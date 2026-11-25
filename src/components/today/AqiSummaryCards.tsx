"use client";

import { useState } from "react";
import { LevelIcon, levelBadgeClasses } from "../Icons";
import { fmt, type Dictionary } from "@/lib/client/i18n";
import type { guidanceForLevel } from "@/lib/engine/bands";
import type { Level, NaqiSummary } from "@/lib/types";

type GuidanceText = ReturnType<typeof guidanceForLevel>;

/** Displays 24h US AQI summary, India NAQI status, and optional local monitor calibration input. */
export function AqiSummaryCards({
  dict,
  aqiToday,
  aqiNow,
  providerInstantAqi,
  pm25Now,
  mean24,
  levelNow,
  levelToday,
  guidance,
  naqi,
  calibrationPm25,
  onCalibrate,
}: {
  dict: Dictionary;
  aqiToday: number;
  aqiNow: number;
  providerInstantAqi: number;
  pm25Now: number;
  mean24: number;
  levelNow: Level;
  levelToday: Level;
  guidance: GuidanceText;
  naqi: NaqiSummary | null;
  calibrationPm25: number | null;
  onCalibrate: (val: number | null) => void;
}) {
  const [calInput, setCalInput] = useState(calibrationPm25 ? String(calibrationPm25) : "");
  const nowLevelKey = String(levelNow) as keyof Dictionary["levels"];

  return (
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
            {dict.today.nowChip}: {aqiNow} ({dict.levels[nowLevelKey].name})
          </span>
          <span className="text-xs opacity-90">
            {dict.today.providerAqiLabel}: {providerInstantAqi}
          </span>
        </div>
        <p className="mt-3 text-sm font-medium">{guidance.everyone}</p>
      </div>

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
                  {fmt(dict.today.naqiDominant, {
                    pollutant: naqi.dominant?.toUpperCase() ?? "PM2.5",
                  })}
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

        <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
          <label
            htmlFor="local-cal-input"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
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
                if (Number.isFinite(n) && n > 0) onCalibrate(n);
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
                  onCalibrate(null);
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
  );
}
