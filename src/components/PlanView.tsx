"use client";

import { useRef, useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { ChatDrawer } from "./ChatDrawer";
import { fmt, getDict } from "@/lib/client/i18n";
import { MYTHS } from "@/lib/engine/myths";
import type { ActionSection } from "@/lib/types";

const TAB_KEYS = ["all", "routine", "indoor", "swap"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export function PlanView() {
  const { lang, activeProfile, context, planResponse, loadingPlan, planError } = useAirCompass();
  const dict = getDict(lang);
  const [tab, setTab] = useState<TabKey>("all");
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % TAB_KEYS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = TAB_KEYS.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    const nextKey = TAB_KEYS[nextIdx];
    if (!nextKey) return;
    setTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  }

  const plan = planResponse?.plan;
  const outcome = planResponse?.outcome ?? "fallback";
  const outcomeBadge =
    outcome === "ai"
      ? dict.plan.badgeAi
      : outcome === "repaired"
        ? dict.plan.badgeRepaired
        : dict.plan.badgeFallback;

  const cards = (plan?.cards ?? []).filter(
    (c) => tab === "all" || c.section === (tab as ActionSection),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{dict.plan.title}</h1>
          <span
            data-testid="plan-outcome-badge"
            className="rounded-full border border-teal-700/40 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-950 dark:border-teal-400/40 dark:bg-teal-950/60 dark:text-teal-100"
          >
            {outcomeBadge}
          </span>
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {plan
            ? fmt(dict.plan.liveAnnouncement, { count: plan.cards.length })
            : dict.plan.loadingPlan}
        </div>

        {loadingPlan && !plan ? (
          <p className="mt-3 text-sm font-medium text-teal-800 dark:text-teal-300">
            {dict.plan.loadingPlan}
          </p>
        ) : null}

        {planError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-700/40 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/50 dark:text-amber-100"
          >
            {planError}
          </p>
        ) : null}

        {plan ? (
          <div className="mt-3 space-y-2">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {plan.headline}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">{plan.summary}</p>
          </div>
        ) : null}

        {/* WAI-ARIA Filter tabs */}
        <div role="tablist" aria-label={dict.plan.title} className="mt-4 flex flex-wrap gap-2">
          {TAB_KEYS.map((key, idx) => (
            <button
              key={key}
              id={`plan-tab-${key}`}
              ref={(el) => {
                tabRefs.current[key] = el;
              }}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls="plan-tabpanel"
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                tab === key
                  ? "border-teal-800 bg-teal-800 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-slate-950"
                  : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {dict.plan.tabs[key]}
            </button>
          ))}
        </div>
      </section>

      {/* Action cards */}
      <section
        id="plan-tabpanel"
        role="tabpanel"
        aria-labelledby={`plan-tab-${tab}`}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {cards.map((card) => {
          const imp = card.impact;
          const isQuant = imp.kind === "quantified";
          const isTradeoff = card.tradeoff || imp.exposureDeltaUgM3 < -0.05;
          const absUg = `${Math.abs(imp.exposureDeltaUgM3).toFixed(1)} µg/m³`;
          const absPct = `${Math.abs(Math.round(imp.exposureDeltaPct))}%`;
          const rangeStr = `${Math.abs(imp.exposureRangeUgM3[0]).toFixed(1)}–${Math.abs(imp.exposureRangeUgM3[1]).toFixed(1)} µg/m³`;

          return (
            <article
              key={card.actionId}
              className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
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
        })}
      </section>

      {/* Member notes & trade-offs */}
      {plan && (plan.memberNotes.length > 0 || plan.tradeoffs.length > 0) ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plan.memberNotes.length > 0 ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-base font-bold">{dict.plan.memberNotesHeading}</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {plan.memberNotes.map((mn, i) => (
                  <li
                    key={`${mn.group}-${i}`}
                    className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"
                  >
                    <span className="font-semibold">{dict.groups[mn.group]}: </span>
                    {mn.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.tradeoffs.length > 0 ? (
            <div className="rounded-2xl border border-amber-700/40 bg-amber-50 p-5 dark:border-amber-400/40 dark:bg-amber-950/50">
              <h2 className="text-base font-bold text-amber-950 dark:text-amber-100">
                {dict.plan.tradeoffsHeading}
              </h2>
              <ul className="mt-2 space-y-2 text-sm text-amber-950 dark:text-amber-100">
                {plan.tradeoffs.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Grounded Streaming What-If Chat */}
      <ChatDrawer profile={activeProfile} context={context} dict={dict} />

      {/* Four Myth Cards */}
      <section
        aria-labelledby="myths-heading"
        className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="myths-heading" className="text-lg font-bold">
          {dict.plan.mythsHeading}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MYTHS.map((m) => (
            <article
              key={m.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
            >
              <h3 className="text-sm font-bold">{dict.myths[m.id].title}</h3>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {dict.myths[m.id].fact}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{m.source}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
