import { levelOfPm25 } from "./bands";
import type { HourPoint, WindowRange, WindowSummary } from "../types";

const formatHour = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function parseClockHour(ts: string, fallback: number): number {
  const m = /T(\d{2}):/.exec(ts);
  if (m) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) return h;
  }
  return fallback % 24;
}

function makeRange(start: number, length: number, mean: number): WindowRange {
  return {
    start: start % 24,
    end: (start + length) % 24 || 24,
    mean: round6(mean),
    startLabel: formatHour(start),
    endLabel: formatHour(start + length),
  };
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
  const shortData = n < 24;

  // Best contiguous 2h window within 08:00..20:00 (starts at 08..18 inclusive)
  let best: { idx: number; mean: number } | null = null;
  for (let i = 0; i <= n - 2; i++) {
    const h0 = hours[i];
    const h1 = hours[i + 1];
    if (h0 >= 8 && h0 <= 18 && h1 === (h0 + 1) % 24) {
      const m = (pm25ByHour[i] + pm25ByHour[i + 1]) / 2;
      if (!best || m < best.mean - 1e-12) best = { idx: i, mean: m };
    }
  }
  // Fallback if a short slice contains no 08..20 pair
  if (!best) {
    if (n >= 2) {
      for (let i = 0; i <= n - 2; i++) {
        const m = (pm25ByHour[i] + pm25ByHour[i + 1]) / 2;
        if (!best || m < best.mean - 1e-12) best = { idx: i, mean: m };
      }
    } else {
      best = { idx: 0, mean: pm25ByHour[0] };
    }
  }

  // Worst contiguous 3h window across available hours (earliest on ties)
  let avoid: { idx: number; mean: number } | null = null;
  const avoidLen = Math.min(3, n);
  for (let i = 0; i <= n - avoidLen; i++) {
    let sum = 0;
    for (let k = 0; k < avoidLen; k++) sum += pm25ByHour[i + k];
    const m = sum / avoidLen;
    if (!avoid || m > avoid.mean + 1e-12) avoid = { idx: i, mean: m };
  }
  const resolvedBest = best ?? { idx: 0, mean: pm25ByHour[0] };
  const resolvedAvoid = avoid ?? { idx: 0, mean: pm25ByHour[0] };

  const bestStartHour = hours[resolvedBest.idx];
  const avoidStartHour = hours[resolvedAvoid.idx];

  return {
    best: makeRange(bestStartHour, Math.min(2, n), resolvedBest.mean),
    avoid: makeRange(avoidStartHour, avoidLen, resolvedAvoid.mean),
    noGoodWindow: levelOfPm25(resolvedBest.mean) >= 4,
    shortData,
    hoursEvaluated: n,
  };
}

/** Finds best and avoid windows from the next <= 24 hours starting at `nowIndex`. */
export function findWindows(hours: readonly HourPoint[], nowIndex: number): WindowSummary {
  if (hours.length === 0) throw new RangeError("hours must be non-empty");
  const start = Math.max(0, Math.min(nowIndex, hours.length - 1));
  const slice = hours.slice(start, start + 24);
  const pm25 = slice.map((h) => h.pm25);
  const clockHours = slice.map((h, idx) => parseClockHour(h.t, idx));
  return findWindowsFromHours(pm25, clockHours);
}
