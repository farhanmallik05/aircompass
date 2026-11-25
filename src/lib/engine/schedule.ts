import type { CommuteMode, Scenario } from "../types";

/** Assumed urban door-to-door commute speeds (km/h, plan.md section 5.5). */
export const COMMUTE_SPEED_KMH: Record<CommuteMode, number> = {
  walk: 4.5,
  cycle: 14,
  two_wheeler: 18,
  auto: 18,
  bus: 18,
  car: 20,
  metro: 30,
  wfh: 0,
};

/**
 * Breathing factors (dimensionless relative to sedentary indoor = 1.0)
 * grounded in US EPA Exposure Factors Handbook Ch. 6 short-term inhalation rates.
 */
export const BREATHING_FACTORS = {
  sleep: 0.8,
  indoorRest: 1.0,
  walk: 2.0,
  cycle: 3.0,
  outdoorExercise: 4.0,
  indoorExercise: 2.5,
  transitSeated: 1.0,
} as const;

export type SlotLocation =
  | "home"
  | "work_indoor"
  | "outdoor_walk"
  | "outdoor_cycle"
  | "outdoor_open_transit"
  | "outdoor_exercise"
  | "indoor_exercise"
  | "car_cabin"
  | "metro_cabin";

export interface SubSlot {
  /** Fraction of the hour in (0, 1]; all sub-slots in an hour sum to 1.0. */
  f: number;
  location: SlotLocation;
  /** Breathing factor v */
  v: number;
  /** Whether an N95/FFP2 respirator applies when scenario.n95Outdoors is enabled */
  n95Eligible: boolean;
}

function commuteLocation(mode: Exclude<CommuteMode, "wfh">): {
  location: SlotLocation;
  v: number;
  n95Eligible: boolean;
} {
  switch (mode) {
    case "walk":
      return { location: "outdoor_walk", v: BREATHING_FACTORS.walk, n95Eligible: true };
    case "cycle":
      return { location: "outdoor_cycle", v: BREATHING_FACTORS.cycle, n95Eligible: true };
    case "car":
      return { location: "car_cabin", v: BREATHING_FACTORS.transitSeated, n95Eligible: false };
    case "metro":
      return { location: "metro_cabin", v: BREATHING_FACTORS.transitSeated, n95Eligible: false };
    case "two_wheeler":
    case "auto":
    case "bus":
      return {
        location: "outdoor_open_transit",
        v: BREATHING_FACTORS.transitSeated,
        n95Eligible: true,
      };
  }
}

/**
 * Builds 24 hourly sub-slot cells (sum of f = 1.0 per hour) for either a commute day or a home/WFH day.
 * Commute out begins at 08:00; return commute begins at 17:00; exercise is 0.5h during exerciseHour.
 */
export function buildDaySchedule(
  scenario: Scenario,
  commuteKm: number,
  isCommuteDay: boolean,
): SubSlot[][] {
  const activeCommute = isCommuteDay && scenario.commuteMode !== "wfh" && commuteKm > 0;
  const speed = COMMUTE_SPEED_KMH[scenario.commuteMode];
  const rawTripHours = activeCommute && speed > 0 ? commuteKm / speed : 0;
  const tripHours = Math.min(2, Math.max(0, rawTripHours));

  const cells: SubSlot[][] = [];
  for (let h = 0; h < 24; h++) {
    const slots: SubSlot[] = [];
    let used = 0;

    const addSlot = (f: number, location: SlotLocation, v: number, n95Eligible: boolean) => {
      const clamped = Math.min(1 - used, Math.max(0, f));
      if (clamped <= 1e-9) return;
      slots.push({ f: clamped, location, v, n95Eligible });
      used += clamped;
    };

    // Exercise block: 30 minutes (0.5h) inside exerciseHour
    if (scenario.exerciseHour === h) {
      if (scenario.exerciseIndoors) {
        addSlot(0.5, "indoor_exercise", BREATHING_FACTORS.indoorExercise, false);
      } else {
        addSlot(0.5, "outdoor_exercise", BREATHING_FACTORS.outdoorExercise, true);
      }
    }

    // Outbound commute starting at 08:00 (spills into hour 9 if > 1h)
    if (activeCommute && scenario.commuteMode !== "wfh") {
      const cSpec = commuteLocation(scenario.commuteMode);
      if (h === 8) {
        addSlot(Math.min(1, tripHours), cSpec.location, cSpec.v, cSpec.n95Eligible);
      } else if (h === 9 && tripHours > 1) {
        addSlot(tripHours - 1, cSpec.location, cSpec.v, cSpec.n95Eligible);
      } else if (h === 17) {
        addSlot(Math.min(1, tripHours), cSpec.location, cSpec.v, cSpec.n95Eligible);
      } else if (h === 18 && tripHours > 1) {
        addSlot(tripHours - 1, cSpec.location, cSpec.v, cSpec.n95Eligible);
      }
    }

    // Remainder of the hour: sleep (22..05), work/school indoors (09..16 on commute days), or home
    const rem = 1 - used;
    if (rem > 1e-9) {
      if (h >= 22 || h < 6) {
        addSlot(rem, "home", BREATHING_FACTORS.sleep, false);
      } else if (activeCommute && h >= 9 && h < 17) {
        addSlot(rem, "work_indoor", BREATHING_FACTORS.indoorRest, false);
      } else {
        addSlot(rem, "home", BREATHING_FACTORS.indoorRest, false);
      }
    }

    cells.push(slots);
  }
  return cells;
}

/** True if clock hour h is a home-occupied hour (used when purifier runs "all hours at home"). */
export function isHomeHour(h: number, isCommuteDay: boolean, hasCommute: boolean): boolean {
  if (!hasCommute || !isCommuteDay) return true;
  return h < 8 || h >= 17;
}

/** Default all-home-hours purifier schedule for a household profile. */
export function allHomePurifierHours(
  commuteMode: CommuteMode,
  commuteDaysPerWeek: number,
): number[] {
  const hasCommute = commuteMode !== "wfh" && commuteDaysPerWeek > 0;
  const hours: number[] = [];
  for (let h = 0; h < 24; h++) {
    // If commuting some days, running during sleeping/evening/morning hours covers home time;
    // on WFH/weekend days all 24h are at home.
    if (!hasCommute || h < 8 || h >= 18) hours.push(h);
  }
  return hours;
}
