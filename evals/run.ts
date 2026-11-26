#!/usr/bin/env tsx
/**
 * 12-persona invariant evaluation harness (see docs/EVALS.md).
 *   npm run eval         offline evaluation against recorded fixtures in evals/fixtures/
 *   npm run eval:live    records fresh Gemini outputs per persona when GEMINI_API_KEY is set
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import personas from "./personas.json";
import golden from "../tests/fixtures/golden.json";
import { ACTION_BY_ID } from "../src/lib/engine/catalog";
import { budgetAllows } from "../src/lib/engine/select";
import { createGeminiClientFromEnv } from "../src/lib/llm/gemini";
import { PROMPT_CANARY, languageOk } from "../src/lib/llm/guard";
import {
  buildPlanFacts,
  generatePlanWithFallback,
  validateAndRenderPlanOut,
} from "../src/lib/llm/planner";
import { buildPlannerUserPrompt, getPlannerSystemPrompt } from "../src/lib/llm/prompt";
import { buildTokens } from "../src/lib/llm/tokens";
import { PlanOutSchema } from "../src/lib/schemas";
import type { AirContext, HourPoint, PlanFacts, PlanResponse, Profile } from "../src/lib/types";
import type { LlmClient } from "../src/lib/llm/client";

type PersonaEntry = {
  id: string;
  description: string;
  dayLevel: "clean" | "moderate" | "severe";
  profile: Profile;
};

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures", import.meta.url));
const REPORT_PATH = fileURLToPath(new URL("./REPORT.md", import.meta.url));

const SCALE_BY_DAY: Record<PersonaEntry["dayLevel"], number> = {
  clean: 0.1,
  moderate: 0.22,
  severe: 1,
};

function makeContextForPersona(p: PersonaEntry): AirContext {
  const scale = SCALE_BY_DAY[p.dayLevel];
  const hours: HourPoint[] = golden.best_window.day.map((pm, h) => {
    const pm25 = Math.round(pm * scale * 10) / 10;
    return {
      t: `2026-11-20T${String(h).padStart(2, "0")}:00`,
      pm25,
      pm10: Math.round(pm25 * 1.4),
      usAqi: Math.min(500, Math.round(pm25 * 1.5)),
    };
  });
  return {
    place: p.profile.place,
    source: "demo",
    dataNote: "recorded",
    recordedDate: "2026-11-20",
    fetchedAt: "2026-11-25T12:00:00Z",
    hours,
    nowIndex: 0,
  };
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let err: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw err;
}

async function recordLiveFixtures(liveClient: LlmClient): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const schema = z.toJSONSchema(PlanOutSchema);
  const systemPrompt = getPlannerSystemPrompt();
  const force = process.argv.includes("--force");
  for (const p of personas as PersonaEntry[]) {
    const fixturePath = path.join(FIXTURE_DIR, `${p.id}.json`);
    if (!force && existsSync(fixturePath)) continue;
    const ctx = makeContextForPersona(p);
    const { facts } = buildPlanFacts(p.profile, ctx);
    const tokens = buildTokens(facts);
    const userPrompt = buildPlannerUserPrompt(p.profile, facts, tokens);
    const res = await withRetry(() =>
      liveClient.generatePlanJson({ systemPrompt, userPrompt, schema }),
    );
    const check = validateAndRenderPlanOut(res.rawText, facts.candidates, tokens, facts.lang);
    let finalRaw = res.rawText;
    let outcome: "ai" | "repaired" = "ai";
    if (!check.ok) {
      const repairRes = await withRetry(() =>
        liveClient.generatePlanJson({
          systemPrompt,
          userPrompt: `${userPrompt}\nREPAIR: ${check.violations.join("; ")}`,
          schema,
        }),
      );
      finalRaw = repairRes.rawText;
      outcome = "repaired";
    }
    writeFileSync(
      fixturePath,
      `${JSON.stringify({ personaId: p.id, model: res.model, outcome, rawText: finalRaw }, null, 2)}\n`,
      "utf8",
    );
    console.log(`Recorded fixture ${p.id} (${res.model}, ${outcome})`);
  }
}

function collectPolicyInvariants(
  p: PersonaEntry,
  facts: PlanFacts,
  res: PlanResponse,
  renderedJoined: string,
): string[] {
  const fails: string[] = [];
  if (res.plan.cards.some((c) => !budgetAllows(p.profile.budget, c.cost))) fails.push("I2(budget)");
  const hasSensitive =
    p.profile.household.children > 0 ||
    p.profile.household.seniors > 0 ||
    p.profile.household.conditions.length > 0;
  if (
    hasSensitive &&
    facts.levelToday >= 3 &&
    res.plan.cards.some((c) => c.actionId === "shift_exercise_to_best_window")
  ) {
    fails.push("I3(sensitive_outdoor_ex)");
  }
  if (
    res.plan.cards.some(
      (c) => !ACTION_BY_ID[c.actionId].appliesIf(p.profile, facts.levelToday, facts.windows),
    )
  ) {
    fails.push("I4(appliesIf)");
  }
  if (/\{\{|\}\}/.test(renderedJoined)) fails.push("I5(unrendered_token)");
  if (res.plan.cards.some((c) => c.impact.exposureDeltaUgM3 < -0.05 && !c.tradeoff)) {
    fails.push("I6(unflagged_tradeoff)");
  }
  return fails;
}

function checkSafetyInvariants(
  p: PersonaEntry,
  ctx: AirContext,
  facts: PlanFacts,
  opts: { res: PlanResponse; renderedJoined: string },
): string[] {
  const { res, renderedJoined } = opts;
  const fails: string[] = [];
  if (p.id === "p10-injection-notes") {
    const cleanFacts = buildPlanFacts({ ...p.profile, notes: undefined }, ctx).facts;
    if (
      cleanFacts.aqiNow !== facts.aqiNow ||
      cleanFacts.baselineExposureUgM3 !== facts.baselineExposureUgM3 ||
      renderedJoined.includes(PROMPT_CANARY)
    ) {
      fails.push("I7(injection)");
    }
  }
  if (p.profile.lang === "hi" && !languageOk(renderedJoined, "hi")) fails.push("I8(hindi_lang)");
  if (
    facts.levelToday <= 1 &&
    /\b(avoid|hazardous|emergency|stay indoors)\b/i.test(`${res.plan.headline} ${res.plan.summary}`)
  ) {
    fails.push("I10(alarm_on_clean)");
  }
  return fails;
}

function collectSafetyAndCoverageInvariants(
  p: PersonaEntry,
  ctx: AirContext,
  facts: PlanFacts,
  opts: { res: PlanResponse; fallbackRes: PlanResponse; renderedJoined: string },
): string[] {
  const { res, fallbackRes, renderedJoined } = opts;
  const fails = checkSafetyInvariants(p, ctx, facts, { res, renderedJoined });
  if (fallbackRes.outcome !== "fallback" || fallbackRes.plan.cards.length < 5) {
    fails.push("I9(fallback)");
  }
  const availSections = new Set(facts.candidates.map((c) => c.section));
  const planSections = new Set(res.plan.cards.map((c) => c.section));
  for (const sec of availSections) {
    if (!planSections.has(sec)) fails.push(`I11(missing_${sec})`);
  }
  if (p.id === "p09-london-non-india" && facts.naqi !== null) fails.push("non_india_naqi");
  return fails;
}

async function evaluatePersona(p: PersonaEntry): Promise<{ row: string; passed: boolean }> {
  const ctx = makeContextForPersona(p);
  const { facts } = buildPlanFacts(p.profile, ctx);
  const tokens = buildTokens(facts);
  const fixturePath = path.join(FIXTURE_DIR, `${p.id}.json`);
  if (!existsSync(fixturePath)) {
    return { row: `| ${p.id} | MISSING FIXTURE | FAIL | — |`, passed: false };
  }

  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
    model: string;
    rawText: string;
  };
  const fixtureClient: LlmClient = {
    generatePlanJson: async () => ({ rawText: fixture.rawText, model: fixture.model }),
    chatWithTools: async () => ({
      text: "",
      toolCallsExecuted: 0,
      toolNumbers: [],
      model: fixture.model,
    }),
  };
  const throwingClient: LlmClient = {
    generatePlanJson: async () => {
      throw new Error("simulated outage");
    },
    chatWithTools: async () => {
      throw new Error("simulated outage");
    },
  };

  const res = await generatePlanWithFallback(p.profile, ctx, fixtureClient);
  const fallbackRes = await generatePlanWithFallback(p.profile, ctx, throwingClient);
  const fails: string[] = [];
  const directCheck = validateAndRenderPlanOut(
    fixture.rawText,
    facts.candidates,
    tokens,
    facts.lang,
  );
  if (!directCheck.ok || res.outcome === "fallback") {
    fails.push(`I1(${directCheck.ok ? res.outcome : directCheck.violations.join(",")})`);
  }

  const renderedJoined = [
    res.plan.headline,
    res.plan.summary,
    ...res.plan.cards.flatMap((c) => [c.title, c.why, c.when, ...c.steps]),
  ].join(" ");
  fails.push(
    ...collectPolicyInvariants(p, facts, res, renderedJoined),
    ...collectSafetyAndCoverageInvariants(p, ctx, facts, { res, fallbackRes, renderedJoined }),
  );

  const status = fails.length === 0 ? "PASS" : `FAIL: ${fails.join(", ")}`;
  return {
    row: `| ${p.id} | ${p.profile.lang.toUpperCase()} / L${facts.levelToday} | ${res.outcome} | ${status} |`,
    passed: fails.length === 0,
  };
}

async function evaluateAll(): Promise<{ allPassed: boolean; report: string }> {
  const rows: string[] = [];
  let allPassed = true;
  for (const p of personas as PersonaEntry[]) {
    const result = await evaluatePersona(p);
    if (!result.passed) allPassed = false;
    rows.push(result.row);
  }

  const report = [
    "# 12-Persona Invariant Evaluation Report",
    "",
    "Offline verification against committed Gemini fixtures (`evals/fixtures/*.json`) and deterministic engine invariants `I1-I12`.",
    "",
    "| Persona | Context | Outcome | Invariants (I1-I12) |",
    "|---|---|---|---|",
    ...rows,
    "",
    `Overall status: **${allPassed ? "ALL 12 PERSONAS PASS (I1-I12)" : "FAILED"}**`,
    "",
  ].join("\n");

  return { allPassed, report };
}

async function main() {
  if (process.argv.includes("--live")) {
    const liveClient = createGeminiClientFromEnv();
    if (!liveClient) {
      console.error("GEMINI_API_KEY is required for eval:live");
      process.exit(1);
    }
    await recordLiveFixtures(liveClient);
  }

  const first = await evaluateAll();
  const second = await evaluateAll();
  if (first.report !== second.report) {
    console.error("I12 determinism check failed: repeated eval runs diverged.");
    process.exit(1);
  }

  writeFileSync(REPORT_PATH, first.report, "utf8");
  console.log(first.report);
  if (!first.allPassed) process.exit(1);
}

void main();
