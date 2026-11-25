import { describe, it, expect } from "vitest";
import golden from "../fixtures/golden.json";
import { aqiFromPm25, levelOfPm25 } from "@/lib/engine/bands";
import { naqi, naqiCategory, naqiPm25, naqiPm10 } from "@/lib/engine/naqi";
import { stepIndoor, purifierQ, steadyState } from "@/lib/engine/indoor";
import { computeExposure } from "@/lib/engine/exposure";
import { co2eSavedKgPerYear } from "@/lib/engine/emissions";
import { findWindowsFromHours } from "@/lib/engine/window";
import type { CommuteMode, Scenario } from "@/lib/types";

/**
 * Expected values come ONLY from tests/fixtures/golden.json, produced by scripts/oracle.mjs (CI re-checks it).
 * Never compute an expectation with product code in a test: that proves nothing.
 */
const HOME = { P: 0.8, k: 0.3 };

describe("golden vectors", () => {
  it("EPA AQI from PM2.5 matches the oracle at every breakpoint edge", () => {
    for (const { pm25, aqi } of golden.epa_aqi_pm25)
      expect(aqiFromPm25(pm25), `pm25=${pm25}`).toBe(aqi);
  });

  it("NAQI PM2.5 / PM10 sub-indices match the oracle (CPCB table; Severe anchors are assumptions)", () => {
    for (const { pm25, index } of golden.naqi_pm25)
      expect(naqiPm25(pm25), `pm25=${pm25}`).toBe(index);
    for (const { pm10, index } of golden.naqi_pm10)
      expect(naqiPm10(pm10), `pm10=${pm10}`).toBe(index);
    const w = golden.naqi_cpcb_worked_example;
    expect(Math.abs(naqiPm25(w.pm25) - w.cpcb_published_approx)).toBeLessThanOrEqual(w.tolerance);
  });

  it("overall NAQI (max rule, dominant pollutant) and category edges match the oracle", () => {
    for (const g of golden.naqi_overall)
      expect(naqi(g.pm25, "pm10" in g ? g.pm10 : undefined), JSON.stringify(g)).toEqual({
        index: g.index,
        category: g.category,
        dominant: g.dominant,
      });
    for (const e of golden.naqi_category_edges)
      expect(naqiCategory(e.index), `index=${e.index}`).toBe(e.category);
  });

  it("indoor hourly step matches the oracle (tolerance 1e-3)", () => {
    for (const g of golden.indoor_step) {
      const r = stepIndoor(g.cStart, g.cOut, g.a, { ...HOME, q: g.q, S: g.S });
      expect(r.cSS).toBeCloseTo(g.cSS, 3);
      expect(r.cEnd).toBeCloseTo(g.cEnd, 3);
      expect(r.cMean).toBeCloseTo(g.cMean, 3);
    }
  });

  it("purifier ACH for a 15 m2 room matches the oracle", () => {
    expect(purifierQ(250, 15)).toBeCloseTo(golden.purifier_q_15m2_room.hepa_cadr250, 4);
    expect(purifierQ(200, 15)).toBeCloseTo(golden.purifier_q_15m2_room.diy_cadr200, 4);
  });

  it("steady state equals the exposure identity (windows shut, constant outdoor air)", () => {
    const e = golden.exposure_identity;
    expect(steadyState(e.cOut, e.a, { ...HOME, q: 0 })).toBeCloseTo(e.expected, 3);
    expect(steadyState(e.cOut, e.a, { ...HOME, q: purifierQ(250, 15) })).toBeCloseTo(
      e.with_hepa,
      3,
    );
    const cooking = golden.indoor_step[3];
    expect(
      steadyState(cooking.cOut, cooking.a, { ...HOME, q: cooking.q, S: cooking.S }),
    ).toBeCloseTo(cooking.cSS, 3);
  });

  it("level boundaries agree with AQI categories", () => {
    const edges: [number, number][] = [
      [9.0, 0],
      [9.1, 1],
      [35.4, 1],
      [35.5, 2],
      [55.5, 3],
      [125.5, 4],
      [225.5, 5],
      [999, 5],
    ];
    for (const [c, level] of edges) expect(levelOfPm25(c), `pm25=${c}`).toBe(level);
  });

  it("T05: exposure engine reproduces golden.exposure_identity end to end", () => {
    const e = golden.exposure_identity;
    const constantOut = Array.from({ length: 24 }, () => e.cOut);
    const baseShut: Scenario = {
      windowsOpenHours: [],
      envelope: "normal",
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
    const noPurifier = computeExposure(constantOut, baseShut, { roomAreaM2: 15, commuteKm: 0 });
    expect(noPurifier.exposureUgM3).toBeCloseTo(e.expected, 3);

    const allHours = Array.from({ length: 24 }, (_, h) => h);
    const withHepa = computeExposure(
      constantOut,
      { ...baseShut, purifier: "hepa", purifierHours: allHours },
      { roomAreaM2: 15, commuteKm: 0 },
    );
    expect(withHepa.exposureUgM3).toBeCloseTo(e.with_hepa, 3);
  });

  it("T07: window finder reproduces golden.best_window (best 12-14, avoid 04-07, ties earliest)", () => {
    const bw = golden.best_window;
    const res = findWindowsFromHours(bw.day);
    expect(res.best.start).toBe(bw.best.start);
    expect(res.best.end).toBe(bw.best.end);
    expect(res.best.mean).toBeCloseTo(bw.best.mean, 4);
    expect(res.avoid.start).toBe(bw.avoid.start);
    expect(res.avoid.end).toBe(bw.avoid.end);
    expect(res.avoid.mean).toBeCloseTo(bw.avoid.mean, 4);
    expect(res.shortData).toBe(false);

    // Earliest tie-break and short-data edge cases
    const flatTied = Array.from({ length: 24 }, () => 80);
    const tied = findWindowsFromHours(flatTied);
    expect(tied.best.start).toBe(8);
    expect(tied.avoid.start).toBe(0);

    const short = findWindowsFromHours([100, 90, 80, 120, 150], [8, 9, 10, 11, 12]);
    expect(short.shortData).toBe(true);
    expect(short.best.start).toBe(9);
  });

  it("T06: emissions reproduce golden.co2e_kg_per_year (777.6 / 576 / 979.2)", () => {
    for (const row of golden.co2e_kg_per_year) {
      expect(
        co2eSavedKgPerYear(
          row.kmOneWay,
          row.daysPerWeek,
          row.from as CommuteMode,
          row.to as CommuteMode,
        ),
        `${row.from}->${row.to}`,
      ).toBeCloseTo(row.kg, 4);
    }
  });
});

describe("invariants (properties, not examples)", () => {
  it("more purifier never raises the indoor mean; higher outdoor never lowers it", () => {
    for (let cOut = 0; cOut <= 500; cOut += 25)
      for (let a = 0.3; a <= 4; a += 0.35) {
        let prev = Infinity;
        for (const q of [0, 0.5, 1, 2, 3.1]) {
          const m = stepIndoor(100, cOut, a, { ...HOME, q }).cMean;
          expect(m).toBeLessThanOrEqual(prev + 1e-9);
          prev = m;
        }
        expect(stepIndoor(100, cOut + 50, a, { ...HOME, q: 0 }).cMean).toBeGreaterThanOrEqual(
          stepIndoor(100, cOut, a, { ...HOME, q: 0 }).cMean - 1e-9,
        );
      }
  });

  it("AQI and NAQI are monotone non-decreasing and bounded", () => {
    let pa = -1,
      pn = -1;
    for (let c = 0; c <= 600; c += 0.1) {
      const a = aqiFromPm25(c),
        n = naqiPm25(c);
      expect(a).toBeGreaterThanOrEqual(pa);
      expect(a).toBeLessThanOrEqual(500);
      expect(n).toBeGreaterThanOrEqual(pn);
      expect(n).toBeLessThanOrEqual(500);
      pa = a;
      pn = n;
    }
  });

  it("rejects non-finite, negative and degenerate input instead of returning a plausible number", () => {
    for (const bad of [NaN, -1, Infinity]) {
      expect(() => aqiFromPm25(bad)).toThrow(RangeError);
      expect(() => levelOfPm25(bad)).toThrow(RangeError);
      expect(() => naqiPm25(bad)).toThrow(RangeError);
      expect(() => naqiPm10(bad)).toThrow(RangeError);
    }
    expect(() => stepIndoor(10, 10, 0, { P: 0.8, k: 0, q: 0 })).toThrow(RangeError);
    expect(() => purifierQ(250, 0)).toThrow(RangeError);
  });
});
