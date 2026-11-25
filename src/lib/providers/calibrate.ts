import { aqiFromPm25 } from "../engine/bands";
import type { AirContext } from "../types";

/** Calibrates modelled PM2.5 concentrations using a user-entered local monitor reading (clamp 0.5x..3x). */
export function applyCalibration(context: AirContext, observedPm25: number): AirContext {
  if (!Number.isFinite(observedPm25) || observedPm25 < 0) return context;
  const nowPoint = context.hours[context.nowIndex];
  if (!nowPoint || nowPoint.pm25 <= 0) return context;
  const rawRatio = observedPm25 / nowPoint.pm25;
  const r = Math.min(3, Math.max(0.5, rawRatio));
  const factor = Math.round(r * 100) / 100;
  return {
    ...context,
    calibrationFactor: factor,
    hours: context.hours.map((h) => {
      const scaled = Math.round(h.pm25 * r * 10) / 10;
      return {
        ...h,
        pm25: scaled,
        pm10: Math.round(h.pm10 * r * 10) / 10,
        usAqi: aqiFromPm25(scaled),
      };
    }),
  };
}
