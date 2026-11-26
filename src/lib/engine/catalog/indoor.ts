import { allHomePurifierHours } from "../schedule";
import { avoidHoursOf, bestHoursOf, makeAction, type ActionDef } from "./shared";

type IndoorActionId =
  | "air_house_in_best_window"
  | "close_windows_at_peak"
  | "run_purifier_through_night"
  | "diy_box_fan_filter"
  | "buy_hepa_purifier"
  | "seal_gaps_and_door_sweeps"
  | "cooking_ventilation"
  | "damp_mop_dont_sweep"
  | "avoid_indoor_smoke_sources";

export const INDOOR_BY_ID: Record<IndoorActionId, ActionDef> = {
  air_house_in_best_window: makeAction("air_house_in_best_window", {
    section: "indoor",
    appliesIf: (p, level) => p.home.windows !== "sealed" && level >= 2,
    edit: (s, _p, w) => ({ ...s, windowsOpenHours: bestHoursOf(w) }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
  close_windows_at_peak: makeAction("close_windows_at_peak", {
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
  }),
  run_purifier_through_night: makeAction("run_purifier_through_night", {
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
  }),
  diy_box_fan_filter: makeAction("diy_box_fan_filter", {
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
  }),
  buy_hepa_purifier: makeAction("buy_hepa_purifier", {
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
  }),
  seal_gaps_and_door_sweeps: makeAction("seal_gaps_and_door_sweeps", {
    section: "indoor",
    appliesIf: (p) => p.home.windows === "leaky",
    edit: (s) => ({ ...s, envelope: "normal", windowsOpenHours: [7, 8, 17, 18] }),
    cost: 1,
    effort: 2,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
  cooking_ventilation: makeAction("cooking_ventilation", {
    section: "indoor",
    appliesIf: (p) => ["lpg", "biomass", "other"].includes(p.home.cooking),
    edit: (s) => ({ ...s, cookVent: true }),
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
  damp_mop_dont_sweep: makeAction("damp_mop_dont_sweep", {
    section: "indoor",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory"],
    confidence: "low",
  }),
  avoid_indoor_smoke_sources: makeAction("avoid_indoor_smoke_sources", {
    section: "indoor",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
};
