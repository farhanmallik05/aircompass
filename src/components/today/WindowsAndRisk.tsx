"use client";

import Link from "next/link";
import { fmt, type Dictionary } from "@/lib/client/i18n";
import type { guidanceForLevel } from "@/lib/engine/bands";
import type { Group, WindowSummary } from "@/lib/types";

type GuidanceText = ReturnType<typeof guidanceForLevel>;

function WindowsSection({ dict, windows }: { dict: Dictionary; windows: WindowSummary }) {
  return (
    <section
      aria-labelledby="windows-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
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
            {fmt(dict.today.meanShortValue, { mean: windows.best.mean.toFixed(1) })}
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
            {fmt(dict.today.meanShortValue, { mean: windows.avoid.mean.toFixed(1) })}
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
  );
}

/** Best/avoid time windows, household sensitivity guidance, and emergency care banner. */
export function WindowsAndRisk({
  dict,
  windows,
  members,
  guidance,
  planCardCount,
}: {
  dict: Dictionary;
  windows: WindowSummary;
  members: readonly Group[];
  guidance: GuidanceText;
  planCardCount: number;
}) {
  return (
    <>
      <WindowsSection dict={dict} windows={windows} />

      <section
        aria-labelledby="member-risk-heading"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2
            id="member-risk-heading"
            className="text-base font-bold text-slate-950 dark:text-white"
          >
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
              {dict.app.nav.plan} ({planCardCount}) <span aria-hidden="true">→</span>
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
    </>
  );
}
