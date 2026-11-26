"use client";

import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { AirChart } from "./AirChart";
import { SetupForm } from "./SetupForm";
import { AqiSummaryCards } from "./today/AqiSummaryCards";
import { WindowsAndRisk } from "./today/WindowsAndRisk";
import { fmt, getDict, type Dictionary } from "@/lib/client/i18n";
import { aqiFromPm25, guidanceForLevel, levelOfPm25, next24hMeanPm25 } from "@/lib/engine/bands";
import { trailingNaqi } from "@/lib/engine/naqi";
import { householdGroups } from "@/lib/engine/select";
import { findWindows } from "@/lib/engine/window";
import type { AirContext, Profile } from "@/lib/types";

function TodayHeroBanner({
  dict,
  activeProfile,
  context,
  showSetup,
  loadingContext,
  onSampleFamily,
  onToggleSetup,
}: {
  dict: Dictionary;
  activeProfile: Profile;
  context: AirContext;
  showSetup: boolean;
  loadingContext: boolean;
  onSampleFamily: () => void;
  onToggleSetup: () => void;
}) {
  const dataBadgeText =
    context.dataNote === "recorded"
      ? fmt(dict.dataBadge.recorded, { date: context.recordedDate ?? "winter" })
      : dict.dataBadge[context.dataNote];

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            {dict.today.title}
          </h1>
          <p className="text-sm text-slate-700 dark:text-slate-300">{dict.today.subtitle}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {activeProfile.place.name} ({activeProfile.place.country})
            </span>
            <span
              data-testid="data-source-badge"
              className="rounded-full border border-teal-700/40 bg-teal-50 px-3 py-1 font-medium text-teal-950 dark:border-teal-400/40 dark:bg-teal-950/60 dark:text-teal-100"
            >
              {dataBadgeText}
            </span>
            {context.calibrationFactor !== undefined ? (
              <span className="rounded-full border border-amber-700/40 bg-amber-50 px-3 py-1 font-medium text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/60 dark:text-amber-100">
                {fmt(dict.dataBadge.calibrated, { factor: context.calibrationFactor })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="sample-family-btn"
            onClick={onSampleFamily}
            className="min-h-11 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
          >
            {dict.app.sampleFamilyBtn}
          </button>
          <button
            type="button"
            data-testid="toggle-setup-btn"
            aria-expanded={showSetup}
            onClick={onToggleSetup}
            className="min-h-11 rounded-xl border border-slate-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {dict.app.setupBtn}
          </button>
        </div>
      </div>

      {loadingContext ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 text-sm font-medium text-teal-800 dark:text-teal-300"
        >
          {dict.today.loadingContext}
        </p>
      ) : null}
    </section>
  );
}

/** Primary Today view showing current air quality, windows, hourly chart, and household triggers. */
export function TodayView() {
  const {
    lang,
    activeProfile,
    context,
    planResponse,
    calibrationPm25,
    loadingContext,
    trySampleFamily,
    saveProfileAndPlan,
    setCalibrationPm25,
  } = useAirCompass();
  const dict = getDict(lang);
  const [showSetup, setShowSetup] = useState(false);

  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const nowPoint = context.hours[nowIdx];
  const pm25Now = nowPoint?.pm25 ?? 0;
  const mean24 = next24hMeanPm25(context.hours, nowIdx);
  const levelToday = levelOfPm25(mean24);
  const windows = findWindows(context.hours, nowIdx);
  const naqi = activeProfile.place.country === "IN" ? trailingNaqi(context.hours, nowIdx) : null;
  const guidance = guidanceForLevel(levelToday, lang);

  return (
    <div className="space-y-6">
      <TodayHeroBanner
        dict={dict}
        activeProfile={activeProfile}
        context={context}
        showSetup={showSetup}
        loadingContext={loadingContext}
        onSampleFamily={() => {
          setShowSetup(false);
          void trySampleFamily();
        }}
        onToggleSetup={() => setShowSetup((v) => !v)}
      />

      {showSetup ? (
        <SetupForm
          initial={activeProfile}
          dict={dict}
          onSave={async (nextProfile) => {
            await saveProfileAndPlan(nextProfile);
            setShowSetup(false);
          }}
        />
      ) : null}

      <AqiSummaryCards
        dict={dict}
        aqiToday={aqiFromPm25(mean24)}
        aqiNow={aqiFromPm25(pm25Now)}
        providerInstantAqi={nowPoint?.usAqi ?? aqiFromPm25(pm25Now)}
        pm25Now={pm25Now}
        mean24={mean24}
        levelNow={levelOfPm25(pm25Now)}
        levelToday={levelToday}
        guidance={guidance}
        naqi={naqi}
        calibrationPm25={calibrationPm25}
        onCalibrate={setCalibrationPm25}
      />

      <AirChart hours={context.hours} nowIndex={nowIdx} windows={windows} dict={dict} />

      <WindowsAndRisk
        dict={dict}
        windows={windows}
        members={householdGroups(activeProfile)}
        guidance={guidance}
        planCardCount={planResponse?.plan.cards.length ?? 7}
      />
    </div>
  );
}
