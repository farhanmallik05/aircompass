"use client";

import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { PrintableBriefCard } from "./brief/PrintableBriefCard";
import { getDict } from "@/lib/client/i18n";
import { aqiFromPm25, guidanceForLevel, levelOfPm25, next24hMeanPm25 } from "@/lib/engine/bands";
import { findWindows } from "@/lib/engine/window";

function BriefToolbar({
  title,
  subtitle,
  printBtn,
  copyShareBtn,
  whatsappBtn,
  whatsappHref,
  onCopy,
}: {
  title: string;
  subtitle: string;
  printBtn: string;
  copyShareBtn: string;
  whatsappBtn: string;
  whatsappHref: string;
  onCopy: () => void;
}) {
  return (
    <div className="print-hidden flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-slate-700 dark:text-slate-300">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-11 rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
        >
          {printBtn}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="min-h-11 rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {copyShareBtn}
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 dark:border-emerald-400 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          {whatsappBtn}
        </a>
      </div>
    </div>
  );
}

/** Community and RWA printable clean-air brief view with copy and WhatsApp share controls. */
export function BriefView() {
  const { lang, activeProfile, context, planResponse } = useAirCompass();
  const dict = getDict(lang);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);

  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const mean24 = next24hMeanPm25(context.hours, nowIdx);
  const aqi = aqiFromPm25(mean24);
  const guidance = guidanceForLevel(levelOfPm25(mean24), lang);
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

  return (
    <div className="space-y-6">
      <BriefToolbar
        title={dict.brief.title}
        subtitle={dict.brief.subtitle}
        printBtn={dict.brief.printBtn}
        copyShareBtn={dict.brief.copyShareBtn}
        whatsappBtn={dict.brief.whatsappBtn}
        whatsappHref={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
        onCopy={handleCopy}
      />

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

      <PrintableBriefCard
        dict={dict}
        placeName={activeProfile.place.name}
        country={activeProfile.place.country}
        band={guidance.band}
        sensitiveGuidance={guidance.sensitive}
        aqi={aqi}
        mean24={mean24}
        windows={windows}
        cards={planResponse?.plan.cards ?? []}
      />
    </div>
  );
}
