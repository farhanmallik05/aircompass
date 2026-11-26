"use client";

import { getDict } from "@/lib/client/i18n";
import {
  isRecord,
  isValidPlace,
  isValidPlanResponse,
  saveCachedPlan,
  type DataMode,
} from "@/lib/client/storage";
import { applyCalibration } from "@/lib/providers/calibrate";
import { getDemoContext } from "@/lib/providers/demo";
import type { AirContext, PlanResponse, Profile } from "@/lib/types";

function isValidAirContext(val: unknown): val is AirContext {
  if (!isRecord(val) || !isValidPlace(val.place)) return false;
  if (val.source !== "live" && val.source !== "demo") return false;
  if (typeof val.dataNote !== "string" || typeof val.fetchedAt !== "string") return false;
  return (
    Array.isArray(val.hours) &&
    val.hours.length > 0 &&
    typeof val.nowIndex === "number" &&
    Number.isInteger(val.nowIndex)
  );
}

function isApiContextPayload(
  val: unknown,
): val is { context: AirContext; upstreamFallback?: boolean; requestedPlace?: { name: string } } {
  return isRecord(val) && isValidAirContext(val.context);
}

function readRequestedPlaceName(
  payload: { requestedPlace?: { name: string } },
  fallback: string,
): string {
  const rp: unknown = payload.requestedPlace;
  return isRecord(rp) && typeof rp.name === "string" && rp.name.length > 0 ? rp.name : fallback;
}

/** Fetches live or calibrated demo air context from `/api/context` with honest fallback attribution. */
export async function fetchRemoteContext(
  p: Profile,
  nextMode: DataMode,
  cal: number | null,
): Promise<{ ctx: AirContext; fallbackFor: string | null }> {
  if (nextMode === "demo") {
    const demo = getDemoContext(p.place);
    return { ctx: cal !== null ? applyCalibration(demo, cal) : demo, fallbackFor: null };
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
    if (!res.ok) throw new Error(`Context HTTP ${res.status}`);
    const raw: unknown = await res.json();
    if (!isApiContextPayload(raw)) throw new Error("Invalid /api/context payload");
    return {
      ctx: raw.context,
      fallbackFor: raw.upstreamFallback === true ? readRequestedPlaceName(raw, p.place.name) : null,
    };
  } catch (err) {
    console.warn(
      "[AirCompass] fetchRemoteContext failed; falling back to Greater Noida demo fixture:",
      err instanceof Error ? err.message : String(err),
    );
    return { ctx: getDemoContext(), fallbackFor: p.place.name };
  }
}

/** Fetches tailored household action plan from `/api/plan` and caches valid responses locally. */
export async function fetchPlanOrError(
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
    const raw: unknown = await res.json();
    if (!isValidPlanResponse(raw)) {
      return { data: null, error: getDict(p.lang).plan.planFetchError };
    }
    saveCachedPlan(fp, raw);
    return { data: raw, error: null };
  } catch (err) {
    console.warn(
      "[AirCompass] fetchPlanOrError failed:",
      err instanceof Error ? err.message : String(err),
    );
    return { data: null, error: getDict(p.lang).plan.planFetchError };
  }
}
