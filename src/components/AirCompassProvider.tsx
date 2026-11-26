"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { getDict } from "@/lib/client/i18n";
import {
  clearAllAirCompassData,
  loadCachedPlan,
  loadCalibration,
  loadDataMode,
  loadStoredLang,
  loadStoredProfile,
  planFingerprint,
  saveCachedPlan,
  saveCalibration,
  saveDataMode,
  saveStoredLang,
  saveStoredProfile,
  type DataMode,
} from "@/lib/client/storage";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import { applyCalibration } from "@/lib/providers/calibrate";
import type { AirContext, Lang, PlanResponse, Profile } from "@/lib/types";

interface AirCompassState {
  lang: Lang;
  mode: DataMode;
  profile: Profile | null;
  activeProfile: Profile;
  context: AirContext;
  planResponse: PlanResponse | null;
  calibrationPm25: number | null;
  loadingContext: boolean;
  loadingPlan: boolean;
  planError: string | null;
  hasCustomHousehold: boolean;
  setLang: (lang: Lang) => void;
  setMode: (mode: DataMode) => void;
  setCalibrationPm25: (val: number | null) => void;
  trySampleFamily: () => Promise<void>;
  saveProfileAndPlan: (profile: Profile) => Promise<void>;
  refreshPlan: (p: Profile, ctx: AirContext) => Promise<void>;
}

const AirCompassCtx = createContext<AirCompassState | null>(null);

export function useAirCompass(): AirCompassState {
  const ctx = useContext(AirCompassCtx);
  if (!ctx) throw new Error("useAirCompass must be used inside AirCompassProvider");
  return ctx;
}

async function fetchRemoteContext(
  p: Profile,
  nextMode: DataMode,
  cal: number | null,
): Promise<AirContext> {
  if (nextMode === "demo") {
    const demo = getDemoContext(p.place);
    return cal !== null ? applyCalibration(demo, cal) : demo;
  }
  try {
    const params = new URLSearchParams({
      lat: String(p.place.lat),
      lon: String(p.place.lon),
      name: p.place.name,
      country: p.place.country,
      mode: "live",
    });
    if (cal !== null) params.set("observedPm25", String(cal));
    const res = await fetch(`/api/context?${params.toString()}`);
    if (!res.ok) throw new Error("Failed context fetch");
    const data = (await res.json()) as { context: AirContext };
    return data.context;
  } catch {
    return getDemoContext(p.place);
  }
}

async function fetchPlanOrError(
  p: Profile,
  ctx: AirContext,
  fp: string,
): Promise<{ data: PlanResponse | null; error: string | null }> {
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: p, context: ctx }),
    });
    if (!res.ok) return { data: null, error: getDict(p.lang).plan.planFetchError };
    const data = (await res.json()) as PlanResponse;
    saveCachedPlan(fp, data);
    return { data, error: null };
  } catch {
    return { data: null, error: getDict(p.lang).plan.planFetchError };
  }
}

function useContextPlanSync() {
  const [context, setContext] = useState<AirContext>(() => getDemoContext());
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const refreshPlan = useCallback(async (p: Profile, ctx: AirContext) => {
    const fp = planFingerprint(p, ctx);
    const cached = loadCachedPlan(fp);
    if (cached) {
      setPlanResponse(cached);
      setPlanError(null);
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);
    const outcome = await fetchPlanOrError(p, ctx, fp);
    if (outcome.data) setPlanResponse(outcome.data);
    if (outcome.error) setPlanError(outcome.error);
    setLoadingPlan(false);
  }, []);

  const syncContextAndPlan = useCallback(
    async (p: Profile, nextMode: DataMode, cal: number | null) => {
      setLoadingContext(true);
      const ctx = await fetchRemoteContext(p, nextMode, cal);
      setContext(ctx);
      setLoadingContext(false);
      await refreshPlan(p, ctx);
    },
    [refreshPlan],
  );

  return {
    context,
    planResponse,
    loadingContext,
    loadingPlan,
    planError,
    refreshPlan,
    syncContextAndPlan,
  };
}

function useInitialStoredSession(
  syncContextAndPlan: (p: Profile, nextMode: DataMode, cal: number | null) => Promise<void>,
  setLangState: (l: Lang) => void,
  setModeState: (m: DataMode) => void,
  setProfile: (p: Profile | null) => void,
  setCalibrationState: (c: number | null) => void,
) {
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      const storedLang = loadStoredLang();
      const storedMode = loadDataMode();
      const storedProfile = loadStoredProfile();
      const storedCal = loadCalibration();
      setLangState(storedLang);
      setModeState(storedMode);
      setCalibrationState(storedCal);
      const initial = storedProfile
        ? { ...storedProfile, lang: storedLang }
        : { ...SAMPLE_FAMILY_PROFILE, lang: storedLang };
      if (storedProfile) setProfile(initial);
      await syncContextAndPlan(initial, storedMode, storedCal);
    })();
    return () => {
      active = false;
    };
  }, [setCalibrationState, setLangState, setModeState, setProfile, syncContextAndPlan]);
}

function useProfileActions(
  lang: Lang,
  mode: DataMode,
  profile: Profile | null,
  calibrationPm25: number | null,
  syncContextAndPlan: (p: Profile, nextMode: DataMode, cal: number | null) => Promise<void>,
  refreshPlan: (p: Profile, ctx: AirContext) => Promise<void>,
  context: AirContext,
  setters: {
    setLangState: (l: Lang) => void;
    setModeState: (m: DataMode) => void;
    setProfile: (p: Profile | null) => void;
    setCalibrationState: (c: number | null) => void;
    setDeletedMsg: (m: string | null) => void;
  },
) {
  const activeProfile: Profile = profile ?? { ...SAMPLE_FAMILY_PROFILE, lang };
  return {
    activeProfile,
    setLang: (nextLang: Lang) => {
      setters.setLangState(nextLang);
      saveStoredLang(nextLang);
      const nextP: Profile = { ...(profile ?? SAMPLE_FAMILY_PROFILE), lang: nextLang };
      if (profile) setters.setProfile(nextP);
      void refreshPlan(nextP, context);
    },
    setMode: (nextMode: DataMode) => {
      setters.setModeState(nextMode);
      saveDataMode(nextMode);
      void syncContextAndPlan(activeProfile, nextMode, calibrationPm25);
    },
    setCalibrationPm25: (val: number | null) => {
      setters.setCalibrationState(val);
      saveCalibration(val);
      void syncContextAndPlan(activeProfile, mode, val);
    },
    trySampleFamily: async () => {
      const sample: Profile = { ...SAMPLE_FAMILY_PROFILE, lang };
      setters.setProfile(sample);
      saveStoredProfile(sample);
      setters.setDeletedMsg(null);
      await syncContextAndPlan(sample, mode, calibrationPm25);
    },
    saveProfileAndPlan: async (nextP: Profile) => {
      const normalized: Profile = { ...nextP, lang };
      setters.setProfile(normalized);
      saveStoredProfile(normalized);
      setters.setDeletedMsg(null);
      await syncContextAndPlan(normalized, mode, calibrationPm25);
    },
    handleDeleteData: () => {
      clearAllAirCompassData();
      setters.setProfile(null);
      setters.setCalibrationState(null);
      setters.setModeState("demo");
      setters.setDeletedMsg(getDict(lang).app.deletedToast);
      void syncContextAndPlan({ ...SAMPLE_FAMILY_PROFILE, lang }, "demo", null);
    },
  };
}

/** Provides household profile, air context, bilingual dictionary, and cached plan state. */
export function AirCompassProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [mode, setModeState] = useState<DataMode>("demo");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [calibrationPm25, setCalibrationState] = useState<number | null>(null);
  const [deletedMsg, setDeletedMsg] = useState<string | null>(null);
  const sync = useContextPlanSync();

  useInitialStoredSession(
    sync.syncContextAndPlan,
    setLangState,
    setModeState,
    setProfile,
    setCalibrationState,
  );

  const actions = useProfileActions(
    lang,
    mode,
    profile,
    calibrationPm25,
    sync.syncContextAndPlan,
    sync.refreshPlan,
    sync.context,
    { setLangState, setModeState, setProfile, setCalibrationState, setDeletedMsg },
  );

  return (
    <AirCompassCtx.Provider
      value={{
        lang,
        mode,
        profile,
        ...sync,
        ...actions,
        calibrationPm25,
        hasCustomHousehold: profile !== null,
      }}
    >
      <AppShell
        lang={lang}
        onLangChange={actions.setLang}
        mode={mode}
        onModeChange={actions.setMode}
        onDeleteData={actions.handleDeleteData}
        deletedMsg={deletedMsg}
      >
        {children}
      </AppShell>
    </AirCompassCtx.Provider>
  );
}
