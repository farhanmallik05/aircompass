import { parseClockHour } from "./bands";
import { purifierQ, steadyState, stepIndoor } from "./indoor";
import { buildDaySchedule } from "./schedule";
import {
  airExchangeForHour,
  BASE_PARAMS,
  cookingSourceForHour,
  PURIFIER_CADR_M3H,
  type ModelParamSet,
} from "./sensitivity";
import type { Scenario } from "../types";

interface ExposureBreakdown {
  exposureUgM3: number;
  hourlyIndoorMean: number[];
  hourlyOutdoor: number[];
}

interface RoomStepCtx {
  scenario: Scenario;
  qFull: number;
  openSet: ReadonlySet<number>;
  purSet: ReadonlySet<number>;
  params: ModelParamSet;
}

interface DaySlotInput {
  cOut: number;
  clockHour: number;
}

interface DayHourConcentrations extends DaySlotInput {
  cHome: number;
  cWork: number;
}

function stepRoomHour(cStart: number, slot: DaySlotInput, ctx: RoomStepCtx) {
  const { scenario, qFull, openSet, purSet, params } = ctx;
  const a = airExchangeForHour(scenario.envelope, openSet.has(slot.clockHour), params);
  const q = purSet.has(slot.clockHour) ? qFull : 0;
  const S = cookingSourceForHour(slot.clockHour, scenario.cooking, scenario.cookVent, params);
  return stepIndoor(cStart, slot.cOut, a, { P: params.P, k: params.k, q, S });
}

function simulate24hIndoor(
  daySlots: readonly DaySlotInput[],
  firstSlot: DaySlotInput,
  ctx: { scenario: Scenario; roomAreaM2: number; params: ModelParamSet },
): { cHome: number; clockHour: number; cOut: number }[] {
  const { scenario, roomAreaM2, params } = ctx;
  const openSet = new Set(scenario.windowsOpenHours);
  const purSet = new Set(scenario.purifierHours);
  const cadr = PURIFIER_CADR_M3H[scenario.purifier];
  const qFull = cadr > 0 ? purifierQ(cadr, roomAreaM2, params.purifierDerate) : 0;
  const stepCtx: RoomStepCtx = { scenario, qFull, openSet, purSet, params };

  // Initialize at hour-0 steady state so constant Cout matches the steady-state identity exactly,
  // then run one 24h cyclic pass to settle diurnal carryover.
  const a0 = airExchangeForHour(scenario.envelope, openSet.has(firstSlot.clockHour), params);
  const q0 = purSet.has(firstSlot.clockHour) ? qFull : 0;
  const s0 = cookingSourceForHour(firstSlot.clockHour, scenario.cooking, scenario.cookVent, params);
  let c = steadyState(firstSlot.cOut, a0, { P: params.P, k: params.k, q: q0, S: s0 });

  for (const slot of daySlots) {
    c = stepRoomHour(c, slot, stepCtx).cEnd;
  }

  return daySlots.map((slot) => {
    const step = stepRoomHour(c, slot, stepCtx);
    c = step.cEnd;
    return { ...slot, cHome: step.cMean };
  });
}

function simulateWorkIndoor(
  homeSlots: readonly { cOut: number; clockHour: number; cHome: number }[],
  firstCOut: number,
  params: ModelParamSet,
): DayHourConcentrations[] {
  const aWork = params.aNormalClosed;
  let c = steadyState(firstCOut, aWork, { P: params.P, k: params.k, q: 0, S: 0 });
  for (const slot of homeSlots) {
    c = stepIndoor(c, slot.cOut, aWork, { P: params.P, k: params.k, q: 0, S: 0 }).cEnd;
  }
  return homeSlots.map((slot) => {
    const step = stepIndoor(c, slot.cOut, aWork, { P: params.P, k: params.k, q: 0, S: 0 });
    c = step.cEnd;
    return { ...slot, cWork: step.cMean };
  });
}

function slotConcentration(
  location: ReturnType<typeof buildDaySchedule>[number][number]["location"],
  ctx: {
    cHome: number;
    cWork: number;
    cOut: number;
    n95Applied: boolean;
    params: ModelParamSet;
  },
): number {
  const { cHome, cWork, cOut, n95Applied, params } = ctx;
  let c: number;
  switch (location) {
    case "home":
    case "indoor_exercise":
      c = cHome;
      break;
    case "work_indoor":
      c = cWork;
      break;
    case "car_cabin":
      c = 0.6 * cOut;
      break;
    case "metro_cabin":
      c = 0.7 * cOut;
      break;
    case "outdoor_walk":
    case "outdoor_cycle":
    case "outdoor_open_transit":
    case "outdoor_exercise":
      c = cOut;
      break;
  }
  return n95Applied ? c * params.n95Residual : c;
}

function weightedDayExposure(
  hours: readonly DayHourConcentrations[],
  scenario: Scenario,
  opts: { commuteKm: number; isCommuteDay: boolean; params: ModelParamSet },
): number {
  const schedule = buildDaySchedule(scenario, opts.commuteKm, opts.isCommuteDay);
  let num = 0;
  let den = 0;
  for (const hour of hours) {
    const slots = schedule[hour.clockHour];
    if (!slots) continue;
    for (const s of slots) {
      const c = slotConcentration(s.location, {
        cHome: hour.cHome,
        cWork: hour.cWork,
        cOut: hour.cOut,
        n95Applied: scenario.n95Outdoors && s.n95Eligible,
        params: opts.params,
      });
      num += c * s.v * s.f;
      den += s.v * s.f;
    }
  }
  if (den <= 0) throw new RangeError("total breathing weight must be > 0");
  return num / den;
}

function buildHourGrid(
  hourlyPm25: readonly number[],
  timestamps: readonly string[] | undefined,
): { cOut24: number[]; daySlots: DaySlotInput[]; firstSlot: DaySlotInput } {
  const cOut24: number[] = [];
  while (cOut24.length < 24) {
    for (const v of hourlyPm25) {
      if (cOut24.length < 24) cOut24.push(v);
    }
  }
  const daySlots: DaySlotInput[] = cOut24.map((cOut, i) => {
    const ts = timestamps?.[i];
    return { cOut, clockHour: ts ? parseClockHour(ts, i) : i };
  });
  const firstSlot = daySlots[0];
  if (!firstSlot) throw new RangeError("hourlyPm25 must be non-empty");
  return { cOut24, daySlots, firstSlot };
}

/** Computes 24h breathing-weighted exposure (ug/m3) over a 24-hour outdoor PM2.5 series. */
export function computeExposure(
  hourlyPm25: readonly number[],
  scenario: Scenario,
  options: {
    roomAreaM2: number;
    commuteKm: number;
    timestamps?: readonly string[];
    params?: ModelParamSet;
  },
): ExposureBreakdown {
  if (hourlyPm25.length === 0) throw new RangeError("hourlyPm25 must be non-empty");
  for (const v of hourlyPm25) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`invalid outdoor PM2.5: ${v}`);
  }
  const params = options.params ?? BASE_PARAMS;
  const { cOut24, daySlots, firstSlot } = buildHourGrid(hourlyPm25, options.timestamps);
  const homeData = simulate24hIndoor(daySlots, firstSlot, {
    scenario,
    roomAreaM2: options.roomAreaM2,
    params,
  });
  const hourData = simulateWorkIndoor(homeData, firstSlot.cOut, params);
  const cHome24 = homeData.map((h) => h.cHome);

  const commuteDays = Math.min(7, Math.max(0, scenario.commuteDaysPerWeek));
  let exposureUgM3 = 0;
  if (commuteDays > 0 && scenario.commuteMode !== "wfh" && options.commuteKm > 0) {
    const commuteDayExp = weightedDayExposure(hourData, scenario, {
      commuteKm: options.commuteKm,
      isCommuteDay: true,
      params,
    });
    const homeDayExp =
      commuteDays < 7
        ? weightedDayExposure(hourData, scenario, {
            commuteKm: options.commuteKm,
            isCommuteDay: false,
            params,
          })
        : 0;
    exposureUgM3 = (commuteDays * commuteDayExp + (7 - commuteDays) * homeDayExp) / 7;
  } else {
    exposureUgM3 = weightedDayExposure(hourData, scenario, {
      commuteKm: options.commuteKm,
      isCommuteDay: false,
      params,
    });
  }

  return {
    exposureUgM3,
    hourlyIndoorMean: cHome24,
    hourlyOutdoor: cOut24,
  };
}

/** Berkeley Earth rule of thumb (~22 ug/m3 24h PM2.5 ~= 1 cigarette/day). Not a clinical measure. */
export function cigaretteEquivalentPerDay(exposureUgM3: number): number {
  if (!Number.isFinite(exposureUgM3) || exposureUgM3 < 0) {
    throw new RangeError(`exposure must be finite >= 0, got ${exposureUgM3}`);
  }
  return Math.round((exposureUgM3 / 22) * 10) / 10;
}
