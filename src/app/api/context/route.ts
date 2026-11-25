import { ContextQuerySchema } from "@/lib/schemas";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "@/lib/providers/demo";
import { searchPlaces } from "@/lib/providers/geocode";
import { applyCalibration, fetchOpenMeteoContext } from "@/lib/providers/openMeteo";
import { jsonError } from "@/lib/security/headers";
import { clientIpFromHeaders, takeIpToken } from "@/lib/security/rateLimit";
import type { Profile } from "@/lib/types";

export async function GET(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!takeIpToken("context", ip)) {
    return jsonError(429, "Rate limit exceeded; please retry shortly.");
  }

  const { searchParams } = new URL(request.url);
  const raw: Record<string, unknown> = {};
  const q = searchParams.get("q");
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");
  const name = searchParams.get("name");
  const country = searchParams.get("country");
  const mode = searchParams.get("mode");
  const observedStr = searchParams.get("observedPm25");

  if (q !== null) raw.q = q;
  if (latStr !== null) raw.lat = Number(latStr);
  if (lonStr !== null) raw.lon = Number(lonStr);
  if (name !== null) raw.name = name;
  if (country !== null) raw.country = country;
  if (mode !== null) raw.mode = mode;
  if (observedStr !== null) raw.observedPm25 = Number(observedStr);

  const parsed = ContextQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(400, "Invalid context query parameters.");
  }

  const input = parsed.data;

  try {
    // Place search mode
    if (input.q && input.lat === undefined && input.lon === undefined) {
      const places = await searchPlaces(input.q);
      return Response.json({ places }, { headers: { "Cache-Control": "no-store" } });
    }

    const place: Profile["place"] =
      input.lat !== undefined && input.lon !== undefined
        ? {
            name: input.name ?? "Selected location",
            lat: input.lat,
            lon: input.lon,
            country: input.country ?? "IN",
          }
        : SAMPLE_FAMILY_PROFILE.place;

    if (input.mode === "demo") {
      let ctx = getDemoContext(place);
      if (input.observedPm25 !== undefined) ctx = applyCalibration(ctx, input.observedPm25);
      return Response.json({ context: ctx }, { headers: { "Cache-Control": "no-store" } });
    }

    let ctx = await fetchOpenMeteoContext(place);
    if (input.observedPm25 !== undefined) ctx = applyCalibration(ctx, input.observedPm25);
    return Response.json({ context: ctx }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Graceful degradation to labelled demo fixture on upstream outage
    const fallback = getDemoContext();
    return Response.json(
      { context: fallback, upstreamFallback: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
