"use client";

import type { Dictionary } from "@/lib/client/i18n";
import type { PlanCard, WindowSummary } from "@/lib/types";

/** Printable single-page household and RWA clean-air brief article. */
export function PrintableBriefCard({
  dict,
  placeName,
  country,
  band,
  sensitiveGuidance,
  aqi,
  mean24,
  windows,
  cards,
}: {
  dict: Dictionary;
  placeName: string;
  country: string;
  band: string;
  sensitiveGuidance: string;
  aqi: number;
  mean24: number;
  windows: WindowSummary;
  cards: readonly PlanCard[];
}) {
  return (
    <article className="space-y-5 rounded-2xl border border-slate-300 bg-white p-6 text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-300 pb-4 dark:border-slate-700">
        <h2 className="text-xl font-bold">
          {dict.brief.title} — {placeName} ({country})
        </h2>
        <p className="mt-1 text-sm">
          {dict.today.todayLevelChip}: <strong>{band}</strong> (US AQI {aqi}, 24h mean{" "}
          {mean24.toFixed(1)} µg/m³) · {dict.today.goOutWindow}: {windows.best.startLabel}-
          {windows.best.endLabel} · {dict.today.avoidWindow}: {windows.avoid.startLabel}-
          {windows.avoid.endLabel}
        </p>
      </header>

      <section>
        <h3 className="text-base font-bold">{dict.brief.familySummaryTitle}</h3>
        <p className="mt-1 text-sm">{sensitiveGuidance}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {cards.slice(0, 6).map((c) => (
            <li key={c.actionId}>
              <strong>{c.title}:</strong> {c.when}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-base font-bold">{dict.brief.rwaChecklistTitle}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            {dict.actions.community_no_burning.title} — {dict.actions.community_no_burning.why}
          </li>
          <li>
            {dict.actions.society_dust_and_diesel_audit.title} —{" "}
            {dict.actions.society_dust_and_diesel_audit.why}
          </li>
          <li>
            {dict.actions.child_play_indoors_when_poor.title} —{" "}
            {dict.actions.child_play_indoors_when_poor.why}
          </li>
          <li>
            {dict.actions.no_idling.title} — {dict.actions.no_idling.why}
          </li>
        </ul>
      </section>

      <footer className="border-t border-slate-300 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
        <p>{dict.app.footer.attribution}</p>
        <p>{dict.app.footer.disclaimer}</p>
      </footer>
    </article>
  );
}
