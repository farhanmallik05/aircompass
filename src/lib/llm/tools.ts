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

type ScenarioPatch = ReturnType<typeof SimulateScenarioArgsSchema.parse>;

function applyScenarioPatch(baseScenario: Scenario, patch: ScenarioPatch): Scenario {
  const nextScenario: Scenario = { ...baseScenario };
  for (const [key, val] of Object.entries(patch)) {
    if (val !== undefined) {
      Object.assign(nextScenario, { [key]: val });
    }
  }
  if (nextScenario.purifier !== "none" && nextScenario.purifierHours.length === 0) {
    nextScenario.purifierHours = Array.from({ length: 24 }, (_, h) => h);
  }
  return nextScenario;
}

function summarizeSensitivity(
  context: AirContext,
  profile: Profile,
  baseScenario: Scenario,
  nextScenario: Scenario,
): { before: number; after: number; rangeUgM3: [number, number] } {
  const series = next24Series(context);
  const deltas: number[] = [];
  let before = 0;
  let after = 0;

  for (const params of PARAMETER_SETS) {
    const opts = {
      roomAreaM2: profile.home.roomAreaM2,
      commuteKm: profile.commute.km,
      timestamps: series.timestamps,
      params,
    };
    const b = computeExposure(series.pm25, baseScenario, opts).exposureUgM3;
    const a = computeExposure(series.pm25, nextScenario, opts).exposureUgM3;
    deltas.push(b - a);
    if (params.name === "base") {
      before = b;
      after = a;
    }
  }

  return {
    before,
    after,
    rangeUgM3: [
      Math.round(Math.min(...deltas) * 10) / 10,
      Math.round(Math.max(...deltas) * 10) / 10,
    ],
  };
}

/** Executes the bounded engine simulation behind the Gemini simulate_scenario tool. */
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

  const nextScenario = applyScenarioPatch(baseScenario, parsed.data);
  const { before, after, rangeUgM3 } = summarizeSensitivity(
    context,
    profile,
    baseScenario,
    nextScenario,
  );
  const rawDelta = before - after;
  const pct = before > 0 ? (rawDelta / before) * 100 : 0;
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
    beforeUgM3: Math.round(before * 10) / 10,
    afterUgM3: Math.round(after * 10) / 10,
    deltaUgM3: Math.round(rawDelta * 10) / 10,
    deltaPct: Math.round(pct * 10) / 10,
    rangeUgM3,
    co2eSavedKgPerYear: Math.round((co2Before - co2After) * 10) / 10,
    assumptions: [
      "Single-zone indoor mass balance across Conservative/Base/Optimistic parameters",
      "Room ceiling height 2.7 m; car cabin 0.6x outdoor",
    ],
  };
}
