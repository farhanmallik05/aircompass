import { aqiFromPm25, levelOfPm25 } from "@/lib/engine/bands";
import type { Dictionary } from "@/lib/client/i18n";
import type { HourPoint, Level, WindowSummary } from "@/lib/types";

const BAR_FILL: Record<Level, string> = {
  0: "#047857",
  1: "#0f766e",
  2: "#b45309",
  3: "#c2410c",
  4: "#be123c",
  5: "#991b1b",
};

function SvgPollutionBars({
  slice,
  windows,
  maxVal,
  padL,
  padT,
  plotH,
  chartH,
  stepW,
  barW,
}: {
  slice: readonly HourPoint[];
  windows: WindowSummary;
  maxVal: number;
  padL: number;
  padT: number;
  plotH: number;
  chartH: number;
  stepW: number;
  barW: number;
}) {
  return slice.map((pt, i) => {
    const hPx = Math.max(2, (pt.pm25 / maxVal) * plotH);
    const x = padL + i * stepW + 2;
    const hh = pt.t.slice(11, 13);
    const hrNum = Number(hh);
    const isBest =
      !windows.noGoodWindow &&
      (hrNum === windows.best.start || hrNum === (windows.best.start + 1) % 24);
    return (
      <g key={pt.t}>
        <rect
          x={x}
          y={padT + plotH - hPx}
          width={barW}
          height={hPx}
          rx="3"
          fill={BAR_FILL[levelOfPm25(pt.pm25)]}
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
  });
}

/** Native inline SVG hourly PM2.5 strip with WHO 15 ug/m3 guideline and best-window outlines. */
export function AirBarChartSvg({
  slice,
  windows,
  chartTitle,
}: {
  slice: readonly HourPoint[];
  windows: WindowSummary;
  chartTitle: string;
}) {
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
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        role="img"
        aria-labelledby="svg-chart-title svg-chart-desc"
        className="h-auto w-full"
      >
        <title id="svg-chart-title">{chartTitle}</title>
        <desc id="svg-chart-desc">
          {`Next ${slice.length} hours PM2.5. Best window ${windows.best.startLabel}-${windows.best.endLabel}, avoid window ${windows.avoid.startLabel}-${windows.avoid.endLabel}. WHO 24h guideline line at 15 ug/m3.`}
        </desc>

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

        <SvgPollutionBars
          slice={slice}
          windows={windows}
          maxVal={maxVal}
          padL={padL}
          padT={padT}
          plotH={plotH}
          chartH={chartH}
          stepW={stepW}
          barW={barW}
        />

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
  );
}

/** Accessible keyboard-scrollable hourly air quality table alternative to the SVG strip. */
export function AirHourlyTable({ slice, dict }: { slice: readonly HourPoint[]; dict: Dictionary }) {
  return (
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
  );
}
