import { guidanceForLevel } from "../engine/bands";
import type { PlanFacts } from "../types";

/**
 * Builds the closed dictionary of {{token}} -> rendered value (with units, Latin digits).
 * The LLM emits only token keys; code substitutes after guard checks pass.
 */
export function buildTokens(facts: PlanFacts): Record<string, string> {
  const levelInfo = guidanceForLevel(facts.levelToday, facts.lang);
  const tokens: Record<string, string> = {
    "aqi.now": String(facts.aqiNow),
    "aqi.today": String(facts.aqiToday),
    "level.name": levelInfo.band,
    "best.start": facts.windows.best.startLabel,
    "best.end": facts.windows.best.endLabel,
    "avoid.start": facts.windows.avoid.startLabel,
    "avoid.end": facts.windows.avoid.endLabel,
    "exposure.before": `${Math.round(facts.baselineExposureUgM3)} µg/m³`,
    "exposure.after": `${Math.round(facts.combinedExposureUgM3)} µg/m³`,
  };

  const rangeJoin = facts.lang === "hi" ? "से" : "to";

  for (const c of facts.candidates) {
    const absUg = Math.abs(c.impact.exposureDeltaUgM3).toFixed(1);
    const absPct = Math.abs(Math.round(c.impact.exposureDeltaPct));
    const lo = Math.abs(c.impact.exposureRangeUgM3[0]).toFixed(1);
    const hi = Math.abs(c.impact.exposureRangeUgM3[1]).toFixed(1);
    const [rMin, rMax] = Number(lo) <= Number(hi) ? [lo, hi] : [hi, lo];
    tokens[`impact.${c.id}.pct`] = `${absPct} %`;
    tokens[`impact.${c.id}.ugm3`] = `${absUg} µg/m³`;
    tokens[`impact.${c.id}.range`] = `${rMin} ${rangeJoin} ${rMax} µg/m³`;
    if (c.impact.co2eKgPerYear !== undefined) {
      tokens[`co2e.${c.id}`] = `${Math.round(c.impact.co2eKgPerYear)} kg CO2e/yr`;
    }
  }

  return tokens;
}
