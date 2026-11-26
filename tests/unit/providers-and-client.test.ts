import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyCalibration } from "@/lib/providers/calibrate";
import { searchPlaces } from "@/lib/providers/geocode";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import {
  clearProviderCache,
  detectDataNote,
  fetchJsonWithRetry,
  fetchOpenMeteoContext,
} from "@/lib/providers/openMeteo";
import { fetchPlanOrError, fetchRemoteContext } from "@/lib/client/contextFetchers";
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

  it("openMeteo enforces host allow-list, cache hits, zero-hour errors, and client contextFetchers", async () => {
    clearProviderCache();
    await expect(fetchJsonWithRetry("https://evil.example.com/aq")).rejects.toThrow(
      /non-allowlisted/,
    );

    const mockOkFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("air-quality")) {
        return Response.json({
          hourly: {
            time: ["2026-11-25T00:00"],
            pm2_5: [120],
            pm10: [180],
            us_aqi: [185],
          },
        });
      }
      return Response.json({
        hourly: {
          time: ["2026-11-25T00:00"],
          temperature_2m: [14],
          relative_humidity_2m: [78],
          wind_speed_10m: [4],
        },
      });
    };
    const fetchSpy = vi.fn(mockOkFetch);
    await fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, fetchSpy, 1000, 2);
    await fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, fetchSpy, 2000, 2);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // Second call served from cache

    // Refresh expired entry and verify bounded cache evicts stale then oldest entries
    await fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, fetchSpy, 3_602_000, 2);
    await fetchOpenMeteoContext(
      { name: "Pune", lat: 18.52, lon: 73.85, country: "IN" },
      fetchSpy,
      3_602_001,
      2,
    );
    await fetchOpenMeteoContext(
      { name: "Mumbai", lat: 19.07, lon: 72.87, country: "IN" },
      fetchSpy,
      3_602_002,
      2,
    );
    // Expired-first path + capacity=2 evicted Greater Noida, keeping Pune and Mumbai
    await fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, fetchSpy, 7_300_000, 2);
    expect(fetchSpy).toHaveBeenCalledTimes(10);

    clearProviderCache();
    const mismatchWxFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("air-quality")) {
        return Response.json({
          hourly: {
            time: ["2026-11-25T00:00", "2026-11-25T01:00"],
            pm2_5: [120, 130],
            pm10: [-1, Number.NaN],
            us_aqi: [-10, Number.POSITIVE_INFINITY],
          },
        });
      }
      // Weather length mismatch + non-finite fallback -> safely ignored without crashing air series
      return Response.json({
        hourly: {
          time: ["2026-11-25T00:00"],
          temperature_2m: [14, 15],
          relative_humidity_2m: [78],
          wind_speed_10m: [4],
        },
      });
    };
    const mismatchRes = await fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, mismatchWxFetch);
    expect(mismatchRes.hours).toHaveLength(2);
    expect(mismatchRes.hours[0]?.tempC).toBeUndefined();

    clearProviderCache();
    const sparseMetricsFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("air-quality")) {
        return Response.json({
          hourly: {
            time: ["", "2026-11-25T01:00"],
            pm2_5: [100, 120],
            pm10: [140, 160],
            us_aqi: [170, 180],
          },
        });
      }
      return Response.json({
        hourly: {
          time: ["", "2026-11-25T01:00"],
          temperature_2m: [null, null],
          relative_humidity_2m: [70, 75],
          wind_speed_10m: [null, null],
        },
      });
    };
    const sparseMetricsRes = await fetchOpenMeteoContext(
      SAMPLE_FAMILY_PROFILE.place,
      sparseMetricsFetch,
    );
    expect(sparseMetricsRes.hours).toHaveLength(1);
    expect(sparseMetricsRes.hours[0]?.rh).toBe(75);
    expect(sparseMetricsRes.hours[0]?.windKmh).toBeUndefined();

    clearProviderCache();
    const bad404Fetch: typeof fetch = async () => new Response("missing", { status: 404 });
    await expect(
      fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, bad404Fetch, 9000),
    ).rejects.toThrow(/404/);

    clearProviderCache();
    const nonErrorFetch: typeof fetch = async () => {
      throw "string failure";
    };
    await expect(
      fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, nonErrorFetch, 9500),
    ).rejects.toThrow(/Upstream fetch failed/);

    clearProviderCache();
    const zeroHoursFetch: typeof fetch = async (url) => {
      if (String(url).includes("air-quality")) {
        return Response.json({
          hourly: { time: ["2026-11-25T00:00"], pm2_5: [null], pm10: [10], us_aqi: [10] },
        });
      }
      return Response.json({
        hourly: {
          time: ["2026-11-25T00:00"],
          temperature_2m: [14],
          relative_humidity_2m: [78],
          wind_speed_10m: [4],
        },
      });
    };
    await expect(
      fetchOpenMeteoContext(SAMPLE_FAMILY_PROFILE.place, zeroHoursFetch),
    ).rejects.toThrow(/zero valid hourly/);

    // Client contextFetchers: demo calibrated + live fallback + plan error/ok paths
    const demoCal = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "demo", 200);
    expect(demoCal.fallbackFor).toBeNull();
    expect(demoCal.ctx.calibrationFactor).toBeDefined();

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/api/context")) {
        return Response.json({
          context: getDemoContext(),
          requestedPlace: { name: "Delhi" },
          upstreamFallback: true,
        });
      }
      return new Response("down", { status: 503 });
    }) as typeof fetch;
    try {
      const demoRaw = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "demo", null);
      expect(demoRaw.fallbackFor).toBeNull();

      const liveFb = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", 180);
      expect(liveFb.fallbackFor).toBe("Delhi");

      globalThis.fetch = (async () => Response.json({ context: getDemoContext() })) as typeof fetch;
      const liveClean = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(liveClean.fallbackFor).toBeNull();

      globalThis.fetch = (async () => new Response("down", { status: 503 })) as typeof fetch;
      const liveHttpErr = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(liveHttpErr.fallbackFor).toBe("Greater Noida");

      const planErr = await fetchPlanOrError(SAMPLE_FAMILY_PROFILE, demoCal.ctx, "fp-err");
      expect(planErr.data).toBeNull();
      expect(planErr.error).toBeTruthy();

      const mockPlan = {
        outcome: "fallback",
        plan: { headline: "Ok", summary: "Summary", cards: [], memberNotes: [], tradeoffs: [] },
      };
      globalThis.fetch = (async () => Response.json(mockPlan)) as typeof fetch;
      const planOk = await fetchPlanOrError(SAMPLE_FAMILY_PROFILE, demoCal.ctx, "fp-ok");
      expect(planOk.error).toBeNull();
      expect(planOk.data?.outcome).toBe("fallback");

      globalThis.fetch = (async () => Response.json({ invalid: true })) as typeof fetch;
      const malformedCtx = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(malformedCtx.fallbackFor).toBe("Greater Noida");

      globalThis.fetch = (async () =>
        Response.json({
          context: { ...getDemoContext(), source: "cached" },
        })) as typeof fetch;
      const badSourceCtx = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(badSourceCtx.fallbackFor).toBe("Greater Noida");

      globalThis.fetch = (async () =>
        Response.json({
          context: { ...getDemoContext(), dataNote: 42 },
        })) as typeof fetch;
      const badNoteCtx = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(badNoteCtx.fallbackFor).toBe("Greater Noida");

      globalThis.fetch = (async () =>
        Response.json({
          context: { ...getDemoContext(), hours: [], nowIndex: 0 },
        })) as typeof fetch;
      const emptyHoursCtx = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(emptyHoursCtx.fallbackFor).toBe("Greater Noida");

      globalThis.fetch = (async () =>
        Response.json({
          context: getDemoContext(),
          upstreamFallback: true,
        })) as typeof fetch;
      const fallbackDefaultName = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(fallbackDefaultName.fallbackFor).toBe("Greater Noida");

      globalThis.fetch = (async () => Response.json({ invalidPlan: true })) as typeof fetch;
      const badPlanPayload = await fetchPlanOrError(SAMPLE_FAMILY_PROFILE, demoCal.ctx, "fp-bad");
      expect(badPlanPayload.data).toBeNull();
      expect(badPlanPayload.error).toBeTruthy();

      globalThis.fetch = (async () => {
        throw "non-error string";
      }) as typeof fetch;
      const nonErrFb = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(nonErrFb.fallbackFor).toBe("Greater Noida");
      const nonErrPlan = await fetchPlanOrError(SAMPLE_FAMILY_PROFILE, demoCal.ctx, "fp-nonerr");
      expect(nonErrPlan.data).toBeNull();

      globalThis.fetch = (async () => {
        throw new Error("offline");
      }) as typeof fetch;
      const netFb = await fetchRemoteContext(SAMPLE_FAMILY_PROFILE, "live", null);
      expect(netFb.fallbackFor).toBe("Greater Noida");
      const netPlanErr = await fetchPlanOrError(SAMPLE_FAMILY_PROFILE, demoCal.ctx, "fp-net");
      expect(netPlanErr.data).toBeNull();
      expect(netPlanErr.error).toBeTruthy();
    } finally {
      globalThis.fetch = origFetch;
    }
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
    expect(
      isValidStoredProfile({
        ...SAMPLE_FAMILY_PROFILE,
        home: { ...SAMPLE_FAMILY_PROFILE.home, windows: "open" },
      }),
    ).toBe(false);
    expect(
      isValidStoredProfile({
        ...SAMPLE_FAMILY_PROFILE,
        budget: "unlimited",
      }),
    ).toBe(false);
    expect(
      isValidStoredProfile({
        ...SAMPLE_FAMILY_PROFILE,
        household: { adults: 1, children: 0, seniors: 0, conditions: "none" },
      }),
    ).toBe(false);
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

    // Storage quota / SecurityError on getItem, setItem, and removeItem does not throw
    const throwingStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    vi.stubGlobal("window", { localStorage: throwingStorage });
    expect(loadStoredProfile()).toBeNull();
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

    const strThrowStorage = {
      getItem: () => {
        throw "denied";
      },
      setItem: () => {
        throw "quota";
      },
      removeItem: () => {
        throw "denied";
      },
    };
    vi.stubGlobal("window", { localStorage: strThrowStorage });
    expect(loadStoredProfile()).toBeNull();
    expect(() => saveStoredLang("en")).not.toThrow();
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
      "event: done\ndata: []\n\n" +
      "event: bad\ndata: {not-json\n\n" +
      'event: chunk\ndata: {"text":""}\n\n' +
      'event: chunk\ndata: {"text":"Hello "}\n\n' +
      'event: done\ndata: {"text":123}\n\n' +
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
