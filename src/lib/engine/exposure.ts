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

export interface ExposureBreakdown {
  exposureUgM3: number;
  hourlyIndoorMean: number[];
  hourlyOutdoor: number[];
}

function localHourOfTimestamp(ts: string, fallbackIndex: number): number {
  const m = /T(\d{2}):/.exec(ts);
  if (m) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) return h;
  }
  return fallbackIndex % 24;
}

function simulate24hIndoor(
  cOut24: readonly number[],
  clockHours24: readonly number[],
  scenario: Scenario,
  roomAreaM2: number,
  params: ModelParamSet,
): number[] {
  const openSet = new Set(scenario.windowsOpenHours);
  const purSet = new Set(scenario.purifierHours);
  const cadr = PURIFIER_CADR_M3H[scenario.purifier];
  const qFull = cadr > 0 ? purifierQ(cadr, roomAreaM2, params.purifierDerate) : 0;

  // Initialize at hour-0 steady state so constant Cout matches the steady-state identity exactly,
  // then run one 24h cyclic pass to settle diurnal carryover.
  const a0 = airExchangeForHour(scenario.envelope, openSet.has(clockHours24[0]), params);
  const q0 = purSet.has(clockHours24[0]) ? qFull : 0;
  const s0 = cookingSourceForHour(clockHours24[0], scenario.cooking, scenario.cookVent, params);
  let c = steadyState(cOut24[0], a0, { P: params.P, k: params.k, q: q0, S: s0 });

  for (let i = 0; i < 24; i++) {
    const ch = clockHours24[i];
    const a = airExchangeForHour(scenario.envelope, openSet.has(ch), params);
    const q = purSet.has(ch) ? qFull : 0;
    const S = cookingSourceForHour(ch, scenario.cooking, scenario.cookVent, params);
    c = stepIndoor(c, cOut24[i], a, { P: params.P, k: params.k, q, S }).cEnd;
  }

  const means: number[] = [];
  for (let i = 0; i < 24; i++) {
    const ch = clockHours24[i];
    const a = airExchangeForHour(scenario.envelope, openSet.has(ch), params);
    const q = purSet.has(ch) ? qFull : 0;
    const S = cookingSourceForHour(ch, scenario.cooking, scenario.cookVent, params);
    const step = stepIndoor(c, cOut24[i], a, { P: params.P, k: params.k, q, S });
    means.push(step.cMean);
    c = step.cEnd;
  }
  return means;
}

function simulateWorkIndoor(cOut24: readonly number[], params: ModelParamSet): number[] {
  const aWork = params.aNormalClosed;
  let c = steadyState(cOut24[0], aWork, { P: params.P, k: params.k, q: 0, S: 0 });
  for (let i = 0; i < 24; i++) {
    c = stepIndoor(c, cOut24[i], aWork, { P: params.P, k: params.k, q: 0, S: 0 }).cEnd;
  }
  const means: number[] = [];
  for (let i = 0; i < 24; i++) {
    const step = stepIndoor(c, cOut24[i], aWork, { P: params.P, k: params.k, q: 0, S: 0 });
    means.push(step.cMean);
    c = step.cEnd;
  }
  return means;
}

function slotConcentration(
  location: ReturnType<typeof buildDaySchedule>[number][number]["location"],
  cHome: number,
  cWork: number,
  cOut: number,
  n95Applied: boolean,
  params: ModelParamSet,
): number {
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
  cOut24: readonly number[],
  cHome24: readonly number[],
  cWork24: readonly number[],
  clockHours24: readonly number[],
  scenario: Scenario,
  commuteKm: number,
  isCommuteDay: boolean,
  params: ModelParamSet,
): number {
  const schedule = buildDaySchedule(scenario, commuteKm, isCommuteDay);
  let num = 0;
  let den = 0;
  for (let i = 0; i < 24; i++) {
    const ch = clockHours24[i];
    const slots = schedule[ch] ?? schedule[i];
    for (const s of slots) {
      const c = slotConcentration(
        s.location,
        cHome24[i],
        cWork24[i],
        cOut24[i],
        scenario.n95Outdoors && s.n95Eligible,
        params,
      );
      num += c * s.v * s.f;
      den += s.v * s.f;
    }
  }
  if (den <= 0) throw new RangeError("total breathing weight must be > 0");
  return num / den;
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
  const cOut24 = Array.from({ length: 24 }, (_, i) => hourlyPm25[i % hourlyPm25.length]);
  const clockHours24 = Array.from({ length: 24 }, (_, i) =>
    options.timestamps?.[i] ? localHourOfTimestamp(options.timestamps[i], i) : i,
  );

  const cHome24 = simulate24hIndoor(cOut24, clockHours24, scenario, options.roomAreaM2, params);
  const cWork24 = simulateWorkIndoor(cOut24, params);

  const commuteDays = Math.min(7, Math.max(0, scenario.commuteDaysPerWeek));
  let exposureUgM3 = 0;
  if (commuteDays > 0 && scenario.commuteMode !== "wfh" && options.commuteKm > 0) {
    const commuteDayExp = weightedDayExposure(
      cOut24,
      cHome24,
      cWork24,
      clockHours24,
      scenario,
      options.commuteKm,
      true,
      params,
    );
    const homeDayExp =
      commuteDays < 7
        ? weightedDayExposure(
            cOut24,
            cHome24,
            cWork24,
            clockHours24,
            scenario,
            options.commuteKm,
            false,
            params,
          )
        : 0;
    exposureUgM3 = (commuteDays * commuteDayExp + (7 - commuteDays) * homeDayExp) / 7;
  } else {
    exposureUgM3 = weightedDayExposure(
      cOut24,
      cHome24,
      cWork24,
      clockHours24,
      scenario,
      options.commuteKm,
      false,
      params,
    );
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
