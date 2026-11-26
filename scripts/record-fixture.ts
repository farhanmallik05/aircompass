#!/usr/bin/env tsx
/**
 * Records a 72-hour severe winter smog window for Greater Noida from Open-Meteo's past_days=14 archive.
 * If Open-Meteo is unreachable, writes an explicit "illustrative" synthetic fixture (never falsely labelled "recorded").
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { aqiFromPm25 } from "../src/lib/engine/bands";
import { OpenMeteoAirResponseSchema, OpenMeteoWeatherResponseSchema } from "../src/lib/schemas";
import type { HourPoint } from "../src/lib/types";

const LAT = 28.4744;
const LON = 77.504;

function syntheticSevere72h(): HourPoint[] {
  const day = [
    260, 270, 280, 290, 300, 310, 300, 280, 240, 200, 170, 150, 140, 135, 140, 155, 185, 230, 270,
    290, 300, 290, 280, 270,
  ];
  const hours: HourPoint[] = [];
  for (let d = 0; d < 3; d++) {
    const dateStr = `2026-11-${String(18 + d).padStart(2, "0")}`;
    for (let h = 0; h < 24; h++) {
      const pm25 = day[h] ?? 200;
      hours.push({
        t: `${dateStr}T${String(h).padStart(2, "0")}:00`,
        pm25,
        pm10: Math.round(pm25 * 1.4),
        usAqi: aqiFromPm25(pm25),
        tempC: h < 7 || h > 19 ? 12 : 21,
        rh: h < 8 ? 82 : 54,
        windKmh: h < 8 || h > 18 ? 4 : 9,
      });
    }
  }
  return hours;
}

function optionalMetric(val: number | null | undefined): number | undefined {
  return val !== null && val !== undefined ? val : undefined;
}

function extractArchiveHours(
  air: z.infer<typeof OpenMeteoAirResponseSchema>,
  wx: z.infer<typeof OpenMeteoWeatherResponseSchema>,
): HourPoint[] {
  const hours: HourPoint[] = [];
  for (let i = 0; i < air.hourly.time.length; i++) {
    const pm25 = air.hourly.pm2_5[i];
    if (pm25 === null || pm25 === undefined || !Number.isFinite(pm25)) continue;
    const pm10 = air.hourly.pm10[i] ?? pm25 * 1.4;
    const usAqi = air.hourly.us_aqi[i] ?? aqiFromPm25(pm25);
    const tempC = optionalMetric(wx.hourly.temperature_2m[i]);
    const rh = optionalMetric(wx.hourly.relative_humidity_2m[i]);
    const windKmh = optionalMetric(wx.hourly.wind_speed_10m[i]);
    hours.push({
      t: air.hourly.time[i],
      pm25: Math.round(pm25 * 10) / 10,
      pm10: Math.round(pm10 * 10) / 10,
      usAqi: Math.min(500, Math.round(usAqi)),
      ...(tempC !== undefined ? { tempC } : {}),
      ...(rh !== undefined ? { rh } : {}),
      ...(windKmh !== undefined ? { windKmh } : {}),
    });
  }
  return hours;
}

function pickHighestSmogWindow(hours: readonly HourPoint[]): {
  slice: HourPoint[];
  bestMean: number;
} {
  let bestStart = 0;
  let bestMean = -1;
  for (let s = 0; s <= hours.length - 72; s++) {
    if (!hours[s].t.endsWith("T00:00")) continue;
    let sum = 0;
    for (let k = 0; k < 72; k++) sum += hours[s + k].pm25;
    const m = sum / 72;
    if (m > bestMean) {
      bestMean = m;
      bestStart = s;
    }
  }
  return { slice: hours.slice(bestStart, bestStart + 72), bestMean };
}

async function main() {
  const outPath = fileURLToPath(new URL("../data/demo-day.json", import.meta.url));
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&hourly=pm2_5,pm10,nitrogen_dioxide,ozone,us_aqi&past_days=14&forecast_days=1&timezone=auto`;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&past_days=14&forecast_days=1&timezone=auto`;

  try {
    const [airRes, wxRes] = await Promise.all([
      fetch(airUrl, { signal: AbortSignal.timeout(10_000) }),
      fetch(wxUrl, { signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!airRes.ok || !wxRes.ok) throw new Error(`HTTP ${airRes.status}/${wxRes.status}`);

    const air = OpenMeteoAirResponseSchema.parse(await airRes.json());
    const wx = OpenMeteoWeatherResponseSchema.parse(await wxRes.json());
    const hours = extractArchiveHours(air, wx);
    if (hours.length < 72) throw new Error("Insufficient archive hours returned");

    const { slice, bestMean } = pickHighestSmogWindow(hours);
    const nowIndex = 24;
    const recordedDate = slice[nowIndex].t.slice(0, 10);
    const payload = {
      dataNote: "recorded",
      recordedDate,
      fetchedAt: new Date().toISOString(),
      nowIndex,
      hours: slice,
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(
      `Recorded Greater Noida 72h fixture (${recordedDate}, mean=${bestMean.toFixed(1)} ug/m3)`,
    );
  } catch (err) {
    console.warn("Open-Meteo unreachable, writing illustrative synthetic fixture:", err);
    const payload = {
      dataNote: "illustrative",
      recordedDate: "2026-11-19",
      fetchedAt: new Date().toISOString(),
      nowIndex: 24,
      hours: syntheticSevere72h(),
    };
    writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

void main();
