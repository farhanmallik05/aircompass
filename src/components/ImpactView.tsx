"use client";

import { useState } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { SimulatorControls } from "./impact/SimulatorControls";
import { fmt, getDict } from "@/lib/client/i18n";
import { clampNowIndex } from "@/lib/engine/bands";
import { co2eSavedKgPerYear } from "@/lib/engine/emissions";
import { cigaretteEquivalentPerDay, computeExposure } from "@/lib/engine/exposure";
import { next24Series } from "@/lib/engine/impact";
import { allHomePurifierHours } from "@/lib/engine/schedule";
import { baselineScenario } from "@/lib/engine/sensitivity";
import { findWindows } from "@/lib/engine/window";
import type { CommuteMode, Scenario, WindowSummary } from "@/lib/types";

function resolveWindowsOpenHours(
  bestWindowsOnly: boolean,
  baseHours: readonly number[],
  windows: WindowSummary,
): number[] {
  if (!bestWindowsOnly) return [...baseHours];
  if (windows.noGoodWindow) return [];
  return [windows.best.start, (windows.best.start + 1) % 24];
}

function ExposureComparisonCard({
  beforeLabel,
  afterLabel,
  cigaretteText,
  beforeUg,
  afterUg,
  title,
  subtitle,
}: {
  beforeLabel: string;
  afterLabel: string;
  cigaretteText: string;
  beforeUg: number;
  afterUg: number;
  title: string;
  subtitle: string;
}) {
  const delta = beforeUg - afterUg;
  const pct = beforeUg > 0 ? Math.round((delta / beforeUg) * 100) : 0;
  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{subtitle}</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
            {beforeLabel}
          </p>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            {beforeUg.toFixed(1)} <span className="text-base font-normal">µg/m³</span>
          </p>
        </div>
        <div className="rounded-xl border border-teal-700/40 bg-teal-50 p-4 dark:border-teal-400/40 dark:bg-teal-950/60">
          <p className="text-xs font-semibold uppercase text-teal-900 dark:text-teal-200">
            {afterLabel}
          </p>
          <p
            className="mt-1 text-3xl font-extrabold tabular-nums text-teal-950 dark:text-white"
            data-testid="impact-after-ugm3"
          >
            {afterUg.toFixed(1)} <span className="text-base font-normal">µg/m³</span>{" "}
            <span className="text-sm font-semibold">
              ({delta >= 0 ? `-${pct}%` : `+${Math.abs(pct)}%`})
            </span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{cigaretteText}</p>
    </section>
  );
}

function computeImpactMetrics(
  activeProfile: ReturnType<typeof useAirCompass>["activeProfile"],
  context: ReturnType<typeof useAirCompass>["context"],
  base: Scenario,
  simScenario: Scenario,
  households: number,
) {
  const series = next24Series(context);
  const opts = {
    roomAreaM2: activeProfile.home.roomAreaM2,
    commuteKm: activeProfile.commute.km,
    timestamps: series.timestamps,
  };
  const beforeUg = computeExposure(series.pm25, base, opts).exposureUgM3;
  const afterUg = computeExposure(series.pm25, simScenario, opts).exposureUgM3;
  const cigs = cigaretteEquivalentPerDay(afterUg);
  const perHouseholdCo2 = Math.max(
    0,
    co2eSavedKgPerYear(
      activeProfile.commute.km,
      activeProfile.commute.daysPerWeek,
      activeProfile.commute.mode,
      "wfh",
    ) -
      co2eSavedKgPerYear(
        activeProfile.commute.km,
        simScenario.commuteDaysPerWeek,
        simScenario.commuteMode,
        "wfh",
      ),
  );
  return { beforeUg, afterUg, cigs, communityCo2: Math.round(households * perHouseholdCo2) };
}

function CommunityMultiplierCard({
  heading,
  sliderLabel,
  resultText,
  households,
  onChangeHouseholds,
}: {
  heading: string;
  sliderLabel: string;
  resultText: string;
  households: number;
  onChangeHouseholds: (v: number) => void;
}) {
  return (
    <section
      aria-labelledby="community-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 id="community-heading" className="text-lg font-bold">
        {heading}
      </h2>
      <label htmlFor="community-slider" className="mt-2 block text-sm font-medium">
        {sliderLabel}: {households}
      </label>
      <input
        id="community-slider"
        type="range"
        min={1}
        max={500}
        value={households}
        aria-valuetext={`${households}`}
        onChange={(e) => onChangeHouseholds(Number(e.target.value))}
        className="mt-2 min-h-11 w-full accent-teal-700"
      />
      <p
        aria-live="polite"
        className="mt-2 text-base font-semibold text-emerald-900 dark:text-emerald-300"
      >
        {resultText}
      </p>
    </section>
  );
}

/** Instant client-side exposure and community CO2e simulator backed by the TypeScript engine. */
export function ImpactView() {
  const { lang, activeProfile, context } = useAirCompass();
  const dict = getDict(lang);
  const nowIdx = clampNowIndex(context.hours, context.nowIndex);
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
    purifierHours: purifier === "none" ? [] : allHomePurifierHours(commuteMode, commuteDays),
    windowsOpenHours: resolveWindowsOpenHours(bestWindowsOnly, base.windowsOpenHours, windows),
    n95Outdoors: n95,
    exerciseIndoors,
    cookVent,
    commuteMode,
    commuteDaysPerWeek: commuteDays,
  };
  const metrics = computeImpactMetrics(activeProfile, context, base, simScenario, households);

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
      <ExposureComparisonCard
        title={dict.impact.title}
        subtitle={dict.impact.subtitle}
        beforeLabel={dict.impact.beforeLabel}
        afterLabel={dict.impact.afterLabel}
        beforeUg={metrics.beforeUg}
        afterUg={metrics.afterUg}
        cigaretteText={fmt(dict.impact.cigaretteNote, { cigs: metrics.cigs })}
      />

      <SimulatorControls
        dict={dict}
        purifier={purifier}
        bestWindowsOnly={bestWindowsOnly}
        n95={n95}
        exerciseIndoors={exerciseIndoors}
        cookVent={cookVent}
        commuteMode={commuteMode}
        commuteDays={commuteDays}
        onPurifierChange={setPurifier}
        onBestWindowsChange={setBestWindowsOnly}
        onN95Change={setN95}
        onExerciseIndoorsChange={setExerciseIndoors}
        onCookVentChange={setCookVent}
        onCommuteModeChange={setCommuteMode}
        onCommuteDaysChange={setCommuteDays}
        onReset={resetAll}
      />

      <CommunityMultiplierCard
        heading={dict.impact.communityHeading}
        sliderLabel={dict.impact.communitySliderLabel}
        resultText={fmt(dict.impact.communityResult, { households, kg: metrics.communityCo2 })}
        households={households}
        onChangeHouseholds={setHouseholds}
      />
    </div>
  );
}
