"use client";

import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { fmt, getDict } from "@/lib/client/i18n";
import { co2eSavedKgPerYear } from "@/lib/engine/emissions";
import { cigaretteEquivalentPerDay, computeExposure } from "@/lib/engine/exposure";
import { next24Series } from "@/lib/engine/impact";
import { allHomePurifierHours } from "@/lib/engine/schedule";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { findWindows } from "@/lib/engine/window";
import { COMMUTE_MODES, type CommuteMode, type Scenario } from "@/lib/types";

export function ImpactView() {
  const { lang, activeProfile, context } = useAirCompass();
  const dict = getDict(lang);
  const nowIdx = Math.max(0, Math.min(context.nowIndex, context.hours.length - 1));
  const windows = findWindows(context.hours, nowIdx);
  const base = baselineScenario(activeProfile);

  const [purifier, setPurifier] = useState<Scenario["purifier"]>(base.purifier);
  const [bestWindowsOnly, setBestWindowsOnly] = useState(false);
  const [n95, setN95] = useState(base.n95Outdoors);
  const [exerciseIndoors, setExerciseIndoors] = useState(base.exerciseIndoors);
  const [cookVent, setCookVent] = useState(base.cookVent);
  const [commuteMode, setCommuteMode] = useState<CommuteMode>(base.commuteMode);
  const [commuteDays, setCommuteDays] = useState<number>(base.commuteDaysPerWeek);
  const [households, setHouseholds] = useState<number>(50);

  const simScenario: Scenario = {
    ...base,
    purifier,
    purifierHours:
      purifier === "none" ? [] : allHomePurifierHours(commuteMode, commuteDays),
    windowsOpenHours: bestWindowsOnly
      ? windows.noGoodWindow
        ? []
        : [windows.best.start, (windows.best.start + 1) % 24]
      : base.windowsOpenHours,
    n95Outdoors: n95,
    exerciseIndoors,
    cookVent,
    commuteMode,
    commuteDaysPerWeek: commuteDays,
  };

  const series = next24Series(context);
  const beforeUg = computeExposure(series.pm25, base, {
    roomAreaM2: activeProfile.home.roomAreaM2,
    commuteKm: activeProfile.commute.km,
    timestamps: series.timestamps,
  }).exposureUgM3;

  const afterUg = computeExposure(series.pm25, simScenario, {
    roomAreaM2: activeProfile.home.roomAreaM2,
    commuteKm: activeProfile.commute.km,
    timestamps: series.timestamps,
  }).exposureUgM3;

  const delta = beforeUg - afterUg;
  const pct = beforeUg > 0 ? Math.round((delta / beforeUg) * 100) : 0;
  const cigs = cigaretteEquivalentPerDay(afterUg);
  const perHouseholdCo2 = Math.max(
    0,
    co2eSavedKgPerYear(activeProfile.commute.km, activeProfile.commute.daysPerWeek, activeProfile.commute.mode, "wfh") -
      co2eSavedKgPerYear(activeProfile.commute.km, commuteDays, commuteMode, "wfh"),
  );
  const communityCo2 = Math.round(households * perHouseholdCo2);

  function resetAll() {
    setPurifier(base.purifier);
    setBestWindowsOnly(false);
    setN95(base.n95Outdoors);
    setExerciseIndoors(base.exerciseIndoors);
    setCookVent(base.cookVent);
    setCommuteMode(base.commuteMode);
    setCommuteDays(base.commuteDaysPerWeek);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{dict.impact.title}</h1>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{dict.impact.subtitle}</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
              {dict.impact.beforeLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {beforeUg.toFixed(1)} <span className="text-base font-normal">µg/m³</span>
            </p>
          </div>

          <div className="rounded-xl border border-teal-700/40 bg-teal-50 p-4 dark:border-teal-400/40 dark:bg-teal-950/60">
            <p className="text-xs font-semibold uppercase text-teal-900 dark:text-teal-200">
              {dict.impact.afterLabel}
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-teal-950 dark:text-white" data-testid="impact-after-ugm3">
              {afterUg.toFixed(1)} <span className="text-base font-normal">µg/m³</span>{" "}
              <span className="text-sm font-semibold">
                ({delta >= 0 ? `-${pct}%` : `+${Math.abs(pct)}%`})
              </span>
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          {fmt(dict.impact.cigaretteNote, { cigs })}
        </p>
      </section>

      {/* What-if interactive controls */}
      <section aria-labelledby="whatif-heading" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="whatif-heading" className="text-lg font-bold">
            {dict.impact.controlsHeading}
          </h2>
          <button
            type="button"
            onClick={resetAll}
            className="min-h-11 rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {dict.impact.resetBtn}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="sim-purifier" className="block text-sm font-semibold">
              {dict.impact.purifierControl}
            </label>
            <select
              id="sim-purifier"
              value={purifier}
              onChange={(e) => setPurifier(e.target.value as Scenario["purifier"])}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            >
              <option value="none">{dict.setup.purNone}</option>
              <option value="diy">{dict.setup.purDiy}</option>
              <option value="hepa">{dict.setup.purHepa}</option>
            </select>
          </div>

          <div>
            <label htmlFor="sim-commute" className="block text-sm font-semibold">
              {dict.impact.commuteModeControl}
            </label>
            <select
              id="sim-commute"
              value={commuteMode}
              onChange={(e) => setCommuteMode(e.target.value as CommuteMode)}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
            >
              {COMMUTE_MODES.map((m) => (
                <option key={m} value={m}>
                  {dict.setup.modes[m]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sim-days" className="block text-sm font-semibold">
              {dict.impact.commuteDaysControl}: {commuteDays}
            </label>
            <input
              id="sim-days"
              type="range"
              min={0}
              max={7}
              value={commuteDays}
              onChange={(e) => setCommuteDays(Number(e.target.value))}
              className="mt-3 w-full accent-teal-700"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={bestWindowsOnly}
              onChange={(e) => setBestWindowsOnly(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>{dict.impact.windowsControl}</span>
          </label>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={n95}
              onChange={(e) => setN95(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>{dict.impact.n95Control}</span>
          </label>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={exerciseIndoors}
              onChange={(e) => setExerciseIndoors(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>{dict.impact.exerciseIndoorsControl}</span>
          </label>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
            <input
              type="checkbox"
              checked={cookVent}
              onChange={(e) => setCookVent(e.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>{dict.impact.cookVentControl}</span>
          </label>
        </div>
      </section>

      {/* Community Multiplier */}
      <section aria-labelledby="community-heading" className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 id="community-heading" className="text-lg font-bold">
          {dict.impact.communityHeading}
        </h2>
        <label htmlFor="community-slider" className="mt-2 block text-sm font-medium">
          {dict.impact.communitySliderLabel}: {households}
        </label>
        <input
          id="community-slider"
          type="range"
          min={1}
          max={500}
          value={households}
          onChange={(e) => setHouseholds(Number(e.target.value))}
          className="mt-2 w-full accent-teal-700"
        />
        <p className="mt-3 text-base font-semibold text-emerald-900 dark:text-emerald-300">
          {fmt(dict.impact.communityResult, { households, kg: communityCo2 })}
        </p>
      </section>
    </div>
  );
}
