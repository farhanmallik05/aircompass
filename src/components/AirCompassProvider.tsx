"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppShell } from "./AppShell";
import { fetchPlanOrError, fetchRemoteContext } from "@/lib/client/contextFetchers";
import { getDict } from "@/lib/client/i18n";
import {
  clearAllAirCompassData,
  loadCachedPlan,
  loadCalibration,
  loadDataMode,
  loadStoredLang,
  loadStoredProfile,
  planFingerprint,
  saveCalibration,
  saveDataMode,
  saveStoredLang,
  saveStoredProfile,
  type DataMode,
} from "@/lib/client/storage";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
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
  fallbackPlace: string | null;
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

function useContextPlanSync() {
  const [context, setContext] = useState<AirContext>(() => getDemoContext());
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [fallbackPlace, setFallbackPlace] = useState<string | null>(null);
  const syncSeqRef = useRef(0);
  const planSeqRef = useRef(0);

  const refreshPlan = useCallback(async (p: Profile, ctx: AirContext) => {
    const seq = ++planSeqRef.current;
    const fp = planFingerprint(p, ctx);
    const cached = loadCachedPlan(fp);
    if (cached) {
      setPlanResponse(cached);
      setPlanError(null);
      setLoadingPlan(false);
      return;
    }
    setLoadingPlan(true);
    setPlanError(null);
    const outcome = await fetchPlanOrError(p, ctx, fp);
    if (seq !== planSeqRef.current) return;
    if (outcome.data) setPlanResponse(outcome.data);
    if (outcome.error) setPlanError(outcome.error);
    setLoadingPlan(false);
  }, []);

  const syncContextAndPlan = useCallback(
    async (p: Profile, nextMode: DataMode, cal: number | null) => {
      const seq = ++syncSeqRef.current;
      setLoadingContext(true);
      const { ctx, fallbackFor } = await fetchRemoteContext(p, nextMode, cal);
      if (seq !== syncSeqRef.current) return;
      setContext(ctx);
      setFallbackPlace(fallbackFor);
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
    fallbackPlace,
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
    document.documentElement.dataset.hydrated = "true";
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
