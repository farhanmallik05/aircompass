"use client";

import type { AirContext, Lang, PlanResponse, Profile } from "@/lib/types";

const KEY_PROFILE = "aircompass.profile.v1";
const KEY_LANG = "aircompass.lang.v1";
const KEY_MODE = "aircompass.mode.v1";
const KEY_CALIBRATION = "aircompass.calibration.v1";
const KEY_PLAN_CACHE = "aircompass.plan.v1";

export type DataMode = "demo" | "live";

const VALID_BUDGETS = new Set(["zero", "low", "medium"]);
const VALID_WINDOWS = new Set(["sealed", "normal", "leaky"]);
const VALID_PURIFIERS = new Set(["none", "hepa", "diy"]);
const VALID_COOKING = new Set(["lpg", "induction", "biomass", "other"]);
const VALID_COMMUTES = new Set([
  "walk",
  "cycle",
  "two_wheeler",
  "auto",
  "bus",
  "metro",
  "car",
  "wfh",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

/** Lightweight client runtime validator so tampered/stale localStorage cannot crash React renders. */
export function isValidStoredProfile(val: unknown): val is Profile {
  if (!isRecord(val)) return false;
  if (val.lang !== "en" && val.lang !== "hi") return false;
  if (typeof val.budget !== "string" || !VALID_BUDGETS.has(val.budget)) return false;

  const { place, household, home, commute, habits } = val;
  if (!isRecord(place) || typeof place.name !== "string" || typeof place.country !== "string") {
    return false;
  }
  if (!isFiniteInRange(place.lat, -90, 90) || !isFiniteInRange(place.lon, -180, 180)) {
    return false;
  }

  if (
    !isRecord(household) ||
    !isFiniteInRange(household.adults, 0, 20) ||
    !isFiniteInRange(household.children, 0, 20) ||
    !isFiniteInRange(household.seniors, 0, 20) ||
    !Array.isArray(household.conditions)
  ) {
    return false;
  }

  if (
    !isRecord(home) ||
    (home.type !== "apartment" && home.type !== "house") ||
    typeof home.windows !== "string" ||
    !VALID_WINDOWS.has(home.windows) ||
    typeof home.ac !== "boolean" ||
    typeof home.purifier !== "string" ||
    !VALID_PURIFIERS.has(home.purifier) ||
    typeof home.cooking !== "string" ||
    !VALID_COOKING.has(home.cooking) ||
    !isFiniteInRange(home.roomAreaM2, 4, 500)
  ) {
    return false;
  }

  if (
    !isRecord(commute) ||
    typeof commute.mode !== "string" ||
    !VALID_COMMUTES.has(commute.mode) ||
    !isFiniteInRange(commute.km, 0, 200) ||
    !isFiniteInRange(commute.daysPerWeek, 0, 7)
  ) {
    return false;
  }

  if (
    !isRecord(habits) ||
    typeof habits.morningOutdoorExercise !== "boolean" ||
    typeof habits.schoolRun !== "boolean"
  ) {
    return false;
  }

  return true;
}

export function isValidCachedPlanPayload(
  val: unknown,
): val is { fingerprint: string; response: PlanResponse } {
  if (!isRecord(val) || typeof val.fingerprint !== "string") return false;
  const res = val.response;
  if (!isRecord(res) || !isRecord(res.plan) || !Array.isArray(res.plan.cards)) return false;
  return typeof res.plan.headline === "string" && typeof res.outcome === "string";
}

export function loadStoredProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PROFILE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidStoredProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredProfile(profile: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PROFILE, JSON.stringify(profile));
    window.localStorage.setItem(KEY_LANG, profile.lang);
  } catch {
    // Ignore storage quota / privacy-mode errors cleanly
  }
}

export function loadStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const v = window.localStorage.getItem(KEY_LANG);
    return v === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

export function saveStoredLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_LANG, lang);
    const p = loadStoredProfile();
    if (p) {
      window.localStorage.setItem(KEY_PROFILE, JSON.stringify({ ...p, lang }));
    }
  } catch {
    // Ignore storage errors cleanly
  }
}

export function loadDataMode(): DataMode {
  if (typeof window === "undefined") return "demo";
  try {
    return window.localStorage.getItem(KEY_MODE) === "live" ? "live" : "demo";
  } catch {
    return "demo";
  }
}

export function saveDataMode(mode: DataMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_MODE, mode);
  } catch {
    // Ignore storage errors cleanly
  }
}

export function loadCalibration(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_CALIBRATION);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 2000 ? n : null;
  } catch {
    return null;
  }
}

export function saveCalibration(val: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (val === null) window.localStorage.removeItem(KEY_CALIBRATION);
    else window.localStorage.setItem(KEY_CALIBRATION, String(val));
  } catch {
    // Ignore storage errors cleanly
  }
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
    const parsed: unknown = JSON.parse(raw);
    if (!isValidCachedPlanPayload(parsed)) return null;
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
  try {
    window.localStorage.removeItem(KEY_PROFILE);
    window.localStorage.removeItem(KEY_MODE);
    window.localStorage.removeItem(KEY_CALIBRATION);
    window.localStorage.removeItem(KEY_PLAN_CACHE);
  } catch {
    // Ignore storage errors cleanly
  }
}
