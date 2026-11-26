#!/usr/bin/env node
/**
 * INDEPENDENT ORACLE. Written without importing anything from src/. It is the source of truth for expected
 * numbers. Tests read tests/fixtures/golden.json; they must never recompute expectations with product code.
 *
 *   node scripts/oracle.mjs           regenerate tests/fixtures/golden.json (a human does this, on purpose)
 *   node scripts/oracle.mjs --check   CI: fail if golden.json differs from what this script produces
 *
 * Sources (verified 25 Nov 2026):
 *  - EPA AQI, 2024 revision, 40 CFR Part 58 App. G: PM2.5 truncated to 0.1 ug/m3; 301-500 is ONE bracket (225.5-325.4).
 *  - CPCB NAQI table: PM2.5 0-30/31-60/61-90/91-120/121-250/250+; PM10 0-50/51-100/101-250/251-350/351-430/430+.
 *    CPCB gives NO upper anchor for "Severe" (250+). 380 (PM2.5) and 510 (PM10) are CONVENTIONS from common
 *    implementations, flagged `assumption: true` below. CPCB worked example: PM2.5 = 150 -> ~323.
 *  - Indoor model, exposure identity, window finder, CO2e: this repo's METHODOLOGY (docs/METHODOLOGY.md).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EPA = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];
const aqi = (c) => {
  const t = Math.floor(c * 10 + 1e-9) / 10;
  for (const [cl, ch, il, ih] of EPA)
    if (t <= ch) return Math.round(((ih - il) / (ch - cl)) * (t - cl) + il);
  return 500;
};
const N25 = [
  [0, 30, 0, 50],
  [31, 60, 51, 100],
  [61, 90, 101, 200],
  [91, 120, 201, 300],
  [121, 250, 301, 400],
  [251, 380, 401, 500],
];
const N10 = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 510, 401, 500],
];
const sub = (T, c) => {
  const x = Math.round(c);
  for (const [cl, ch, il, ih] of T)
    if (x <= ch) return Math.round(il + ((x - cl) * (ih - il)) / (ch - cl));
  return 500;
};
const cat = (i) => {
  if (i <= 50) return "Good";
  if (i <= 100) return "Satisfactory";
  if (i <= 200) return "Moderate";
  if (i <= 300) return "Poor";
  if (i <= 400) return "Very Poor";
  return "Severe";
};
const overall = (p25, p10) => {
  const a = sub(N25, p25),
    b = p10 === undefined ? -1 : sub(N10, p10);
  const index = Math.max(a, b);
  return { index, category: cat(index), dominant: b > a ? "pm10" : "pm25" };
};
const P = 0.8,
  K = 0.3;
const step = (c0, cout, a, q = 0, S = 0) => {
  const l = a + K + q,
    css = (P * a * cout + S) / l,
    d = Math.exp(-l);
  return { cSS: css, cEnd: css + (c0 - css) * d, cMean: css + ((c0 - css) * (1 - d)) / l };
};
const qOf = (cadr, area, derate = 0.5) => (derate * cadr) / (area * 2.7);
const r6 = (x) => Math.round(x * 1e6) / 1e6;

// Synthetic severe day (NOT real data), outdoor PM2.5 by clock hour 0..23
const DAY = [
  260, 270, 280, 290, 300, 310, 300, 280, 240, 200, 170, 150, 140, 135, 140, 155, 185, 230, 270,
  290, 300, 290, 280, 270,
];
const best = () => {
  let b = null;
  for (let s = 8; s <= 18; s++) {
    const m = (DAY[s] + DAY[s + 1]) / 2;
    if (!b || m < b.mean) b = { start: s, end: s + 2, mean: m };
  }
  return b;
};
const avoid = () => {
  let b = null;
  for (let s = 0; s <= 21; s++) {
    const m = (DAY[s] + DAY[s + 1] + DAY[s + 2]) / 3;
    if (!b || m > b.mean) b = { start: s, end: s + 3, mean: r6(m) };
  }
  return b;
};

const EF = {
  car: 0.17,
  two_wheeler: 0.1,
  auto: 0.09,
  bus: 0.07,
  metro: 0.035,
  walk: 0,
  cycle: 0,
  wfh: 0,
};
const co2e = (kmOneWay, days, from, to) => r6(kmOneWay * 2 * days * 48 * (EF[from] - EF[to]));

const qH = r6(qOf(250, 15)),
  qD = r6(qOf(200, 15));
const golden = {
  generated_by: "scripts/oracle.mjs",
  note: "Do not edit by hand. Change the oracle, regenerate, review the diff in the PR.",
  epa_aqi_pm25: [
    0, 5, 9.0, 9.04, 9.1, 20, 35.4, 35.5, 55.4, 55.5, 60, 125.4, 125.5, 150, 225.4, 225.5, 230,
    325.4, 400,
  ].map((c) => ({ pm25: c, aqi: aqi(c) })),
  naqi_pm25: [0, 30, 31, 45, 60, 61, 75, 90, 100, 120, 121, 150, 155, 250]
    .map((c) => ({ pm25: c, index: sub(N25, c) }))
    .concat([251, 300, 380, 500].map((c) => ({ pm25: c, index: sub(N25, c), assumption: true }))),
  naqi_pm10: [0, 50, 51, 80, 100, 101, 180, 250, 251, 300, 350, 351, 400, 430]
    .map((c) => ({ pm10: c, index: sub(N10, c) }))
    .concat([431, 500].map((c) => ({ pm10: c, index: sub(N10, c), assumption: true }))),
  naqi_category_edges: [0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 500].map((i) => ({
    index: i,
    category: cat(i),
  })),
  naqi_overall: [
    [0, undefined],
    [75, undefined],
    [75, 180],
    [150, 100],
    [45, 300],
    [300, 100],
    [30, 50],
  ].map(([p25, p10]) => ({
    pm25: p25,
    ...(p10 === undefined ? {} : { pm10: p10 }),
    ...overall(p25, p10),
  })),
  naqi_cpcb_worked_example: {
    pm25: 150,
    cpcb_published_approx: 323,
    our_index: sub(N25, 150),
    tolerance: 1,
  },
  indoor_step: [
    { cStart: 100, cOut: 200, a: 0.7, q: 0, S: 0 },
    { cStart: 100, cOut: 200, a: 4.0, q: 0, S: 0 },
    { cStart: 100, cOut: 200, a: 0.7, q: r6(qH), S: 0 },
    { cStart: 20, cOut: 20, a: 0.7, q: 0, S: 10 },
  ].map((i) => {
    const r = step(i.cStart, i.cOut, i.a, i.q, i.S);
    return { ...i, cSS: r6(r.cSS), cEnd: r6(r.cEnd), cMean: r6(r.cMean) };
  }),
  purifier_q_15m2_room: { hepa_cadr250: r6(qH), diy_cadr200: r6(qD), derate: 0.5, ceiling_m: 2.7 },
  exposure_identity: {
    note: "Cout constant, always at home/indoors, windows shut, no purifier, no commute, no exercise: steady-state exposure = P*a*C/(a+k).",
    cOut: 200,
    a: 0.7,
    expected: r6((P * 0.7 * 200) / (0.7 + K)),
    with_hepa: r6((P * 0.7 * 200) / (0.7 + K + qH)),
  },
  best_window: {
    day: DAY,
    best: best(),
    avoid: avoid(),
    tie_rule: "earliest start",
  },
  co2e_kg_per_year: [
    { kmOneWay: 12, daysPerWeek: 5, from: "car", to: "metro" },
    { kmOneWay: 12, daysPerWeek: 5, from: "car", to: "bus" },
    { kmOneWay: 12, daysPerWeek: 5, from: "car", to: "wfh" },
  ].map((c) => ({ ...c, kg: co2e(c.kmOneWay, c.daysPerWeek, c.from, c.to) })),
  co2e_formula: "kmOneWay * 2 trips/day * daysPerWeek * 48 weeks * (EF_from - EF_to)",
};

const out = `${JSON.stringify(golden, null, 2)}\n`;
const path = fileURLToPath(new URL("../tests/fixtures/golden.json", import.meta.url));
if (process.argv.includes("--check")) {
  const disk = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (disk !== out) {
    console.error(
      "golden.json differs from oracle output. Do not hand-edit it; run `node scripts/oracle.mjs` and review the diff.",
    );
    process.exit(1);
  }
  console.log("golden.json matches oracle");
} else {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, out);
  console.log("wrote", path);
}
