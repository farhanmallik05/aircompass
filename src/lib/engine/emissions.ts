import factors from "../../../data/emission-factors.json";
import type { CommuteMode } from "../types";

const WEEKS_PER_YEAR = factors.workingWeeksPerYear;

export function emissionFactor(mode: CommuteMode): number {
  return factors.modes[mode].kgPerPassengerKm;
}

export function emissionFactorRange(mode: CommuteMode): [number, number] {
  const [lo, hi] = factors.modes[mode].rangeKgPerPassengerKm;
  return [lo, hi];
}

/** Round-trip annual CO2e saved (kg/yr) when shifting from `fromMode` to `toMode`. */
export function co2eSavedKgPerYear(
  kmOneWay: number,
  daysPerWeek: number,
  fromMode: CommuteMode,
  toMode: CommuteMode,
): number {
  if (!Number.isFinite(kmOneWay) || kmOneWay < 0) {
    throw new RangeError(`kmOneWay must be finite >= 0, got ${kmOneWay}`);
  }
  if (!Number.isFinite(daysPerWeek) || daysPerWeek < 0 || daysPerWeek > 7) {
    throw new RangeError(`daysPerWeek must be in [0, 7], got ${daysPerWeek}`);
  }
  const saved =
    kmOneWay *
    2 *
    daysPerWeek *
    WEEKS_PER_YEAR *
    (emissionFactor(fromMode) - emissionFactor(toMode));
  return Math.round(saved * 1e6) / 1e6;
}

/** Sensitivity range [min, max] for annual CO2e saved across DEFRA / India GHG Program bounds. */
export function co2eSavedRangeKgPerYear(
  kmOneWay: number,
  daysPerWeek: number,
  fromMode: CommuteMode,
  toMode: CommuteMode,
): [number, number] {
  const central = co2eSavedKgPerYear(kmOneWay, daysPerWeek, fromMode, toMode);
  const [fLo, fHi] = emissionFactorRange(fromMode);
  const [tLo, tHi] = emissionFactorRange(toMode);
  const trips = kmOneWay * 2 * daysPerWeek * WEEKS_PER_YEAR;
  const lo = Math.max(0, Math.min(central, Math.round(trips * (fLo - tHi) * 1e6) / 1e6));
  const hi = Math.max(central, Math.round(trips * (fHi - tLo) * 1e6) / 1e6);
  return [lo, hi];
}

/** Annual CO2e saved from stopping 5 min/day engine idling (0.6-1.0 L/h petrol, 250 days/yr). */
export function idlingCo2eSaved(): { kg: number; range: [number, number] } {
  const [lMin, lMax] = factors.idling.litersPerHour;
  const hoursPerYear = (factors.idling.minutesPerDay / 60) * factors.idling.daysPerYear;
  const co2PerL = factors.idling.kgCo2PerLiterPetrol;
  const min = Math.round(lMin * hoursPerYear * co2PerL * 10) / 10;
  const max = Math.round(lMax * hoursPerYear * co2PerL * 10) / 10;
  const mid = Math.round(((min + max) / 2) * 10) / 10;
  return { kg: mid, range: [min, max] };
}

/** Annual CO2e saved from trip-chaining errands (10% central reduction, 5-15% range). */
export function tripChainingCo2eSaved(
  kmOneWay: number,
  daysPerWeek: number,
  mode: CommuteMode,
): { kg: number; range: [number, number] } {
  const annualBase = co2eSavedKgPerYear(kmOneWay, daysPerWeek, mode, "wfh");
  const [fMin, fMax] = factors.tripChaining.rangeFraction;
  const mid = Math.round(annualBase * factors.tripChaining.reductionFraction * 10) / 10;
  const min = Math.round(annualBase * fMin * 10) / 10;
  const max = Math.round(annualBase * fMax * 10) / 10;
  return { kg: mid, range: [min, max] };
}
