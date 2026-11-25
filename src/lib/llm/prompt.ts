import { readFileSync } from "node:fs";
import path from "node:path";
import fewshot from "../../../prompts/planner.fewshot.json";
import type { PlanFacts, Profile } from "../types";

let cachedPlannerSystem: string | null = null;
let cachedChatSystem: string | null = null;

export function getPlannerSystemPrompt(): string {
  if (!cachedPlannerSystem) {
    cachedPlannerSystem = readFileSync(
      path.join(process.cwd(), "prompts", "planner.system.md"),
      "utf8",
    );
  }
  return cachedPlannerSystem;
}

export function getChatSystemPrompt(): string {
  if (!cachedChatSystem) {
    cachedChatSystem = readFileSync(path.join(process.cwd(), "prompts", "chat.system.md"), "utf8");
  }
  return cachedChatSystem;
}

/** Builds compact structured prompt payload for `/api/plan` without leaking raw API keys. */
export function buildPlannerUserPrompt(
  profile: Profile,
  facts: PlanFacts,
  tokens: Record<string, string>,
): string {
  const candidateSummary = facts.candidates.map((c) => ({
    id: c.id,
    section: c.section,
    cost: c.cost,
    effort: c.effort,
    audience: c.audience,
    kind: c.impact.kind,
    tradeoff: c.tradeoff,
    ...(c.mitigation ? { mitigation: c.mitigation } : {}),
    tokens: [
      `{{impact.${c.id}.pct}}`,
      `{{impact.${c.id}.ugm3}}`,
      `{{impact.${c.id}.range}}`,
      ...(c.impact.co2eKgPerYear !== undefined ? [`{{co2e.${c.id}}}`] : []),
    ],
  }));

  const example = fewshot[facts.lang];
  const requiredSections = [...new Set(facts.candidates.map((c) => c.section))];
  const payload = {
    lang: facts.lang,
    place: profile.place.name,
    country: profile.place.country,
    level: facts.levelToday,
    members: facts.members,
    budget: facts.budget,
    requiredSections,
    availableGlobalTokens: Object.keys(tokens)
      .filter((k) => !k.startsWith("impact.") && !k.startsWith("co2e."))
      .map((k) => `{{${k}}}`),
    candidates: candidateSummary,
    ...(facts.sanitizedNote ? { householdNote: facts.sanitizedNote } : {}),
    styleExampleOnly: example,
  };

  return `Generate a valid JSON plan for this household. Include at least one card from EVERY section in requiredSections (${requiredSections.join(", ")}). Use ONLY {{tokens}} from availableGlobalTokens or the exact candidate's tokens array (never invent or borrow candidate tokens from styleExampleOnly). Zero digits, zero number words, zero units.\n${JSON.stringify(payload)}`;
}

/** Builds repair prompt appending exact guard/schema violations from attempt 1. */
export function buildRepairUserPrompt(
  originalUserPrompt: string,
  violations: readonly string[],
): string {
  return `${originalUserPrompt}\n\nREPAIR REQUIRED: Your previous output violated these rules: ${violations.join("; ")}. Fix every listed violation, keep only {{tokens}} without digits/units/number-words/links/medical-claims, and return valid JSON.`;
}
