export type Lang = "en" | "hi";
export const GROUPS = ["child", "senior", "respiratory", "cardiac", "pregnant", "adult"] as const;
export type Group = (typeof GROUPS)[number];

export const COMMUTE_MODES = [
  "walk",
  "cycle",
  "two_wheeler",
  "auto",
  "bus",
  "metro",
  "car",
  "wfh",
] as const;
export type CommuteMode = (typeof COMMUTE_MODES)[number];

export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export const ACTION_IDS = [
  "shift_exercise_to_best_window",
  "exercise_indoors_when_poor",
  "n95_for_open_transport",
  "commute_to_public_transport",
  "wfh_on_worst_day",
  "no_idling",
  "errands_in_best_window",
  "child_play_indoors_when_poor",
  "trip_chaining",
  "air_house_in_best_window",
  "close_windows_at_peak",
  "run_purifier_through_night",
  "diy_box_fan_filter",
  "buy_hepa_purifier",
  "seal_gaps_and_door_sweeps",
  "cooking_ventilation",
  "damp_mop_dont_sweep",
  "avoid_indoor_smoke_sources",
  "lpg_instead_of_biomass",
  "induction_cooking",
  "warmth_without_burning",
  "carpool_shared_ride",
  "walk_or_cycle_short_trips",
  "community_no_burning",
  "society_dust_and_diesel_audit",
  "share_community_brief",
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export type ActionSection = "routine" | "indoor" | "swap";

export interface Profile {
  lang: Lang;
  place: {
    name: string;
    lat: number;
    lon: number;
    country: string; // ISO alpha-2
  };
  household: {
    adults: number;
    children: number;
    seniors: number;
    conditions: ("respiratory" | "cardiac" | "pregnant")[];
  };
  home: {
    windows: "sealed" | "normal" | "leaky";
    purifier: "none" | "hepa" | "diy";
    cooking: "lpg" | "induction" | "biomass" | "other";
    roomAreaM2: number;
  };
  commute: {
    mode: CommuteMode;
    km: number; // one way
    daysPerWeek: number;
  };
  habits: {
    morningOutdoorExercise: boolean;
    schoolRun: boolean;
  };
  budget: "zero" | "low" | "medium";
  notes?: string; // untrusted, <= 300 chars
}

export interface HourPoint {
  t: string;
  pm25: number;
  pm10: number;
  usAqi: number;
  tempC?: number;
  rh?: number;
  windKmh?: number;
}

export type DataNote = "cams_europe_11km" | "cams_global_25_45km" | "recorded" | "illustrative";

export interface AirContext {
  place: Profile["place"];
  source: "live" | "demo";
  dataNote: DataNote;
  recordedDate?: string;
  calibrationFactor?: number;
  fetchedAt: string;
  hours: HourPoint[];
  nowIndex: number;
}

export interface Scenario {
  windowsOpenHours: number[]; // 0-23
  envelope: "sealed" | "normal" | "leaky";
  purifier: "none" | "hepa" | "diy";
  purifierHours: number[]; // 0-23
  exerciseHour: number | null;
  exerciseIndoors: boolean;
  commuteMode: CommuteMode;
  commuteDaysPerWeek: number;
  n95Outdoors: boolean;
  cooking: Profile["home"]["cooking"];
  cookVent: boolean;
}

export interface Impact {
  actionId: ActionId;
  kind: "quantified" | "guidance";
  exposureDeltaUgM3: number; // > 0 better; < 0 = trade-off (shown, never hidden)
  exposureDeltaPct: number;
  exposureRangeUgM3: [number, number]; // min/max of 3 parameter sets
  co2eKgPerYear?: number;
  co2eRangeKgPerYear?: [number, number];
  confidence: "low" | "medium";
  method: string;
  assumptions: string[];
}

export interface CandidateAction {
  id: ActionId;
  section: ActionSection;
  cost: 0 | 1 | 2;
  effort: 1 | 2 | 3;
  audience: Group[];
  score: number;
  impact: Impact;
  tradeoff: boolean;
  mitigation?: ActionId;
}

export interface PlanCard {
  actionId: ActionId;
  section: ActionSection;
  title: string;
  why: string;
  when: string;
  steps: string[];
  impact: Impact;
  cost: 0 | 1 | 2;
  effort: 1 | 2 | 3;
  tradeoff: boolean;
}

export interface Plan {
  headline: string;
  summary: string;
  cards: PlanCard[];
  memberNotes: { group: Group; note: string }[];
  tradeoffs: string[];
}

type PlanOutcome = "ai" | "repaired" | "fallback";

export interface WindowRange {
  start: number;
  end: number;
  mean: number;
  startLabel: string;
  endLabel: string;
}

export interface WindowSummary {
  best: WindowRange;
  avoid: WindowRange;
  noGoodWindow: boolean;
  shortData: boolean;
  hoursEvaluated: number;
}

export interface NaqiSummary {
  sufficient: boolean;
  validHours: number;
  index?: number;
  category?: "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";
  dominant?: "pm25" | "pm10";
  assumptionUsed?: boolean;
}

export interface PlanFacts {
  levelNow: Level;
  levelToday: Level;
  aqiNow: number;
  aqiToday: number;
  pm25Now: number;
  pm25TodayMean: number;
  naqi: NaqiSummary | null;
  windows: WindowSummary;
  baselineExposureUgM3: number;
  combinedExposureUgM3: number;
  candidates: CandidateAction[];
  members: Group[];
  lang: Lang;
  budget: Profile["budget"];
  dataNote: DataNote;
  recordedDate?: string;
  calibrationFactor?: number;
  sanitizedNote?: string;
}

export interface PlanResponse {
  outcome: PlanOutcome;
  plan: Plan;
  facts: PlanFacts;
  baselineScenario: Scenario;
  combinedScenario: Scenario;
  tokens: Record<string, string>;
  reason?: string;
}

export interface GeoPlace {
  name: string;
  admin1?: string;
  country: string; // ISO alpha-2
  lat: number;
  lon: number;
}
