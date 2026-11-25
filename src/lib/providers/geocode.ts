import { OpenMeteoGeocodeResponseSchema } from "../schemas";
import type { GeoPlace } from "../types";
import { fetchJsonWithRetry } from "./openMeteo";

const GEOCODE_HOST = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoPlace[]> {
  const clean = query.trim();
  if (!clean || clean.length > 80) return [];
  const params = new URLSearchParams({
    name: clean,
    count: "5",
    language: "en",
    format: "json",
  });
  const raw = await fetchJsonWithRetry(`${GEOCODE_HOST}?${params.toString()}`, fetchImpl);
  const parsed = OpenMeteoGeocodeResponseSchema.parse(raw);
  return (parsed.results ?? []).map((r) => ({
    name: r.name,
    ...(r.admin1 ? { admin1: r.admin1 } : {}),
    country: (r.country_code ?? "IN").toUpperCase().slice(0, 2),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
