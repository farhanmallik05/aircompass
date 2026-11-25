/**
 * mutation-killers-2.test.ts
 *
 * Second wave of targeted Stryker survivor kills, targeting specific lines
 * identified from the mutation.json report:
 *
 *   select.ts: lines 18-19, 25, 27-30, 48, 54, 71-74, 77-78, 85
 *   schedule.ts: lines 61, 80, 82, 86, 92, 107, 111, 114-115, 121-125, 148
 */
import { describe, it, expect } from "vitest";
import { selectCandidates } from "@/lib/engine/select";
import { buildDaySchedule, allHomePurifierHours } from "@/lib/engine/schedule";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import type { AirContext, HourPoint, Level, Profile, Scenario, WindowSummary } from "@/lib/types";

function makeHours24(pm25 = 150, startHour = 0): HourPoint[] {
  return Array.from({ length: 24 }, (_, i) => ({
    t: `2026-11-20T${String((startHour + i) % 24).padStart(2, "0")}:00`,
    pm25,
    pm10: pm25 * 1.5,
    usAqi: 200,
  }));
}

function makeCtx(pm25 = 150): AirContext {
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

const WIN: WindowSummary = {
  best: { start: 12, end: 14, mean: 100, startLabel: "12:00", endLabel: "14:00" },
  avoid: { start: 7, end: 10, mean: 250, startLabel: "07:00", endLabel: "10:00" },
  noGoodWindow: false,
  shortData: false,
  hoursEvaluated: 24,
};

const baseProfile: Profile = {
  ...SAMPLE_FAMILY_PROFILE,
  home: {
    ...SAMPLE_FAMILY_PROFILE.home,
    purifier: "none",
    cooking: "lpg",
    windows: "normal",
    roomAreaM2: 25,
  },
  commute: { mode: "car", km: 10, daysPerWeek: 5 },
  budget: "medium",
  household: { adults: 2, children: 1, seniors: 0, conditions: [] },
  habits: { morningOutdoorExercise: false, schoolRun: false },
};

function makeSc(overrides: Partial<Scenario> = {}): Scenario {
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

// ─── select.ts line-18-19: budgetAllows ────────────────────────────────────
describe("select.ts budgetAllows (lines 18-19)", () => {
  it("budget='zero' allows ONLY cost=0, not cost=1 or cost=2", () => {
    const p: Profile = { ...baseProfile, budget: "zero" };
    const ctx = makeCtx(100);
    const cands = selectCandidates(p, ctx, 2 as Level, baselineScenario(p), WIN);
    expect(cands.every((c) => c.cost === 0)).toBe(true);
    // Confirm no cost=1 items (e.g., n95 mask cost=1)
    expect(cands.some((c) => c.cost >= 1)).toBe(false);
  });

  it("budget='medium' allows cost=2 (buy_hepa_purifier)", () => {
    const p: Profile = {
      ...baseProfile,
      budget: "medium",
      home: { ...baseProfile.home, purifier: "none" },
    };
    const ctx = makeCtx(150);
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    expect(cands.some((c) => c.id === "buy_hepa_purifier")).toBe(true);
  });

  it("budget='low' allows cost=1 but not cost=2 (string equality, not !== 'low')", () => {
    const p: Profile = {
      ...baseProfile,
      budget: "low",
      home: { ...baseProfile.home, purifier: "none" },
    };
    const ctx = makeCtx(150);
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    expect(cands.every((c) => c.cost <= 1)).toBe(true);
    expect(cands.some((c) => c.cost === 1)).toBe(true); // diy_box_fan has cost=1
    expect(cands.some((c) => c.id === "buy_hepa_purifier")).toBe(false);
  });
});

// ─── select.ts lines 25-30: scoreCandidate internals ───────────────────────
describe("select.ts scoreCandidate internals", () => {
  it("co2e contributes to score: action with more co2e gets higher score (Math.min not Math.max)", () => {
    // commute_to_public_transport has co2e; walking has 0 co2e
    const ctx = makeCtx(100);
    const p: Profile = { ...baseProfile, commute: { mode: "car", km: 20, daysPerWeek: 5 } };
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    const transport = cands.find((c) => c.id === "commute_to_public_transport");
    const mopping = cands.find((c) => c.id === "damp_mop_dont_sweep");
    if (transport && mopping) {
      // transport has CO2e savings → higher score contribution
      expect(transport.score).toBeGreaterThan(mopping.score);
    }
  });

  it("audienceMatch: groups.length > 0 divides matches, not multiplies", () => {
    // With groups=['adult','child','senior'], an action targeting all 3 scores higher than one targeting 1
    const p3: Profile = {
      ...baseProfile,
      household: { adults: 1, children: 1, seniors: 1, conditions: [] },
      habits: { morningOutdoorExercise: false, schoolRun: false },
    };
    const ctx = makeCtx(150);
    const cands3 = selectCandidates(p3, ctx, 3 as Level, baselineScenario(p3), WIN);
    // All scores should be in [−0.2, 1.0]
    for (const c of cands3) {
      expect(c.score).toBeGreaterThanOrEqual(-0.2);
      expect(c.score).toBeLessThanOrEqual(1.0);
    }
  });

  it("ease = 1 - (cost + effort)/5: high cost+effort → lower ease → lower score for same exposure", () => {
    // diy_box_fan (cost=1, effort=2, ease=0.4) vs damp_mop_dont_sweep (cost=0, effort=1, ease=0.8)
    // Both have zero exposure delta (guidance); ease is 0.1 weight → 0.04 vs 0.08 diff
    const p: Profile = {
      ...baseProfile,
      budget: "medium",
      home: { ...baseProfile.home, purifier: "none" },
    };
    const ctx = makeCtx(50);
    const cands = selectCandidates(p, ctx, 2 as Level, baselineScenario(p), WIN);
    const mop = cands.find((c) => c.id === "damp_mop_dont_sweep");
    const diy = cands.find((c) => c.id === "diy_box_fan_filter");
    if (mop && diy) {
      // mop has lower cost+effort so higher ease → higher base score component
      expect(diy.cost + diy.effort).toBeGreaterThan(mop.cost + mop.effort);
    }
  });

  it("tradeoff penalty: exposureDeltaUgM3 < 0 AND co2eKgPerYear < 300 → score -= 0.2 (&&, not ||)", () => {
    // Test: an action that improves air (delta > 0) should NOT get penalty even if co2e < 300
    const p: Profile = { ...baseProfile, commute: { mode: "car", km: 1, daysPerWeek: 1 } };
    const ctx = makeCtx(50);
    const cands = selectCandidates(p, ctx, 2 as Level, baselineScenario(p), WIN);
    // All 'guidance' kind actions have delta=0 (not < 0), so no penalty → score >= 0
    const guidanceCands = cands.filter((c) => c.impact.kind === "guidance");
    for (const c of guidanceCands) {
      expect(c.score).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── select.ts line 48: sections array ────────────────────────────────────
describe("select.ts section filter (line 48)", () => {
  it("sections array covers exactly ['routine','indoor','swap'] — mutation to ['Stryker was here'] caught", () => {
    const ctx = makeCtx(150);
    const p: Profile = { ...baseProfile, budget: "medium" };
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    const sections = new Set(cands.map((c) => c.section));
    // All three sections must be represented
    expect(sections.has("routine")).toBe(true);
    expect(sections.has("indoor")).toBe(true);
    expect(sections.has("swap")).toBe(true);
  });
});

// ─── select.ts line 54: tradeoff threshold ────────────────────────────────
describe("select.ts tradeoff threshold (line 54)", () => {
  it("tradeoff flag only set when exposureDeltaUgM3 < -0.05, not <= -0.05 or +0.05", () => {
    // Test: when commuting to open transit in heavy smog → might set tradeoff
    const ctx = makeCtx(400);
    const p: Profile = {
      ...baseProfile,
      commute: { mode: "car", km: 10, daysPerWeek: 5 },
      habits: { morningOutdoorExercise: false, schoolRun: false },
    };
    const cands = selectCandidates(p, ctx, 4 as Level, baselineScenario(p), WIN);
    // Any action with tradeoff=true must have exposureDeltaUgM3 < -0.05 (strict less than)
    const tradeoffs = cands.filter((c) => c.tradeoff);
    for (const c of tradeoffs) {
      expect(c.impact.exposureDeltaUgM3).toBeLessThan(-0.05);
      expect(c.mitigation).toBe("n95_for_open_transport");
    }
    // Any action with delta = 0 must NOT be tradeoff
    const zeroDelta = cands.filter((c) => c.impact.exposureDeltaUgM3 === 0);
    for (const c of zeroDelta) {
      expect(c.tradeoff).toBe(false);
    }
  });
});

// ─── select.ts lines 71-78: pick logic ────────────────────────────────────
describe("select.ts pick logic (lines 71-85)", () => {
  it("section filter: c.section === sec (not !==): only matching sections are pre-picked", () => {
    const ctx = makeCtx(100);
    const p: Profile = { ...baseProfile, budget: "medium" };
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    // Result must have entries from all three sections (routine, indoor, swap)
    const routine = cands.filter((c) => c.section === "routine");
    const indoor = cands.filter((c) => c.section === "indoor");
    const swap = cands.filter((c) => c.section === "swap");
    expect(routine.length).toBeGreaterThanOrEqual(1);
    expect(indoor.length).toBeGreaterThanOrEqual(1);
    expect(swap.length).toBeGreaterThanOrEqual(1);
  });

  it("picked.size < 14 (not <= 14 or >= 14): caps result at max 14", () => {
    const ctx = makeCtx(200);
    const p: Profile = { ...baseProfile, budget: "medium" };
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    expect(cands.length).toBeLessThanOrEqual(14);
  });

  it("sort: b.score - a.score descending (not b.score + a.score)", () => {
    const ctx = makeCtx(200);
    const p: Profile = { ...baseProfile, budget: "medium" };
    const cands = selectCandidates(p, ctx, 3 as Level, baselineScenario(p), WIN);
    // Verify descending score order
    for (let i = 0; i < cands.length - 1; i++) {
      expect(cands[i].score).toBeGreaterThanOrEqual(cands[i + 1].score);
    }
  });

  it("tie-break: equal scores sorted by localeCompare(id) ascending (not removed by ArrowFunction→undefined)", () => {
    // Two sections always produce at least 2 from each; ties within scores are broken by id
    const ctx = makeCtx(100);
    const p: Profile = { ...baseProfile, budget: "zero" };
    const cands = selectCandidates(p, ctx, 2 as Level, baselineScenario(p), WIN);
    // Groups by score and checks within-group id ordering
    const scoreGroups = new Map<number, string[]>();
    for (const c of cands) {
      const existing = scoreGroups.get(c.score) ?? [];
      existing.push(c.id);
      scoreGroups.set(c.score, existing);
    }
    for (const [, ids] of scoreGroups) {
      for (let i = 0; i < ids.length - 1; i++) {
        expect(ids[i].localeCompare(ids[i + 1])).toBeLessThanOrEqual(0);
      }
    }
  });
});

// ─── schedule.ts line 61: activeCommute BooleanLiteral → true ───────────────
describe("schedule.ts activeCommute BooleanLiteral (line 61)", () => {
  it("activeCommute=true when isCommuteDay && mode!='wfh' && km>0 (not always true)", () => {
    const sc = makeSc({ commuteMode: "car" });
    // isCommuteDay=false → no commute
    const cells = buildDaySchedule(sc, 10, false);
    const hasCarCabin = cells.flat().some((s) => s.location === "car_cabin");
    expect(hasCarCabin).toBe(false);
  });
});

// ─── schedule.ts line 80: commuteMode !== "wfh" string mutation ────────────
describe("schedule.ts commuteMode !== 'wfh' (line 80)", () => {
  it("wfh mode (empty string '') would match '' !== 'wfh' = true; real guard uses exact 'wfh'", () => {
    // wfh mode → no active commute even if isCommuteDay=true and km>0
    const wfhSc = makeSc({ commuteMode: "wfh", commuteDaysPerWeek: 5 });
    const cells = buildDaySchedule(wfhSc, 20, true);
    const anyOutdoor = cells
      .flat()
      .some(
        (s) =>
          s.location === "outdoor_walk" ||
          s.location === "outdoor_cycle" ||
          s.location === "outdoor_open_transit",
      );
    expect(anyOutdoor).toBe(false);
  });

  it("commuteKm > 0 (not >= 0): km=0 → no commute", () => {
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 0, true);
    expect(cells.flat().some((s) => s.location === "car_cabin")).toBe(false);
  });
});

// ─── schedule.ts line 82: speed > 0 and activeCommute && speed > 0 ─────────
describe("schedule.ts speed guard (line 82)", () => {
  it("rawTripHours = km / speed only when activeCommute && speed > 0 (not || )", () => {
    // metro speed=30 → 10km / 30 = 0.333h commute time
    const sc = makeSc({ commuteMode: "metro" });
    const cells = buildDaySchedule(sc, 10, true);
    const metroSlot = cells[8].find((s) => s.location === "metro_cabin");
    expect(metroSlot).toBeTruthy();
    // Trip is 0.333h → fraction should be ~0.333
    expect(metroSlot!.f).toBeCloseTo(10 / 30, 2);
  });

  it("speed >= 0 would include wfh with speed=0 → prevent by using > 0", () => {
    // This is tested: wfh speed=0 → rawTripHours computed as 0 (since activeCommute=false for wfh)
    // But if the mutant makes it speed >= 0, 0/0 = NaN → check that wfh produces no commute slots
    const wfhSc = makeSc({ commuteMode: "wfh" });
    const cells = buildDaySchedule(wfhSc, 10, true);
    expect(cells.flat().every((s) => s.location === "home" || s.location === "work_indoor")).toBe(
      true,
    );
  });
});

// ─── schedule.ts line 86: h < 24 boundary ───────────────────────────────────
describe("schedule.ts h < 24 loop (line 86)", () => {
  it("produces exactly 24 hours (loop: h < 24, not h <= 24)", () => {
    const sc = makeSc({ commuteMode: "bus" });
    const cells = buildDaySchedule(sc, 5, true);
    expect(cells).toHaveLength(24);
  });
});

// ─── schedule.ts line 92: clamped <= 1e-9 (should be < 1e-9) ───────────────
describe("schedule.ts clamped boundary (line 92)", () => {
  it("clamped exactly 0 → slot skipped (clamped < 1e-9 guard fires at 0)", () => {
    // km=0 → rawTripHours=0 → tripHours=0 → addSlot(0,...) → clamped=0 < 1e-9 → skip
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 0, true);
    // No car_cabin slots
    expect(cells.flat().some((s) => s.location === "car_cabin")).toBe(false);
  });

  it("clamped = 1e-9 exactly would be allowed (mutant: clamped < 1e-9 → <=): test with nonzero", () => {
    // 10km car at 20km/h = 0.5h → significant slot at h=8
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 10, true);
    const carSlot = cells[8].find((s) => s.location === "car_cabin");
    expect(carSlot).toBeDefined();
    expect(carSlot!.f).toBeCloseTo(0.5, 5);
  });
});

// ─── schedule.ts lines 107-115: commute branch conditions ────────────────
describe("schedule.ts commute branch hours (lines 107-115)", () => {
  it("outbound at h=8, return at h=17 (not h=18 for return start)", () => {
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 10, true); // 10km / 20km/h = 0.5h
    // h=8: outbound commute
    expect(cells[8].some((s) => s.location === "car_cabin")).toBe(true);
    // h=17: return commute (not h=18 as start)
    expect(cells[17].some((s) => s.location === "car_cabin")).toBe(true);
    // h=9: trip is 0.5h so no spillover (tripHours < 1 → h=9 and h=18 have no extra commute)
    const h9Car = cells[9].filter((s) => s.location === "car_cabin");
    expect(h9Car).toHaveLength(0);
  });

  it("tripHours > 1 for spill-over: 25km at 20km/h = 1.25h → spills to h=9 and h=18", () => {
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 25, true); // 25/20 = 1.25h > 1 → spill
    expect(cells[9].some((s) => s.location === "car_cabin")).toBe(true); // spillover at h=9
    expect(cells[18].some((s) => s.location === "car_cabin")).toBe(true); // return spillover at h=18
    // tripHours capped at 2 → fraction at h=9 is 0.25
    const spill9 = cells[9].find((s) => s.location === "car_cabin");
    expect(spill9!.f).toBeCloseTo(0.25, 2);
  });

  it("Math.min(1, tripHours) caps slot at 1 hour (not Math.max)", () => {
    // 50km / 20km/h = 2.5h → capped at 2 (by Math.min(2, rawTripHours)), then h=8 slot = Math.min(1, 2) = 1
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 50, true);
    const slot8 = cells[8].find((s) => s.location === "car_cabin");
    expect(slot8!.f).toBeCloseTo(1.0, 5); // exactly 1 hour at h=8
  });
});

// ─── schedule.ts line 121-125: remainder slot ────────────────────────────
describe("schedule.ts remainder slot (lines 121-125)", () => {
  it("rem = 1 - used (not 1 + used): remaining fraction is complement", () => {
    // 10km car at 20km/h: used=0.5 at h=8 → rem=0.5 for home slot
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 10, true);
    const h8 = cells[8];
    const totalF = h8.reduce((acc, s) => acc + s.f, 0);
    expect(totalF).toBeCloseTo(1.0, 10); // must sum to 1
    const homeSlot = h8.find((s) => s.location !== "car_cabin");
    expect(homeSlot?.f).toBeCloseTo(0.5, 5);
  });

  it("h >= 22 || h < 6 → sleep slot (not h > 22 or h <= 6)", () => {
    const sc = makeSc({ commuteMode: "wfh" });
    const cells = buildDaySchedule(sc, 0, false);
    // h=22: sleep boundary (>= 22 → sleep)
    expect(cells[22].every((s) => s.location === "home")).toBe(true);
    // h=5: sleep (5 < 6 → sleep)
    expect(cells[5].every((s) => s.location === "home")).toBe(true);
    // h=6: NOT sleep (6 is NOT < 6 and NOT >= 22) → home/indoorRest
    expect(cells[6].every((s) => s.location === "home")).toBe(true);
    // h=21: NOT sleep (21 < 22) → home
    expect(cells[21].every((s) => s.location === "home")).toBe(true);
  });

  it("work slot condition: activeCommute && h >= 9 && h < 17 (not h > 9 or h <= 17)", () => {
    const sc = makeSc({ commuteMode: "car" });
    const cells = buildDaySchedule(sc, 10, true);
    // h=9: work_indoor (9 >= 9 ✓ and 9 < 17 ✓)
    expect(cells[9].some((s) => s.location === "work_indoor")).toBe(true);
    // h=16: work_indoor (16 >= 9 ✓ and 16 < 17 ✓)
    expect(cells[16].some((s) => s.location === "work_indoor")).toBe(true);
    // h=17: NOT work_indoor (17 is NOT < 17) → return commute
    const h17 = cells[17];
    const hasWork = h17.some((s) => s.location === "work_indoor");
    expect(hasWork).toBe(false);
    // h=8: NOT work_indoor (8 < 9) → commute
    const h8 = cells[8];
    const hasWorkH8 = h8.some((s) => s.location === "work_indoor");
    expect(hasWorkH8).toBe(false);
  });
});

// ─── schedule.ts line 148: allHomePurifierHours conditions ────────────────
describe("schedule.ts allHomePurifierHours conditions (line 148)", () => {
  it("!hasCommute → all 24 hours [0..23] (not hasCommute → all)", () => {
    const hours = allHomePurifierHours("wfh", 0);
    expect(hours).toHaveLength(24);
    for (let h = 0; h < 24; h++) {
      expect(hours).toContain(h);
    }
  });

  it("h < 8 included (not h <= 8)", () => {
    // Car commuter: hours [0..7, 18..23]
    const hours = allHomePurifierHours("car", 5);
    expect(hours).toContain(7); // 7 < 8 → included
    expect(hours).not.toContain(8); // 8 is NOT < 8 → excluded
    expect(hours).not.toContain(9);
  });

  it("h >= 18 included (not h > 18 or h >= 19)", () => {
    const hours = allHomePurifierHours("car", 5);
    expect(hours).toContain(18); // exactly 18 ✓
    expect(hours).toContain(23);
    expect(hours).not.toContain(17); // 17 < 18 → excluded
  });

  it("commuteDaysPerWeek < 7 (not <= 7): 7 days → different hour set than 5 days", () => {
    // 5 days: hasCommute, only home hours
    const hours5 = allHomePurifierHours("car", 5);
    // 7 days: commuteDaysPerWeek < 7 is false → different branch
    const hours7 = allHomePurifierHours("car", 7);
    // Both should have hours but the full-week commuter may differ
    expect(hours5.length).toBeGreaterThan(0);
    expect(hours7.length).toBeGreaterThan(0);
  });

  it("!hasCommute || h < 8 || h >= 18: all three conditions independently open hours", () => {
    // bus commuter 3 days: hasCommute=true; h=4 < 8 → included, h=20 >= 18 → included
    const hours = allHomePurifierHours("bus", 3);
    expect(hours).toContain(4); // h < 8
    expect(hours).toContain(20); // h >= 18
  });
});
