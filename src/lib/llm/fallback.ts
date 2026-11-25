import en from "../../i18n/en.json";
import hi from "../../i18n/hi.json";
import { guidanceForLevel } from "../engine/bands";
import { selectFallbackOrder } from "../engine/select";
import type { Plan, PlanCard, PlanFacts } from "../types";

/**
 * Deterministic fallback plan built exclusively from ranked engine candidates and i18n templates.
 * Guaranteed valid when Gemini is unavailable, over daily cap, or fails the guard twice.
 */
export function buildFallbackPlan(facts: PlanFacts): Plan {
  const dict = facts.lang === "hi" ? hi : en;
  const levelInfo = guidanceForLevel(facts.levelToday, facts.lang);
  const picked = selectFallbackOrder(facts.candidates);

  const cards: PlanCard[] = picked.map((c) => {
    const tpl = dict.actions[c.id];
    const when = tpl.when
      .replaceAll("{bestStart}", facts.windows.best.startLabel)
      .replaceAll("{bestEnd}", facts.windows.best.endLabel)
      .replaceAll("{avoidStart}", facts.windows.avoid.startLabel)
      .replaceAll("{avoidEnd}", facts.windows.avoid.endLabel);
    return {
      actionId: c.id,
      section: c.section,
      title: tpl.title,
      why: tpl.why,
      when,
      steps: [...tpl.steps].slice(0, 3),
      impact: c.impact,
      cost: c.cost,
      effort: c.effort,
      tradeoff: c.tradeoff,
    };
  });

  const tradeoffs = picked
    .filter((c) => c.tradeoff)
    .slice(0, 2)
    .map((c) => {
      const co2 = c.impact.co2eKgPerYear ? `${Math.round(c.impact.co2eKgPerYear)} kg CO2e/yr` : "";
      const ug = `${Math.abs(c.impact.exposureDeltaUgM3).toFixed(1)} µg/m³`;
      return facts.lang === "hi"
        ? `${co2} बचाने वाला सफ़र विकल्प सांस का संपर्क ${ug} बढ़ा सकता है — साथ में फ़िट N95 मास्क पहनें।`
        : `This commute swap saves ${co2} but raises exposure by ${ug} — pair with a fitted N95 mask.`;
    });

  const memberNotes = facts.members.slice(0, 5).map((group) => ({
    group,
    note: group === "adult" ? levelInfo.everyone : `${dict.groups[group]}: ${levelInfo.sensitive}`,
  }));

  const headline =
    facts.lang === "hi"
      ? `${levelInfo.band} वायु स्तर में घर के अंदर साफ़ हवा और सुरक्षा योजना`
      : `Clean indoor air and protective routine for ${levelInfo.band} air`;

  const summary =
    facts.lang === "hi"
      ? `US AQI ${facts.aqiNow} (${levelInfo.band})। सबसे अच्छा बाहरी समय ${facts.windows.best.startLabel}–${facts.windows.best.endLabel}, बचने का समय ${facts.windows.avoid.startLabel}–${facts.windows.avoid.endLabel}।`
      : `Current US AQI ${facts.aqiNow} (${levelInfo.band}). Cleanest window ${facts.windows.best.startLabel}–${facts.windows.best.endLabel}; peak avoid window ${facts.windows.avoid.startLabel}–${facts.windows.avoid.endLabel}.`;

  return {
    headline: headline.slice(0, 120),
    summary: summary.slice(0, 360),
    cards,
    memberNotes,
    tradeoffs,
  };
}
