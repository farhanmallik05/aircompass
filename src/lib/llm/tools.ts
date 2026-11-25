import type { FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { co2eSavedKgPerYear } from "../engine/emissions";
import { computeExposure } from "../engine/exposure";
import { next24Series } from "../engine/impact";
import { PARAMETER_SETS } from "../engine/sensitivity";
import { SimulateScenarioArgsSchema } from "../schemas";
import type { AirContext, Profile, Scenario } from "../types";

export const SIMULATE_SCENARIO_DECLARATION: FunctionDeclaration = {
  name: "simulate_scenario",
  description:
    "Simulates how changes to windows, air purifier, exercise timing/indoors, commute mode/days, N95 mask, or cooking ventilation affect 24h breathing PM2.5 exposure and CO2e.",
  parametersJsonSchema: z.toJSONSchema(SimulateScenarioArgsSchema),
};

export function executeSimulateScenario(
  rawArgs: unknown,
  profile: Profile,
  context: AirContext,
  baseScenario: Scenario,
): {
  ok: boolean;
  error?: string;
  beforeUgM3?: number;
  afterUgM3?: number;
  deltaUgM3?: number;
  deltaPct?: number;
  rangeUgM3?: [number, number];
  co2eSavedKgPerYear?: number;
  assumptions?: string[];
} {
  const parsed = SimulateScenarioArgsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return { ok: false, error: "Invalid scenario arguments" };
  }

  const patch = parsed.data;
  const nextScenario: Scenario = {
    ...baseScenario,
    ...(patch.windowsOpenHours !== undefined ? { windowsOpenHours: patch.windowsOpenHours } : {}),
    ...(patch.envelope !== undefined ? { envelope: patch.envelope } : {}),
    ...(patch.purifier !== undefined ? { purifier: patch.purifier } : {}),
    ...(patch.purifierHours !== undefined ? { purifierHours: patch.purifierHours } : {}),
    ...(patch.exerciseHour !== undefined ? { exerciseHour: patch.exerciseHour } : {}),
    ...(patch.exerciseIndoors !== undefined ? { exerciseIndoors: patch.exerciseIndoors } : {}),
    ...(patch.commuteMode !== undefined ? { commuteMode: patch.commuteMode } : {}),
    ...(patch.commuteDaysPerWeek !== undefined
      ? { commuteDaysPerWeek: patch.commuteDaysPerWeek }
      : {}),
    ...(patch.n95Outdoors !== undefined ? { n95Outdoors: patch.n95Outdoors } : {}),
    ...(patch.cooking !== undefined ? { cooking: patch.cooking } : {}),
    ...(patch.cookVent !== undefined ? { cookVent: patch.cookVent } : {}),
  };

  if (nextScenario.purifier !== "none" && nextScenario.purifierHours.length === 0) {
    nextScenario.purifierHours = Array.from({ length: 24 }, (_, h) => h);
  }

  const series = next24Series(context);
  const deltas: number[] = [];
  let baseBefore = 0;
  let baseAfter = 0;

  for (const params of PARAMETER_SETS) {
    const b = computeExposure(series.pm25, baseScenario, {
      roomAreaM2: profile.home.roomAreaM2,
      commuteKm: profile.commute.km,
      timestamps: series.timestamps,
      params,
    }).exposureUgM3;
    const a = computeExposure(series.pm25, nextScenario, {
      roomAreaM2: profile.home.roomAreaM2,
      commuteKm: profile.commute.km,
      timestamps: series.timestamps,
      params,
    }).exposureUgM3;
    deltas.push(b - a);
    if (params.name === "base") {
      baseBefore = b;
      baseAfter = a;
    }
  }

  const rawDelta = baseBefore - baseAfter;
  const pct = baseBefore > 0 ? (rawDelta / baseBefore) * 100 : 0;
  const co2Before = co2eSavedKgPerYear(
    profile.commute.km,
    baseScenario.commuteDaysPerWeek,
    baseScenario.commuteMode,
    "wfh",
  );
  const co2After = co2eSavedKgPerYear(
    profile.commute.km,
    nextScenario.commuteDaysPerWeek,
    nextScenario.commuteMode,
    "wfh",
  );

  return {
    ok: true,
    beforeUgM3: Math.round(baseBefore * 10) / 10,
    afterUgM3: Math.round(baseAfter * 10) / 10,
    deltaUgM3: Math.round(rawDelta * 10) / 10,
    deltaPct: Math.round(pct * 10) / 10,
    rangeUgM3: [
      Math.round(Math.min(...deltas) * 10) / 10,
      Math.round(Math.max(...deltas) * 10) / 10,
    ],
    co2eSavedKgPerYear: Math.round((co2Before - co2After) * 10) / 10,
    assumptions: [
      "Single-zone indoor mass balance across Conservative/Base/Optimistic parameters",
      "Room ceiling height 2.7 m; car cabin 0.6x outdoor",
    ],
  };
}
