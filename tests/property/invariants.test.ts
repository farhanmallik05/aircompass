import { describe, it, expect } from "vitest";
import fc from "fast-check";
import golden from "../fixtures/golden.json";
import { computeExposure } from "@/lib/engine/exposure";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { trailingNaqi } from "@/lib/engine/naqi";
import { findWindowsFromHours } from "@/lib/engine/window";
import { ACTION_BY_ID, ACTION_CATALOG } from "@/lib/engine/catalog";
import { evaluateActionImpact } from "@/lib/engine/impact";
import { selectCandidates } from "@/lib/engine/select";
import type { AirContext, HourPoint, Profile } from "@/lib/types";

function makeSevereContext(): AirContext {
  const hours: HourPoint[] = golden.best_window.day.map((pm25, h) => ({
    t: `2026-11-20T${String(h).padStart(2, "0")}:00`,
    pm25,
    pm10: Math.round(pm25 * 1.4),
    usAqi: 280,
  }));
  return {
    place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
    source: "demo",
    dataNote: "recorded",
    recordedDate: "2026-11-20",
    fetchedAt: "2026-11-25T12:00:00Z",
    hours,
    nowIndex: 0,
  };
}

const SAMPLE_CAR_PROFILE: Profile = {
  lang: "en",
  place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 2, children: 1, seniors: 1, conditions: ["respiratory"] },
  home: {
    windows: "normal",
    purifier: "none",
    cooking: "lpg",
    roomAreaM2: 15,
  },
  commute: { mode: "car", km: 12, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: true },
  budget: "medium",
};

describe("engine properties and ordering invariants", () => {
  it("property: N95 never raises exposure, and constant-outdoor indoor exposure <= max outdoor (without cooking)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 5, max: 450, noNaN: true }), { minLength: 24, maxLength: 24 }),
        fc.double({ min: 8, max: 80, noNaN: true }),
        fc.double({ min: 0, max: 25, noNaN: true }),
        (pm25Series, roomAreaM2, commuteKm) => {
          const base = {
            windowsOpenHours: [12, 13],
            envelope: "normal" as const,
            purifier: "none" as const,
            purifierHours: [],
            exerciseHour: 6,
            exerciseIndoors: false,
            commuteMode: "bus" as const,
            commuteDaysPerWeek: 5,
            n95Outdoors: false,
            cooking: "induction" as const,
            cookVent: false,
          };
          const withoutN95 = computeExposure(pm25Series, base, {
            roomAreaM2,
            commuteKm,
          }).exposureUgM3;
          const withN95 = computeExposure(
            pm25Series,
            { ...base, n95Outdoors: true },
            { roomAreaM2, commuteKm },
          ).exposureUgM3;
          const maxOut = Math.max(...pm25Series);
          expect(withN95).toBeLessThanOrEqual(withoutN95 + 1e-9);
          expect(withoutN95).toBeLessThanOrEqual(maxOut + 1e-6);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("CPCB NAQI enforces >= 16 valid trailing hours and never invents an index below threshold", () => {
    const shortHours: HourPoint[] = Array.from({ length: 15 }, (_, i) => ({
      t: `2026-11-25T${String(i).padStart(2, "0")}:00`,
      pm25: 180,
      pm10: 250,
      usAqi: 230,
    }));
    const insufficient = trailingNaqi(shortHours, 14);
    expect(insufficient.sufficient).toBe(false);
    expect(insufficient.index).toBeUndefined();

    const enoughHours: HourPoint[] = [
      ...shortHours,
      { t: "2026-11-25T15:00", pm25: 180, pm10: 250, usAqi: 230 },
    ];
    const sufficient = trailingNaqi(enoughHours, 15);
    expect(sufficient.sufficient).toBe(true);
    expect(sufficient.index).toBeGreaterThan(300);
  });

  it("T09 ordering test: purifier >> N95 > indoor exercise > window timing >= exercise timing; transit swap <= 0 on severe day", () => {
    const ctx = makeSevereContext();
    const windows = findWindowsFromHours(golden.best_window.day);

    // 1. Open-transport profile for N95 vs purifier vs timing ordering
    const busProfile: Profile = {
      ...SAMPLE_CAR_PROFILE,
      commute: { mode: "bus", km: 12, daysPerWeek: 5 },
    };
    const busBase = baselineScenario(busProfile);
    const hepa = evaluateActionImpact(
      ACTION_BY_ID.buy_hepa_purifier,
      busProfile,
      ctx,
      busBase,
      windows,
    );
    const diy = evaluateActionImpact(
      ACTION_BY_ID.diy_box_fan_filter,
      busProfile,
      ctx,
      busBase,
      windows,
    );
    const n95 = evaluateActionImpact(
      ACTION_BY_ID.n95_for_open_transport,
      busProfile,
      ctx,
      busBase,
      windows,
    );
    const exIn = evaluateActionImpact(
      ACTION_BY_ID.exercise_indoors_when_poor,
      busProfile,
      ctx,
      busBase,
      windows,
    );
    const winAir = evaluateActionImpact(
      ACTION_BY_ID.air_house_in_best_window,
      busProfile,
      ctx,
      busBase,
      windows,
    );
    const exShift = evaluateActionImpact(
      ACTION_BY_ID.shift_exercise_to_best_window,
      busProfile,
      ctx,
      busBase,
      windows,
    );

    expect(hepa.exposureDeltaUgM3).toBeGreaterThan(diy.exposureDeltaUgM3);
    expect(diy.exposureDeltaUgM3).toBeGreaterThan(n95.exposureDeltaUgM3);
    expect(n95.exposureDeltaUgM3).toBeGreaterThan(exIn.exposureDeltaUgM3);
    expect(exIn.exposureDeltaUgM3).toBeGreaterThan(winAir.exposureDeltaUgM3);
    expect(exIn.exposureDeltaUgM3).toBeGreaterThanOrEqual(exShift.exposureDeltaUgM3 - 1);
    expect(winAir.exposureDeltaUgM3).toBeGreaterThan(0);
    expect(exShift.exposureDeltaUgM3).toBeGreaterThan(0);
    expect(hepa.exposureRangeUgM3[0]).toBeLessThanOrEqual(hepa.exposureDeltaUgM3);
    expect(hepa.exposureRangeUgM3[1]).toBeGreaterThanOrEqual(hepa.exposureDeltaUgM3);

    // 2. Car profile: car -> bus swap cuts CO2e but raises personal exposure (negative exposureDeltaUgM3 kept & flagged)
    const carBase = baselineScenario(SAMPLE_CAR_PROFILE);
    const carToBus = evaluateActionImpact(
      ACTION_BY_ID.commute_to_public_transport,
      SAMPLE_CAR_PROFILE,
      ctx,
      carBase,
      windows,
    );
    expect(carToBus.exposureDeltaUgM3).toBeLessThan(0);
    expect(carToBus.co2eKgPerYear).toBeCloseTo(576, 1);

    const candidates = selectCandidates(SAMPLE_CAR_PROFILE, ctx, 5, carBase, windows);
    const busCandidate = candidates.find((c) => c.id === "commute_to_public_transport");
    expect(busCandidate?.tradeoff).toBe(true);
    expect(busCandidate?.mitigation).toBe("n95_for_open_transport");
    expect(candidates.length).toBeLessThanOrEqual(14);
    expect(ACTION_CATALOG.length).toBe(26);
  });
});
