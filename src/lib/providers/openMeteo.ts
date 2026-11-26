import { aqiFromPm25 } from "../engine/bands";
import { OpenMeteoAirResponseSchema, OpenMeteoWeatherResponseSchema } from "../schemas";
import { logServerError } from "../security/log";
import type { AirContext, DataNote, HourPoint, Profile } from "../types";

const AIR_HOST = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WEATHER_HOST = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 3_600_000;
const REQUEST_TIMEOUT_MS = 5_000;

const EUROPE_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CH",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GB",
  "GR",
  "HR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  "UA",
  "UK",
]);

interface CacheEntry {
  expiresAt: number;
  value: AirContext;
}

const contextCache = new Map<string, CacheEntry>();

export function clearProviderCache(): void {
  contextCache.clear();
}

export function roundCoordKey(lat: number, lon: number): string {
  return `${lat.toFixed(1)},${lon.toFixed(1)}`;
}

export function detectDataNote(place: Profile["place"]): DataNote {
  if (EUROPE_COUNTRIES.has(place.country.toUpperCase())) return "cams_europe_11km";
  return "cams_global_25_45km";
}

export async function fetchJsonWithRetry(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://air-quality-api.open-meteo.com" &&
    parsed.origin !== "https://api.open-meteo.com" &&
    parsed.origin !== "https://geocoding-api.open-meteo.com"
  ) {
    throw new Error(`Blocked non-allowlisted upstream host: ${parsed.origin}`);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(parsed.toString(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        next: { revalidate: 3600 },
      });
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`Upstream HTTP ${res.status}`);
          logServerError(`providers/openMeteo:attempt-${attempt + 1}`, lastErr);
          continue;
        }
        throw new Error(`Upstream HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      logServerError(`providers/openMeteo:attempt-${attempt + 1}`, err);
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Upstream fetch failed");
}

function finiteOrUndefined(val: number | null | undefined): number | undefined {
  return val !== null && val !== undefined && Number.isFinite(val) ? val : undefined;
}

function buildWeatherLookup(
  weather: ReturnType<typeof OpenMeteoWeatherResponseSchema.parse>,
): Map<string, { tempC?: number; rh?: number; windKmh?: number }> {
  const byTime = new Map<string, { tempC?: number; rh?: number; windKmh?: number }>();
  const wn = weather.hourly.time.length;
  if (
    weather.hourly.temperature_2m.length !== wn ||
    weather.hourly.relative_humidity_2m.length !== wn ||
    weather.hourly.wind_speed_10m.length !== wn
  ) {
    return byTime;
  }

  for (let i = 0; i < wn; i++) {
    const t = weather.hourly.time[i];
    if (!t) continue;
    const tempC = finiteOrUndefined(weather.hourly.temperature_2m[i]);
    const rh = finiteOrUndefined(weather.hourly.relative_humidity_2m[i]);
    const windKmh = finiteOrUndefined(weather.hourly.wind_speed_10m[i]);
    byTime.set(t, {
      ...(tempC !== undefined ? { tempC } : {}),
      ...(rh !== undefined ? { rh } : {}),
      ...(windKmh !== undefined ? { windKmh } : {}),
    });
  }
  return byTime;
}

function nonNegativeFinite(val: number | null | undefined, fallback: number): number {
  return val !== null && val !== undefined && Number.isFinite(val) && val >= 0 ? val : fallback;
}

function buildHourPoint(
  air: ReturnType<typeof OpenMeteoAirResponseSchema.parse>,
  i: number,
  wx: { tempC?: number; rh?: number; windKmh?: number } | undefined,
): HourPoint | null {
  const t = air.hourly.time[i];
  const pm25 = finiteOrUndefined(air.hourly.pm2_5[i]);
  if (!t || pm25 === undefined || pm25 < 0) return null;

  const safePm10 = nonNegativeFinite(air.hourly.pm10[i], pm25);
  const aqiRaw = air.hourly.us_aqi[i];
  const safeAqi =
    aqiRaw !== null && aqiRaw !== undefined && Number.isFinite(aqiRaw) && aqiRaw >= 0
      ? Math.min(500, Math.round(aqiRaw))
      : aqiFromPm25(pm25);

  return {
    t,
    pm25: Math.round(pm25 * 10) / 10,
    pm10: Math.round(safePm10 * 10) / 10,
    usAqi: safeAqi,
    ...(wx ?? {}),
  };
}

function buildHours(
  air: ReturnType<typeof OpenMeteoAirResponseSchema.parse>,
  weather: ReturnType<typeof OpenMeteoWeatherResponseSchema.parse>,
): HourPoint[] {
  const n = air.hourly.time.length;
  if (
    air.hourly.pm2_5.length !== n ||
    air.hourly.pm10.length !== n ||
    air.hourly.us_aqi.length !== n
  ) {
    throw new Error("Mismatched hourly array lengths from upstream air-quality API");
  }

  const weatherByTime = buildWeatherLookup(weather);
  const hours: HourPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = air.hourly.time[i];
    const point = buildHourPoint(air, i, t ? weatherByTime.get(t) : undefined);
    if (point) hours.push(point);
  }

  if (hours.length === 0) {
    throw new Error("Upstream air-quality API returned zero valid hourly points");
  }
  return hours;
}

export async function fetchOpenMeteoContext(
  place: Profile["place"],
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<AirContext> {
  const key = `${roundCoordKey(place.lat, place.lon)}:${place.country.toUpperCase()}`;
  const cached = contextCache.get(key);
  if (cached && cached.expiresAt > nowMs) {
    return { ...cached.value, place };
  }

  const airParams = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    hourly: "pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi",
    current: "us_aqi,pm2_5,pm10",
    past_days: "1",
    forecast_days: "2",
    timezone: "auto",
  });
  const wxParams = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    hourly: "temperature_2m,relative_humidity_2m,wind_speed_10m",
    past_days: "1",
    forecast_days: "2",
    timezone: "auto",
  });

  const [rawAir, rawWx] = await Promise.all([
    fetchJsonWithRetry(`${AIR_HOST}?${airParams.toString()}`, fetchImpl),
    fetchJsonWithRetry(`${WEATHER_HOST}?${wxParams.toString()}`, fetchImpl),
  ]);

  const air = OpenMeteoAirResponseSchema.parse(rawAir);
  const weather = OpenMeteoWeatherResponseSchema.parse(rawWx);
  const hours = buildHours(air, weather);

  let nowIndex = Math.min(hours.length - 1, 24);
  if (air.current?.time) {
    const prefix = air.current.time.slice(0, 13);
    const found = hours.findIndex((h) => h.t.startsWith(prefix));
    if (found >= 0) nowIndex = found;
  }

  const ctx: AirContext = {
    place,
    source: "live",
    dataNote: detectDataNote(place),
    fetchedAt: new Date(nowMs).toISOString(),
    hours,
    nowIndex,
  };

  contextCache.set(key, { expiresAt: nowMs + CACHE_TTL_MS, value: ctx });
  return ctx;
}

export { applyCalibration } from "./calibrate";
