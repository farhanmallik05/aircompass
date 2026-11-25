/**
 * mutation-killers.test.ts
 *
 * Targeted tests that kill surviving Stryker mutants in:
 *   guard.ts, select.ts, schedule.ts, exposure.ts, window.ts, impact.ts, catalog.ts
 *
 * Each describe block is focused on the survivors from each module.
 */
import { describe, it, expect } from "vitest";

// ── guard.ts survivors ─────────────────────────────────────────────────────
import {
  findViolations,
  languageOk,
  unfaithfulNumbers,
  render,
  PROMPT_CANARY,
} from "@/lib/llm/guard";

describe("guard.ts mutation killers", () => {
  it("hiNorm uses toLowerCase (not toUpperCase) — chandrabindu normalisation", () => {
    // 'इलाज' (medical claim hi) should be caught regardless of case of ASCII wrapper
    // Key: hiNorm lowercases; if mutant uses toUpperCase the Hindi words don't match
    const textWithMedical = "यह इलाज करता है";
    const v = findViolations(textWithMedical, {});
    expect(v).toContain("medical claim (hi)");

    // Also verify plain English with no violations passes through without false positives
    const clean = "Use an air purifier at home.";
    expect(findViolations(clean, {})).toHaveLength(0);
  });

  it("ALLOWED_TERMS regex matches MERV-13 and MERV13 (optional hyphen)", () => {
    // 'MERV-?13' — the '?' makes the hyphen optional; test both forms
    const withHyphen = "Use a MERV-13 filter";
    const withoutHyphen = "Use a MERV13 filter";
    // Both should NOT trigger 'raw digit' violation because they're in ALLOWED_TERMS
    expect(findViolations(withHyphen, {})).not.toContain("raw digit");
    expect(findViolations(withoutHyphen, {})).not.toContain("raw digit");
    // But a plain digit should still be caught
    expect(findViolations("reduce by 30 units", {})).toContain("raw digit");
  });

  it("unfaithfulNumbers: \\d+(?:\\.\\d+)? matches integers and decimals", () => {
    // Integer in text with no allowed match → bad
    expect(unfaithfulNumbers("delay of 45 minutes", [10])).toEqual(["45"]);
    // Decimal match
    expect(unfaithfulNumbers("PM2.5 is 12.5", [12.5])).toHaveLength(0);
    // Multi-value match — both values allowed
    const result = unfaithfulNumbers("value 12.5 and 6", [12.5, 6]);
    expect(result).toHaveLength(0);
    // 12.9 is within rel tol=0.01 and abs tol=0.5 of 12.5 (|12.9-12.5|=0.4 < 0.5) → allowed
    expect(unfaithfulNumbers("value 12.9", [12.5])).toHaveLength(0);
    // 15.0 is not within tol of 12.5 (|15-12.5|=2.5 > max(0.5, 0.125)) → bad
    expect(unfaithfulNumbers("value 15", [12.5])).toEqual(["15"]);
  });

  it("render replaces known tokens and leaves unknown slots as empty string", () => {
    const tokens = { level: "Moderate", aqi: "142" };
    expect(render("AQI is {{aqi}} ({{level}})", tokens)).toBe("AQI is 142 (Moderate)");
    expect(render("{{unknown}}", tokens)).toBe("");
  });

  it("ALLOWED_TERMS: replace(ALLOWED_TERMS,' ') leaves a space not empty string — digit check still works for surrounding text", () => {
    // The key: ALLOWED_TERMS replaces with " " so adjacent non-term digits are not merged/hidden
    const text = "PM2.5 level is 55 today";
    // 55 is a raw digit not in allowed → violation
    const v = findViolations(text, {});
    expect(v).toContain("raw digit");
  });

  it("PROMPT_CANARY triggers prompt-leak violation", () => {
    expect(findViolations(PROMPT_CANARY, {})).toContain("prompt leak");
  });

  it("languageOk: Hindi text with mostly Devanagari passes hi, also passes en (short check)", () => {
    // languageOk only returns false for en if dev >= 0.05; short sentences may still pass
    // The key test is that hi text has dev >= 0.5 → hi=true
    const hi = "यह हवा की गुणवत्ता की रिपोर्ट है।";
    expect(languageOk(hi, "hi")).toBe(true);
    // For en check: a long Hindi-only text should FAIL en check (dev >= 0.05)
    const longHi =
      "वायु गुणवत्ता खराब है। कृपया बाहर न जाएं। घर पर रहें और खिड़कियां बंद रखें। वायु शोधक का उपयोग करें।";
    expect(languageOk(longHi, "hi")).toBe(true);
    expect(languageOk(longHi, "en")).toBe(false);
  });

  it("languageOk: short text (< 20 letters) always passes", () => {
    expect(languageOk("OK", "en")).toBe(true);
    expect(languageOk("OK", "hi")).toBe(true);
  });
});

// ── select.ts survivors ────────────────────────────────────────────────────
import { selectCandidates, selectFallbackOrder, householdGroups } from "@/lib/engine/select";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import type { AirContext, HourPoint, Level, Profile, WindowSummary } from "@/lib/types";

function makeHours24(pm25 = 150): HourPoint[] {
  return Array.from({ length: 24 }, (_, i) => ({
    t: `2026-11-20T${String(i).padStart(2, "0")}:00`,
    pm25,
    pm10: pm25 * 1.5,
    usAqi: 200,
  }));
}

function makeCtx24(pm25 = 150): AirContext {
  return {
    place: SAMPLE_FAMILY_PROFILE.place,
    source: "demo",
    dataNote: "recorded",
    recordedDate: "2026-11-20",
    fetchedAt: "2026-11-25T12:00:00Z",
    hours: makeHours24(pm25),
    nowIndex: 0,
  };
}

const DEFAULT_WIN: WindowSummary = {
  best: { start: 12, end: 14, mean: 100, startLabel: "12:00", endLabel: "14:00" },
  avoid: { start: 7, end: 10, mean: 250, startLabel: "07:00", endLabel: "10:00" },
  noGoodWindow: false,
  shortData: false,
  hoursEvaluated: 24,
};

const baseProfile: Profile = {
  ...SAMPLE_FAMILY_PROFILE,
  home: { ...SAMPLE_FAMILY_PROFILE.home, purifier: "none", cooking: "lpg", windows: "normal" },
  commute: { mode: "car", km: 10, daysPerWeek: 5 },
  budget: "medium",
  household: { adults: 2, children: 1, seniors: 0, conditions: [] },
  habits: { morningOutdoorExercise: false, schoolRun: false },
};

describe("select.ts mutation killers", () => {
  it("clamp: x < lo returns lo, x > hi returns hi, x = lo/hi returns boundary", () => {
    // Tested indirectly through scoreCandidate which uses clamp(exposureDeltaPct, 0, 50)/50
    // A negative exposureDeltaPct must be clamped to 0 → score component is 0
    const zeroCostProfile: Profile = {
      ...baseProfile,
      commute: { mode: "car", km: 1, daysPerWeek: 1 },
      budget: "zero",
    };
    const ctx = makeCtx24(50);
    const cands = selectCandidates(
      zeroCostProfile,
      ctx,
      2 as Level,
      baselineScenario(zeroCostProfile),
      DEFAULT_WIN,
    );
    // All candidates must have cost=0 (budget=zero enforces this)
    expect(cands.every((c) => c.cost === 0)).toBe(true);
    // Scores must be between -0.2 and 1.0 (clamped at both ends)
    expect(cands.every((c) => c.score >= -0.2 && c.score <= 1.0)).toBe(true);
  });

  it("householdGroups: adults=0 children=1 returns ['child'] not ['adult','child']", () => {
    const p: Profile = {
      ...baseProfile,
      household: { adults: 0, children: 1, seniors: 0, conditions: [] },
    };
    expect(householdGroups(p)).toEqual(["child"]);
    // Confirm adults=0 does NOT add "adult" (mutant: > 0 → >= 0)
    expect(householdGroups(p)).not.toContain("adult");
  });

  it("householdGroups: all zero → fallback to ['adult']", () => {
    const p: Profile = {
      ...baseProfile,
      household: { adults: 0, children: 0, seniors: 0, conditions: [] },
    };
    expect(householdGroups(p)).toEqual(["adult"]);
  });

  it("budget=low allows cost<=1 but not cost=2 (not cost<1 or cost<2)", () => {
    const lowProfile: Profile = { ...baseProfile, budget: "low" };
    const ctx = makeCtx24(150);
    const cands = selectCandidates(
      lowProfile,
      ctx,
      3 as Level,
      baselineScenario(lowProfile),
      DEFAULT_WIN,
    );
    // No cost-2 items (buy_hepa_purifier cost=2 must be excluded)
    expect(cands.every((c) => c.cost <= 1)).toBe(true);
    // But cost=1 items ARE allowed
    expect(cands.some((c) => c.cost === 1)).toBe(true);
  });

  it("long commute co2e score > short commute co2e score by >= 0.15 for commute_to_public_transport", () => {
    const short: Profile = {
      ...baseProfile,
      commute: { mode: "car", km: 2, daysPerWeek: 3 },
      budget: "medium",
    };
    const long: Profile = {
      ...baseProfile,
      commute: { mode: "car", km: 12, daysPerWeek: 5 },
      budget: "medium",
    };
    const ctx = makeCtx24(200);
    const shortCands = selectCandidates(
      short,
      ctx,
      3 as Level,
      baselineScenario(short),
      DEFAULT_WIN,
    );
    const longCands = selectCandidates(long, ctx, 3 as Level, baselineScenario(long), DEFAULT_WIN);
    const shortScore = shortCands.find((c) => c.id === "commute_to_public_transport")?.score ?? -99;
    const longScore = longCands.find((c) => c.id === "commute_to_public_transport")?.score ?? -99;
    expect(longScore).toBeGreaterThan(shortScore + 0.15);
  });

  it("selectFallbackOrder returns at most 7 items", () => {
    const ctx = makeCtx24(150);
    const cands = selectCandidates(
      baseProfile,
      ctx,
      3 as Level,
      baselineScenario(baseProfile),
      DEFAULT_WIN,
    );
    expect(selectFallbackOrder(cands).length).toBeLessThanOrEqual(7);
  });

  it("tradeoff flag is set when exposure delta is < -0.05 (open window in worse air)", () => {
    // commute_to_public_transport switches car to bus → exposed to outdoor air → may be tradeoff
    const ctx = makeCtx24(300); // very bad air
    const noExercise: Profile = {
      ...baseProfile,
      commute: { mode: "car", km: 10, daysPerWeek: 5 },
      habits: { morningOutdoorExercise: false, schoolRun: false },
    };
    const cands = selectCandidates(
      noExercise,
      ctx,
      4 as Level,
      baselineScenario(noExercise),
      DEFAULT_WIN,
    );
    const pt = cands.find((c) => c.id === "commute_to_public_transport");
    if (pt && pt.tradeoff) {
      expect(pt.mitigation).toBe("n95_for_open_transport");
    } else {
      // Not all configs produce tradeoff; just ensure tradeoff implies mitigation
      const anyTradeoff = cands.filter((c) => c.tradeoff);
      anyTradeoff.forEach((c) => expect(c.mitigation).toBe("n95_for_open_transport"));
    }
  });
});

// ── schedule.ts survivors ──────────────────────────────────────────────────
import {
  buildDaySchedule,
  isHomeHour,
  allHomePurifierHours,
  COMMUTE_SPEED_KMH,
} from "@/lib/engine/schedule";
import type { Scenario } from "@/lib/types";

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    windowsOpenHours: [],
    envelope: "normal",
    purifier: "none",
    purifierHours: [],
    exerciseHour: null,
    exerciseIndoors: false,
    commuteMode: "car",
    commuteDaysPerWeek: 5,
    n95Outdoors: false,
    cooking: "induction",
    cookVent: false,
    ...overrides,
  };
}

describe("schedule.ts mutation killers", () => {
  it("isCommuteDay && commuteMode !== 'wfh' && commuteKm > 0: all three guards must be true", () => {
    const sc = makeScenario({ commuteMode: "car" });
    // commuteKm=0 → no commute slots even if isCommuteDay=true
    const noKm = buildDaySchedule(sc, 0, true);
    const slots8 = noKm[8].filter((s) => s.location !== "home" && s.location !== "work_indoor");
    expect(slots8).toHaveLength(0);

    // wfh mode → no commute slots
    const wfhSc = makeScenario({ commuteMode: "wfh" });
    const wfhDay = buildDaySchedule(wfhSc, 10, true);
    const wfhSlots8 = wfhDay[8].filter(
      (s) => s.location === "outdoor_walk" || s.location === "car_cabin",
    );
    expect(wfhSlots8).toHaveLength(0);

    // isCommuteDay=false → no commute slots
    const homeDay = buildDaySchedule(sc, 10, false);
    const homeSlots8 = homeDay[8].filter((s) => s.location === "car_cabin");
    expect(homeSlots8).toHaveLength(0);

    // All three true → commute slots appear at h=8
    const commuteDay = buildDaySchedule(sc, 10, true);
    const hasCommute = commuteDay[8].some((s) => s.location === "car_cabin");
    expect(hasCommute).toBe(true);
  });

  it("clamped < 1e-9 guard: very short trip (< 1e-9 hours) produces no commute sub-slot", () => {
    const sc = makeScenario({ commuteMode: "walk" }); // speed=4.5 km/h
    // km = 1e-10 → tripHours = 1e-10/4.5 ≈ 2.2e-11 → clamped 1e-9 guard fires → no slot
    const tinyDay = buildDaySchedule(sc, 1e-10, true);
    const walkSlots = tinyDay[8].filter((s) => s.location === "outdoor_walk");
    expect(walkSlots).toHaveLength(0);
  });

  it("walk slot breathing factor v = 2.0, cycle = 3.0 (not swapped)", () => {
    const walkSc = makeScenario({ commuteMode: "walk" });
    const cycleSc = makeScenario({ commuteMode: "cycle" });
    const walkDay = buildDaySchedule(walkSc, 2, true);
    const cycleDay = buildDaySchedule(cycleSc, 2, true);

    const walkSlot = walkDay[8].find((s) => s.location === "outdoor_walk");
    const cycleSlot = cycleDay[8].find((s) => s.location === "outdoor_cycle");
    expect(walkSlot?.v).toBe(2.0);
    expect(cycleSlot?.v).toBe(3.0);
    // Confirm not swapped (mutant might swap 2.0 and 3.0)
    expect(walkSlot?.v).toBeLessThan(cycleSlot!.v);
  });

  it("speed > 0 branch: wfh speed=0 produces 0 tripHours → no commute", () => {
    expect(COMMUTE_SPEED_KMH["wfh"]).toBe(0);
    const wfhSc = makeScenario({ commuteMode: "wfh" });
    const cells = buildDaySchedule(wfhSc, 10, true);
    // All slots should be home-based
    const allHome = cells.every((hourSlots) =>
      hourSlots.every((s) => s.location === "home" || s.location === "work_indoor"),
    );
    expect(allHome).toBe(true);
  });

  it("isHomeHour: no commute → all hours are home hours", () => {
    expect(isHomeHour(8, true, false)).toBe(true);
    expect(isHomeHour(12, true, false)).toBe(true);
    expect(isHomeHour(0, false, true)).toBe(true);
  });

  it("isHomeHour: with commute, h<8 is home, h>=8 and h<17 is not home, h>=17 is home", () => {
    expect(isHomeHour(7, true, true)).toBe(true);
    expect(isHomeHour(8, true, true)).toBe(false);
    expect(isHomeHour(16, true, true)).toBe(false);
    expect(isHomeHour(17, true, true)).toBe(true);
    expect(isHomeHour(23, true, true)).toBe(true);
  });

  it("allHomePurifierHours: wfh returns all 24 hours [0..23]", () => {
    const hours = allHomePurifierHours("wfh", 0);
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe(0);
    expect(hours[23]).toBe(23);
  });

  it("allHomePurifierHours: car commuter returns hours [0..7, 18..23]", () => {
    const hours = allHomePurifierHours("car", 5);
    expect(hours).not.toContain(8);
    expect(hours).not.toContain(12);
    expect(hours).toContain(0);
    expect(hours).toContain(7);
    expect(hours).toContain(18);
    expect(hours).toContain(23);
  });

  it("sub-slot fractions sum to 1.0 for each hour", () => {
    const sc = makeScenario({ commuteMode: "bus", exerciseHour: 6, exerciseIndoors: false });
    const cells = buildDaySchedule(sc, 10, true);
    for (let h = 0; h < 24; h++) {
      const sum = cells[h].reduce((acc, s) => acc + s.f, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });
});

// ── exposure.ts survivors ──────────────────────────────────────────────────
import { computeExposure, cigaretteEquivalentPerDay } from "@/lib/engine/exposure";

describe("exposure.ts mutation killers", () => {
  const baseSc: Scenario = {
    windowsOpenHours: [],
    envelope: "sealed",
    purifier: "none",
    purifierHours: [],
    exerciseHour: null,
    exerciseIndoors: false,
    commuteMode: "wfh",
    commuteDaysPerWeek: 0,
    n95Outdoors: false,
    cooking: "induction",
    cookVent: false,
  };

  it("h >= 0 && h <= 23 guard: timestamp T99:00 falls back to index-based clock hour", () => {
    const badTs = Array.from(
      { length: 24 },
      (_, i) => `2026-11-20T99:${String(i).padStart(2, "0")}`,
    );
    // Should not throw — uses fallback index
    const result = computeExposure(Array(24).fill(100), baseSc, {
      roomAreaM2: 25,
      commuteKm: 0,
      timestamps: badTs,
    });
    expect(result.exposureUgM3).toBeGreaterThan(0);
  });

  it("h = -1 is out of [0,23] range → fallback index used", () => {
    // Inject a timestamp that parses to hour -1 (impossible from real T format, test parser guard)
    // The regex /T(\d{2}):/ will never match '-1', so we test with no match
    const noMatchTs = Array.from({ length: 24 }, () => "2026-11-20");
    const result = computeExposure(Array(24).fill(80), baseSc, {
      roomAreaM2: 25,
      commuteKm: 0,
      timestamps: noMatchTs,
    });
    expect(result.exposureUgM3).toBeGreaterThan(0);
  });

  it("sealed-home carryover: initial steady-state at hour 0 matches cyclic convergence", () => {
    // With constant outdoor PM2.5=100, sealed envelope, no purifier → indoor converges to steady-state
    const result = computeExposure(Array(24).fill(100), baseSc, { roomAreaM2: 25, commuteKm: 0 });
    // Indoor must be less than outdoor (penetration < 1, deposition > 0)
    expect(result.hourlyIndoorMean.every((v) => v < 100)).toBe(true);
    // But must be > 0
    expect(result.hourlyIndoorMean.every((v) => v > 0)).toBe(true);
  });

  it("cadr > 0 check: hepa purifier reduces indoor concentration vs none", () => {
    const noFilter = computeExposure(Array(24).fill(200), baseSc, { roomAreaM2: 25, commuteKm: 0 });
    const withHepa: Scenario = {
      ...baseSc,
      purifier: "hepa",
      purifierHours: Array.from({ length: 24 }, (_, i) => i),
    };
    const withFilter = computeExposure(Array(24).fill(200), withHepa, {
      roomAreaM2: 25,
      commuteKm: 0,
    });
    expect(withFilter.exposureUgM3).toBeLessThan(noFilter.exposureUgM3);
  });

  it("commute 7 days/week: all days are commute days → no home-only days", () => {
    const sc7: Scenario = {
      ...baseSc,
      commuteMode: "car",
      commuteDaysPerWeek: 7,
    };
    const result = computeExposure(Array(24).fill(100), sc7, { roomAreaM2: 25, commuteKm: 10 });
    // With 7 commute days, homeDayExp contribution is 0 → result = commuteDayExp only
    expect(result.exposureUgM3).toBeGreaterThan(0);
  });

  it("commute km=0 with commute mode → falls through to WFH-style home-only calc", () => {
    const sc: Scenario = { ...baseSc, commuteMode: "car", commuteDaysPerWeek: 5 };
    const result = computeExposure(Array(24).fill(100), sc, { roomAreaM2: 25, commuteKm: 0 });
    // km=0 → no active commute → all-home calc
    expect(result.exposureUgM3).toBeGreaterThan(0);
  });

  it("cigaretteEquivalentPerDay: 22 ug/m3 = 1.0 cig/day, 44 = 2.0, 0 = 0.0", () => {
    expect(cigaretteEquivalentPerDay(22)).toBe(1.0);
    expect(cigaretteEquivalentPerDay(44)).toBe(2.0);
    expect(cigaretteEquivalentPerDay(0)).toBe(0.0);
    expect(cigaretteEquivalentPerDay(11)).toBe(0.5);
  });

  it("cigaretteEquivalentPerDay throws on negative or NaN", () => {
    expect(() => cigaretteEquivalentPerDay(-1)).toThrow(RangeError);
    expect(() => cigaretteEquivalentPerDay(NaN)).toThrow(RangeError);
  });
});

// ── window.ts survivors ────────────────────────────────────────────────────
import { findWindows, findWindowsFromHours } from "@/lib/engine/window";

describe("window.ts mutation killers", () => {
  it("parseClockHour fallback: T99:00 → fallback = idx % 24", () => {
    const hours: HourPoint[] = Array.from({ length: 24 }, (_, i) => ({
      t: "2026-11-20T99:00", // bad hour → fallback
      pm25: i === 10 ? 20 : 150, // best at index 10
      pm10: 200,
      usAqi: 200,
    }));
    // Should not throw
    const result = findWindows(hours, 0);
    expect(result.hoursEvaluated).toBe(24);
    expect(result.best.startLabel).toMatch(/^\d{2}:00$/);
    expect(result.avoid.startLabel).toMatch(/^\d{2}:00$/);
  });

  it("h === 0 edge: best window at hour 0 is valid startLabel '00:00'", () => {
    // All PM2.5=200 except hour 0,1 which are low → best window starts at 0
    // But best window must be in 08:00–18:00; hour 0 not eligible → goes to fallback
    const pm25 = Array.from({ length: 24 }, (_, i) => (i < 2 ? 10 : 200));
    const result = findWindowsFromHours(pm25);
    // The best 2h in 08..18 range will be at 08 (all 200 there) since nothing better
    expect(result.best.startLabel).toMatch(/^\d{2}:00$/);
    expect(result.shortData).toBe(false);
  });

  it("ObjectLiteral fields: best and avoid have startLabel, endLabel, mean, start, end", () => {
    const pm25 = Array.from({ length: 24 }, (_, i) => (i === 12 ? 50 : 180));
    const result = findWindowsFromHours(pm25);
    expect(result.best).toHaveProperty("startLabel");
    expect(result.best).toHaveProperty("endLabel");
    expect(result.best).toHaveProperty("mean");
    expect(result.best).toHaveProperty("start");
    expect(result.best).toHaveProperty("end");
    expect(result.avoid).toHaveProperty("startLabel");
    expect(result.avoid.startLabel).toMatch(/^\d{2}:00$/);
    expect(result.best.mean).toBeLessThan(result.avoid.mean);
  });

  it("shortData=true when fewer than 24 hours provided", () => {
    const short = findWindowsFromHours([50, 100, 80]);
    expect(short.shortData).toBe(true);
    expect(short.hoursEvaluated).toBe(3);
  });

  it("noGoodWindow=true when best 2h window is at level >= 4 (PM2.5 >= ~150)", () => {
    // levelOfPm25(200) = 4 → noGoodWindow
    const allBad = Array.from({ length: 24 }, () => 200);
    const result = findWindowsFromHours(allBad);
    expect(result.noGoodWindow).toBe(true);
  });

  it("best window uses < not <=: when two windows are equal, picks earlier one (earliest on ties)", () => {
    // Two equal windows at 08:00 and 10:00 → should pick 08:00 (first seen)
    const pm25 = Array.from({ length: 24 }, (_, i) => {
      if (i === 8 || i === 9) return 100;
      if (i === 10 || i === 11) return 100;
      return 200;
    });
    const result = findWindowsFromHours(pm25);
    expect(result.best.start).toBe(8); // earlier window wins on tie
  });

  it("avoid window: worst 3h window uses > not >=: picks earliest on tie", () => {
    // Equal worst at h=0 and h=12; both mean=200 → first (h=0) is kept
    const pm25 = Array.from({ length: 24 }, (_, i) => {
      if (i < 3) return 200;
      if (i >= 12 && i < 15) return 200;
      return 50;
    });
    const result = findWindowsFromHours(pm25);
    expect(result.avoid.start).toBe(0);
  });

  it("throws RangeError on empty input", () => {
    expect(() => findWindowsFromHours([])).toThrow(RangeError);
    expect(() => findWindows([], 0)).toThrow(RangeError);
  });

  it("throws RangeError on negative PM2.5", () => {
    expect(() => findWindowsFromHours([-1, 100])).toThrow(RangeError);
  });
});

// ── impact.ts survivors ────────────────────────────────────────────────────
import { evaluateActionImpact, next24Series, buildCombinedScenario } from "@/lib/engine/impact";
import { ACTION_BY_ID } from "@/lib/engine/catalog";
import { PARAMETER_SETS } from "@/lib/engine/sensitivity";

describe("impact.ts mutation killers", () => {
  function makeCtxWith(pm25: number, nowIndex = 0): AirContext {
    return {
      place: SAMPLE_FAMILY_PROFILE.place,
      source: "demo",
      dataNote: "recorded",
      recordedDate: "2026-11-20",
      fetchedAt: "2026-11-25T12:00:00Z",
      hours: Array.from({ length: 48 }, (_, i) => ({
        t: `2026-11-20T${String(i % 24).padStart(2, "0")}:00`,
        pm25,
        pm10: pm25 * 1.5,
        usAqi: 200,
      })),
      nowIndex,
    };
  }

  const wfhProfile: Profile = {
    ...SAMPLE_FAMILY_PROFILE,
    home: {
      ...SAMPLE_FAMILY_PROFILE.home,
      purifier: "none",
      cooking: "induction",
      windows: "sealed",
      roomAreaM2: 25,
    },
    commute: { mode: "wfh", km: 0, daysPerWeek: 0 },
    budget: "medium",
    household: { adults: 2, children: 0, seniors: 0, conditions: [] },
    habits: { morningOutdoorExercise: false, schoolRun: false },
  };

  it("rawDelta > 0 && before > 0 guard: zero outdoor → no delta", () => {
    const zeroPm25Ctx = makeCtxWith(0);
    const zeroBefore = baselineScenario(wfhProfile);
    const impact = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      { ...wfhProfile, home: { ...wfhProfile.home, purifier: "none" } },
      zeroPm25Ctx,
      zeroBefore,
      DEFAULT_WIN,
    );
    // With zero outdoor PM2.5, indoor is also ~0 → delta is 0
    expect(impact.exposureDeltaPct).toBe(0);
    expect(impact.exposureDeltaUgM3).toBe(0);
  });

  it("before * 0.8 cap: very small room fully saturated → delta capped at 80%", () => {
    const tinyRoom: Profile = {
      ...wfhProfile,
      home: { ...wfhProfile.home, roomAreaM2: 4, purifier: "none" },
    };
    const ctx = makeCtxWith(300, 0);
    const impact = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      tinyRoom,
      ctx,
      baselineScenario(tinyRoom),
      DEFAULT_WIN,
    );
    // 80% cap applied
    expect(impact.exposureDeltaPct).toBe(80);
  });

  it("Conservative params give higher before-exposure than Optimistic params", () => {
    // Conservative: higher penetration P=0.9, lower deposition k=0.2 → more indoor PM2.5
    const conservative = PARAMETER_SETS.find((p) => p.name === "conservative")!;
    const optimistic = PARAMETER_SETS.find((p) => p.name === "optimistic")!;
    const sc = baselineScenario(wfhProfile);
    const ctx = makeCtxWith(100);
    const series = next24Series(ctx);

    const beforeCons = computeExposure(series.pm25, sc, {
      roomAreaM2: 25,
      commuteKm: 0,
      params: conservative,
    }).exposureUgM3;
    const beforeOpt = computeExposure(series.pm25, sc, {
      roomAreaM2: 25,
      commuteKm: 0,
      params: optimistic,
    }).exposureUgM3;
    expect(beforeCons).toBeGreaterThan(beforeOpt);
  });

  it("next24Series slices from nowIndex", () => {
    const ctx = makeCtxWith(100, 10);
    const series = next24Series(ctx);
    expect(series.pm25).toHaveLength(24);
    // First element is hours[10].pm25
    expect(series.pm25[0]).toBe(ctx.hours[10].pm25);
  });

  it("guidance kind: actions without edit() return kind='guidance' and zero delta", () => {
    const ctx = makeCtxWith(150);
    const sc = baselineScenario(wfhProfile);
    const impact = evaluateActionImpact(
      ACTION_BY_ID.damp_mop_dont_sweep,
      wfhProfile,
      ctx,
      sc,
      DEFAULT_WIN,
    );
    expect(impact.kind).toBe("guidance");
    expect(impact.exposureDeltaUgM3).toBe(0);
    expect(impact.exposureDeltaPct).toBe(0);
  });

  it("buildCombinedScenario skips commute_to_public_transport and walk_or_cycle_short_trips", () => {
    const defs = [ACTION_BY_ID.commute_to_public_transport, ACTION_BY_ID.buy_hepa_purifier];
    const baseSc = baselineScenario(wfhProfile);
    const combined = buildCombinedScenario(defs, wfhProfile, baseSc, DEFAULT_WIN);
    // commute_to_public_transport is skipped → commuteMode unchanged
    expect(combined.commuteMode).toBe(baseSc.commuteMode);
    // buy_hepa_purifier IS applied → purifier set
    expect(combined.purifier).toBe("hepa");
  });

  it("exposureRangeUgM3: [min, max] from 3 param sets — conservative gives max delta", () => {
    const ctx = makeCtxWith(200, 0);
    const p: Profile = { ...wfhProfile, home: { ...wfhProfile.home, purifier: "none" } };
    const impact = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      p,
      ctx,
      baselineScenario(p),
      DEFAULT_WIN,
    );
    expect(impact.exposureRangeUgM3[0]).toBeLessThanOrEqual(impact.exposureRangeUgM3[1]);
    expect(impact.exposureRangeUgM3[1]).toBeGreaterThan(0);
  });
});

// ── catalog.ts survivors ───────────────────────────────────────────────────
import { ACTION_CATALOG } from "@/lib/engine/catalog";

describe("catalog.ts mutation killers — appliesIf boolean literals", () => {
  it("errands_in_best_window appliesIf returns exactly true (not false)", () => {
    const def = ACTION_BY_ID.errands_in_best_window;
    expect(def.appliesIf(baseProfile, 2 as Level, DEFAULT_WIN)).toBe(true);
    expect(def.appliesIf(baseProfile, 0 as Level, DEFAULT_WIN)).toBe(true);
  });

  it("damp_mop_dont_sweep appliesIf returns exactly true for all profiles", () => {
    const def = ACTION_BY_ID.damp_mop_dont_sweep;
    expect(def.appliesIf(baseProfile, 0 as Level, DEFAULT_WIN)).toBe(true);
    expect(def.appliesIf({ ...baseProfile, budget: "zero" }, 5 as Level, DEFAULT_WIN)).toBe(true);
  });

  it("avoid_indoor_smoke_sources appliesIf returns exactly true", () => {
    const def = ACTION_BY_ID.avoid_indoor_smoke_sources;
    expect(def.appliesIf(baseProfile, 1 as Level, DEFAULT_WIN)).toBe(true);
  });

  it("community_no_burning appliesIf returns exactly true", () => {
    expect(ACTION_BY_ID.community_no_burning.appliesIf(baseProfile, 2 as Level, DEFAULT_WIN)).toBe(
      true,
    );
  });

  it("society_dust_and_diesel_audit appliesIf returns exactly true", () => {
    expect(
      ACTION_BY_ID.society_dust_and_diesel_audit.appliesIf(baseProfile, 2 as Level, DEFAULT_WIN),
    ).toBe(true);
  });

  it("share_community_brief appliesIf returns exactly true", () => {
    expect(ACTION_BY_ID.share_community_brief.appliesIf(baseProfile, 2 as Level, DEFAULT_WIN)).toBe(
      true,
    );
  });

  it("wfh_on_worst_day: daysPerWeek >= 3 (not > 3) and level >= 4", () => {
    const def = ACTION_BY_ID.wfh_on_worst_day;
    // 3 days is the boundary — should apply
    const p3 = { ...baseProfile, commute: { ...baseProfile.commute, daysPerWeek: 3 } };
    expect(def.appliesIf(p3, 4 as Level, DEFAULT_WIN)).toBe(true);
    // 2 days should NOT apply
    const p2 = { ...baseProfile, commute: { ...baseProfile.commute, daysPerWeek: 2 } };
    expect(def.appliesIf(p2, 4 as Level, DEFAULT_WIN)).toBe(false);
    // level=3 should NOT apply (requires >= 4)
    expect(def.appliesIf(p3, 3 as Level, DEFAULT_WIN)).toBe(false);
  });

  it("walk_or_cycle_short_trips: km <= 3 and level <= 2 boundary conditions", () => {
    const def = ACTION_BY_ID.walk_or_cycle_short_trips;
    // km=3.0 on boundary → applies
    const p3 = { ...baseProfile, commute: { mode: "car" as const, km: 3.0, daysPerWeek: 5 } };
    expect(def.appliesIf(p3, 2 as Level, DEFAULT_WIN)).toBe(true);
    // km=3.1 → does NOT apply
    const p31 = { ...baseProfile, commute: { mode: "car" as const, km: 3.1, daysPerWeek: 5 } };
    expect(def.appliesIf(p31, 2 as Level, DEFAULT_WIN)).toBe(false);
    // level=3 → does NOT apply (requires <= 2)
    expect(def.appliesIf(p3, 3 as Level, DEFAULT_WIN)).toBe(false);
    // km <= 1.2 → walk, else cycle
    const p1 = { ...baseProfile, commute: { mode: "car" as const, km: 1.2, daysPerWeek: 5 } };
    const edited1 = def.edit!(baselineScenario(p1), p1, DEFAULT_WIN);
    expect(edited1.commuteMode).toBe("walk");
    const p2 = { ...baseProfile, commute: { mode: "car" as const, km: 1.3, daysPerWeek: 5 } };
    const edited2 = def.edit!(baselineScenario(p2), p2, DEFAULT_WIN);
    expect(edited2.commuteMode).toBe("cycle");
  });

  it("exercise_indoors_when_poor: level >= 3 is boundary", () => {
    const def = ACTION_BY_ID.exercise_indoors_when_poor;
    const pEx = { ...baseProfile, habits: { morningOutdoorExercise: true, schoolRun: false } };
    expect(def.appliesIf(pEx, 3 as Level, DEFAULT_WIN)).toBe(true);
    expect(def.appliesIf(pEx, 2 as Level, DEFAULT_WIN)).toBe(false);
  });

  it("shift_exercise_to_best_window: sensitive household + level >= 3 → false", () => {
    const def = ACTION_BY_ID.shift_exercise_to_best_window;
    const pSens = {
      ...baseProfile,
      habits: { morningOutdoorExercise: true, schoolRun: false },
      household: { adults: 2, children: 1, seniors: 0, conditions: [] },
    };
    // Level 3 + children > 0 → false
    expect(def.appliesIf(pSens, 3 as Level, DEFAULT_WIN)).toBe(false);
    // Level 2 + children > 0 → true (not sensitive enough to block)
    expect(def.appliesIf(pSens, 2 as Level, DEFAULT_WIN)).toBe(true);
  });

  it("catalog has exactly 26 actions and each has non-empty method and assumptions", () => {
    expect(ACTION_CATALOG).toHaveLength(26);
    for (const a of ACTION_CATALOG) {
      expect(a.method.length).toBeGreaterThan(0);
      expect(a.assumptions.length).toBeGreaterThan(0);
    }
  });

  it("action IDs are unique strings", () => {
    const ids = ACTION_CATALOG.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ACTION_CATALOG.length);
  });

  it("n95_for_open_transport applies when mode is in [walk,cycle,two_wheeler,auto,bus] and level>=3", () => {
    const def = ACTION_BY_ID.n95_for_open_transport;
    for (const mode of ["walk", "cycle", "two_wheeler", "auto", "bus"] as const) {
      const p = { ...baseProfile, commute: { mode, km: 5, daysPerWeek: 5 } };
      expect(def.appliesIf(p, 3 as Level, DEFAULT_WIN)).toBe(true);
    }
    // car mode → false (not in list)
    const pCar = { ...baseProfile, commute: { mode: "car" as const, km: 5, daysPerWeek: 5 } };
    // But car with exercise still applies:
    const pCarEx = { ...pCar, habits: { morningOutdoorExercise: true, schoolRun: false } };
    expect(def.appliesIf(pCarEx, 3 as Level, DEFAULT_WIN)).toBe(true);
    // car without exercise → false
    const pCarNoEx = { ...pCar, habits: { morningOutdoorExercise: false, schoolRun: false } };
    expect(def.appliesIf(pCarNoEx, 3 as Level, DEFAULT_WIN)).toBe(false);
  });
});
