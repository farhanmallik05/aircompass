# Efficiency & Performance Measurements

Measured on **2026-11-26T12:26:12.969Z** (Node v24.19.0, win32 x64).

## Measured Metrics

| Metric | Result | Target / Budget |
|---|---|---|
| Deterministic engine (`buildPlanFacts`, 200 runs) | p50: **1.5 ms**, p95: **2.39 ms** | < 5 ms |
| Fallback planner pipeline (20 runs) | p50: **1.58 ms**, p95: **2.02 ms** | < 10 ms |
| Live Gemini `generatePlanJson` | **Skipped due to transient API error (HTTP 503 UNAVAILABLE: This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.)** | 1 call (< 12 s timeout) |
| Compiled `.next/static` JS (total gzipped across all chunks) | **228.5 KB** | No chart lib, self-hosted fonts |
| Compiled `.next/static` total (raw / gzip) | 918.9 KB / 365.3 KB | Compact asset footprint |

## Architectural Efficiency Tactics

- **Single structured LLM call per plan:** Compact 14-candidate JSON payload + static cache-friendly system prompt prefix + `maxOutputTokens: 1600` + minimal thinking (`ThinkingLevel.MINIMAL` on Gemini 3.x, `thinkingBudget: 0` on Gemini 2.5).
- **Parallel upstream fetching + 1 h cache:** Air quality and weather endpoints execute via `Promise.all` with `0.1°` lat/lon cache key (`revalidate: 3600`).
- **Zero client-side chart bundles:** 24-hour pollution strips use native inline SVG presentation attributes + `<meter>`, saving JS parse/hydration cost and respecting strict nonce CSP.
- **Zero-round-trip What-If simulator:** `/impact` computes exposure and community CO2e directly in browser memory using the pure TypeScript engine.
- **Nonce CSP trade-off:** Every document page calls `await connection()` to generate a fresh per-request CSP nonce (preventing stale cached HTML nonces per ADR 0005), trading edge HTML caching for strict XSS protection while static JS/CSS chunks remain edge-cached.
