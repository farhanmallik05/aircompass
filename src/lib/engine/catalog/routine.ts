import {
  co2eSavedKgPerYear,
  co2eSavedRangeKgPerYear,
  idlingCo2eSaved,
  tripChainingCo2eSaved,
} from "../emissions";
import { makeAction, type ActionDef } from "./shared";

type RoutineActionId =
  | "shift_exercise_to_best_window"
  | "exercise_indoors_when_poor"
  | "n95_for_open_transport"
  | "commute_to_public_transport"
  | "wfh_on_worst_day"
  | "no_idling"
  | "errands_in_best_window"
  | "child_play_indoors_when_poor"
  | "trip_chaining";

export const ROUTINE_BY_ID: Record<RoutineActionId, ActionDef> = {
  shift_exercise_to_best_window: makeAction("shift_exercise_to_best_window", {
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
  }),
  exercise_indoors_when_poor: makeAction("exercise_indoors_when_poor", {
    section: "routine",
    appliesIf: (p, level) => p.habits.morningOutdoorExercise && level >= 3,
    edit: (s) => ({ ...s, exerciseIndoors: true }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
  n95_for_open_transport: makeAction("n95_for_open_transport", {
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
  }),
  commute_to_public_transport: makeAction("commute_to_public_transport", {
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
  }),
  wfh_on_worst_day: makeAction("wfh_on_worst_day", {
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
  }),
  no_idling: makeAction("no_idling", {
    section: "routine",
    appliesIf: (p) => ["car", "two_wheeler"].includes(p.commute.mode) || p.habits.schoolRun,
    co2e: () => idlingCo2eSaved(),
    cost: 0,
    effort: 1,
    audience: ["adult", "child"],
    confidence: "low",
  }),
  errands_in_best_window: makeAction("errands_in_best_window", {
    section: "routine",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "senior"],
    confidence: "medium",
  }),
  child_play_indoors_when_poor: makeAction("child_play_indoors_when_poor", {
    section: "routine",
    appliesIf: (p, level) => p.household.children > 0 && level >= 3,
    cost: 0,
    effort: 1,
    audience: ["child", "respiratory"],
    confidence: "medium",
  }),
  trip_chaining: makeAction("trip_chaining", {
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
  }),
};
