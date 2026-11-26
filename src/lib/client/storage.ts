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

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

export function isValidPlace(place: unknown): place is Profile["place"] {
  return (
    isRecord(place) &&
    typeof place.name === "string" &&
    typeof place.country === "string" &&
    isFiniteInRange(place.lat, -90, 90) &&
    isFiniteInRange(place.lon, -180, 180)
  );
}

function isValidHousehold(hh: unknown): boolean {
  return (
    isRecord(hh) &&
    isFiniteInRange(hh.adults, 0, 20) &&
    isFiniteInRange(hh.children, 0, 20) &&
    isFiniteInRange(hh.seniors, 0, 20) &&
    Array.isArray(hh.conditions)
  );
}

function isValidHome(home: unknown): boolean {
  return (
    isRecord(home) &&
    typeof home.windows === "string" &&
    VALID_WINDOWS.has(home.windows) &&
    typeof home.purifier === "string" &&
    VALID_PURIFIERS.has(home.purifier) &&
    typeof home.cooking === "string" &&
    VALID_COOKING.has(home.cooking) &&
    isFiniteInRange(home.roomAreaM2, 4, 500)
  );
}

function isValidCommute(commute: unknown, habits: unknown): boolean {
  return (
    isRecord(commute) &&
    typeof commute.mode === "string" &&
    VALID_COMMUTES.has(commute.mode) &&
    isFiniteInRange(commute.km, 0, 200) &&
    isFiniteInRange(commute.daysPerWeek, 0, 7) &&
    isRecord(habits) &&
    typeof habits.morningOutdoorExercise === "boolean" &&
    typeof habits.schoolRun === "boolean"
  );
}

/** Lightweight client runtime validator so tampered/stale localStorage cannot crash React renders. */
export function isValidStoredProfile(val: unknown): val is Profile {
  if (!isRecord(val)) return false;
  if (val.lang !== "en" && val.lang !== "hi") return false;
  if (typeof val.budget !== "string" || !VALID_BUDGETS.has(val.budget)) return false;
  return (
    isValidPlace(val.place) &&
    isValidHousehold(val.household) &&
    isValidHome(val.home) &&
    isValidCommute(val.commute, val.habits)
  );
}

/** Validates plan payloads returned by `/api/plan` or restored from localStorage. */
export function isValidPlanResponse(val: unknown): val is PlanResponse {
  if (!isRecord(val) || !isRecord(val.plan) || !Array.isArray(val.plan.cards)) return false;
  return typeof val.plan.headline === "string" && typeof val.outcome === "string";
}

/** Validates cached plan payloads stored in browser localStorage. */
export function isValidCachedPlanPayload(
  val: unknown,
): val is { fingerprint: string; response: PlanResponse } {
  return isRecord(val) && typeof val.fingerprint === "string" && isValidPlanResponse(val.response);
}

function safeReadItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn(
      "[storage] localStorage.getItem unavailable:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function safeWriteItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.warn(
      "[storage] localStorage.setItem skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function safeRemoveItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(
      "[storage] localStorage.removeItem skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function safeReadJson(key: string): unknown {
  const raw = safeReadItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(
      "[storage] Discarding corrupted stored JSON:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

export function loadStoredProfile(): Profile | null {
  const parsed = safeReadJson(KEY_PROFILE);
  return isValidStoredProfile(parsed) ? parsed : null;
}

export function saveStoredProfile(profile: Profile): void {
  safeWriteItem(KEY_PROFILE, JSON.stringify(profile));
  safeWriteItem(KEY_LANG, profile.lang);
}

export function loadStoredLang(): Lang {
  return safeReadItem(KEY_LANG) === "hi" ? "hi" : "en";
}

export function saveStoredLang(lang: Lang): void {
  safeWriteItem(KEY_LANG, lang);
  const p = loadStoredProfile();
  if (p) safeWriteItem(KEY_PROFILE, JSON.stringify({ ...p, lang }));
}

export function loadDataMode(): DataMode {
  return safeReadItem(KEY_MODE) === "live" ? "live" : "demo";
}

export function saveDataMode(mode: DataMode): void {
  safeWriteItem(KEY_MODE, mode);
}

export function loadCalibration(): number | null {
  const raw = safeReadItem(KEY_CALIBRATION);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 2000 ? n : null;
}

export function saveCalibration(val: number | null): void {
  if (val === null) safeRemoveItem(KEY_CALIBRATION);
  else safeWriteItem(KEY_CALIBRATION, String(val));
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
  const parsed = safeReadJson(KEY_PLAN_CACHE);
  if (!isValidCachedPlanPayload(parsed)) return null;
  return parsed.fingerprint === fingerprint ? parsed.response : null;
}

export function saveCachedPlan(fingerprint: string, response: PlanResponse): void {
  safeWriteItem(KEY_PLAN_CACHE, JSON.stringify({ fingerprint, response }));
}

export function clearAllAirCompassData(): void {
  safeRemoveItem(KEY_PROFILE);
  safeRemoveItem(KEY_MODE);
  safeRemoveItem(KEY_CALIBRATION);
  safeRemoveItem(KEY_PLAN_CACHE);
}
