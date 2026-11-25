"use client";

import { useState } from "react";
import { aqiFromPm25, levelOfPm25 } from "@/lib/engine/bands";
import type { HourPoint, WindowSummary } from "@/lib/types";
import type { Dictionary } from "@/lib/client/i18n";

function barFillForLevel(pm25: number): string {
  const lvl = levelOfPm25(pm25);
  switch (lvl) {
    case 0:
      return "#047857";
    case 1:
      return "#0f766e";
    case 2:
      return "#b45309";
    case 3:
      return "#c2410c";
    case 4:
      return "#be123c";
    case 5:
      return "#991b1b";
  }
}

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
  const start = Math.max(0, Math.min(nowIndex, hours.length - 1));
  const slice = hours.slice(start, start + 24);
  const maxVal = Math.max(50, ...slice.map((h) => h.pm25));
  const chartW = 720;
  const chartH = 210;
  const padL = 42;
  const padB = 28;
  const padT = 18;
  const plotW = chartW - padL - 12;
  const plotH = chartH - padT - padB;
  const stepW = plotW / Math.max(1, slice.length);
  const barW = Math.max(8, stepW - 4);
  const whoY = padT + plotH - (Math.min(15, maxVal) / maxVal) * plotH;

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

      {!showTable ? (
        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            role="img"
            aria-labelledby="svg-chart-title svg-chart-desc"
            className="h-auto w-full"
          >
            <title id="svg-chart-title">{dict.today.chartTitle}</title>
            <desc id="svg-chart-desc">
              {`Next ${slice.length} hours PM2.5. Best window ${windows.best.startLabel}-${windows.best.endLabel}, avoid window ${windows.avoid.startLabel}-${windows.avoid.endLabel}. WHO 24h guideline line at 15 ug/m3.`}
            </desc>

            {/* Y-axis baseline & max label */}
            <line
              x1={padL}
              y1={padT + plotH}
              x2={chartW - 8}
              y2={padT + plotH}
              stroke="#64748b"
              strokeWidth="1"
            />
            <text x={padL - 6} y={padT + 10} textAnchor="end" fontSize="11" fill="currentColor">
              {Math.round(maxVal)}
            </text>
            <text x={padL - 6} y={padT + plotH} textAnchor="end" fontSize="11" fill="currentColor">
              0
            </text>

            {/* Bars */}
            {slice.map((pt, i) => {
              const hPx = Math.max(2, (pt.pm25 / maxVal) * plotH);
              const x = padL + i * stepW + 2;
              const y = padT + plotH - hPx;
              const hh = pt.t.slice(11, 13);
              const hrNum = Number(hh);
              const isBest =
                !windows.noGoodWindow &&
                (hrNum === windows.best.start || hrNum === (windows.best.start + 1) % 24);
              return (
                <g key={pt.t}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={hPx}
                    rx="3"
                    fill={barFillForLevel(pt.pm25)}
                    className={isBest ? "stroke-slate-900 dark:stroke-slate-100" : undefined}
                    strokeWidth={isBest ? "2" : "0"}
                  />
                  {i % 3 === 0 ? (
                    <text
                      x={x + barW / 2}
                      y={chartH - 8}
                      textAnchor="middle"
                      fontSize="11"
                      fill="currentColor"
                    >
                      {hh}
                    </text>
                  ) : null}
                </g>
              );
            })}

            {/* WHO 2021 15 ug/m3 24h guideline line */}
            <line
              x1={padL}
              y1={whoY}
              x2={chartW - 8}
              y2={whoY}
              className="stroke-slate-900 dark:stroke-slate-100"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <text
              x={chartW - 12}
              y={Math.max(12, whoY - 4)}
              textAnchor="end"
              fontSize="11"
              fill="currentColor"
            >
              WHO 15 µg/m³
            </text>
          </svg>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-700">
                <th className="px-2 py-2 font-semibold">{dict.today.tableColHour}</th>
                <th className="px-2 py-2 font-semibold">{dict.today.tableColPm25}</th>
                <th className="px-2 py-2 font-semibold">{dict.today.tableColPm10}</th>
                <th className="px-2 py-2 font-semibold">{dict.today.tableColAqi}</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((pt) => (
                <tr key={pt.t} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="px-2 py-1.5 font-mono">{pt.t.slice(11, 16)}</td>
                  <td className="px-2 py-1.5">{pt.pm25.toFixed(1)}</td>
                  <td className="px-2 py-1.5">{pt.pm10.toFixed(1)}</td>
                  <td className="px-2 py-1.5">{aqiFromPm25(pt.pm25)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
