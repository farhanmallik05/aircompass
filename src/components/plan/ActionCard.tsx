"use client";

import { fmt, type Dictionary } from "@/lib/client/i18n";
import type { PlanCard } from "@/lib/types";

interface ActionCardProps {
  card: PlanCard;
  dict: Dictionary;
}

/** Renders a single action card with quantified exposure range, trade-off badge, and calculation breakdown. */
export function ActionCard({ card, dict }: ActionCardProps) {
  const imp = card.impact;
  const isQuant = imp.kind === "quantified";
  const isTradeoff = card.tradeoff || imp.exposureDeltaUgM3 < -0.05;
  const absUg = `${Math.abs(imp.exposureDeltaUgM3).toFixed(1)} µg/m³`;
  const absPct = `${Math.abs(Math.round(imp.exposureDeltaPct))}%`;
  const rangeStr = `${Math.abs(imp.exposureRangeUgM3[0]).toFixed(1)}–${Math.abs(imp.exposureRangeUgM3[1]).toFixed(1)} µg/m³`;

  return (
    <article className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {dict.plan.tabs[card.section]}
          </span>
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {fmt(dict.plan.confidenceLabel, { level: imp.confidence })}
          </span>
        </div>

        <h2 className="text-base font-bold text-slate-950 dark:text-white">{card.title}</h2>

        {isQuant ? (
          isTradeoff ? (
            <p
              data-testid={`tradeoff-badge-${card.actionId}`}
              className="rounded-lg border border-amber-700/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 dark:border-amber-400/50 dark:bg-amber-950/60 dark:text-amber-100"
            >
              {fmt(dict.plan.impactTradeoff, {
                ugm3: absUg,
                pct: absPct,
                range: rangeStr,
              })}
            </p>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-teal-700/30 bg-teal-50/70 px-3 py-2 dark:border-teal-400/30 dark:bg-teal-950/40">
              <p className="text-xs font-semibold text-teal-950 dark:text-teal-100">
                {fmt(dict.plan.impactExposure, {
                  ugm3: absUg,
                  pct: absPct,
                  range: rangeStr,
                })}
              </p>
              <meter
                min={0}
                max={80}
                value={Math.min(80, Math.max(0, Math.round(imp.exposureDeltaPct)))}
                aria-label={card.title}
                className="h-2 w-full"
              />
            </div>
          )
        ) : (
          <p className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {dict.plan.impactGuidance}
          </p>
        )}

        {imp.co2eKgPerYear !== undefined ? (
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">
            {fmt(dict.plan.impactCo2e, {
              co2e: `${Math.round(imp.co2eKgPerYear)} kg CO2e/yr${
                imp.co2eRangeKgPerYear
                  ? ` (${Math.round(imp.co2eRangeKgPerYear[0])}–${Math.round(imp.co2eRangeKgPerYear[1])})`
                  : ""
              }`,
            })}
          </p>
        ) : null}

        <p className="text-sm text-slate-800 dark:text-slate-200">
          <span className="font-semibold">{dict.plan.whyLabel}: </span>
          {card.why}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="font-semibold">{dict.plan.whenLabel}: </span>
          {card.when}
        </p>

        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
          {card.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ul>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer font-semibold text-slate-900 dark:text-slate-100">
          {dict.plan.howCalculated}
        </summary>
        <p className="mt-2 text-slate-700 dark:text-slate-300">{imp.method}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600 dark:text-slate-400">
          {imp.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
    </article>
  );
}
