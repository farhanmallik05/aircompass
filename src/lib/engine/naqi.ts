import { clampNowIndex } from "./bands";
import type { HourPoint, NaqiSummary } from "../types";

/** CPCB National AQI, PM-based approximation (PM2.5 and PM10 sub-indices only; max rule). */
type Row = readonly [number, number, number, number];

const PM25: readonly Row[] = [
  [0, 30, 0, 50],
  [31, 60, 51, 100],
  [61, 90, 101, 200],
  [91, 120, 201, 300],
  [121, 250, 301, 400],
  // CPCB lists Severe only as "250+". Upper anchor 380 is a CONVENTION (assumption), capped at 500.
  [251, 380, 401, 500],
];
const PM10: readonly Row[] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 510, 401, 500], // 510 is a convention as above
];

type NaqiCategory = "Good" | "Satisfactory" | "Moderate" | "Poor" | "Very Poor" | "Severe";

function subIndex(table: readonly Row[], c: number): number {
  if (!Number.isFinite(c) || c < 0) {
    throw new RangeError(`concentration must be finite and >= 0, got ${c}`);
  }
  const x = Math.round(c);
  for (const [cl, ch, il, ih] of table) {
    if (x <= ch) return Math.round(il + ((x - cl) * (ih - il)) / (ch - cl));
  }
  return 500;
}

export const naqiPm25 = (c: number) => subIndex(PM25, c);
export const naqiPm10 = (c: number) => subIndex(PM10, c);

export function naqiCategory(index: number): NaqiCategory {
  if (index <= 50) return "Good";
  if (index <= 100) return "Satisfactory";
  if (index <= 200) return "Moderate";
  if (index <= 300) return "Poor";
  if (index <= 400) return "Very Poor";
  return "Severe";
}

/** Overall index = max sub-index. Inputs are trailing 24 h means; the caller enforces >= 16 valid hours. */
export function naqi(
  pm25: number,
  pm10?: number,
): { index: number; category: NaqiCategory; dominant: "pm25" | "pm10" } {
  const a = naqiPm25(pm25);
  const b = pm10 === undefined ? -1 : naqiPm10(pm10);
  const index = Math.max(a, b);
  return { index, category: naqiCategory(index), dominant: b > a ? "pm10" : "pm25" };
}

/** CPCB 24-hour trailing NAQI (PM-based). Requires >= 16 valid hours in the trailing 24h window. */
export function trailingNaqi(hours: readonly HourPoint[], nowIndex: number): NaqiSummary {
  if (hours.length === 0) return { sufficient: false, validHours: 0 };
  const end = clampNowIndex(hours, nowIndex);
  const start = Math.max(0, end - 23);
  const slice = hours.slice(start, end + 1);
  const valid25 = slice.map((h) => h.pm25).filter((v) => Number.isFinite(v) && v >= 0);
  if (valid25.length < 16) {
    return { sufficient: false, validHours: valid25.length };
  }
  const mean25 = valid25.reduce((s, v) => s + v, 0) / valid25.length;
  const valid10 = slice.map((h) => h.pm10).filter((v) => Number.isFinite(v) && v >= 0);
  const mean10 =
    valid10.length >= 16 ? valid10.reduce((s, v) => s + v, 0) / valid10.length : undefined;
  const result = naqi(mean25, mean10);
  const assumptionUsed =
    Math.round(mean25) > 250 || (mean10 !== undefined && Math.round(mean10) > 430);
  return {
    sufficient: true,
    validHours: valid25.length,
    index: result.index,
    category: result.category,
    dominant: result.dominant,
    assumptionUsed,
  };
}
