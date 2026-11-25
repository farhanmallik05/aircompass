"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { getDict } from "@/lib/client/i18n";
import type { DataMode } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

export function AppShell({
  lang,
  onLangChange,
  mode,
  onModeChange,
  onDeleteData,
  deletedMsg,
  children,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  onDeleteData: () => void;
  deletedMsg: string | null;
  children: React.ReactNode;
}) {
  const dict = getDict(lang);
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const h1 = mainRef.current?.querySelector("h1");
    if (h1 instanceof HTMLElement) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }, [pathname]);

  const navItems = [
    { href: "/", label: dict.app.nav.today },
    { href: "/plan", label: dict.app.nav.plan },
    { href: "/impact", label: dict.app.nav.impact },
    { href: "/brief", label: dict.app.nav.brief },
  ];

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-teal-800 focus:px-4 focus:py-3 focus:text-white"
      >
        {dict.app.skipToMain}
      </a>

      <header className="print-hidden border-b border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-lg font-bold tracking-tight text-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-teal-300"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" strokeLinecap="round" />
              </svg>
              <span>{dict.app.name}</span>
            </Link>

            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={dict.app.langLabel} className="inline-flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => onLangChange("en")}
                  aria-pressed={lang === "en"}
                  className={`min-h-11 min-w-11 rounded-md px-3 text-sm font-medium ${
                    lang === "en"
                      ? "bg-teal-800 text-white dark:bg-teal-300 dark:text-slate-950"
                      : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {dict.app.langEn}
                </button>
                <button
                  type="button"
                  onClick={() => onLangChange("hi")}
                  aria-pressed={lang === "hi"}
                  className={`min-h-11 min-w-11 rounded-md px-3 text-sm font-medium ${
                    lang === "hi"
                      ? "bg-teal-800 text-white dark:bg-teal-300 dark:text-slate-950"
                      : "text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  {dict.app.langHi}
                </button>
              </div>
            </div>
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

        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
          <div role="group" aria-label={dict.app.modeLabel} className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700 dark:text-slate-300">{dict.app.modeLabel}:</span>
            <button
              type="button"
              onClick={() => onModeChange("demo")}
              aria-pressed={mode === "demo"}
              className={`min-h-11 rounded-lg border px-3 py-1.5 font-medium ${
                mode === "demo"
                  ? "border-teal-800 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-100"
                  : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {dict.app.modeRecorded}
            </button>
            <button
              type="button"
              onClick={() => onModeChange("live")}
              aria-pressed={mode === "live"}
              className={`min-h-11 rounded-lg border px-3 py-1.5 font-medium ${
                mode === "live"
                  ? "border-teal-800 bg-teal-50 text-teal-950 dark:border-teal-400 dark:bg-teal-950 dark:text-teal-100"
                  : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {dict.app.modeLive}
            </button>
          </div>

          <button
            type="button"
            onClick={onDeleteData}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {dict.app.deleteDataBtn}
          </button>
        </div>

        {deletedMsg ? (
          <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-4 pb-2 text-sm font-medium text-teal-800 dark:text-teal-300">
            {deletedMsg}
          </div>
        ) : null}
      </header>

      <main id="main-content" ref={mainRef} className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </main>

      <footer className="print-hidden border-t border-slate-300 bg-white px-4 py-5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <div className="mx-auto flex max-w-5xl flex-col gap-1">
          <p>{dict.app.footer.attribution}</p>
          <p>{dict.app.footer.disclaimer}</p>
        </div>
      </footer>
    </div>
  );
}
