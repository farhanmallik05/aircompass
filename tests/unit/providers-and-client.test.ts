import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyCalibration } from "@/lib/providers/calibrate";
import { searchPlaces } from "@/lib/providers/geocode";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import { detectDataNote } from "@/lib/providers/openMeteo";
import { fmt, getDict } from "@/lib/client/i18n";
import { MYTHS } from "@/lib/engine/myths";
import {
  clearAllAirCompassData,
  isValidCachedPlanPayload,
  isValidStoredProfile,
  loadCachedPlan,
  loadCalibration,
  loadDataMode,
  loadStoredLang,
  loadStoredProfile,
  planFingerprint,
  saveCachedPlan,
  saveCalibration,
  saveDataMode,
  saveStoredLang,
  saveStoredProfile,
} from "@/lib/client/storage";
import { buildPlanFacts } from "@/lib/llm/planner";
import { buildFallbackPlan } from "@/lib/llm/fallback";
import { consumeChatSseStream } from "@/lib/client/sseChat";

function makeMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("providers: calibrate, geocode, and demo regional helper", () => {
  it("applyCalibration clamps ratio to 0.5x..3x and rejects invalid inputs", () => {
    const base = getDemoContext();
    const nowPm = base.hours[base.nowIndex]?.pm25 ?? 100;

    expect(applyCalibration(base, Number.NaN)).toBe(base);
    expect(applyCalibration(base, -5)).toBe(base);

    const lowClamp = applyCalibration(base, nowPm * 0.1);
    expect(lowClamp.calibrationFactor).toBe(0.5);

    const highClamp = applyCalibration(base, nowPm * 10);
    expect(highClamp.calibrationFactor).toBe(3);

    const zeroCtx = {
      ...base,
      hours: base.hours.map((h) => ({ ...h, pm25: 0 })),
    };
    expect(applyCalibration(zeroCtx, 50)).toBe(zeroCtx);
  });

  it("searchPlaces validates query bounds and normalizes Open-Meteo geocode payload", async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        results: [
          {
            name: "Noida",
            latitude: 28.57,
            longitude: 77.32,
            country_code: "in",
            admin1: "Uttar Pradesh",
          },
          { name: "Delhi", latitude: 28.61, longitude: 77.21 },
        ],
      }),
    );

    expect(await searchPlaces("   ", fetchSpy as typeof fetch)).toEqual([]);
    expect(await searchPlaces("x".repeat(81), fetchSpy as typeof fetch)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();

    const places = await searchPlaces("Noida", fetchSpy as typeof fetch);
    expect(places).toEqual([
      {
        name: "Noida",
        admin1: "Uttar Pradesh",
        country: "IN",
        lat: 28.57,
        lon: 77.32,
      },
      { name: "Delhi", country: "IN", lat: 28.61, lon: 77.21 },
    ]);

    const emptyRes = await searchPlaces("Nowhere", (async () => Response.json({})) as typeof fetch);
    expect(emptyRes).toEqual([]);
  });

  it("detectDataNote distinguishes CAMS regional vs global and getDemoContext allows custom place override", () => {
    expect(detectDataNote({ name: "Paris", lat: 48.85, lon: 2.35, country: "FR" })).toBe(
      "cams_europe_11km",
    );
    expect(detectDataNote(SAMPLE_FAMILY_PROFILE.place)).toBe("cams_global_25_45km");
    expect(getDemoContext().dataNote).toBe("recorded");
    const customCtx = getDemoContext({ name: "Pune", lat: 18.52, lon: 73.85, country: "IN" });
    expect(customCtx.place.name).toBe("Pune");
    expect(customCtx.source).toBe("demo");
  });
});

describe("client: i18n, myths catalog, and validated localStorage wrapper", () => {
  beforeEach(() => {
    const ls = makeMemoryStorage();
    vi.stubGlobal("window", { localStorage: ls });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getDict, fmt, and MYTHS return complete cited entries in en and hi", () => {
    const en = getDict("en");
    const hi = getDict("hi");
    expect(en.app.name).toBe("AirCompass");
    expect(hi.app.nav.today).toBe("आज");
    expect(fmt("Hi {name}, AQI {val}", { name: "Delhi", val: 210 })).toBe("Hi Delhi, AQI 210");
    expect(MYTHS).toHaveLength(4);
    for (const m of MYTHS) {
      expect(m.source.length).toBeGreaterThan(10);
      expect(en.myths[m.id].title).toBeTruthy();
      expect(hi.myths[m.id].fact).toBeTruthy();
    }
  });

  it("validates stored profiles, lang, mode, calibration, cached plans, and clears cleanly", () => {
    expect(loadStoredProfile()).toBeNull();
    expect(loadStoredLang()).toBe("en");
    expect(loadDataMode()).toBe("demo");
    expect(loadCalibration()).toBeNull();

    saveStoredProfile(SAMPLE_FAMILY_PROFILE);
    expect(loadStoredProfile()).toEqual(SAMPLE_FAMILY_PROFILE);

    saveStoredLang("hi");
    expect(loadStoredLang()).toBe("hi");
    expect(loadStoredProfile()?.lang).toBe("hi");

    saveDataMode("live");
    expect(loadDataMode()).toBe("live");

    saveCalibration(145);
    expect(loadCalibration()).toBe(145);
    saveCalibration(null);
    expect(loadCalibration()).toBeNull();

    const ctx = getDemoContext();
    const { facts, baselineScenario, combinedScenario } = buildPlanFacts(
      SAMPLE_FAMILY_PROFILE,
      ctx,
    );
    const plan = buildFallbackPlan(facts);
    const fp = planFingerprint(SAMPLE_FAMILY_PROFILE, ctx);
    saveCachedPlan(fp, {
      outcome: "fallback",
      plan,
      facts,
      baselineScenario,
      combinedScenario,
      tokens: {},
    });
    expect(loadCachedPlan(fp)?.plan.headline).toBe(plan.headline);
    expect(loadCachedPlan("different-fp")).toBeNull();

    // Corrupted / tampered storage is safely rejected
    window.localStorage.setItem("aircompass.profile.v1", "{bad json");
    expect(loadStoredProfile()).toBeNull();
    window.localStorage.setItem(
      "aircompass.profile.v1",
      JSON.stringify({
        ...SAMPLE_FAMILY_PROFILE,
        place: { name: "X", lat: 999, lon: 0, country: "IN" },
      }),
    );
    expect(loadStoredProfile()).toBeNull();
    expect(isValidStoredProfile(null)).toBe(false);
    expect(isValidCachedPlanPayload({ fingerprint: "x", response: {} })).toBe(false);

    // Invalid lang / mode / calibration values fall back safely
    window.localStorage.setItem("aircompass.lang.v1", "fr");
    expect(loadStoredLang()).toBe("en");
    window.localStorage.setItem("aircompass.mode.v1", "invalid");
    expect(loadDataMode()).toBe("demo");
    window.localStorage.setItem("aircompass.calibration.v1", "-10");
    expect(loadCalibration()).toBeNull();
    window.localStorage.setItem("aircompass.plan.v1", "{bad json");
    expect(loadCachedPlan(fp)).toBeNull();

    // Storage quota error on setItem does not throw
    const throwingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    vi.stubGlobal("window", { localStorage: throwingStorage });
    expect(() => saveStoredProfile(SAMPLE_FAMILY_PROFILE)).not.toThrow();
    expect(() =>
      saveCachedPlan(fp, {
        outcome: "fallback",
        plan,
        facts,
        baselineScenario,
        combinedScenario,
        tokens: {},
      }),
    ).not.toThrow();
    expect(() => clearAllAirCompassData()).not.toThrow();

    vi.stubGlobal("window", { localStorage: makeMemoryStorage() });
    clearAllAirCompassData();
    expect(loadStoredProfile()).toBeNull();
    expect(loadDataMode()).toBe("demo");
  });

  it("handles missing window gracefully in SSR context", () => {
    vi.unstubAllGlobals();
    expect(loadStoredProfile()).toBeNull();
    expect(loadStoredLang()).toBe("en");
    expect(loadDataMode()).toBe("demo");
    expect(loadCalibration()).toBeNull();
    expect(loadCachedPlan("fp")).toBeNull();
    saveStoredProfile(SAMPLE_FAMILY_PROFILE);
    saveStoredLang("en");
    saveDataMode("demo");
    saveCalibration(100);
    clearAllAirCompassData();
  });

  it("consumeChatSseStream parses tool, chunk, done events and skips malformed blocks safely", async () => {
    const enc = new TextEncoder();
    const ssePayload =
      "event: tool\ndata: {}\n\n" +
      "invalid-line-without-data\n\n" +
      "event: bad\ndata: {not-json\n\n" +
      'event: chunk\ndata: {"text":"Hello "}\n\n' +
      'event: done\ndata: {"text":"Hello world","toolCallsExecuted":1}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(ssePayload.slice(0, 25)));
        c.enqueue(enc.encode(ssePayload.slice(25)));
        c.close();
      },
    });
    const tools = vi.fn();
    const chunks: string[] = [];
    let final: { text: string; used: boolean } | null = null;
    await consumeChatSseStream(stream, {
      onTool: tools,
      onChunk: (d) => chunks.push(d),
      onDone: (text, used) => {
        final = { text, used };
      },
    });
    expect(tools).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(["Hello "]);
    expect(final).toEqual({ text: "Hello world", used: true });
  });
});
