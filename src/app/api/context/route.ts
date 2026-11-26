import { ContextQuerySchema } from "@/lib/schemas";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import { searchPlaces } from "@/lib/providers/geocode";
import { applyCalibration, fetchOpenMeteoContext } from "@/lib/providers/openMeteo";
import { jsonError, logServerError } from "@/lib/security/headers";
import { clientIpFromHeaders, takeIpToken } from "@/lib/security/rateLimit";
import type { Profile } from "@/lib/types";

function parseContextQuery(searchParams: URLSearchParams): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  const textKeys = ["q", "name", "country", "mode"] as const;
  for (const key of textKeys) {
    const val = searchParams.get(key);
    if (val !== null) raw[key] = val;
  }
  const numericKeys = ["lat", "lon", "observedPm25"] as const;
  for (const key of numericKeys) {
    const val = searchParams.get(key);
    if (val !== null) {
      raw[key] = val.trim() === "" ? Number.NaN : Number(val);
    }
  }
  return raw;
}

function resolvePlace(input: {
  lat?: number;
  lon?: number;
  name?: string;
  country?: string;
}): Profile["place"] {
  if (input.lat === undefined || input.lon === undefined) {
    return SAMPLE_FAMILY_PROFILE.place;
  }
  return {
    name: input.name ?? "Selected location",
    lat: input.lat,
    lon: input.lon,
    country: input.country ?? "IN",
  };
}

/** Serves geocoded places, demo severe-day air data, or calibrated live Open-Meteo data. */
export async function GET(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!takeIpToken("context", ip)) {
    return jsonError(429, "Rate limit exceeded; please retry shortly.", { "Retry-After": "60" });
  }

  const parsed = ContextQuerySchema.safeParse(parseContextQuery(new URL(request.url).searchParams));
  if (!parsed.success) {
    return jsonError(400, "Invalid context query parameters.");
  }

  const input = parsed.data;
  const place = resolvePlace(input);
  if (input.q && input.lat === undefined && input.lon === undefined) {
    try {
      const places = await searchPlaces(input.q);
      return Response.json({ places }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      logServerError("api/context:geocode", err);
      return Response.json(
        { error: "Place search unavailable.", places: [] },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  try {
    const rawCtx =
      input.mode === "demo" ? getDemoContext(place) : await fetchOpenMeteoContext(place);
    const ctx =
      input.observedPm25 !== undefined ? applyCalibration(rawCtx, input.observedPm25) : rawCtx;
    return Response.json({ context: ctx }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logServerError("api/context", err);
    return Response.json(
      { context: getDemoContext(), requestedPlace: place, upstreamFallback: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
