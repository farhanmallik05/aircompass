"use client";

import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { getDict } from "@/lib/client/i18n";
import { aqiFromPm25, guidanceForLevel, levelOfPm25, next24hMeanPm25 } from "@/lib/engine/bands";
import { findWindows } from "@/lib/engine/window";

export function BriefView() {
  const { lang, activeProfile, context, planResponse } = useAirCompass();
  const dict = getDict(lang);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);

  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const mean24 = next24hMeanPm25(context.hours, nowIdx);
  const level = levelOfPm25(mean24);
  const aqi = aqiFromPm25(mean24);
  const guidance = guidanceForLevel(level, lang);
  const windows = findWindows(context.hours, nowIdx);

  const shareText = [
    `AirCompass — ${activeProfile.place.name}`,
    `Level: ${guidance.band} (US AQI ${aqi})`,
    `Best window: ${windows.best.startLabel}-${windows.best.endLabel} | Avoid: ${windows.avoid.startLabel}-${windows.avoid.endLabel}`,
    ...(planResponse?.plan.cards.slice(0, 4).map((c, i) => `${i + 1}. ${c.title}`) ?? []),
  ].join("\n");

  async function handleCopy() {
    setCopyErr(false);
    setCopied(false);
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        setCopyErr(true);
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch {
      setCopyErr(true);
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <div className="space-y-6">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-bold">{dict.brief.title}</h1>
          <p className="text-sm text-slate-700 dark:text-slate-300">{dict.brief.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
          >
            {dict.brief.printBtn}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-11 rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {dict.brief.copyShareBtn}
          </button>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-950"
          >
            {dict.brief.whatsappBtn}
          </a>
        </div>
      </div>

      {copied ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm font-semibold text-teal-800 dark:text-teal-300"
        >
          {dict.brief.copiedToast}
        </p>
      ) : null}
      {copyErr ? (
        <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">
          {dict.brief.copyError}
        </p>
      ) : null}

      {/* Printable single-page brief */}
      <article className="space-y-5 rounded-2xl border border-slate-300 bg-white p-6 text-slate-950 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-300 pb-4 dark:border-slate-700">
          <h2 className="text-xl font-bold">
            {dict.brief.title} — {activeProfile.place.name} ({activeProfile.place.country})
          </h2>
          <p className="mt-1 text-sm">
            {dict.today.todayLevelChip}: <strong>{guidance.band}</strong> (US AQI {aqi}, 24h mean{" "}
            {mean24.toFixed(1)} µg/m³) · {dict.today.goOutWindow}: {windows.best.startLabel}-
            {windows.best.endLabel} · {dict.today.avoidWindow}: {windows.avoid.startLabel}-
            {windows.avoid.endLabel}
          </p>
        </header>

        <section>
          <h3 className="text-base font-bold">{dict.brief.familySummaryTitle}</h3>
          <p className="mt-1 text-sm">{guidance.sensitive}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {(planResponse?.plan.cards.slice(0, 6) ?? []).map((c) => (
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
    </div>
  );
}
