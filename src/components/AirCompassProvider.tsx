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

export function AirCompassProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [mode, setModeState] = useState<DataMode>("demo");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [context, setContext] = useState<AirContext>(() => getDemoContext());
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [calibrationPm25, setCalibrationState] = useState<number | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [deletedMsg, setDeletedMsg] = useState<string | null>(null);

  const activeProfile: Profile = profile ?? { ...SAMPLE_FAMILY_PROFILE, lang };

  const fetchContextFor = useCallback(
    async (p: Profile, nextMode: DataMode, cal: number | null): Promise<AirContext> => {
      setLoadingContext(true);
      try {
        if (nextMode === "demo") {
          let demo = getDemoContext(p.place);
          if (cal !== null) demo = applyCalibration(demo, cal);
          setContext(demo);
          return demo;
        }
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
        setContext(data.context);
        return data.context;
      } catch {
        const fallback = getDemoContext(p.place);
        setContext(fallback);
        return fallback;
      } finally {
        setLoadingContext(false);
      }
    },
    [],
  );

  const refreshPlan = useCallback(async (p: Profile, ctx: AirContext) => {
    const fp = planFingerprint(p, ctx);
    const cached = loadCachedPlan(fp);
    if (cached) {
      setPlanResponse(cached);
      return;
    }
    setLoadingPlan(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, context: ctx }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as PlanResponse;
      saveCachedPlan(fp, data);
      setPlanResponse(data);
    } finally {
      setLoadingPlan(false);
    }
  }, []);

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
      const initialProfile = storedProfile
        ? { ...storedProfile, lang: storedLang }
        : { ...SAMPLE_FAMILY_PROFILE, lang: storedLang };
      if (storedProfile) setProfile(initialProfile);

      const ctx = await fetchContextFor(initialProfile, storedMode, storedCal);
      if (!active) return;
      await refreshPlan(initialProfile, ctx);
    })();
    return () => {
      active = false;
    };
  }, [fetchContextFor, refreshPlan]);

  const setLang = useCallback(
    (nextLang: Lang) => {
      setLangState(nextLang);
      saveStoredLang(nextLang);
      const nextProfile: Profile = { ...(profile ?? SAMPLE_FAMILY_PROFILE), lang: nextLang };
      if (profile) setProfile(nextProfile);
      void refreshPlan(nextProfile, context);
    },
    [context, profile, refreshPlan],
  );

  const setMode = useCallback(
    (nextMode: DataMode) => {
      setModeState(nextMode);
      saveDataMode(nextMode);
      const p: Profile = { ...(profile ?? SAMPLE_FAMILY_PROFILE), lang };
      void (async () => {
        const ctx = await fetchContextFor(p, nextMode, calibrationPm25);
        await refreshPlan(p, ctx);
      })();
    },
    [calibrationPm25, fetchContextFor, lang, profile, refreshPlan],
  );

  const setCalibrationPm25 = useCallback(
    (val: number | null) => {
      setCalibrationState(val);
      saveCalibration(val);
      const p: Profile = { ...(profile ?? SAMPLE_FAMILY_PROFILE), lang };
      void (async () => {
        const ctx = await fetchContextFor(p, mode, val);
        await refreshPlan(p, ctx);
      })();
    },
    [fetchContextFor, lang, mode, profile, refreshPlan],
  );

  const trySampleFamily = useCallback(async () => {
    const sample: Profile = { ...SAMPLE_FAMILY_PROFILE, lang };
    setProfile(sample);
    saveStoredProfile(sample);
    setDeletedMsg(null);
    const ctx = await fetchContextFor(sample, mode, calibrationPm25);
    await refreshPlan(sample, ctx);
  }, [calibrationPm25, fetchContextFor, lang, mode, refreshPlan]);

  const saveProfileAndPlan = useCallback(
    async (nextProfile: Profile) => {
      const normalized: Profile = { ...nextProfile, lang };
      setProfile(normalized);
      saveStoredProfile(normalized);
      setDeletedMsg(null);
      const ctx = await fetchContextFor(normalized, mode, calibrationPm25);
      await refreshPlan(normalized, ctx);
    },
    [calibrationPm25, fetchContextFor, lang, mode, refreshPlan],
  );

  const handleDeleteData = useCallback(() => {
    clearAllAirCompassData();
    setProfile(null);
    setCalibrationState(null);
    setModeState("demo");
    const dict = getDict(lang);
    setDeletedMsg(dict.app.deletedToast);
    const sample: Profile = { ...SAMPLE_FAMILY_PROFILE, lang };
    void (async () => {
      const ctx = await fetchContextFor(sample, "demo", null);
      await refreshPlan(sample, ctx);
    })();
  }, [fetchContextFor, lang, refreshPlan]);

  return (
    <AirCompassCtx.Provider
      value={{
        lang,
        mode,
        profile,
        activeProfile,
        context,
        planResponse,
        calibrationPm25,
        loadingContext,
        loadingPlan,
        hasCustomHousehold: profile !== null,
        setLang,
        setMode,
        setCalibrationPm25,
        trySampleFamily,
        saveProfileAndPlan,
        refreshPlan,
      }}
    >
      <AppShell
        lang={lang}
        onLangChange={setLang}
        mode={mode}
        onModeChange={setMode}
        onDeleteData={handleDeleteData}
        deletedMsg={deletedMsg}
      >
        {children}
      </AppShell>
    </AirCompassCtx.Provider>
  );
}
