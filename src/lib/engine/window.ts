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

interface HourSlot {
  pm25: number;
  hour: number;
}

function findFallbackBest2h(
  slots: readonly HourSlot[],
  firstSlot: HourSlot,
): {
  startHour: number;
  mean: number;
} {
  if (slots.length < 2) return { startHour: firstSlot.hour, mean: firstSlot.pm25 };
  let fallback: { startHour: number; mean: number } | null = null;
  let prev: HourSlot | null = null;
  for (const curr of slots) {
    if (prev) {
      const m = (prev.pm25 + curr.pm25) / 2;
      if (!fallback || m < fallback.mean - 1e-12) fallback = { startHour: prev.hour, mean: m };
    }
    prev = curr;
  }
  return fallback ?? { startHour: firstSlot.hour, mean: firstSlot.pm25 };
}

function findBestWindow2h(
  slots: readonly HourSlot[],
  firstSlot: HourSlot,
): { startHour: number; mean: number } {
  let best: { startHour: number; mean: number } | null = null;
  let prev: HourSlot | null = null;
  for (const curr of slots) {
    if (prev && prev.hour >= 8 && prev.hour <= 18 && curr.hour === (prev.hour + 1) % 24) {
      const m = (prev.pm25 + curr.pm25) / 2;
      if (!best || m < best.mean - 1e-12) best = { startHour: prev.hour, mean: m };
    }
    prev = curr;
  }
  return best ?? findFallbackBest2h(slots, firstSlot);
}

function findAvoidWindow(
  slots: readonly HourSlot[],
  avoidLen: number,
  firstSlot: HourSlot,
): { startHour: number; mean: number } {
  const n = slots.length;
  let avoid: { startHour: number; mean: number } | null = null;
  for (const [i, head] of slots.entries()) {
    if (i + avoidLen > n) break;
    let sum = 0;
    for (const item of slots.slice(i, i + avoidLen)) sum += item.pm25;
    const m = sum / avoidLen;
    if (!avoid || m > avoid.mean + 1e-12) avoid = { startHour: head.hour, mean: m };
  }
  return avoid ?? { startHour: firstSlot.hour, mean: firstSlot.pm25 };
}

/**
 * Finds best 2-hour window in 08:00-20:00 (earliest on ties) and worst 3-hour avoid window across
 * the supplied series. Handles arrays shorter than 24 hours gracefully.
 */
export function findWindowsFromHours(
  pm25ByHour: readonly number[],
  clockHours?: readonly number[],
): WindowSummary {
  for (const v of pm25ByHour) {
    if (!Number.isFinite(v) || v < 0) throw new RangeError(`invalid PM2.5: ${v}`);
  }

  const slots: HourSlot[] = pm25ByHour.map((pm25, i) => ({
    pm25,
    hour: clockHours?.[i] ?? i % 24,
  }));
  const firstSlot = slots[0];
  if (!firstSlot) throw new RangeError("pm25ByHour must be non-empty");

  const n = slots.length;
  const avoidLen = Math.min(3, n);
  const resolvedBest = findBestWindow2h(slots, firstSlot);
  const resolvedAvoid = findAvoidWindow(slots, avoidLen, firstSlot);

  return {
    best: makeRange(resolvedBest.startHour, Math.min(2, n), resolvedBest.mean),
    avoid: makeRange(resolvedAvoid.startHour, avoidLen, resolvedAvoid.mean),
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
