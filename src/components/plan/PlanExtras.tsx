"use client";

import type { Dictionary } from "@/lib/client/i18n";
import { MYTHS } from "@/lib/engine/myths";
import type { Plan } from "@/lib/types";

/** Renders member-specific household guidance and honest negative-exposure trade-off notes. */
export function MemberNotesAndTradeoffs({ plan, dict }: { plan?: Plan; dict: Dictionary }) {
  if (!plan || (plan.memberNotes.length === 0 && plan.tradeoffs.length === 0)) return null;
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {plan.memberNotes.length > 0 ? (
        <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-bold">{dict.plan.memberNotesHeading}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {plan.memberNotes.map((mn) => (
              <li
                key={`${mn.group}-${mn.note}`}
                className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800"
              >
                <span className="font-semibold">{dict.groups[mn.group]}: </span>
                {mn.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.tradeoffs.length > 0 ? (
        <div className="rounded-2xl border border-amber-700/40 bg-amber-50 p-5 dark:border-amber-400/40 dark:bg-amber-950/50">
          <h2 className="text-base font-bold text-amber-950 dark:text-amber-100">
            {dict.plan.tradeoffsHeading}
          </h2>
          <ul className="mt-2 space-y-2 text-sm text-amber-950 dark:text-amber-100">
            {plan.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Displays four peer-reviewed air-quality myth cards with inline source attribution. */
export function MythsSection({ dict }: { dict: Dictionary }) {
  return (
    <section
      aria-labelledby="myths-heading"
      className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <h2 id="myths-heading" className="text-lg font-bold">
        {dict.plan.mythsHeading}
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MYTHS.map((m) => (
          <article
            key={m.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
          >
            <h3 className="text-sm font-bold">{dict.myths[m.id].title}</h3>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              {dict.myths[m.id].fact}
            </p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{m.source}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
