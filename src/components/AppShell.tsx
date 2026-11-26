"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ModeToolbar, PrimaryNavBar } from "./shell/HeaderBars";
import { getDict, type Dictionary } from "@/lib/client/i18n";
import type { DataMode } from "@/lib/client/storage";
import type { Lang } from "@/lib/types";

function routeDocumentTitle(pathname: string, dict: Dictionary): string {
  const titles: Record<string, string> = {
    "/": dict.app.pageTitles.today,
    "/plan": dict.app.pageTitles.plan,
    "/impact": dict.app.pageTitles.impact,
    "/brief": dict.app.pageTitles.brief,
  };
  const routeTitle = titles[pathname];
  return routeTitle ? `${routeTitle} — ${dict.app.name}` : dict.app.name;
}

/** Global landmark shell providing skip-to-main navigation, header controls, and footer attribution. */
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
    document.title = routeDocumentTitle(pathname, dict);
  }, [dict, lang, pathname]);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const h1 = mainRef.current?.querySelector("h1");
    if (h1 instanceof HTMLElement) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
  }, [pathname]);

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-teal-800 focus:px-4 focus:py-3 focus:text-white"
      >
        {dict.app.skipToMain}
      </a>

      <header className="print-hidden border-b border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900">
        <PrimaryNavBar dict={dict} lang={lang} pathname={pathname} onLangChange={onLangChange} />
        <ModeToolbar
          dict={dict}
          mode={mode}
          onModeChange={onModeChange}
          onDeleteData={onDeleteData}
        />
        {deletedMsg ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-auto max-w-5xl px-4 pb-2 text-sm font-medium text-teal-800 dark:text-teal-300"
          >
            {deletedMsg}
          </div>
        ) : null}
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto max-w-5xl px-4 py-6 focus:outline-none"
      >
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
