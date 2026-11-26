import type { Profile, Scenario } from "../types";

export type ParameterSetName = "conservative" | "base" | "optimistic";

export interface ModelParamSet {
  name: ParameterSetName;
  /** Penetration factor P (0..1) */
  P: number;
  /** Deposition rate k (h^-1) */
  k: number;
  /** Real-world CADR derate factor */
  purifierDerate: number;
  /** Air exchange rate when normal home windows are shut (h^-1) */
  aNormalClosed: number;
  /** Air exchange rate when sealed/AC windows are shut (h^-1) */
  aSealedClosed: number;
  /** Air exchange rate for leaky envelope (h^-1) */
  aLeaky: number;
  /** Air exchange rate when windows are open (h^-1) */
  aOpen: number;
  /** N95/FFP2 residual penetration factor (0..1) */
  n95Residual: number;
  /** Cooking source S multiplier (reflects +-50% uncertainty) */
  cookingScale: number;
}

/** Three coherent parameter sets for uncertainty bounds [min, max] (docs/METHODOLOGY.md). */
export const PARAMETER_SETS: readonly ModelParamSet[] = [
  {
    name: "conservative",
    P: 0.9,
    k: 0.2,
    purifierDerate: 0.3,
    aNormalClosed: 1.0,
    aSealedClosed: 0.4,
    aLeaky: 2.3,
    aOpen: 4.5,
    n95Residual: 0.4,
    cookingScale: 1.5,
  },
  {
    name: "base",
    P: 0.8,
    k: 0.3,
    purifierDerate: 0.5,
    aNormalClosed: 0.7,
    aSealedClosed: 0.3,
    aLeaky: 2.0,
    aOpen: 4.0,
    n95Residual: 0.2,
    cookingScale: 1.0,
  },
  {
    name: "optimistic",
    P: 0.7,
    k: 0.4,
    purifierDerate: 0.7,
    aNormalClosed: 0.5,
    aSealedClosed: 0.2,
    aLeaky: 1.7,
    aOpen: 3.5,
    n95Residual: 0.1,
    cookingScale: 0.5,
  },
] as const;

export const BASE_PARAMS = PARAMETER_SETS[1];

export const PURIFIER_CADR_M3H: Record<Scenario["purifier"], number> = {
  none: 0,
  hepa: 250,
  diy: 200,
};

/** Cooking indoor PM2.5 source S (ug/m3/h) during active cooking hours (07 and 19). */
export const COOKING_SOURCE_UGM3H: Record<Profile["home"]["cooking"], number> = {
  biomass: 60,
  other: 25,
  lpg: 10,
  induction: 0,
};

export const COOKING_HOURS = new Set([7, 19]);

/** Default baseline scenario derived from household profile habits (docs/METHODOLOGY.md). */
export function baselineScenario(profile: Profile): Scenario {
  let windowsOpenHours: number[] = [];
  if (profile.home.windows === "normal") {
    windowsOpenHours = [7, 8, 17, 18]; // 07-09 and 17-19
  } else if (profile.home.windows === "leaky") {
    windowsOpenHours = Array.from({ length: 24 }, (_, h) => h);
  }

  return {
    windowsOpenHours,
    envelope: profile.home.windows,
    purifier: profile.home.purifier,
    purifierHours: profile.home.purifier === "none" ? [] : [18, 19, 20, 21],
    exerciseHour: profile.habits.morningOutdoorExercise ? 6 : null,
    exerciseIndoors: false,
    commuteMode: profile.commute.mode,
    commuteDaysPerWeek: profile.commute.daysPerWeek,
    n95Outdoors: false,
    cooking: profile.home.cooking,
    cookVent: false,
  };
}

/** Air-exchange rate a (h^-1) for an hour given envelope and whether windows are open. */
export function airExchangeForHour(
  envelope: Scenario["envelope"],
  windowOpen: boolean,
  params: ModelParamSet,
): number {
  if (envelope === "leaky") return params.aLeaky;
  if (windowOpen) return params.aOpen;
  return envelope === "sealed" ? params.aSealedClosed : params.aNormalClosed;
}

/** Indoor cooking source term S (ug/m3/h) for a given clock hour. */
export function cookingSourceForHour(
  hour: number,
  cooking: Scenario["cooking"],
  cookVent: boolean,
  params: ModelParamSet,
): number {
  if (!COOKING_HOURS.has(hour)) return 0;
  const base = COOKING_SOURCE_UGM3H[cooking] * params.cookingScale;
  return cookVent ? base * 0.5 : base;
}
