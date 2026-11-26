"use client";

import { useRef, useState, type RefObject } from "react";
import { useAirCompass } from "./AirCompassProvider";
import { ChatDrawer } from "./ChatDrawer";
import { ActionCard } from "./plan/ActionCard";
import { MemberNotesAndTradeoffs, MythsSection } from "./plan/PlanExtras";
import { fmt, getDict, type Dictionary } from "@/lib/client/i18n";
import type { ActionSection, Plan, PlanResponse } from "@/lib/types";

const TAB_KEYS = ["all", "routine", "indoor", "swap"] as const;
type TabKey = (typeof TAB_KEYS)[number];

function PlanTabBar({
  dict,
  tab,
  tabRefs,
  onSelectTab,
  onTabKeyDown,
}: {
  dict: Dictionary;
  tab: TabKey;
  tabRefs: RefObject<Partial<Record<TabKey, HTMLButtonElement | null>>>;
  onSelectTab: (key: TabKey) => void;
  onTabKeyDown: (e: React.KeyboardEvent, idx: number) => void;
}) {
  return (
    <div role="tablist" aria-label={dict.plan.title} className="mt-4 flex flex-wrap gap-2">
      {TAB_KEYS.map((key, idx) => (
        <button
          key={key}
          id={`plan-tab-${key}`}
          ref={(el) => {
            tabRefs.current[key] = el;
          }}
          type="button"
          role="tab"
          aria-selected={tab === key}
          aria-controls="plan-tabpanel"
          tabIndex={tab === key ? 0 : -1}
          onClick={() => onSelectTab(key)}
          onKeyDown={(e) => onTabKeyDown(e, idx)}
          className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
            tab === key
              ? "border-teal-800 bg-teal-800 text-white dark:border-teal-300 dark:bg-teal-300 dark:text-slate-950"
              : "border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {dict.plan.tabs[key]}
        </button>
      ))}
    </div>
  );
}

function PlanHeaderSection({
  dict,
  plan,
  badgeLabel,
  loadingPlan,
  planError,
  tab,
  tabRefs,
  onSelectTab,
  onTabKeyDown,
}: {
  dict: Dictionary;
  plan?: Plan;
  badgeLabel: string;
  loadingPlan: boolean;
  planError: string | null;
  tab: TabKey;
  tabRefs: RefObject<Partial<Record<TabKey, HTMLButtonElement | null>>>;
  onSelectTab: (key: TabKey) => void;
  onTabKeyDown: (e: React.KeyboardEvent, idx: number) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{dict.plan.title}</h1>
        <span
          data-testid="plan-outcome-badge"
          className="rounded-full border border-teal-700/40 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-950 dark:border-teal-400/40 dark:bg-teal-950/60 dark:text-teal-100"
        >
          {badgeLabel}
        </span>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {plan
          ? fmt(dict.plan.liveAnnouncement, { count: plan.cards.length })
          : dict.plan.loadingPlan}
      </div>
      {loadingPlan && !plan ? (
        <p className="mt-3 text-sm font-medium text-teal-800 dark:text-teal-300">
          {dict.plan.loadingPlan}
        </p>
      ) : null}
      {planError ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-amber-700/40 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/50 dark:text-amber-100"
        >
          {planError}
        </p>
      ) : null}
      {plan ? (
        <div className="mt-3 space-y-2">
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {plan.headline}
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300">{plan.summary}</p>
        </div>
      ) : null}

      <PlanTabBar
        dict={dict}
        tab={tab}
        tabRefs={tabRefs}
        onSelectTab={onSelectTab}
        onTabKeyDown={onTabKeyDown}
      />
    </section>
  );
}

/** Displays tailored AI-worded or engine-fallback household action cards, chat, and myths. */
export function PlanView() {
  const { lang, activeProfile, context, planResponse, loadingPlan, planError } = useAirCompass();
  const dict = getDict(lang);
  const [tab, setTab] = useState<TabKey>("all");
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  function handleTabKeyDown(e: React.KeyboardEvent, idx: number) {
    const keyOffsets: Record<string, number> = {
      ArrowRight: (idx + 1) % TAB_KEYS.length,
      ArrowLeft: (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length,
      Home: 0,
      End: TAB_KEYS.length - 1,
    };
    const nextIdx = keyOffsets[e.key];
    if (nextIdx === undefined) return;
    e.preventDefault();
    const nextKey = TAB_KEYS[nextIdx];
    if (!nextKey) return;
    setTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  }

  const outcome = planResponse?.outcome ?? "fallback";
  const badgeLabels: Record<PlanResponse["outcome"], string> = {
    ai: dict.plan.badgeAi,
    repaired: dict.plan.badgeRepaired,
    fallback: dict.plan.badgeFallback,
  };
  const isSection = (s: ActionSection): boolean => tab === "all" || s === tab;
  const cards = (planResponse?.plan.cards ?? []).filter((c) => isSection(c.section));

  return (
    <div className="space-y-6">
      <PlanHeaderSection
        dict={dict}
        plan={planResponse?.plan}
        badgeLabel={badgeLabels[outcome]}
        loadingPlan={loadingPlan}
        planError={planError}
        tab={tab}
        tabRefs={tabRefs}
        onSelectTab={setTab}
        onTabKeyDown={handleTabKeyDown}
      />

      <section
        id="plan-tabpanel"
        role="tabpanel"
        aria-labelledby={`plan-tab-${tab}`}
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        {cards.map((card) => (
          <ActionCard key={card.actionId} card={card} dict={dict} />
        ))}
      </section>

      <MemberNotesAndTradeoffs plan={planResponse?.plan} dict={dict} />
      <ChatDrawer profile={activeProfile} context={context} dict={dict} />
      <MythsSection dict={dict} />
    </div>
  );
}
