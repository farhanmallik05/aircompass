"use client";

import { useState } from "react";
import { AirBarChartSvg, AirHourlyTable } from "./today/AirChartViews";
import { fmt, type Dictionary } from "@/lib/client/i18n";
import { clampNowIndex } from "@/lib/engine/bands";
import type { HourPoint, WindowSummary } from "@/lib/types";

/** Toggleable 24-hour PM2.5 strip chart and accessible data table. */
export function AirChart({
  hours,
  nowIndex,
  windows,
  dict,
}: {
  hours: readonly HourPoint[];
  nowIndex: number;
  windows: WindowSummary;
  dict: Dictionary;
}) {
  const [showTable, setShowTable] = useState(false);
  const start = clampNowIndex(hours, nowIndex);
  const slice = hours.slice(start, start + 24);
  const svgDesc = fmt(dict.today.svgDescTemplate, {
    count: slice.length,
    bestStart: windows.best.startLabel,
    bestEnd: windows.best.endLabel,
    avoidStart: windows.avoid.startLabel,
    avoidEnd: windows.avoid.endLabel,
  });

  return (
    <section
      aria-labelledby="chart-heading"
      className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="chart-heading"
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {dict.today.chartTitle}
        </h2>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="min-h-11 rounded-lg border border-slate-400 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {showTable ? dict.today.showChartBtn : dict.today.showTableBtn}
        </button>
      </div>

      {showTable ? (
        <AirHourlyTable slice={slice} dict={dict} />
      ) : (
        <AirBarChartSvg
          slice={slice}
          windows={windows}
          chartTitle={dict.today.chartTitle}
          svgDesc={svgDesc}
        />
      )}
    </section>
  );
}
