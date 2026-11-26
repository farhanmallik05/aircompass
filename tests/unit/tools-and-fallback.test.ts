import { describe, it, expect } from "vitest";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { executeSimulateScenario } from "@/lib/llm/tools";
import { buildFallbackPlan } from "@/lib/llm/fallback";
import {
  buildPlanFacts,
  generatePlanWithFallback,
  validateAndRenderPlanOut,
} from "@/lib/llm/planner";
import {
  collectAllowedChatNumbers,
  deterministicChatFallback,
  runGroundedChat,
} from "@/lib/llm/chat";
import { buildTokens } from "@/lib/llm/tokens";
import { buildPlannerUserPrompt } from "@/lib/llm/prompt";
import { PROMPT_CANARY } from "@/lib/llm/guard";
import type { LlmClient } from "@/lib/llm/client";

describe("LLM tools, fallback wording, planner extraction, and chat safety", () => {
  it("executeSimulateScenario rejects invalid arguments and handles full scenario patches", () => {
    const ctx = getDemoContext();
    const base = baselineScenario(SAMPLE_FAMILY_PROFILE);

    const invalidNull = executeSimulateScenario(null, SAMPLE_FAMILY_PROFILE, ctx, base);
    expect(invalidNull.ok).toBe(true);

    const invalid = executeSimulateScenario(
      { commuteDaysPerWeek: 99 },
      SAMPLE_FAMILY_PROFILE,
      ctx,
      base,
    );
    expect(invalid.ok).toBe(false);

    const patched = executeSimulateScenario(
      {
        purifier: "hepa",
        purifierHours: [],
        windowsOpenHours: [15],
        envelope: "sealed",
        exerciseHour: 15,
        exerciseIndoors: true,
        commuteMode: "metro",
        commuteDaysPerWeek: 4,
        n95Outdoors: true,
        cooking: "induction",
        cookVent: true,
      },
      SAMPLE_FAMILY_PROFILE,
      ctx,
      base,
    );
    expect(patched.ok).toBe(true);
    expect((patched.deltaUgM3 ?? 0) > 0).toBe(true);
    expect(patched.rangeUgM3).toHaveLength(2);
    expect(patched.assumptions?.length).toBeGreaterThan(0);

    // Zero PM2.5 + induction (zero cooking source) produces 0% delta cleanly without division error
    const inductionProfile = {
      ...SAMPLE_FAMILY_PROFILE,
      home: { ...SAMPLE_FAMILY_PROFILE.home, cooking: "induction" as const },
    };
    const zeroCtx = { ...ctx, hours: ctx.hours.map((h) => ({ ...h, pm25: 0 })) };
    const zeroRes = executeSimulateScenario(
      {},
      inductionProfile,
      zeroCtx,
      baselineScenario(inductionProfile),
    );
    expect(zeroRes.ok).toBe(true);
    expect(zeroRes.deltaPct).toBe(0);
  });

  it("buildFallbackPlan builds bilingual cards, tradeoffs, and member notes", () => {
    const ctx = getDemoContext();
    const { facts } = buildPlanFacts({ ...SAMPLE_FAMILY_PROFILE, lang: "hi" }, ctx);
    const hiPlan = buildFallbackPlan(facts);
    expect(hiPlan.cards.length).toBeGreaterThanOrEqual(5);
    expect(hiPlan.tradeoffs.length).toBeGreaterThan(0);
    expect(hiPlan.memberNotes.some((m) => m.group === "child")).toBe(true);

    const cleanCtx = {
      ...ctx,
      hours: ctx.hours.map((h) => ({ ...h, pm25: 5, pm10: 10, usAqi: 21 })),
    };
    const cleanFacts = buildPlanFacts(SAMPLE_FAMILY_PROFILE, cleanCtx).facts;
    const cleanPlan = buildFallbackPlan(cleanFacts);
    expect(cleanPlan.cards.length).toBeGreaterThanOrEqual(5);
  });

  it("planner handles daily quota exhaustion and extracts fenced/prefixed JSON cleanly", async () => {
    const ctx = getDemoContext();
    const { facts } = buildPlanFacts(SAMPLE_FAMILY_PROFILE, ctx);
    const tokens = buildTokens(facts);
    const hiFacts = buildPlanFacts(
      { ...SAMPLE_FAMILY_PROFILE, lang: "hi", notes: "Asthma" },
      ctx,
    ).facts;
    const hiTokens = buildTokens(hiFacts);
    expect(hiTokens).toHaveProperty("aqi.now");
    expect(buildPlannerUserPrompt(SAMPLE_FAMILY_PROFILE, hiFacts, hiTokens)).toContain(
      "householdNote",
    );
    expect(buildPlannerUserPrompt(SAMPLE_FAMILY_PROFILE, facts, tokens)).not.toContain(
      "householdNote",
    );
    const dummyClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => ({
        text: "",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };

    const capped = await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, dummyClient, {
      quotaAllowed: false,
    });
    expect(capped.outcome).toBe("fallback");
    expect(capped.reason).toBe("daily_cap");

    const ids = facts.candidates.slice(0, 5).map((c) => c.id);
    const validObj = {
      headline: "Clean air plan for {{level.name}}",
      summary: "Today US AQI is {{aqi.now}} with window {{best.start}}-{{best.end}}.",
      cards: ids.map((actionId) => ({
        actionId,
        title: "Practical indoor step",
        why: "Cuts smoke inside.",
        when: "Follow across {{best.start}}-{{best.end}}.",
        steps: ["Shut windows at peak hours."],
      })),
      memberNotes: [{ group: "child", note: "Keep indoor play." }],
      tradeoffs: [],
    };

    const fenced = `Here is JSON:\n\`\`\`json\n${JSON.stringify(validObj)}\n\`\`\``;
    expect(validateAndRenderPlanOut(fenced, facts.candidates, tokens, "en").ok).toBe(true);

    const prefixed = `Leading note ${JSON.stringify(validObj)} trailing`;
    expect(validateAndRenderPlanOut(prefixed, facts.candidates, tokens, "en").ok).toBe(true);

    const dupIds = [ids[0]!, ids[0]!, ...ids.slice(2)];
    const dupJson = JSON.stringify({
      ...validObj,
      cards: dupIds.map((actionId) => ({ ...validObj.cards[0]!, actionId })),
    });
    const dupCheck = validateAndRenderPlanOut(dupJson, facts.candidates, tokens, "en");
    expect(dupCheck.ok).toBe(false);
  });

  it("runGroundedChat covers quota cap, Hindi fallback, unsupported tool, and canary/medical leaks", async () => {
    const ctx = getDemoContext();
    const hiProfile = { ...SAMPLE_FAMILY_PROFILE, lang: "hi" as const };
    const { facts } = buildPlanFacts(hiProfile, ctx);
    expect(collectAllowedChatNumbers(facts, [42.5])).toContain(43);
    expect(deterministicChatFallback({ ...facts, candidates: [] })).toContain("US AQI");

    // Quota blocked -> Hindi deterministic summary
    const capped = await runGroundedChat({
      profile: hiProfile,
      context: ctx,
      history: [],
      message: "क्या करें?",
      client: null,
      quotaAllowed: false,
    });
    expect(capped.fallback).toBe(true);
    expect(capped.text).toContain("इंजन सारांश");

    // Unsupported tool + medical claim in response
    const badMedicalClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async (req) => {
        const res = await req.executeTool("other_tool", {});
        expect(res.ok).toBe(false);
        return {
          text: `यह आपका इलाज ${PROMPT_CANARY} करता है`,
          toolCallsExecuted: 1,
          toolNumbers: [],
          model: "mock",
        };
      },
    };
    const caught = await runGroundedChat({
      profile: hiProfile,
      context: ctx,
      history: [],
      message: "सुझाव दें",
      client: badMedicalClient,
    });
    expect(caught.faithful).toBe(false);
    expect(caught.fallback).toBe(true);

    // Model exception -> localized fallback
    const throwClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => {
        throw new Error("timeout");
      },
    };
    const errRes = await runGroundedChat({
      profile: hiProfile,
      context: ctx,
      history: [],
      message: "सुझाव",
      client: throwClient,
    });
    expect(errRes.fallback).toBe(true);
    expect(errRes.text).toContain("इंजन सारांश");

    // Hindi medical guarantee + data:text URI rejected via unified guard check
    const hiGuaranteeClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => ({
        text: "यह बीमारी से सुरक्षा की गारंटी देता है [link](data:text/html,x)",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const hiCaught = await runGroundedChat({
      profile: hiProfile,
      context: ctx,
      history: [],
      message: "क्या यह सुरक्षित है?",
      client: hiGuaranteeClient,
    });
    expect(hiCaught.faithful).toBe(false);
    expect(hiCaught.fallback).toBe(true);

    // EN error fallback + non-streaming safe chunk delivery from trimmed reply
    const enErr = await runGroundedChat({
      profile: SAMPLE_FAMILY_PROFILE,
      context: ctx,
      history: [],
      message: "Help",
      client: throwClient,
    });
    expect(enErr.text).toContain("Engine summary (model error or timeout)");

    const nonStreamOkClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => ({
        text: "  Keep windows closed during peak smog hours.  ",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const deliveredChunks: string[] = [];
    const safeReply = await runGroundedChat({
      profile: SAMPLE_FAMILY_PROFILE,
      context: ctx,
      history: [],
      message: "Window advice",
      client: nonStreamOkClient,
      onTextChunk: (c) => deliveredChunks.push(c),
    });
    expect(safeReply.faithful).toBe(true);
    expect(deliveredChunks).toEqual(["Keep windows closed during peak smog hours."]);

    // Empty reply and sanitizedNote context payload branch
    const emptyReplyClient: LlmClient = {
      generatePlanJson: async () => ({ rawText: "", model: "mock" }),
      chatWithTools: async () => ({
        text: "   ",
        toolCallsExecuted: 0,
        toolNumbers: [],
        model: "mock",
      }),
    };
    const emptyCaught = await runGroundedChat({
      profile: { ...SAMPLE_FAMILY_PROFILE, notes: "Elder has asthma" },
      context: ctx,
      history: [],
      message: "Advice",
      client: emptyReplyClient,
    });
    expect(emptyCaught.faithful).toBe(false);
    expect(emptyCaught.fallback).toBe(true);
  });
});
