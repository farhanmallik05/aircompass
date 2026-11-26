import { co2eSavedKgPerYear, co2eSavedRangeKgPerYear } from "../emissions";
import { makeAction, type ActionDef } from "./shared";

type SwapActionId =
  | "lpg_instead_of_biomass"
  | "induction_cooking"
  | "warmth_without_burning"
  | "carpool_shared_ride"
  | "walk_or_cycle_short_trips"
  | "community_no_burning"
  | "society_dust_and_diesel_audit"
  | "share_community_brief";

export const SWAP_BY_ID: Record<SwapActionId, ActionDef> = {
  lpg_instead_of_biomass: makeAction("lpg_instead_of_biomass", {
    section: "swap",
    appliesIf: (p) => p.home.cooking === "biomass",
    edit: (s) => ({ ...s, cooking: "lpg" }),
    cost: 1,
    effort: 2,
    audience: ["adult", "child", "senior", "respiratory", "cardiac", "pregnant"],
    confidence: "low",
  }),
  induction_cooking: makeAction("induction_cooking", {
    section: "swap",
    appliesIf: (p) => p.home.cooking === "lpg",
    edit: (s) => ({ ...s, cooking: "induction" }),
    cost: 2,
    effort: 2,
    audience: ["adult", "respiratory", "pregnant"],
    confidence: "low",
  }),
  warmth_without_burning: makeAction("warmth_without_burning", {
    section: "swap",
    appliesIf: (_p, level) => level >= 2,
    cost: 1,
    effort: 1,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  }),
  carpool_shared_ride: makeAction("carpool_shared_ride", {
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
  }),
  walk_or_cycle_short_trips: makeAction("walk_or_cycle_short_trips", {
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
  }),
  community_no_burning: makeAction("community_no_burning", {
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  }),
  society_dust_and_diesel_audit: makeAction("society_dust_and_diesel_audit", {
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 3,
    audience: ["adult", "senior", "child"],
    confidence: "low",
  }),
  share_community_brief: makeAction("share_community_brief", {
    section: "swap",
    appliesIf: () => true,
    cost: 0,
    effort: 1,
    audience: ["adult", "child", "senior"],
    confidence: "low",
  }),
};
