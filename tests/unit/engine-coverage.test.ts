import { describe, it, expect } from "vitest";
import { guidanceForLevel, next24hMeanPm25 } from "@/lib/engine/bands";
import { ACTION_BY_ID, ACTION_CATALOG } from "@/lib/engine/catalog";
import {
  co2eSavedKgPerYear,
  co2eSavedRangeKgPerYear,
  idlingCo2eSaved,
  tripChainingCo2eSaved,
} from "@/lib/engine/emissions";
import { cigaretteEquivalentPerDay, computeExposure } from "@/lib/engine/exposure";
import { buildCombinedScenario, evaluateActionImpact, next24Series } from "@/lib/engine/impact";
import { trailingNaqi } from "@/lib/engine/naqi";
import { allHomePurifierHours, buildDaySchedule, isHomeHour } from "@/lib/engine/schedule";
import { householdGroups, selectCandidates, selectFallbackOrder } from "@/lib/engine/select";
import {
  airExchangeForHour,
  BASE_PARAMS,
  baselineScenario,
  cookingSourceForHour,
} from "@/lib/engine/sensitivity";
import { findWindows, findWindowsFromHours } from "@/lib/engine/window";
import { SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import type {
  ActionId,
  AirContext,
  HourPoint,
  Level,
  Profile,
  Scenario,
  WindowSummary,
} from "@/lib/types";

function makeHours(values: number[], startHour = 0): HourPoint[] {
  return values.map((pm25, i) => {
    const h = (startHour + i) % 24;
    return {
      t: `2026-11-20T${String(h).padStart(2, "0")}:00`,
      pm25,
      pm10: pm25 * 1.5,
      usAqi: 150,
    };
  });
}

function makeCtx(values: number[], nowIndex = 0, startHour = 0): AirContext {
  return {
    place: SAMPLE_FAMILY_PROFILE.place,
    source: "demo",
    dataNote: "recorded",
    recordedDate: "2026-11-20",
    fetchedAt: "2026-11-25T12:00:00Z",
    hours: makeHours(values, startHour),
    nowIndex,
  };
}

const DEFAULT_WINDOWS: WindowSummary = {
  best: { start: 12, end: 14, mean: 120, startLabel: "12:00", endLabel: "14:00" },
  avoid: { start: 7, end: 10, mean: 300, startLabel: "07:00", endLabel: "10:00" },
  noGoodWindow: false,
  shortData: false,
  hoursEvaluated: 24,
};

const STRICT_WINDOWS: WindowSummary = {
  ...DEFAULT_WINDOWS,
  noGoodWindow: true,
  avoid: { start: 4, end: 7, mean: 300, startLabel: "04:00", endLabel: "07:00" },
};

describe("engine behavior & boundary coverage (T03-T09)", () => {
  it("bands & guidance handle next24hMeanPm25 bounds, zero values, and all 6 levels", () => {
    expect(() => next24hMeanPm25([], 0)).toThrow(RangeError);
    expect(() =>
      next24hMeanPm25([{ t: "2026-11-20T00:00", pm25: -1, pm10: 0, usAqi: 0 }], 0),
    ).toThrow(RangeError);

    const h48 = makeHours([...Array.from({ length: 24 }, () => 10), ...Array.from({ length: 24 }, () => 80)]);
    expect(next24hMeanPm25(h48, 24)).toBe(80);
    expect(next24hMeanPm25(makeHours([0, 30, 50]), -5)).toBeCloseTo(80 / 3, 4);
    expect(next24hMeanPm25(makeHours([10, 30, 50]), 99)).toBe(50);

    for (const lvl of [0, 1, 2, 3, 4, 5] as Level[]) {
      const en = guidanceForLevel(lvl, "en");
      const hi = guidanceForLevel(lvl, "hi");
      expect(en.level).toBe(lvl);
      expect(en.band.length).toBeGreaterThan(2);
      expect(hi.everyone.length).toBeGreaterThan(2);
      expect(hi.sensitive.length).toBeGreaterThan(2);
    }
  });

  it("trailingNaqi enforces >= 16 hours, trailing 24h windowing, 0-PM2.5 validity, and Severe anchors", () => {
    expect(trailingNaqi([], 0)).toEqual({ sufficient: false, validHours: 0 });

    // 48h where first 10h are extreme (400) and trailing 24h (idx 16..39) are 60
    const h48 = makeHours([...Array.from({ length: 16 }, () => 400), ...Array.from({ length: 24 }, () => 60)]);
    const res48 = trailingNaqi(h48, 39);
    expect(res48).toEqual({
      sufficient: true,
      validHours: 24,
      index: 100,
      category: "Satisfactory",
      dominant: "pm25",
      assumptionUsed: false,
    });

    // Zero PM2.5 is valid; NaN is excluded
    const zeros16 = makeHours(Array.from({ length: 16 }, () => 0));
    zeros16.push({ t: "2026-11-20T16:00", pm25: Number.NaN, pm10: 0, usAqi: 0 });
    expect(trailingNaqi(zeros16, 16)).toEqual({
      sufficient: true,
      validHours: 16,
      index: 0,
      category: "Good",
      dominant: "pm25",
      assumptionUsed: false,
    });

    // Exactly 15 valid hours -> insufficient
    const invalid16 = [...zeros16.slice(0, 15), { t: "2026-11-20T15:00", pm25: -1, pm10: 0, usAqi: 0 }];
    expect(trailingNaqi(invalid16, 15)).toEqual({ sufficient: false, validHours: 15 });

    // Boundary 250 (no assumption) vs 251 (assumption) and PM10 430 vs 431
    const pm25_250 = makeHours(Array.from({ length: 16 }, () => 250)).map((h) => ({ ...h, pm10: 100 }));
    expect(trailingNaqi(pm25_250, 15).assumptionUsed).toBe(false);
    const pm25_251 = makeHours(Array.from({ length: 16 }, () => 251)).map((h) => ({ ...h, pm10: 100 }));
    expect(trailingNaqi(pm25_251, 15).assumptionUsed).toBe(true);

    const pm10_430 = makeHours(Array.from({ length: 16 }, () => 60)).map((h) => ({ ...h, pm10: 430 }));
    expect(trailingNaqi(pm10_430, 15).assumptionUsed).toBe(false);
    const pm10_431 = makeHours(Array.from({ length: 16 }, () => 60)).map((h) => ({ ...h, pm10: 431 }));
    expect(trailingNaqi(pm10_431, 15)).toMatchObject({ assumptionUsed: true, dominant: "pm10" });
  });

  it("sensitivity, baselineScenario, cooking source, and air exchange cover all envelopes", () => {
    const sealed = baselineScenario({
      ...SAMPLE_FAMILY_PROFILE,
      home: { ...SAMPLE_FAMILY_PROFILE.home, windows: "sealed", purifier: "hepa" },
      habits: { morningOutdoorExercise: false, schoolRun: false },
    });
    expect(sealed.windowsOpenHours).toEqual([]);
    expect(sealed.purifierHours).toEqual([18, 19, 20, 21]);
    expect(sealed.exerciseHour).toBeNull();

    const leaky = baselineScenario({
      ...SAMPLE_FAMILY_PROFILE,
      home: { ...SAMPLE_FAMILY_PROFILE.home, windows: "leaky" },
    });
    expect(leaky.windowsOpenHours).toHaveLength(24);
    expect(airExchangeForHour("leaky", false, BASE_PARAMS)).toBe(2.0);
    expect(airExchangeForHour("sealed", false, BASE_PARAMS)).toBe(0.3);
    expect(airExchangeForHour("sealed", true, BASE_PARAMS)).toBe(4.0);
    expect(airExchangeForHour("normal", false, BASE_PARAMS)).toBe(0.7);

    expect(cookingSourceForHour(7, "biomass", false, BASE_PARAMS)).toBe(60);
    expect(cookingSourceForHour(19, "biomass", true, BASE_PARAMS)).toBe(30);
    expect(cookingSourceForHour(12, "biomass", false, BASE_PARAMS)).toBe(0);
  });

  it("emissions compute exact boundaries, mode ranges, idling, and trip chaining", () => {
    expect(() => co2eSavedKgPerYear(-0.1, 5, "car", "bus")).toThrow(RangeError);
    expect(() => co2eSavedKgPerYear(Number.NaN, 5, "car", "bus")).toThrow(RangeError);
    expect(() => co2eSavedKgPerYear(10, -1, "car", "bus")).toThrow(RangeError);
    expect(() => co2eSavedKgPerYear(10, 7.1, "car", "bus")).toThrow(RangeError);
    expect(() => co2eSavedKgPerYear(10, Number.POSITIVE_INFINITY, "car", "bus")).toThrow(RangeError);

    expect(co2eSavedKgPerYear(0, 0, "car", "bus")).toBe(0);
    expect(co2eSavedKgPerYear(10, 7, "car", "wfh")).toBeCloseTo(10 * 2 * 7 * 48 * 0.17, 4);

    const [lo, hi] = co2eSavedRangeKgPerYear(12, 5, "car", "metro");
    const mid = co2eSavedKgPerYear(12, 5, "car", "metro");
    expect(lo).toBeGreaterThan(0);
    expect(lo).toBeLessThan(mid);
    expect(hi).toBeGreaterThan(mid);
    expect(lo).toBeCloseTo(12 * 2 * 5 * 48 * (0.11 - 0.045), 4);
    expect(hi).toBeCloseTo(12 * 2 * 5 * 48 * (0.24 - 0.02), 4);

    const idle = idlingCo2eSaved();
    expect(idle.kg).toBeCloseTo(38.5, 1);
    expect(idle.range).toEqual([28.9, 48.1]);

    const chain = tripChainingCo2eSaved(12, 5, "car");
    expect(chain.kg).toBeCloseTo(97.9, 1);
    expect(chain.range[0]).toBeCloseTo(49.0, 1);
    expect(chain.range[1]).toBeCloseTo(146.9, 1);
  });

  it("schedule & exposure preserve exact slot breathing weights, cabin factors, N95 eligibility, and timestamps", () => {
    const base = baselineScenario(SAMPLE_FAMILY_PROFILE);
    // Check walk, cycle, open transit, car, metro slots and concentrations
    const walkDay = buildDaySchedule({ ...base, commuteMode: "walk", exerciseHour: null }, 4.5, true);
    expect(walkDay[8][0]).toEqual({ f: 1, location: "outdoor_walk", v: 2, n95Eligible: true });
    expect(walkDay[17][0]).toEqual({ f: 1, location: "outdoor_walk", v: 2, n95Eligible: true });

    const longCycle = buildDaySchedule({ ...base, commuteMode: "cycle", exerciseHour: 8 }, 21, true); // 1.5h trip -> spills to h9, h18
    expect(longCycle[8].some((s) => s.location === "outdoor_exercise" && s.f === 0.5)).toBe(true);
    expect(longCycle[8].some((s) => s.location === "outdoor_cycle" && s.f === 0.5)).toBe(true);
    expect(longCycle[9].some((s) => s.location === "outdoor_cycle" && s.f === 0.5)).toBe(true);
    expect(longCycle[17][0]).toEqual({ f: 1, location: "outdoor_cycle", v: 3, n95Eligible: true });
    expect(longCycle[18].some((s) => s.location === "outdoor_cycle" && s.f === 0.5)).toBe(true);

    const metroDay = buildDaySchedule({ ...base, commuteMode: "metro", exerciseHour: null }, 15, true);
    expect(metroDay[8][0]).toEqual({ f: 0.5, location: "metro_cabin", v: 1, n95Eligible: false });
    expect(metroDay[12][0]).toEqual({ f: 1, location: "work_indoor", v: 1, n95Eligible: false });
    expect(metroDay[23][0]).toEqual({ f: 1, location: "home", v: 0.8, n95Eligible: false });

    const twoWheel = buildDaySchedule({ ...base, commuteMode: "two_wheeler", exerciseHour: null }, 9, true);
    expect(twoWheel[8][0]).toEqual({ f: 0.5, location: "outdoor_open_transit", v: 1, n95Eligible: true });
    const autoDay = buildDaySchedule({ ...base, commuteMode: "auto", exerciseHour: null }, 9, true);
    expect(autoDay[8][0]).toEqual({ f: 0.5, location: "outdoor_open_transit", v: 1, n95Eligible: true });

    // Non-commute day or km=0 must keep hour 8 indoor at home
    const nonCommute = buildDaySchedule({ ...base, commuteMode: "car", exerciseHour: null }, 15, false);
    expect(nonCommute[8][0]).toEqual({ f: 1, location: "home", v: 1, n95Eligible: false });
    const zeroKm = buildDaySchedule({ ...base, commuteMode: "car", exerciseHour: null }, 0, true);
    expect(zeroKm[8][0]).toEqual({ f: 1, location: "home", v: 1, n95Eligible: false });
    const indoorEx = buildDaySchedule({ ...base, commuteMode: "wfh", exerciseHour: 8, exerciseIndoors: true }, 0, true);
    expect(indoorEx[8][0]).toEqual({ f: 0.5, location: "indoor_exercise", v: 2.5, n95Eligible: false });

    expect(isHomeHour(7, true, true)).toBe(true);
    expect(isHomeHour(8, true, true)).toBe(false);
    expect(isHomeHour(16, true, true)).toBe(false);
    expect(isHomeHour(17, true, true)).toBe(true);
    expect(isHomeHour(12, false, true)).toBe(true);
    expect(isHomeHour(12, true, false)).toBe(true);
    expect(allHomePurifierHours("wfh", 5)).toHaveLength(24);
    expect(allHomePurifierHours("car", 0)).toHaveLength(24);
    expect(allHomePurifierHours("car", 5)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 18, 19, 20, 21, 22, 23]);

    // Compare constant 200 ug/m3 exposure across car (0.6x) vs metro (0.7x) vs bus (1.0x) vs N95
    const out200 = Array.from({ length: 24 }, () => 200);
    const shuttleBase: Scenario = {
      ...base,
      windowsOpenHours: [],
      purifier: "none",
      purifierHours: [],
      exerciseHour: null,
      cooking: "induction",
      commuteDaysPerWeek: 7,
    };
    const eCar = computeExposure(out200, { ...shuttleBase, commuteMode: "car" }, { roomAreaM2: 15, commuteKm: 20 }).exposureUgM3;
    const eMetro = computeExposure(out200, { ...shuttleBase, commuteMode: "metro" }, { roomAreaM2: 15, commuteKm: 30 }).exposureUgM3;
    const eBus = computeExposure(out200, { ...shuttleBase, commuteMode: "bus" }, { roomAreaM2: 15, commuteKm: 18 }).exposureUgM3;
    const eBusN95 = computeExposure(out200, { ...shuttleBase, commuteMode: "bus", n95Outdoors: true }, { roomAreaM2: 15, commuteKm: 18 }).exposureUgM3;
    expect(eCar).toBeLessThan(eMetro);
    expect(eMetro).toBeLessThan(eBus);
    expect(eBusN95).toBeLessThan(eCar);

    // Non-matching timestamp fallback vs shifted timestamp changes commute timing exposure
    const diurnal = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 17 ? 50 : 300));
    const shiftedTs = diurnal.map((_, i) => `2026-11-20T${String((i + 12) % 24).padStart(2, "0")}:00`);
    const expAligned = computeExposure(diurnal, shuttleBase, { roomAreaM2: 15, commuteKm: 10 });
    const expShifted = computeExposure(diurnal, shuttleBase, { roomAreaM2: 15, commuteKm: 10, timestamps: shiftedTs });
    expect(expShifted.exposureUgM3).not.toBeCloseTo(expAligned.exposureUgM3, 1);

    const badTsExp = computeExposure(diurnal, shuttleBase, {
      roomAreaM2: 15,
      commuteKm: 10,
      timestamps: diurnal.map(() => "bad-format"),
    });
    expect(badTsExp.exposureUgM3).toBeCloseTo(expAligned.exposureUgM3, 6);

    // Out-of-range hour T99:00 must fall back to index % 24, and sealed-home carryover affects hour 0
    const invalidHourTs = diurnal.map(() => "2026-11-20T99:00");
    const expInvalidHour = computeExposure(diurnal, shuttleBase, {
      roomAreaM2: 15,
      commuteKm: 10,
      timestamps: invalidHourTs,
    });
    expect(expInvalidHour.exposureUgM3).toBeCloseTo(expAligned.exposureUgM3, 6);
    const stepDay = Array.from({ length: 24 }, (_, h) => (h < 12 ? 20 : 300));
    const sealedStep = computeExposure(stepDay, { ...shuttleBase, envelope: "sealed" }, { roomAreaM2: 15, commuteKm: 0 });
    expect(sealedStep.hourlyIndoorMean[0]).toBeGreaterThan(20);

    expect(() => computeExposure([], base, { roomAreaM2: 15, commuteKm: 5 })).toThrow(RangeError);
    expect(() => computeExposure([-1], base, { roomAreaM2: 15, commuteKm: 5 })).toThrow(RangeError);
    expect(cigaretteEquivalentPerDay(44)).toBe(2);
    expect(cigaretteEquivalentPerDay(0)).toBe(0);
    expect(() => cigaretteEquivalentPerDay(-0.1)).toThrow(RangeError);
    expect(() => cigaretteEquivalentPerDay(Number.NaN)).toThrow(RangeError);
  });

  it("window finder handles non-contiguous hours, 08..20 boundary, nowIndex slicing, and tie breaks", () => {
    expect(() => findWindows([], 0)).toThrow(RangeError);
    expect(() => findWindowsFromHours([])).toThrow(RangeError);
    expect(() => findWindowsFromHours([-1])).toThrow(RangeError);
    expect(() => findWindowsFromHours([Number.POSITIVE_INFINITY])).toThrow(RangeError);

    // Only hours 08..19 qualify when lower values exist at 00..07 or 20..23
    const dayWithCleanNight = Array.from({ length: 24 }, (_, h) =>
      h >= 8 && h <= 19 ? (h === 18 || h === 19 ? 60 : 120) : 10,
    );
    const res = findWindowsFromHours(dayWithCleanNight);
    expect(res.best).toMatchObject({ start: 18, end: 20, mean: 60, startLabel: "18:00", endLabel: "20:00" });

    // Non-contiguous hours (gap between 10 and 12) must not pair [10, 12] as best 2h window
    const gapped = findWindowsFromHours([5, 5, 100, 100], [10, 12, 13, 14]);
    expect(gapped.best.start).toBe(12);
    expect(gapped.avoid.start).toBe(12);

    // Night-only fallback and 1-hour edge
    const nightOnly = findWindowsFromHours([90, 50, 40, 120], [0, 1, 2, 3]);
    expect(nightOnly.best).toMatchObject({ start: 1, end: 3, mean: 45 });
    expect(findWindowsFromHours([130], [2])).toMatchObject({ shortData: true, noGoodWindow: true });

    // Boundary 125.4 vs 125.5 for noGoodWindow
    expect(findWindowsFromHours(Array.from({ length: 24 }, () => 125.4)).noGoodWindow).toBe(false);
    expect(findWindowsFromHours(Array.from({ length: 24 }, () => 125.5)).noGoodWindow).toBe(true);

    // findWindows slices from nowIndex on 48h series and rejects T99:00 fallback cleanly
    const h48 = makeHours([...Array.from({ length: 24 }, () => 200), ...Array.from({ length: 24 }, () => 40)]);
    const w48 = findWindows(h48, 24);
    expect(w48.shortData).toBe(false);
    expect(w48.best.mean).toBe(40);
    expect(findWindows(h48, 99).shortData).toBe(true);
    const badTsHours = Array.from({ length: 24 }, (_, i) => ({
      t: i === 0 ? "2026-11-20T99:00" : i === 23 ? "bad-ts" : `2026-11-20T${String(i).padStart(2, "0")}:00`,
      pm25: i >= 8 && i <= 9 ? 20 : 120,
      pm10: 150,
      usAqi: 150,
    }));
    expect(findWindows(badTsHours, 0).best).toMatchObject({ start: 8, end: 10, mean: 20 });
  });

  it("T08 applicability, edits, CO2e, 80% cap, and select scoring/penalties cover all 26 actions", () => {
    const baseClean: Profile = {
      lang: "en",
      place: { name: "Delhi", lat: 28.6, lon: 77.2, country: "IN" },
      household: { adults: 1, children: 0, seniors: 0, conditions: [] },
      home: { type: "apartment", windows: "normal", ac: false, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
      commute: { mode: "car", km: 10, daysPerWeek: 5 },
      habits: { morningOutdoorExercise: true, schoolRun: false },
      budget: "medium",
    };

    const checks: Array<{
      id: ActionId;
      yesP: Profile;
      yesLvl: Level;
      yesWin?: WindowSummary;
      noP: Profile;
      noLvl: Level;
      noWin?: WindowSummary;
      assertEdit?: (before: Scenario, after: Scenario) => void;
      expectCo2e?: boolean;
    }> = [
      {
        id: "shift_exercise_to_best_window",
        yesP: baseClean,
        yesLvl: 3,
        noP: { ...baseClean, household: { ...baseClean.household, children: 1 } },
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.exerciseHour).toBe(12),
      },
      {
        id: "exercise_indoors_when_poor",
        yesP: baseClean,
        yesLvl: 3,
        noP: baseClean,
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.exerciseIndoors).toBe(true),
      },
      {
        id: "n95_for_open_transport",
        yesP: { ...baseClean, commute: { mode: "bus", km: 5, daysPerWeek: 5 }, habits: { morningOutdoorExercise: false, schoolRun: false } },
        yesLvl: 3,
        noP: { ...baseClean, habits: { morningOutdoorExercise: false, schoolRun: false } },
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.n95Outdoors).toBe(true),
      },
      {
        id: "commute_to_public_transport",
        yesP: baseClean,
        yesLvl: 3,
        noP: { ...baseClean, commute: { mode: "metro", km: 10, daysPerWeek: 5 } },
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.commuteMode).toBe("bus"),
        expectCo2e: true,
      },
      {
        id: "wfh_on_worst_day",
        yesP: { ...baseClean, commute: { mode: "car", km: 10, daysPerWeek: 3 } },
        yesLvl: 4,
        noP: { ...baseClean, commute: { mode: "car", km: 10, daysPerWeek: 2 } },
        noLvl: 4,
        assertEdit: (b, a) => expect(a.commuteDaysPerWeek).toBe(b.commuteDaysPerWeek - 1),
        expectCo2e: true,
      },
      {
        id: "no_idling",
        yesP: { ...baseClean, commute: { mode: "wfh", km: 0, daysPerWeek: 0 }, habits: { morningOutdoorExercise: false, schoolRun: true } },
        yesLvl: 2,
        noP: { ...baseClean, commute: { mode: "bus", km: 5, daysPerWeek: 5 }, habits: { morningOutdoorExercise: false, schoolRun: false } },
        noLvl: 2,
        expectCo2e: true,
      },
      {
        id: "errands_in_best_window",
        yesP: baseClean,
        yesLvl: 0,
        noP: baseClean,
        noLvl: 0,
      },
      {
        id: "child_play_indoors_when_poor",
        yesP: { ...baseClean, household: { ...baseClean.household, children: 1 } },
        yesLvl: 3,
        noP: baseClean,
        noLvl: 3,
      },
      {
        id: "trip_chaining",
        yesP: { ...baseClean, commute: { mode: "two_wheeler", km: 4, daysPerWeek: 3 } },
        yesLvl: 2,
        noP: { ...baseClean, commute: { mode: "car", km: 0, daysPerWeek: 5 } },
        noLvl: 2,
        expectCo2e: true,
      },
      {
        id: "air_house_in_best_window",
        yesP: baseClean,
        yesLvl: 2,
        yesWin: STRICT_WINDOWS,
        noP: { ...baseClean, home: { ...baseClean.home, windows: "sealed" } },
        noLvl: 4,
        assertEdit: (_b, a) => expect(a.windowsOpenHours).toEqual([]),
      },
      {
        id: "close_windows_at_peak",
        yesP: baseClean,
        yesLvl: 2,
        yesWin: DEFAULT_WINDOWS, // avoid=07..10 overlaps [7,8]
        noP: baseClean,
        noLvl: 2,
        noWin: STRICT_WINDOWS, // avoid=04..07 does not overlap [7,8,17,18]
        assertEdit: (_b, a) => expect(a.windowsOpenHours).toEqual([17, 18]),
      },
      {
        id: "run_purifier_through_night",
        yesP: { ...baseClean, home: { ...baseClean.home, purifier: "diy" } },
        yesLvl: 3,
        noP: baseClean,
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.purifierHours.length).toBeGreaterThan(8),
      },
      {
        id: "diy_box_fan_filter",
        yesP: { ...baseClean, budget: "low" },
        yesLvl: 3,
        noP: baseClean, // budget medium
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.purifier).toBe("diy"),
      },
      {
        id: "buy_hepa_purifier",
        yesP: baseClean,
        yesLvl: 3,
        noP: { ...baseClean, budget: "low" },
        noLvl: 3,
        assertEdit: (_b, a) => expect(a.purifier).toBe("hepa"),
      },
      {
        id: "seal_gaps_and_door_sweeps",
        yesP: { ...baseClean, home: { ...baseClean.home, windows: "leaky" } },
        yesLvl: 2,
        noP: baseClean,
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.envelope).toBe("normal"),
      },
      {
        id: "cooking_ventilation",
        yesP: baseClean,
        yesLvl: 2,
        noP: { ...baseClean, home: { ...baseClean.home, cooking: "induction" } },
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.cookVent).toBe(true),
      },
      { id: "damp_mop_dont_sweep", yesP: baseClean, yesLvl: 0, noP: baseClean, noLvl: 0 },
      { id: "avoid_indoor_smoke_sources", yesP: baseClean, yesLvl: 0, noP: baseClean, noLvl: 0 },
      {
        id: "lpg_instead_of_biomass",
        yesP: { ...baseClean, home: { ...baseClean.home, cooking: "biomass" } },
        yesLvl: 2,
        noP: baseClean,
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.cooking).toBe("lpg"),
      },
      {
        id: "induction_cooking",
        yesP: baseClean,
        yesLvl: 2,
        noP: { ...baseClean, home: { ...baseClean.home, cooking: "biomass" } },
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.cooking).toBe("induction"),
      },
      { id: "warmth_without_burning", yesP: baseClean, yesLvl: 2, noP: baseClean, noLvl: 1 },
      {
        id: "carpool_shared_ride",
        yesP: baseClean,
        yesLvl: 3,
        noP: { ...baseClean, commute: { mode: "bus", km: 10, daysPerWeek: 5 } },
        noLvl: 3,
        expectCo2e: true,
      },
      {
        id: "walk_or_cycle_short_trips",
        yesP: { ...baseClean, commute: { mode: "car", km: 1.2, daysPerWeek: 5 } },
        yesLvl: 2,
        noP: { ...baseClean, commute: { mode: "car", km: 3.1, daysPerWeek: 5 } },
        noLvl: 2,
        assertEdit: (_b, a) => expect(a.commuteMode).toBe("walk"),
        expectCo2e: true,
      },
      { id: "community_no_burning", yesP: baseClean, yesLvl: 0, noP: baseClean, noLvl: 0 },
      { id: "society_dust_and_diesel_audit", yesP: baseClean, yesLvl: 0, noP: baseClean, noLvl: 0 },
      { id: "share_community_brief", yesP: baseClean, yesLvl: 0, noP: baseClean, noLvl: 0 },
    ];

    expect(checks).toHaveLength(ACTION_CATALOG.length);
    for (const c of checks) {
      const def = ACTION_BY_ID[c.id];
      const yWin = c.yesWin ?? DEFAULT_WINDOWS;
      const nWin = c.noWin ?? DEFAULT_WINDOWS;
      expect(def.appliesIf(c.yesP, c.yesLvl, yWin), `${c.id} expected true`).toBe(true);
      if (c.yesP !== c.noP || c.yesLvl !== c.noLvl || yWin !== nWin) {
        expect(def.appliesIf(c.noP, c.noLvl, nWin), `${c.id} expected false`).toBe(false);
      }
      if (c.assertEdit && def.edit) {
        const before = baselineScenario(c.yesP);
        const after = def.edit(before, c.yesP, yWin);
        c.assertEdit(before, after);
      }
      if (c.expectCo2e) {
        const co = def.co2e?.(c.yesP);
        expect(co?.kg, `${c.id} co2e`).toBeGreaterThan(0);
        expect(co?.range[0]).toBeLessThanOrEqual(co?.kg ?? 0);
      }
    }

    // Also test wrap-around avoid window (22..01 -> 22,23,0) and zero-km/zero-days negative branches
    const wrapWin: WindowSummary = {
      ...DEFAULT_WINDOWS,
      avoid: { start: 22, end: 1, mean: 300, startLabel: "22:00", endLabel: "01:00" },
    };
    expect(ACTION_BY_ID.close_windows_at_peak.appliesIf(baseClean, 3, wrapWin)).toBe(false);
    const wrap6Win: WindowSummary = {
      ...DEFAULT_WINDOWS,
      avoid: { start: 6, end: 9, mean: 300, startLabel: "06:00", endLabel: "09:00" },
    };
    expect(ACTION_BY_ID.close_windows_at_peak.appliesIf(baseClean, 3, wrap6Win)).toBe(true);
    expect(
      ACTION_BY_ID.close_windows_at_peak.edit?.(baselineScenario(baseClean), baseClean, wrap6Win)
        .windowsOpenHours,
    ).toEqual([17, 18]);

    expect(
      ACTION_BY_ID.commute_to_public_transport.appliesIf(
        { ...baseClean, commute: { mode: "car", km: 0, daysPerWeek: 5 } },
        3,
        DEFAULT_WINDOWS,
      ),
    ).toBe(false);
    expect(
      ACTION_BY_ID.commute_to_public_transport.appliesIf(
        { ...baseClean, commute: { mode: "car", km: 10, daysPerWeek: 0 } },
        3,
        DEFAULT_WINDOWS,
      ),
    ).toBe(false);
    expect(
      ACTION_BY_ID.trip_chaining.appliesIf(
        { ...baseClean, commute: { mode: "car", km: 10, daysPerWeek: 0 } },
        3,
        DEFAULT_WINDOWS,
      ),
    ).toBe(false);
    expect(
      ACTION_BY_ID.n95_for_open_transport.appliesIf(baseClean, 3, DEFAULT_WINDOWS),
    ).toBe(true);

    // Also test non-noGoodWindow branch of air_house_in_best_window & cycle branch of walk_or_cycle_short_trips
    expect(
      ACTION_BY_ID.air_house_in_best_window.edit?.(baselineScenario(baseClean), baseClean, DEFAULT_WINDOWS)
        .windowsOpenHours,
    ).toEqual([12, 13]);
    expect(
      ACTION_BY_ID.walk_or_cycle_short_trips.edit?.(
        baselineScenario(baseClean),
        { ...baseClean, commute: { mode: "car", km: 2.5, daysPerWeek: 5 } },
        DEFAULT_WINDOWS,
      ).commuteMode,
    ).toBe("cycle");

    // next24Series slices from nowIndex & evaluateActionImpact enforces exact 80% cap on tiny 4 m2 room + clean 0-day check
    const ctx48 = makeCtx([...Array.from({ length: 24 }, () => 10), ...Array.from({ length: 24 }, () => 300)], 24);
    expect(next24Series(ctx48).pm25[0]).toBe(300);

    const tinyRoom: Profile = {
      ...baseClean,
      home: { ...baseClean.home, roomAreaM2: 4, cooking: "induction" },
      commute: { mode: "wfh", km: 0, daysPerWeek: 0 },
      habits: { morningOutdoorExercise: false, schoolRun: false },
    };
    const tinyHepa = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      tinyRoom,
      ctx48,
      baselineScenario(tinyRoom),
      DEFAULT_WINDOWS,
    );
    expect(tinyHepa.exposureDeltaPct).toBe(80);
    expect(tinyHepa.exposureRangeUgM3[0]).toBeLessThan(tinyHepa.exposureRangeUgM3[1]);
    expect(tinyHepa.kind).toBe("quantified");

    const zeroDayCtx = makeCtx(Array.from({ length: 24 }, () => 0), 0);
    const zeroImpact = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      { ...baseClean, home: { ...baseClean.home, cooking: "induction" } },
      zeroDayCtx,
      baselineScenario({ ...baseClean, home: { ...baseClean.home, cooking: "induction" } }),
      DEFAULT_WINDOWS,
    );
    expect(zeroImpact.exposureDeltaPct).toBe(0);
    expect(zeroImpact.exposureDeltaUgM3).toBe(0);

    const guidanceImp = evaluateActionImpact(
      ACTION_BY_ID.damp_mop_dont_sweep,
      baseClean,
      ctx48,
      baselineScenario(baseClean),
      DEFAULT_WINDOWS,
    );
    expect(guidanceImp.kind).toBe("guidance");
    expect(guidanceImp.exposureDeltaUgM3).toBe(0);

    const combined = buildCombinedScenario(
      [ACTION_BY_ID.buy_hepa_purifier, ACTION_BY_ID.commute_to_public_transport, ACTION_BY_ID.walk_or_cycle_short_trips],
      baseClean,
      baselineScenario(baseClean),
      DEFAULT_WINDOWS,
    );
    expect(combined.purifier).toBe("hepa");
    expect(combined.commuteMode).toBe("car");

    // selectCandidates: section guarantees, budget filters, tradeoff penalty when co2e < 300 vs >= 300
    const shortCar: Profile = {
      ...baseClean,
      commute: { mode: "car", km: 2, daysPerWeek: 3 }, // co2e < 300 -> triggers -0.2 penalty
      budget: "low",
    };
    const lowCands = selectCandidates(shortCar, ctx48, 5, baselineScenario(shortCar), DEFAULT_WINDOWS);
    expect(lowCands.some((c) => c.cost === 1)).toBe(true);
    expect(lowCands.every((c) => c.cost <= 1)).toBe(true);
    expect(lowCands.every((c) => c.score >= -0.2 && c.score <= 1)).toBe(true);
    expect(new Set(lowCands.map((c) => c.section))).toEqual(new Set(["routine", "indoor", "swap"]));
    expect(selectFallbackOrder(lowCands).length).toBeLessThanOrEqual(7);

    const longCar: Profile = { ...baseClean, commute: { mode: "car", km: 12, daysPerWeek: 5 }, budget: "low" };
    const longCands = selectCandidates(longCar, ctx48, 5, baselineScenario(longCar), DEFAULT_WINDOWS);
    const shortSwapScore = lowCands.find((c) => c.id === "commute_to_public_transport")?.score ?? -1;
    const longSwapScore = longCands.find((c) => c.id === "commute_to_public_transport")?.score ?? -1;
    expect(longSwapScore).toBeGreaterThan(shortSwapScore + 0.15);

    const zeroCands = selectCandidates(
      { ...shortCar, budget: "zero" },
      ctx48,
      5,
      baselineScenario({ ...shortCar, budget: "zero" }),
      DEFAULT_WINDOWS,
    );
    expect(zeroCands.every((c) => c.cost === 0)).toBe(true);

    expect(
      householdGroups({
        ...baseClean,
        household: { adults: 1, children: 1, seniors: 1, conditions: ["respiratory", "cardiac", "pregnant"] },
      }),
    ).toEqual(["adult", "child", "senior", "respiratory", "cardiac", "pregnant"]);
    expect(
      householdGroups({
        ...baseClean,
        household: { adults: 0, children: 1, seniors: 0, conditions: [] },
      }),
    ).toEqual(["child"]);
    expect(
      householdGroups({
        ...baseClean,
        household: { adults: 0, children: 0, seniors: 0, conditions: [] },
      }),
    ).toEqual(["adult"]);
  });
});
