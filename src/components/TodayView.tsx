"use client";

import Link from "next/link";
import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { AirChart } from "./AirChart";
import { LevelIcon, levelBadgeClasses } from "./Icons";
import { SetupForm } from "./SetupForm";
import { fmt, getDict } from "@/lib/client/i18n";
import { aqiFromPm25, guidanceForLevel, levelOfPm25, next24hMeanPm25 } from "@/lib/engine/bands";
import { trailingNaqi } from "@/lib/engine/naqi";
import { householdGroups } from "@/lib/engine/select";
import { findWindows } from "@/lib/engine/window";

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
  const [calInput, setCalInput] = useState(calibrationPm25 ? String(calibrationPm25) : "");

  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const nowPoint = context.hours[nowIdx];
  const pm25Now = nowPoint?.pm25 ?? 0;
  const aqiNow = aqiFromPm25(pm25Now);
  const levelNow = levelOfPm25(pm25Now);
  const mean24 = next24hMeanPm25(context.hours, nowIdx);
  const levelToday = levelOfPm25(mean24);
  const aqiToday = aqiFromPm25(mean24);
  const windows = findWindows(context.hours, nowIdx);
  const naqi = activeProfile.place.country === "IN" ? trailingNaqi(context.hours, nowIdx) : null;
  const guidance = guidanceForLevel(levelToday, lang);
  const members = householdGroups(activeProfile);

  const dataBadgeText =
    context.dataNote === "recorded"
      ? fmt(dict.dataBadge.recorded, { date: context.recordedDate ?? "winter" })
      : dict.dataBadge[context.dataNote];

  return (
    <div className="space-y-6">
      {/* Hero + one-click Sample Family & Setup triggers */}
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
              onClick={() => {
                setShowSetup(false);
                void trySampleFamily();
              }}
              className="min-h-11 rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
            >
              {dict.app.sampleFamilyBtn}
            </button>
            <button
              type="button"
              data-testid="toggle-setup-btn"
              aria-expanded={showSetup}
              onClick={() => setShowSetup((v) => !v)}
              className="min-h-11 rounded-xl border border-slate-400 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {dict.app.setupBtn}
            </button>
          </div>
        </div>

        {loadingContext ? (
          <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-teal-800 dark:text-teal-300">
            {dict.today.loadingContext}
          </p>
        ) : null}
      </section>

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

      {/* Main AQI + Today's Level + India NAQI grid */}
      <section aria-label="Air quality overview" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={`rounded-2xl border-2 p-5 ${levelBadgeClasses(levelToday)}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">
                {dict.today.todayLevelChip}
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-4xl font-extrabold tabular-nums">{aqiToday}</span>
                <span className="text-lg font-bold">{guidance.band}</span>
              </div>
              <p className="mt-1 text-sm">
                {dict.today.usAqiLabel} · 24h mean {mean24.toFixed(1)} µg/m³
              </p>
            </div>
            <LevelIcon level={levelToday} className="h-9 w-9 shrink-0" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-current/20 pt-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 font-semibold text-slate-950 dark:bg-slate-950/60 dark:text-white">
              <LevelIcon level={levelNow} className="h-4 w-4" />
              {dict.today.nowChip}: {aqiNow} ({dict.levels[String(levelNow) as "0"].name})
            </span>
            <span className="text-xs opacity-90">
              {dict.today.providerAqiLabel}: {nowPoint?.usAqi ?? aqiNow}
            </span>
          </div>
          <p className="mt-3 text-sm font-medium">{guidance.everyone}</p>
        </div>

        {/* India NAQI + Calibration card */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {naqi ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                {dict.today.naqiLabel}
              </p>
              {naqi.sufficient ? (
                <div className="mt-1 space-y-1">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-extrabold tabular-nums">{naqi.index}</span>
                    <span className="text-base font-bold">{naqi.category}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {fmt(dict.today.naqiDominant, { pollutant: naqi.dominant?.toUpperCase() ?? "PM2.5" })}
                  </p>
                  {naqi.assumptionUsed ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {dict.today.naqiSevereAssumption}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  {dict.today.naqiInsufficient} ({naqi.validHours}/24)
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                {dict.today.usAqiLabel}
              </p>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{guidance.sensitive}</p>
            </div>
          )}

          {/* Local calibration control */}
          <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
            <label htmlFor="local-cal-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {dict.today.calibrationLabel}
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <input
                id="local-cal-input"
                type="number"
                min={1}
                max={1500}
                value={calInput}
                onChange={(e) => setCalInput(e.target.value)}
                placeholder={String(Math.round(pm25Now))}
                className="min-h-11 w-32 rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={() => {
                  const n = Number(calInput);
                  if (Number.isFinite(n) && n > 0) setCalibrationPm25(n);
                }}
                className="min-h-11 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-950"
              >
                {dict.today.calibrationApply}
              </button>
              {calibrationPm25 !== null ? (
                <button
                  type="button"
                  onClick={() => {
                    setCalInput("");
                    setCalibrationPm25(null);
                  }}
                  className="min-h-11 rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  {dict.today.calibrationReset}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Go out / Avoid windows */}
      <section aria-labelledby="windows-heading" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 id="windows-heading" className="text-base font-bold text-slate-950 dark:text-white">
          {dict.today.windowsHeading}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-teal-700/40 bg-teal-50 p-3.5 dark:border-teal-400/40 dark:bg-teal-950/50">
            <p className="text-xs font-semibold uppercase text-teal-900 dark:text-teal-200">
              {dict.today.goOutWindow}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-teal-950 dark:text-white">
              {windows.best.startLabel} - {windows.best.endLabel}
            </p>
            <p className="text-xs text-teal-900 dark:text-teal-200">
              Mean {windows.best.mean.toFixed(1)} µg/m³
            </p>
          </div>
          <div className="rounded-xl border border-rose-700/40 bg-rose-50 p-3.5 dark:border-rose-400/40 dark:bg-rose-950/50">
            <p className="text-xs font-semibold uppercase text-rose-900 dark:text-rose-200">
              {dict.today.avoidWindow}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-rose-950 dark:text-white">
              {windows.avoid.startLabel} - {windows.avoid.endLabel}
            </p>
            <p className="text-xs text-rose-900 dark:text-rose-200">
              Mean {windows.avoid.mean.toFixed(1)} µg/m³
            </p>
          </div>
        </div>
        {windows.noGoodWindow ? (
          <p className="mt-3 text-sm font-semibold text-rose-900 dark:text-rose-200">
            {dict.today.noGoodWindow}
          </p>
        ) : null}
        {windows.shortData ? (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {dict.today.shortDataNote}
          </p>
        ) : null}
      </section>

      {/* Hourly Chart + Table Toggle */}
      <AirChart hours={context.hours} nowIndex={nowIdx} windows={windows} dict={dict} />

      {/* Family member chips + Plan CTA + Static Emergency Care Card */}
      <section aria-labelledby="member-risk-heading" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 id="member-risk-heading" className="text-base font-bold text-slate-950 dark:text-white">
            {dict.today.memberRiskHeading}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {members.map((g) => (
              <li
                key={g}
                className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {dict.groups[g]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{guidance.sensitive}</p>
          <div className="mt-4">
            <Link
              href="/plan"
              className="inline-flex min-h-11 items-center rounded-xl bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200"
            >
              {dict.app.nav.plan} ({planResponse?.plan.cards.length ?? 7}) →
            </Link>
          </div>
        </div>

        <aside
          aria-labelledby="emergency-heading"
          className="rounded-2xl border-2 border-rose-800 bg-rose-50 p-5 text-rose-950 dark:border-rose-400 dark:bg-rose-950/60 dark:text-rose-100"
        >
          <h2 id="emergency-heading" className="text-base font-bold">
            {dict.today.emergencyTitle}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{dict.today.emergencyBody}</p>
        </aside>
      </section>
    </div>
  );
}
