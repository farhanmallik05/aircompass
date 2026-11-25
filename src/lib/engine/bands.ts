import guidanceData from "../../../data/guidance.json";
import type { HourPoint, Lang, Level } from "../types";

export type { Level };

/** US EPA AQI PM2.5 breakpoints, 2024 revision (40 CFR 58 App. G). [concLo, concHi, aqiLo, aqiHi]. */
const EPA_PM25 = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
] as const;

/** EPA truncates (not rounds) PM2.5 to one decimal. The epsilon absorbs binary-float noise such as 0.7 * 10. */
const truncate1 = (c: number) => Math.floor(c * 10 + 1e-9) / 10;

function assertConc(c: number): void {
  if (!Number.isFinite(c) || c < 0) throw new RangeError(`PM2.5 must be a finite number >= 0, got ${c}`);
}

/** PM2.5 (ug/m3) to US AQI, capped at 500. */
export function aqiFromPm25(c: number): number {
  assertConc(c);
  const t = truncate1(c);
  for (const [cl, ch, il, ih] of EPA_PM25) {
    if (t <= ch) return Math.round(((ih - il) / (ch - cl)) * (t - cl) + il);
  }
  return 500;
}

/** Health level L0..L5 from a PM2.5 concentration (same breakpoints as the AQI categories). */
export function levelOfPm25(c: number): Level {
  assertConc(c);
  const t = truncate1(c);
  const uppers = [9.0, 35.4, 55.4, 125.4, 225.4] as const;
  let level = 0;
  for (const u of uppers) if (t > u) level += 1;
  return level as Level;
}

/** Mean PM2.5 across the next 24 hours starting at `nowIndex` (or available remaining hours). */
export function next24hMeanPm25(hours: readonly HourPoint[], nowIndex: number): number {
  if (hours.length === 0) throw new RangeError("hours must be non-empty");
  const start = Math.max(0, Math.min(nowIndex, hours.length - 1));
  const slice = hours.slice(start, start + 24);
  const valid = slice.map((h) => h.pm25).filter((v) => Number.isFinite(v) && v >= 0);
  if (valid.length === 0) throw new RangeError("no valid PM2.5 values in forecast slice");
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

export interface LevelGuidance {
  level: Level;
  band: string;
  everyone: string;
  sensitive: string;
}

/** Guidance text for health level L0..L5 in the requested language. */
export function guidanceForLevel(level: Level, lang: Lang): LevelGuidance {
  const row = guidanceData.levels[level];
  return {
    level,
    band: row.band[lang],
    everyone: row.everyone[lang],
    sensitive: row.sensitive[lang],
  };
}
