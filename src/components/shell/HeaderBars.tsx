"use client";

import Link from "next/link";
import type { Dictionary } from "@/lib/client/i18n";
import type { DataMode } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

function LangToggleGroup({
  dict,
  lang,
  onLangChange,
}: {
  dict: Dictionary;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  return (
    <div
      role="group"
      aria-label={dict.app.langLabel}
      className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700"
    >
      {(
        [
          ["en", dict.app.langEn],
          ["hi", dict.app.langHi],
        ] as const
      ).map(([code, label]) => (
        <button
          key={code}
          type="button"
          onClick={() => onLangChange(code)}
          aria-pressed={lang === code}
          className={`min-h-11 min-w-11 rounded-md px-3 text-sm font-medium ${
            lang === code
              ? "bg-teal-800 text-white dark:bg-teal-300 dark:text-slate-950"
              : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Renders brand link, EN/HI toggle, and primary navigation bar. */
export function PrimaryNavBar({
  dict,
  lang,
  pathname,
  onLangChange,
}: {
  dict: Dictionary;
  lang: Lang;
  pathname: string;
  onLangChange: (lang: Lang) => void;
}) {
  const navItems = [
    { href: "/", label: dict.app.nav.today },
    { href: "/plan", label: dict.app.nav.plan },
    { href: "/impact", label: dict.app.nav.impact },
    { href: "/brief", label: dict.app.nav.brief },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-lg font-bold tracking-tight text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-teal-300"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" strokeLinecap="round" />
          </svg>
          <span>{dict.app.name}</span>
        </Link>

        <LangToggleGroup dict={dict} lang={lang} onLangChange={onLangChange} />
      </div>

      <nav aria-label="Primary navigation" className="flex flex-wrap items-center gap-1.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                active
                  ? "bg-teal-800 text-white dark:bg-teal-300 dark:text-slate-950"
                  : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Renders recorded/live data-mode selector and client-only data deletion control. */
export function ModeToolbar({
  dict,
  mode,
  onModeChange,
  onDeleteData,
}: {
  dict: Dictionary;
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  onDeleteData: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
      <div
        role="group"
        aria-label={dict.app.modeLabel}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {dict.app.modeLabel}:
        </span>
        {(
          [
            ["demo", dict.app.modeRecorded],
            ["live", dict.app.modeLive],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => onModeChange(val)}
            aria-pressed={mode === val}
            className={`min-h-11 rounded-lg border px-3 py-1.5 font-medium ${
              mode === val
                ? "border-teal-800 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-100"
                : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onDeleteData}
        className="min-h-11 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {dict.app.deleteDataBtn}
      </button>
    </div>
  );
}
