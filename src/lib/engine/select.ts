import { ACTION_CATALOG, ACTION_BY_ID, type ActionDef } from "./catalog";
import { evaluateActionImpact } from "./impact";
import type {
  ActionSection,
  CandidateAction,
  Group,
  Level,
  Profile,
  AirContext,
  Scenario,
  WindowSummary,
} from "../types";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function householdGroups(profile: Profile): Group[] {
  const groups = new Set<Group>();
  if (profile.household.adults > 0) groups.add("adult");
  if (profile.household.children > 0) groups.add("child");
  if (profile.household.seniors > 0) groups.add("senior");
  for (const c of profile.household.conditions) groups.add(c);
  if (groups.size === 0) groups.add("adult");
  return [...groups];
}

function budgetAllows(budget: Profile["budget"], cost: 0 | 1 | 2): boolean {
  if (budget === "zero") return cost === 0;
  if (budget === "low") return cost <= 1;
  return true;
}

function scoreCandidate(
  def: ActionDef,
  impact: ReturnType<typeof evaluateActionImpact>,
  groups: readonly Group[],
): number {
  const expPct = clamp(impact.exposureDeltaPct, 0, 50) / 50;
  const co2 = Math.min((impact.co2eKgPerYear ?? 0) / 500, 1);
  const matches = def.audience.filter((g) => groups.includes(g)).length;
  const audienceMatch = groups.length > 0 ? matches / groups.length : 0;
  const ease = 1 - (def.cost + def.effort) / 5;
  let score = 0.6 * expPct + 0.2 * co2 + 0.1 * audienceMatch + 0.1 * ease;
  if (impact.exposureDeltaUgM3 < 0 && (impact.co2eKgPerYear ?? 0) < 300) {
    score -= 0.2;
  }
  return Math.round(score * 10000) / 10000;
}

/**
 * Filters applicable actions by profile/budget, scores them, and picks up to 14 candidates
 * ensuring >= 2 per section (routine, indoor, swap) where available and retaining any trade-offs flagged.
 */
export function selectCandidates(
  profile: Profile,
  context: AirContext,
  level: Level,
  baseScenario: Scenario,
  windows: WindowSummary,
): CandidateAction[] {
  const groups = householdGroups(profile);
  const scored: CandidateAction[] = [];

  for (const def of ACTION_CATALOG) {
    if (!budgetAllows(profile.budget, def.cost)) continue;
    if (!def.appliesIf(profile, level, windows)) continue;
    const impact = evaluateActionImpact(def, profile, context, baseScenario, windows);
    const tradeoff = impact.exposureDeltaUgM3 < -0.05;
    scored.push({
      id: def.id,
      section: def.section,
      cost: def.cost,
      effort: def.effort,
      audience: def.audience,
      score: scoreCandidate(def, impact, groups),
      impact,
      tradeoff,
      ...(tradeoff ? { mitigation: "n95_for_open_transport" as const } : {}),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const picked = new Map<string, CandidateAction>();
  const sections: readonly ActionSection[] = ["routine", "indoor", "swap"];
  for (const sec of sections) {
    const inSec = scored.filter((c) => c.section === sec).slice(0, 2);
    for (const c of inSec) picked.set(c.id, c);
  }
  // Always keep flagged trade-offs in the candidate pool so the user sees honest explanations
  for (const c of scored) {
    if (c.tradeoff && picked.size < 14) picked.set(c.id, c);
  }
  for (const c of scored) {
    if (picked.size >= 14) break;
    picked.set(c.id, c);
  }

  return [...picked.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Top-7 candidates for deterministic fallback when Gemini is unavailable or fails guard twice. */
export function selectFallbackOrder(candidates: readonly CandidateAction[]): CandidateAction[] {
  return candidates.slice(0, 7);
}

export function defsForCandidates(candidates: readonly CandidateAction[]): ActionDef[] {
  return candidates.map((c) => ACTION_BY_ID[c.id]);
}
