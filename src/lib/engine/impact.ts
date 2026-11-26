import { clampNowIndex } from "./bands";
import { computeExposure } from "./exposure";
import { BASE_PARAMS, PARAMETER_SETS } from "./sensitivity";
import type { ActionDef } from "./catalog";
import type { AirContext, Impact, Profile, Scenario, WindowSummary } from "../types";

const round1 = (x: number) => Math.round(x * 10) / 10;

export function next24Series(context: AirContext): { pm25: number[]; timestamps: string[] } {
  const start = clampNowIndex(context.hours, context.nowIndex);
  const slice = context.hours.slice(start, start + 24);
  return {
    pm25: slice.map((h) => h.pm25),
    timestamps: slice.map((h) => h.t),
  };
}

/**
 * Evaluates an action's exposure impact across all three coherent parameter sets (Conservative, Base, Optimistic).
 * Keeps negative exposure deltas (exposure increases) intact and never hides them.
 * Caps displayed purifier-driven percentage reduction at 80% (see docs/METHODOLOGY.md).
 */
export function evaluateActionImpact(
  def: ActionDef,
  profile: Profile,
  context: AirContext,
  opts: { baseScenario: Scenario; windows: WindowSummary },
): Impact {
  const { baseScenario, windows } = opts;
  const series = next24Series(context);
  const co2e = def.co2e?.(profile);

  if (!def.edit) {
    return {
      actionId: def.id,
      kind: "guidance",
      exposureDeltaUgM3: 0,
      exposureDeltaPct: 0,
      exposureRangeUgM3: [0, 0],
      ...(co2e ? { co2eKgPerYear: co2e.kg, co2eRangeKgPerYear: co2e.range } : {}),
      confidence: def.confidence,
      method: def.method,
      assumptions: def.assumptions,
    };
  }

  const editedScenario = def.edit(baseScenario, profile, windows);
  const deltas: number[] = [];
  let baseBefore = 0;
  let baseAfter = 0;

  for (const params of PARAMETER_SETS) {
    const before = computeExposure(series.pm25, baseScenario, {
      roomAreaM2: profile.home.roomAreaM2,
      commuteKm: profile.commute.km,
      timestamps: series.timestamps,
      params,
    }).exposureUgM3;
    const after = computeExposure(series.pm25, editedScenario, {
      roomAreaM2: profile.home.roomAreaM2,
      commuteKm: profile.commute.km,
      timestamps: series.timestamps,
      params,
    }).exposureUgM3;
    const rawDelta = before - after;
    const cappedDelta = rawDelta > 0 && before > 0 ? Math.min(rawDelta, before * 0.8) : rawDelta;
    deltas.push(cappedDelta);
    if (params.name === BASE_PARAMS.name) {
      baseBefore = before;
      baseAfter = after;
    }
  }

  const rawBaseDelta = baseBefore - baseAfter;
  const cappedBaseDelta =
    rawBaseDelta > 0 && baseBefore > 0 ? Math.min(rawBaseDelta, baseBefore * 0.8) : rawBaseDelta;
  const pct = baseBefore > 0 ? (cappedBaseDelta / baseBefore) * 100 : 0;
  const minD = Math.min(...deltas);
  const maxD = Math.max(...deltas);

  return {
    actionId: def.id,
    kind: "quantified",
    exposureDeltaUgM3: round1(cappedBaseDelta),
    exposureDeltaPct: round1(pct),
    exposureRangeUgM3: [round1(minD), round1(maxD)],
    ...(co2e ? { co2eKgPerYear: co2e.kg, co2eRangeKgPerYear: co2e.range } : {}),
    confidence: def.confidence,
    method: def.method,
    assumptions: def.assumptions,
  };
}

/** Applies multiple selected actions in order to produce the combined household scenario. */
export function buildCombinedScenario(
  defs: readonly ActionDef[],
  profile: Profile,
  baseScenario: Scenario,
  windows: WindowSummary,
): Scenario {
  let current = { ...baseScenario };
  for (const def of defs) {
    // Do not auto-apply an exposure-worsening commute swap into the combined indoor/protective baseline
    if (def.id === "commute_to_public_transport" || def.id === "walk_or_cycle_short_trips")
      continue;
    if (def.edit) current = def.edit(current, profile, windows);
  }
  return current;
}
