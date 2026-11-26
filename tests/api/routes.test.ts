import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import golden from "../fixtures/golden.json";
import { clearProviderCache, fetchOpenMeteoContext } from "@/lib/providers/openMeteo";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import * as geminiMod from "@/lib/llm/gemini";
import { generatePlanWithFallback } from "@/lib/llm/planner";
import { runGroundedChat } from "@/lib/llm/chat";
import type { LlmClient } from "@/lib/llm/client";
import { PROMPT_CANARY } from "@/lib/llm/guard";
import { POST as planPost } from "@/app/api/plan/route";
import { POST as chatPost } from "@/app/api/chat/route";
import { GET as contextGet } from "@/app/api/context/route";
import { GET as pingGet } from "@/app/api/ping/route";
import { readBoundedJson } from "@/lib/security/headers";
import { resetRateLimitsForTest } from "@/lib/security/rateLimit";
import type { AirContext } from "@/lib/types";

function makeValidMockPlanJson(actionIds: string[]): string {
  return JSON.stringify({
    headline: "Protect indoor air during {{level.name}} smog",
    summary:
      "Current US AQI is {{aqi.now}} at {{level.name}}. Cleanest window is {{best.start}} to {{best.end}}.",
    cards: actionIds.slice(0, 5).map((actionId, idx) => ({
      actionId,
      title: `Priority action ${idx === 0 ? "for home" : "for routine"}`,
      why: "Reduces inhaled fine particles during peak smog.",
      when: "Follow across the {{best.start}} to {{best.end}} window.",
      steps: ["Keep doors closed.", "Check air band daily."],
    })),
    memberNotes: [{ group: "child", note: "Keep play indoors while level stays {{level.name}}." }],
    tradeoffs: ["Open transit saves emissions but may raise breathing exposure without N95."],
  });
}

function demoCtx(): AirContext {
  const hours = golden.best_window.day.map((pm25, h) => ({
    t: `2026-11-19T${String(h).padStart(2, "0")}:00`,
    pm25,
    pm10: Math.round(pm25 * 1.4),
    usAqi: 260,
  }));
  return {
    place: SAMPLE_FAMILY_PROFILE.place,
    source: "demo",
    dataNote: "recorded",
    recordedDate: "2026-11-19",
    fetchedAt: "2026-11-25T12:00:00Z",
    hours,
    nowIndex: 0,
  };
}

describe("API contracts & provider resilience (mocked boundary)", () => {
  const savedGeminiKey = process.env.GEMINI_API_KEY;
  const savedGoogleKey = process.env.GOOGLE_API_KEY;

  beforeEach(() => {
    clearProviderCache();
    resetRateLimitsForTest();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    if (savedGeminiKey !== undefined) process.env.GEMINI_API_KEY = savedGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (savedGoogleKey !== undefined) process.env.GOOGLE_API_KEY = savedGoogleKey;
    else delete process.env.GOOGLE_API_KEY;
  });

  it("handles malformed Open-Meteo responses (nulls, mismatched lengths, 429, 500, timeout)", async () => {
    const place = SAMPLE_FAMILY_PROFILE.place;

    // 1. Nulls filtered cleanly if valid points exist
    const withNulls: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("air-quality")) {
        return Response.json({
          hourly: {
            time: ["2026-11-25T00:00", "2026-11-25T01:00"],
            pm2_5: [null, 120],
            pm10: [null, 180],
            us_aqi: [null, 185],
          },
          current: { time: "2026-11-25T01:00" },
        });
      }
      return Response.json({
        hourly: {
          time: ["2026-11-25T00:00", "2026-11-25T01:00"],
          temperature_2m: [null, 15],
          relative_humidity_2m: [80, 75],
          wind_speed_10m: [4, 5],
        },
      });
    };
    const ctx = await fetchOpenMeteoContext(place, withNulls, 1000);
    expect(ctx.hours).toHaveLength(1);
    expect(ctx.dataNote).toBe("cams_global_25_45km");

    // 2. Mismatched array lengths throw
    clearProviderCache();
    const mismatched: typeof fetch = async () =>
      Response.json({
        hourly: { time: ["2026-11-25T00:00"], pm2_5: [100, 200], pm10: [120], us_aqi: [150] },
      });
    await expect(fetchOpenMeteoContext(place, mismatched, 2000)).rejects.toThrow();

    // 3. 429 and 500 throw after retry
    clearProviderCache();
    const rateLimited: typeof fetch = async () => new Response("slow down", { status: 429 });
    await expect(fetchOpenMeteoContext(place, rateLimited, 3000)).rejects.toThrow(/429/);

    clearProviderCache();
    const serverErr: typeof fetch = async () => new Response("err", { status: 500 });
    await expect(fetchOpenMeteoContext(place, serverErr, 4000)).rejects.toThrow(/500/);

    // 4. Timeout / network rejection
    clearProviderCache();
    const timedOut: typeof fetch = async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    };
    await expect(fetchOpenMeteoContext(place, timedOut, 5000)).rejects.toThrow();
  });

  it("validates Gemini planner outputs: ai happy path, repair-once path, and deterministic fallback on failure modes", async () => {
    const ctx = demoCtx();
    const validIds = [
      "diy_box_fan_filter",
      "exercise_indoors_when_poor",
      "air_house_in_best_window",
      "commute_to_public_transport",
      "share_community_brief",
    ];

    // 1. Happy path -> outcome "ai"
    const happyClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: makeValidMockPlanJson(validIds), model: "mock" }),
      chatWithTools: async () => ({
        text: "",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const aiRes = await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, happyClient);
    expect(aiRes.outcome).toBe("ai");
    expect(aiRes.plan.headline).not.toContain("{{");

    // 2. First attempt emits raw digit -> repaired on second call -> outcome "repaired"
    let calls = 0;
    const repairClient: LlmClient = {
      generatePlanJson: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            rawText: makeValidMockPlanJson(validIds).replace("Reduces", "Cuts by 40"),
            model: "mock",
          };
        }
        return { rawText: makeValidMockPlanJson(validIds), model: "mock" };
      },
      chatWithTools: async () => ({
        text: "",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const repRes = await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, repairClient);
    expect(repRes.outcome).toBe("repaired");
    expect(calls).toBe(2);

    // 3. Exhaustive malformed model modes -> deterministic valid fallback
    const badModes: Array<{ name: string; fn: () => Promise<string> }> = [
      { name: "invalid json", fn: async () => "{not json" },
      { name: "wrong schema", fn: async () => JSON.stringify({ headline: "only" }) },
      {
        name: "unknown actionId",
        fn: async () => makeValidMockPlanJson(["invented_action", ...validIds.slice(1)]),
      },
      {
        name: "raw digits twice",
        fn: async () => makeValidMockPlanJson(validIds).replace("Reduces", "Cuts 88"),
      },
      {
        name: "wrong language (hi text on en)",
        fn: async () =>
          makeValidMockPlanJson(validIds).replaceAll(
            "Reduces inhaled fine particles during peak smog.",
            "प्रदूषण से बचने के लिए घर के अंदर ही सुरक्षित रहें और बाहर न जाएँ।",
          ),
      },
      { name: "empty", fn: async () => "" },
      {
        name: "canary leak",
        fn: async () => makeValidMockPlanJson(validIds).replace("Reduces", PROMPT_CANARY),
      },
      {
        name: "timeout throw",
        fn: async () => {
          throw new Error("TimeoutError");
        },
      },
    ];

    for (const mode of badModes) {
      const badClient: LlmClient = {
        generatePlanJson: async () => ({ rawText: await mode.fn(), model: "mock" }),
        chatWithTools: async () => ({
          text: "",
          toolCallsExecuted: 0,
          toolNumbers: [],
          model: "mock",
        }),
      };
      const res = await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, badClient);
      expect(res.outcome, mode.name).toBe("fallback");
      expect(res.plan.cards.length, mode.name).toBeGreaterThanOrEqual(5);
    }
  });

  it("chat executes simulate_scenario tool calls and catches unfaithful invented numbers", async () => {
    const ctx = demoCtx();

    // 1. Faithful tool-calling chat
    const toolClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async (req) => {
        const out = await req.executeTool("simulate_scenario", { purifier: "hepa" });
        const after = Number(out.afterUgM3 ?? 0);
        return {
          text: `With a HEPA purifier, your exposure drops to ${after} ug/m3.`,
          toolCallsExecuted: 1,
          toolNumbers: [after],
          model: "mock",
        };
      },
    };
    const ok = await runGroundedChat({
      profile: SAMPLE_FAMILY_PROFILE,
      context: ctx,
      history: [],
      message: "What if I add a HEPA purifier?",
      client: toolClient,
    });
    expect(ok.faithful).toBe(true);
    expect(ok.toolCallsExecuted).toBe(1);

    // 2. Unfaithful invented number gets replaced by deterministic engine summary
    const lyingClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => ({
        text: "Your exposure magically drops to 2.5 ug/m3 with 99% guarantee.",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const caught = await runGroundedChat({
      profile: SAMPLE_FAMILY_PROFILE,
      context: ctx,
      history: [],
      message: "How much does it drop?",
      client: lyingClient,
    });
    expect(caught.faithful).toBe(false);
    expect(caught.fallback).toBe(true);
    expect(caught.text).not.toContain("99%");
  });

  it("HTTP route handlers enforce demo fallback, strict schemas, and valid responses", async () => {
    const ctxRes = await contextGet(new Request("http://localhost/api/context?mode=demo"));
    expect(ctxRes.status).toBe(200);
    const ctxBody = (await ctxRes.json()) as { context: AirContext };
    expect(ctxBody.context.source).toBe("demo");

    const planRes = await planPost(
      new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: SAMPLE_FAMILY_PROFILE, context: getDemoContext() }),
      }),
    );
    expect(planRes.status).toBe(200);

    const chatRes = await chatPost(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: SAMPLE_FAMILY_PROFILE,
          context: getDemoContext(),
          history: [],
          message: "What is my cleanest hour?",
        }),
      }),
    );
    expect(chatRes.status).toBe(200);
    expect(chatRes.headers.get("content-type")).toContain("text/event-stream");
    const sseText = await chatRes.text();
    expect(sseText).toContain("event: done");

    const pingRes = await pingGet();
    expect(pingRes.status).toBe(200);
    expect(await pingRes.json()).toEqual({ ok: true });

    const calDemoRes = await contextGet(
      new Request(
        "http://localhost/api/context?lat=28.5&lon=77.3&name=Noida&country=IN&mode=demo&observedPm25=220",
      ),
    );
    expect(calDemoRes.status).toBe(200);
    const calBody = (await calDemoRes.json()) as { context: AirContext };
    expect(calBody.context.calibrationFactor).toBeDefined();

    // Upstream outage on live context falls back cleanly to true Greater Noida demo fixture + requestedPlace
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    try {
      const liveFallback = await contextGet(
        new Request("http://localhost/api/context?lat=28.61&lon=77.21&name=Delhi&mode=live"),
      );
      expect(liveFallback.status).toBe(200);
      const fbBody = (await liveFallback.json()) as {
        context: AirContext;
        requestedPlace?: { name: string };
        upstreamFallback?: boolean;
      };
      expect(fbBody.upstreamFallback).toBe(true);
      expect(fbBody.context.place.name).toBe("Greater Noida");
      expect(fbBody.requestedPlace?.name).toBe("Delhi");
    } finally {
      globalThis.fetch = origFetch;
    }

    // readBoundedJson malformed JSON + oversized Content-Length
    const badJson = await readBoundedJson(
      new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad json",
      }),
    );
    expect(badJson).toMatchObject({ ok: false, status: 400 });

    const bigHeader = await readBoundedJson(
      new Request("http://localhost/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "99999" },
        body: "{}",
      }),
    );
    expect(bigHeader).toMatchObject({ ok: false, status: 413 });

    // Place search (?q=...) and live Open-Meteo success + calibration via /api/context
    const origFetch2 = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const u = String(url);
      if (u.includes("geocoding-api")) {
        return Response.json({
          results: [{ name: "Noida", latitude: 28.57, longitude: 77.32, country_code: "IN" }],
        });
      }
      if (u.includes("air-quality")) {
        return Response.json({
          hourly: {
            time: ["2026-11-25T00:00", "2026-11-25T01:00"],
            pm2_5: [120, 140],
            pm10: [180, 200],
            us_aqi: [185, 195],
          },
          current: { time: "2026-11-25T01:00" },
        });
      }
      return Response.json({
        hourly: {
          time: ["2026-11-25T00:00", "2026-11-25T01:00"],
          temperature_2m: [14, 15],
          relative_humidity_2m: [80, 75],
          wind_speed_10m: [4, 5],
        },
      });
    }) as typeof fetch;
    try {
      const searchRes = await contextGet(new Request("http://localhost/api/context?q=Noida"));
      expect(searchRes.status).toBe(200);
      const searchBody = (await searchRes.json()) as { places: Array<{ name: string }> };
      expect(searchBody.places[0]?.name).toBe("Noida");

      clearProviderCache();
      const liveOk = await contextGet(
        new Request(
          "http://localhost/api/context?lat=28.57&lon=77.32&name=Noida&mode=live&observedPm25=210",
        ),
      );
      expect(liveOk.status).toBe(200);
      const liveBody = (await liveOk.json()) as { context: AirContext };
      expect(liveBody.context.source).toBe("live");
      expect(liveBody.context.calibrationFactor).toBeDefined();
    } finally {
      globalThis.fetch = origFetch2;
    }

    // /api/chat SSE streaming with mocked Gemini client (tool + chunk + done events) + error branch
    const mockStreamClient: LlmClient = {
      generatePlanJson: async () => ({
        rawText: makeValidMockPlanJson([
          "diy_box_fan_filter",
          "exercise_indoors_when_poor",
          "air_house_in_best_window",
          "commute_to_public_transport",
          "share_community_brief",
        ]),
        model: "mock",
      }),
      chatWithTools: async (req) => {
        const out = await req.executeTool("simulate_scenario", { purifier: "hepa" });
        req.onToolCall?.("simulate_scenario", { purifier: "hepa" }, out);
        req.onTextChunk?.("Using a HEPA purifier ");
        const after = Number(out.afterUgM3 ?? 0);
        return {
          text: `Using a HEPA purifier cuts exposure to ${after} ug/m3.`,
          toolCallsExecuted: 1,
          toolNumbers: [after],
          model: "mock",
        };
      },
    };
    const spy = vi.spyOn(geminiMod, "createGeminiClientFromEnv").mockReturnValue(mockStreamClient);
    try {
      const sseRes = await chatPost(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: SAMPLE_FAMILY_PROFILE,
            context: getDemoContext(),
            history: [],
            message: "What if we add HEPA?",
          }),
        }),
      );
      expect(sseRes.status).toBe(200);
      const streamText = await sseRes.text();
      expect(streamText).toContain("event: tool");
      expect(streamText).toContain("event: chunk");
      expect(streamText).toContain("event: done");

      const planAiRes = await planPost(
        new Request("http://localhost/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profile: SAMPLE_FAMILY_PROFILE, context: getDemoContext() }),
        }),
      );
      expect(planAiRes.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});
