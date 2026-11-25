"use client";

import type { AirContext, Lang, PlanResponse, Profile } from "@/lib/types";

const KEY_PROFILE = "aircompass.profile.v1";
const KEY_LANG = "aircompass.lang.v1";
const KEY_MODE = "aircompass.mode.v1";
const KEY_CALIBRATION = "aircompass.calibration.v1";
const KEY_PLAN_CACHE = "aircompass.plan.v1";

export type DataMode = "demo" | "live";

export function loadStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PROFILE);
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

export function saveStoredProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
  window.localStorage.setItem(KEY_LANG, profile.lang);
}

export function loadStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(KEY_LANG);
  return v === "hi" ? "hi" : "en";
}

export function saveStoredLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_LANG, lang);
  const p = loadStoredProfile();
  if (p) {
    window.localStorage.setItem(KEY_PROFILE, JSON.stringify({ ...p, lang }));
  }
}

export function loadDataMode(): DataMode {
  if (typeof window === "undefined") return "demo";
  return window.localStorage.getItem(KEY_MODE) === "live" ? "live" : "demo";
}

export function saveDataMode(mode: DataMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_MODE, mode);
}

export function loadCalibration(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY_CALIBRATION);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveCalibration(val: number | null): void {
  if (typeof window === "undefined") return;
  if (val === null) window.localStorage.removeItem(KEY_CALIBRATION);
  else window.localStorage.setItem(KEY_CALIBRATION, String(val));
}

export function planFingerprint(profile: Profile, context: AirContext): string {
  return JSON.stringify({
    profile,
    source: context.source,
    dataNote: context.dataNote,
    cal: context.calibrationFactor ?? null,
    t0: context.hours[context.nowIndex]?.t ?? "",
    pm0: context.hours[context.nowIndex]?.pm25 ?? 0,
  });
}

export function loadCachedPlan(fingerprint: string): PlanResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PLAN_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fingerprint: string; response: PlanResponse };
    return parsed.fingerprint === fingerprint ? parsed.response : null;
  } catch {
    return null;
  }
}

export function saveCachedPlan(fingerprint: string, response: PlanResponse): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PLAN_CACHE, JSON.stringify({ fingerprint, response }));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function clearAllAirCompassData(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_PROFILE);
  window.localStorage.removeItem(KEY_MODE);
  window.localStorage.removeItem(KEY_CALIBRATION);
  window.localStorage.removeItem(KEY_PLAN_CACHE);
}
