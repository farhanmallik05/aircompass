import { z } from "zod";
import { aqiFromPm25, levelOfPm25, next24hMeanPm25 } from "../engine/bands";
import { computeExposure } from "../engine/exposure";
import { buildCombinedScenario, next24Series } from "../engine/impact";
import { trailingNaqi } from "../engine/naqi";
import { defsForCandidates, householdGroups, selectCandidates } from "../engine/select";
import { baselineScenario } from "../engine/sensitivity";
import { findWindows } from "../engine/window";
import { PlanOutSchema } from "../schemas";
import { wrapUntrustedNote } from "../security/sanitize";
import type {
  AirContext,
  CandidateAction,
  Lang,
  Plan,
  PlanFacts,
  PlanResponse,
  Profile,
} from "../types";
import type { LlmClient } from "./client";
import { buildFallbackPlan } from "./fallback";
import { findViolations, languageOk, render } from "./guard";
import { buildPlannerUserPrompt, buildRepairUserPrompt, getPlannerSystemPrompt } from "./prompt";
import { buildTokens } from "./tokens";

export function buildPlanFacts(
  profile: Profile,
  context: AirContext,
): {
  facts: PlanFacts;
  baselineScenario: ReturnType<typeof baselineScenario>;
  combinedScenario: ReturnType<typeof baselineScenario>;
} {
  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const pm25Now = context.hours[nowIdx]?.pm25 ?? 0;
  const pm25TodayMean = next24hMeanPm25(context.hours, nowIdx);
  const levelNow = levelOfPm25(pm25Now);
  const levelToday = levelOfPm25(pm25TodayMean);
  const aqiNow = aqiFromPm25(pm25Now);
  const aqiToday = aqiFromPm25(pm25TodayMean);
  const windows = findWindows(context.hours, nowIdx);
  const naqi = profile.place.country === "IN" ? trailingNaqi(context.hours, nowIdx) : null;

  const base = baselineScenario(profile);
  const candidates = selectCandidates(profile, context, levelToday, base, windows);
  const combined = buildCombinedScenario(
    defsForCandidates(candidates.slice(0, 7)),
    profile,
    base,
    windows,
  );

  const series = next24Series(context);
  const baselineExposureUgM3 = computeExposure(series.pm25, base, {
    roomAreaM2: profile.home.roomAreaM2,
    commuteKm: profile.commute.km,
    timestamps: series.timestamps,
  }).exposureUgM3;
  const combinedExposureUgM3 = computeExposure(series.pm25, combined, {
    roomAreaM2: profile.home.roomAreaM2,
    commuteKm: profile.commute.km,
    timestamps: series.timestamps,
  }).exposureUgM3;

  const sanitizedNote = wrapUntrustedNote(profile.notes);

  return {
    facts: {
      levelNow,
      levelToday,
      aqiNow,
      aqiToday,
      pm25Now,
      pm25TodayMean: Math.round(pm25TodayMean * 10) / 10,
      naqi,
      windows,
      baselineExposureUgM3: Math.round(baselineExposureUgM3 * 10) / 10,
      combinedExposureUgM3: Math.round(combinedExposureUgM3 * 10) / 10,
      candidates,
      members: householdGroups(profile),
      lang: profile.lang,
      budget: profile.budget,
      dataNote: context.dataNote,
      ...(context.recordedDate ? { recordedDate: context.recordedDate } : {}),
      ...(context.calibrationFactor !== undefined
        ? { calibrationFactor: context.calibrationFactor }
        : {}),
      ...(sanitizedNote ? { sanitizedNote } : {}),
    },
    baselineScenario: base,
    combinedScenario: combined,
  };
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fenced) return fenced[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/** Validates raw LLM JSON against schema, candidate allow-list, uniqueness, guard rules, and language. */
export function validateAndRenderPlanOut(
  rawText: string,
  candidates: readonly CandidateAction[],
  tokens: Record<string, string>,
  lang: Lang,
): { ok: true; plan: Plan } | { ok: false; violations: string[] } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(rawText));
  } catch {
    return { ok: false, violations: ["invalid json"] };
  }

  const zRes = PlanOutSchema.safeParse(parsedJson);
  if (!zRes.success) {
    return {
      ok: false,
      violations: zRes.error.issues
        .slice(0, 4)
        .map((i) => `schema:${i.path.join(".")}:${i.message}`),
    };
  }

  const out = zRes.data;
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));
  const violations: string[] = [];
  const seenIds = new Set<string>();

  for (const card of out.cards) {
    if (!candidateMap.has(card.actionId)) {
      violations.push(`unknown candidate actionId:${card.actionId}`);
    }
    if (seenIds.has(card.actionId)) {
      violations.push(`duplicate actionId:${card.actionId}`);
    }
    seenIds.add(card.actionId);
  }

  const availableSections = new Set(candidates.map((c) => c.section));
  const pickedSections = new Set(
    out.cards.map((c) => candidateMap.get(c.actionId)?.section).filter(Boolean),
  );
  for (const sec of availableSections) {
    if (!pickedSections.has(sec)) {
      violations.push(`missing section:${sec}`);
    }
  }

  const allTextSegments = [
    out.headline,
    out.summary,
    ...out.cards.flatMap((c) => [c.title, c.why, c.when, ...c.steps]),
    ...out.memberNotes.map((m) => m.note),
    ...out.tradeoffs,
  ];

  for (const seg of allTextSegments) {
    const v = findViolations(seg, tokens);
    violations.push(...v);
  }

  const joined = allTextSegments.join(" ");
  if (!languageOk(joined, lang)) {
    violations.push(`language mismatch:${lang}`);
  }

  if (violations.length > 0) {
    return { ok: false, violations: [...new Set(violations)] };
  }

  const plan: Plan = {
    headline: render(out.headline, tokens),
    summary: render(out.summary, tokens),
    cards: out.cards.map((c) => {
      const cand = candidateMap.get(c.actionId)!;
      return {
        actionId: c.actionId,
        section: cand.section,
        title: render(c.title, tokens),
        why: render(c.why, tokens),
        when: render(c.when, tokens),
        steps: c.steps.map((s) => render(s, tokens)),
        impact: cand.impact,
        cost: cand.cost,
        effort: cand.effort,
        tradeoff: cand.tradeoff,
      };
    }),
    memberNotes: out.memberNotes.map((m) => ({
      group: m.group,
      note: render(m.note, tokens),
    })),
    tradeoffs: out.tradeoffs.map((t) => render(t, tokens)),
  };

  return { ok: true, plan };
}

export async function generatePlanWithFallback(
  profile: Profile,
  context: AirContext,
  client: LlmClient | null,
  options: { quotaAllowed?: boolean } = {},
): Promise<PlanResponse> {
  const {
    facts,
    baselineScenario: base,
    combinedScenario: combined,
  } = buildPlanFacts(profile, context);
  const tokens = buildTokens(facts);

  if (!client || options.quotaAllowed === false) {
    return {
      outcome: "fallback",
      plan: buildFallbackPlan(facts),
      facts,
      baselineScenario: base,
      combinedScenario: combined,
      tokens,
      reason: options.quotaAllowed === false ? "daily_cap" : "no_api_key",
    };
  }

  const systemPrompt = getPlannerSystemPrompt();
  const userPrompt = buildPlannerUserPrompt(profile, facts, tokens);
  const schema = z.toJSONSchema(PlanOutSchema);

  try {
    const first = await client.generatePlanJson({ systemPrompt, userPrompt, schema });
    const v1 = validateAndRenderPlanOut(first.rawText, facts.candidates, tokens, facts.lang);
    if (v1.ok) {
      return {
        outcome: "ai",
        plan: v1.plan,
        facts,
        baselineScenario: base,
        combinedScenario: combined,
        tokens,
      };
    }

    // One repair attempt appending exact violation labels
    const repairPrompt = buildRepairUserPrompt(userPrompt, v1.violations);
    const second = await client.generatePlanJson({
      systemPrompt,
      userPrompt: repairPrompt,
      schema,
    });
    const v2 = validateAndRenderPlanOut(second.rawText, facts.candidates, tokens, facts.lang);
    if (v2.ok) {
      return {
        outcome: "repaired",
        plan: v2.plan,
        facts,
        baselineScenario: base,
        combinedScenario: combined,
        tokens,
      };
    }

    return {
      outcome: "fallback",
      plan: buildFallbackPlan(facts),
      facts,
      baselineScenario: base,
      combinedScenario: combined,
      tokens,
      reason: v2.violations[0] ?? "guard_failed_twice",
    };
  } catch {
    return {
      outcome: "fallback",
      plan: buildFallbackPlan(facts),
      facts,
      baselineScenario: base,
      combinedScenario: combined,
      tokens,
      reason: "llm_error",
    };
  }
}
