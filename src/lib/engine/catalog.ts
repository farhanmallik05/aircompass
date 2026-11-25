import actionMeta from "../../../data/action-meta.json";
import {
  co2eSavedKgPerYear,
  co2eSavedRangeKgPerYear,
  idlingCo2eSaved,
  tripChainingCo2eSaved,
} from "./emissions";
import { allHomePurifierHours } from "./schedule";
import type {
  ActionId,
  ActionSection,
  Group,
  Level,
  Profile,
  Scenario,
  WindowSummary,
} from "../types";

export interface ActionDef {
  id: ActionId;
  section: ActionSection;
  appliesIf: (p: Profile, level: Level, windows: WindowSummary) => boolean;
  edit?: (s: Scenario, p: Profile, windows: WindowSummary) => Scenario;
  co2e?: (p: Profile) => { kg: number; range: [number, number] };
  cost: 0 | 1 | 2;
  effort: 1 | 2 | 3;
  audience: Group[];
  confidence: "low" | "medium";
  method: string;
  assumptions: string[];
}

function avoidHoursOf(w: WindowSummary): Set<number> {
  return new Set([w.avoid.start, (w.avoid.start + 1) % 24, (w.avoid.start + 2) % 24]);
}

function bestHoursOf(w: WindowSummary): number[] {
  if (w.noGoodWindow) return [];
  return [w.best.start, (w.best.start + 1) % 24];
}

const RAW_ACTIONS: readonly Omit<ActionDef, "method" | "assumptions">[] = [
  {
    id: "shift_exercise_to_best_window",
    section: "routine",
    appliesIf: (p, level) => {
      if (!p.habits.morningOutdoorExercise) return false;
      const hasSensitive =
        p.household.children > 0 || p.household.seniors > 0 || p.household.conditions.length > 0;
      return !(hasSensitive && level >= 3);
    },
    edit: (s, _p, w) => ({ ...s, exerciseHour: w.best.start }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child"],
    confidence: "medium",
  },
  {
    id: "exercise_indoors_when_poor",
    section: "routine",
    appliesIf: (p, level) => p.habits.morningOutdoorExercise && level >= 3,
    edit: (s) => ({ ...s, exerciseIndoors: true }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "n95_for_open_transport",
    section: "routine",
    appliesIf: (p, level) =>
      (["walk", "cycle", "two_wheeler", "auto", "bus"].includes(p.commute.mode) ||
        p.habits.morningOutdoorExercise) &&
      level >= 3,
    edit: (s) => ({ ...s, n95Outdoors: true }),
    cost: 1,
    effort: 1,
    audience: ["adult", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "commute_to_public_transport",
    section: "routine",
    appliesIf: (p) =>
      ["car", "two_wheeler", "auto"].includes(p.commute.mode) &&
      p.commute.km > 0 &&
      p.commute.daysPerWeek > 0,
    edit: (s) => ({ ...s, commuteMode: "bus" }),
    co2e: (p) => ({
      kg: co2eSavedKgPerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, "bus"),
      range: co2eSavedRangeKgPerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, "bus"),
    }),
    cost: 0,
    effort: 3,
    audience: ["adult"],
    confidence: "low",
  },
  {
    id: "wfh_on_worst_day",
    section: "routine",
    appliesIf: (p, level) => p.commute.mode !== "wfh" && p.commute.daysPerWeek >= 3 && level >= 4,
    edit: (s) => ({ ...s, commuteDaysPerWeek: Math.max(0, s.commuteDaysPerWeek - 1) }),
    co2e: (p) => ({
      kg: co2eSavedKgPerYear(p.commute.km, 1, p.commute.mode, "wfh"),
      range: co2eSavedRangeKgPerYear(p.commute.km, 1, p.commute.mode, "wfh"),
    }),
    cost: 0,
    effort: 2,
    audience: ["adult", "respiratory", "cardiac", "pregnant"],
    confidence: "medium",
  },
  {
    id: "no_idling",
    section: "routine",
    appliesIf: (p) => ["car", "two_wheeler"].includes(p.commute.mode) || p.habits.schoolRun,
    co2e: () => idlingCo2eSaved(),
    cost: 0,
    effort: 1,
    audience: ["adult", "child"],
    confidence: "low",
  },
  {
    id: "errands_in_best_window",
    section: "routine",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "senior"],
    confidence: "medium",
  },
  {
    id: "child_play_indoors_when_poor",
    section: "routine",
    appliesIf: (p, level) => p.household.children > 0 && level >= 3,
    cost: 0,
    effort: 1,
    audience: ["child", "respiratory"],
    confidence: "medium",
  },
  {
    id: "trip_chaining",
    section: "routine",
    appliesIf: (p) =>
      ["car", "two_wheeler"].includes(p.commute.mode) &&
      p.commute.km > 0 &&
      p.commute.daysPerWeek > 0,
    co2e: (p) => tripChainingCo2eSaved(p.commute.km, p.commute.daysPerWeek, p.commute.mode),
    cost: 0,
    effort: 2,
    audience: ["adult"],
    confidence: "low",
  },
  {
    id: "air_house_in_best_window",
    section: "indoor",
    appliesIf: (p, level) => p.home.windows !== "sealed" && level >= 2,
    edit: (s, _p, w) => ({ ...s, windowsOpenHours: bestHoursOf(w) }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "close_windows_at_peak",
    section: "indoor",
    appliesIf: (p, level, w) => {
      if (p.home.windows !== "normal" || level < 2) return false;
      const avoid = avoidHoursOf(w);
      return [7, 8, 17, 18].some((h) => avoid.has(h));
    },
    edit: (s, _p, w) => {
      const avoid = avoidHoursOf(w);
      return { ...s, windowsOpenHours: s.windowsOpenHours.filter((h) => !avoid.has(h)) };
    },
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "run_purifier_through_night",
    section: "indoor",
    appliesIf: (p) => p.home.purifier !== "none",
    edit: (s, p) => ({
      ...s,
      purifierHours: allHomePurifierHours(p.commute.mode, p.commute.daysPerWeek),
    }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "diy_box_fan_filter",
    section: "indoor",
    appliesIf: (p) => p.home.purifier === "none" && (p.budget === "zero" || p.budget === "low"),
    edit: (s, p) => ({
      ...s,
      purifier: "diy",
      purifierHours: allHomePurifierHours(p.commute.mode, p.commute.daysPerWeek),
    }),
    cost: 1,
    effort: 2,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "buy_hepa_purifier",
    section: "indoor",
    appliesIf: (p) => p.home.purifier === "none" && p.budget === "medium",
    edit: (s, p) => ({
      ...s,
      purifier: "hepa",
      purifierHours: allHomePurifierHours(p.commute.mode, p.commute.daysPerWeek),
    }),
    cost: 2,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "seal_gaps_and_door_sweeps",
    section: "indoor",
    appliesIf: (p) => p.home.windows === "leaky",
    edit: (s) => ({ ...s, envelope: "normal", windowsOpenHours: [7, 8, 17, 18] }),
    cost: 1,
    effort: 2,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "cooking_ventilation",
    section: "indoor",
    appliesIf: (p) => ["lpg", "biomass", "other"].includes(p.home.cooking),
    edit: (s) => ({ ...s, cookVent: true }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "damp_mop_dont_sweep",
    section: "indoor",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory"],
    confidence: "low",
  },
  {
    id: "avoid_indoor_smoke_sources",
    section: "indoor",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "lpg_instead_of_biomass",
    section: "swap",
    appliesIf: (p) => p.home.cooking === "biomass",
    edit: (s) => ({ ...s, cooking: "lpg" }),
    cost: 1,
    effort: 2,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  },
  {
    id: "induction_cooking",
    section: "swap",
    appliesIf: (p) => p.home.cooking === "lpg",
    edit: (s) => ({ ...s, cooking: "induction" }),
    cost: 2,
    effort: 2,
    audience: ["adult", "respiratory", "pregnant"],
    confidence: "low",
  },
  {
    id: "warmth_without_burning",
    section: "swap",
    appliesIf: (_p, level) => level >= 2,
    cost: 1,
    effort: 1,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  },
  {
    id: "carpool_shared_ride",
    section: "swap",
    appliesIf: (p) => p.commute.mode === "car" && p.commute.km > 0 && p.commute.daysPerWeek > 0,
    co2e: (p) => {
      const full = co2eSavedKgPerYear(p.commute.km, p.commute.daysPerWeek, "car", "wfh");
      const [lo, hi] = co2eSavedRangeKgPerYear(p.commute.km, p.commute.daysPerWeek, "car", "wfh");
      return {
        kg: Math.round(full * 0.5 * 10) / 10,
        range: [Math.round(lo * 0.5 * 10) / 10, Math.round(hi * 0.5 * 10) / 10],
      };
    },
    cost: 0,
    effort: 2,
    audience: ["adult"],
    confidence: "low",
  },
  {
    id: "walk_or_cycle_short_trips",
    section: "swap",
    appliesIf: (p, level) =>
      p.commute.km > 0 &&
      p.commute.km <= 3 &&
      !["walk", "cycle", "wfh"].includes(p.commute.mode) &&
      level <= 2,
    edit: (s, p) => ({ ...s, commuteMode: p.commute.km <= 1.2 ? "walk" : "cycle" }),
    co2e: (p) => {
      const target = p.commute.km <= 1.2 ? "walk" : "cycle";
      return {
        kg: co2eSavedKgPerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, target),
        range: co2eSavedRangeKgPerYear(p.commute.km, p.commute.daysPerWeek, p.commute.mode, target),
      };
    },
    cost: 0,
    effort: 2,
    audience: ["adult"],
    confidence: "low",
  },
  {
    id: "community_no_burning",
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  },
  {
    id: "society_dust_and_diesel_audit",
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 3,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  },
  {
    id: "share_community_brief",
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior"],
    confidence: "low",
  },
];

export const ACTION_CATALOG: readonly ActionDef[] = RAW_ACTIONS.map((a) => ({
  ...a,
  method: actionMeta[a.id].method,
  assumptions: actionMeta[a.id].assumptions,
}));

export const ACTION_BY_ID: Record<ActionId, ActionDef> = Object.fromEntries(
  ACTION_CATALOG.map((a) => [a.id, a]),
) as Record<ActionId, ActionDef>;
