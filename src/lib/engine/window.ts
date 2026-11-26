import { clampNowIndex, levelOfPm25, parseClockHour } from "./bands";
import type { HourPoint, WindowRange, WindowSummary } from "../types";

const formatHour = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function makeRange(start: number, length: number, mean: number): WindowRange {
  return {
    start: start % 24,
    end: (start + length) % 24 || 24,
    mean: round6(mean),
    startLabel: formatHour(start),
    endLabel: formatHour(start + length),
  };
}

function findBestWindow2h(
  pm25ByHour: readonly number[],
  hours: readonly number[],
): { idx: number; mean: number } {
  const n = pm25ByHour.length;
  let best: { idx: number; mean: number } | null = null;
  for (let i = 0; i <= n - 2; i++) {
    const h0 = hours[i];
    const h1 = hours[i + 1];
    if (h0 >= 8 && h0 <= 18 && h1 === (h0 + 1) % 24) {
      const m = (pm25ByHour[i] + pm25ByHour[i + 1]) / 2;
      if (!best || m < best.mean - 1e-12) best = { idx: i, mean: m };
    }
  }
  if (best) return best;

  if (n < 2) return { idx: 0, mean: pm25ByHour[0] };
  let fallback: { idx: number; mean: number } = {
    idx: 0,
    mean: (pm25ByHour[0] + pm25ByHour[1]) / 2,
  };
  for (let i = 1; i <= n - 2; i++) {
    const m = (pm25ByHour[i] + pm25ByHour[i + 1]) / 2;
    if (m < fallback.mean - 1e-12) fallback = { idx: i, mean: m };
  }
  return fallback;
}

function findAvoidWindow(
  pm25ByHour: readonly number[],
  avoidLen: number,
): { idx: number; mean: number } {
  const n = pm25ByHour.length;
  let avoid: { idx: number; mean: number } | null = null;
  for (let i = 0; i <= n - avoidLen; i++) {
    let sum = 0;
    for (let k = 0; k < avoidLen; k++) sum += pm25ByHour[i + k];
    const m = sum / avoidLen;
    if (!avoid || m > avoid.mean + 1e-12) avoid = { idx: i, mean: m };
  }
  return avoid ?? { idx: 0, mean: pm25ByHour[0] };
}

/**
 * Finds best 2-hour window in 08:00-20:00 (earliest on ties) and worst 3-hour avoid window across
 * the supplied series. Handles arrays shorter than 24 hours gracefully.
 */
export function findWindowsFromHours(
  pm25ByHour: readonly number[],
  clockHours?: readonly number[],
): WindowSummary {
  if (pm25ByHour.length === 0) throw new RangeError("pm25ByHour must be non-empty");
  for (const v of pm25ByHour) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`invalid PM2.5: ${v}`);
  }

  const n = pm25ByHour.length;
  const hours = clockHours ?? Array.from({ length: n }, (_, i) => i % 24);
  const avoidLen = Math.min(3, n);
  const resolvedBest = findBestWindow2h(pm25ByHour, hours);
  const resolvedAvoid = findAvoidWindow(pm25ByHour, avoidLen);

  return {
    best: makeRange(hours[resolvedBest.idx], Math.min(2, n), resolvedBest.mean),
    avoid: makeRange(hours[resolvedAvoid.idx], avoidLen, resolvedAvoid.mean),
    noGoodWindow: levelOfPm25(resolvedBest.mean) >= 4,
    shortData: n < 24,
    hoursEvaluated: n,
  };
}

/** Finds best and avoid windows from the next <= 24 hours starting at `nowIndex`. */
export function findWindows(hours: readonly HourPoint[], nowIndex: number): WindowSummary {
  if (hours.length === 0) throw new RangeError("hours must be non-empty");
  const start = clampNowIndex(hours, nowIndex);
  const slice = hours.slice(start, start + 24);
  const pm25 = slice.map((h) => h.pm25);
  const clockHours = slice.map((h, idx) => parseClockHour(h.t, idx));
  return findWindowsFromHours(pm25, clockHours);
}
