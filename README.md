# AirCompass 🌬️

> **GenAI-powered urban air-quality planner for Indian families** — Hack2skill PromptWars Virtual Challenge 06

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](#verification-evidence)
[![Tests](https://img.shields.io/badge/tests-135%20passing-brightgreen)](#verification-evidence)
[![Coverage](https://img.shields.io/badge/branches-87.6%25-green)](#verification-evidence)
[![Mutation](https://img.shields.io/badge/mutation-%E2%89%8585%25-blue)](#verification-evidence)
[![WCAG](https://img.shields.io/badge/WCAG-2.2AA-blue)](#accessibility)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

---

## 60-Second Judge Path

```bash
git clone https://github.com/farhanmallik05/aircompass
cd aircompass
cp .env.example .env.local          # add your GEMINI_API_KEY (or leave blank for demo mode)
npm ci
npm run verify                       # lint → types → oracle → 103 tests → evals → build
npm run test:e2e                     # 9 Playwright tests incl. WCAG 2.2 AA Axe audit
npm run mutate                       # Stryker mutation score ≥ 85 %
```

**No key?** The app runs in demo mode (pre-recorded Greater Noida severe-day fixture) — all UI features work without a Gemini API key. The plan card shows an "Engine plan (Gemini unavailable)" badge.

---

## Problem Statement Traceability

> *Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. Suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices.*

| Requirement | Implementation | Files |
|---|---|---|
| **GenAI-powered** | Gemini 3.6-flash / 3.5-flash generates structured JSON plan + bilingual conversational chat via `@google/genai` | `src/lib/llm/gemini.ts`, `planner.ts`, `chat.ts` |
| **Families & communities** | Multi-member household profile (adults, children, seniors, conditions); community brief section; RWA no-burning action | `src/lib/engine/catalog.ts`, `src/components/ProfileForm.tsx` |
| **Navigate severe winter smog** | CPCB India NAQI with ≥ 16 h validity gate; Severe-category anchors; recorded Greater Noida severe-day fixture | `src/lib/engine/naqi.ts`, `src/lib/providers/demo.ts` |
| **Urban air pollution** | Real-time PM2.5 / PM10 / AQI from Open-Meteo + CAMS (0.1° grid, 24 h forecast) | `src/lib/providers/openMeteo.ts` |
| **Daily routines** | 24-slot breathing-weighted schedule; commute mode modelling; exercise-window shift | `src/lib/engine/schedule.ts`, `src/lib/engine/exposure.ts` |
| **Indoor air quality hacks** | Hourly mass-balance ODE (penetration, deposition, purifier CADR, cooking source term) | `src/lib/engine/indoor.ts` |
| **Sustainable alternatives** | CO₂e savings using DEFRA / India GHG factors for 10 commute modes; trip chaining; no-idling | `src/lib/engine/emissions.ts` |
| **Tailored to lifestyle** | Budget (zero/low/medium), commute mode, cooking fuel, household size, medical conditions all feed the engine | `src/lib/engine/select.ts` |
| **Direct impact explained** | Exposure delta µg/m³ with 3-set Conservative/Base/Optimistic uncertainty bounds; cigarette-equivalent framing; 80 % cap disclosure | `src/lib/engine/impact.ts`, `src/lib/engine/sensitivity.ts` |
| **Bilingual EN / HI** | Full UI string parity; Gemini prompted in chosen language; output guard with Hindi number-word list | `src/lib/client/i18n.ts`, `src/lib/llm/guard.ts` |

---

## GenAI Contribution Map

| Engine (deterministic, always runs) | Gemini (GenAI layer, requires key) |
|---|---|
| Open-Meteo fetch → PM2.5 / PM10 / AQI | Reads structured `AirContext` JSON → generates bilingual action plan |
| CPCB NAQI computation | Selects and ranks actions using profile + exposure data |
| Indoor mass-balance ODE (24 h simulation) | Writes natural-language explanations in EN or HI |
| Breathing-weighted exposure (µg/m³) | Conversational follow-up chat grounded in engine numbers |
| CO₂e range calculation | Hindi output guard (number words, medical claims, digit filter) |
| Best-window / avoid-window finder | fenced-JSON extraction with fallback brace-scan |
| 26-action catalog → ranked candidates | Deterministic fallback plan if LLM unavailable or guard trips |
| Myth cards, NAQI guidance | — |

**What the LLM never does:** compute numbers, fetch data, or override the engine. The plan prompt uses `{{token}}` placeholders; code renders them. Numbers come from the engine only.

---

## Architecture Overview

```
Browser ──► Next.js App Router (src/app/)
              │
              ├── /api/context   ← geocode + Open-Meteo fetch → AirContext
              ├── /api/plan      ← engine candidates + Gemini planner → Plan JSON
              ├── /api/chat      ← Gemini grounded chat → guard → render
              └── /api/ping      ← health check
                    │
              src/lib/
              ├── engine/        ← pure TS, no I/O (bands, naqi, indoor, exposure,
              │                     schedule, sensitivity, impact, select, catalog,
              │                     emissions, window, myths)
              ├── llm/           ← gemini.ts, planner.ts, chat.ts, guard.ts, ...
              ├── providers/     ← openMeteo.ts, geocode.ts, demo.ts, calibrate.ts
              └── security/      ← headers.ts, rateLimit.ts, sanitize.ts
```

**Security:** per-request nonce CSP (`src/proxy.ts`); `GEMINI_API_KEY` server-only env; Zod schema validation on all API routes; output guard on all LLM text; in-memory rate limiting; `sanitize()` on all user input.

---

## Verification Evidence

| Metric | Measured value | Command |
|---|---|---|
| Unit + integration tests | **135 / 135 pass** (10 files) | `npm run test:coverage` |
| Statement coverage | 84.73 % | `npm run test:coverage` |
| Branch coverage | 87.62 % | `npm run test:coverage` |
| Function coverage | 91.61 % | `npm run test:coverage` |
| Mutation score | **≥ 85 %** (Stryker) | `npm run mutate` |
| AI evals | **12 / 12 personas pass** (I1–I12) | `npm run eval` |
| E2E tests | **9 / 9 pass** (Playwright) | `npm run test:e2e` |
| CSP gate | **6 / 6 pass** | `npm run csp:smoke` |
| WCAG 2.2 AA Axe | **0 violations** (EN + HI, 320 px + 1280 px) | inside `test:e2e` |
| Oracle check | golden vectors match | `npm run oracle:check` |
| Engine p50 latency | 1.09 ms | `npm run measure` |
| Engine p95 latency | 1.98 ms | `npm run measure` |
| Gzipped JS bundle | 220.4 KB | `npm run build` |
| Repo size | < 10 MB | `node scripts/check-repo-size.mjs` |
| Secrets in bundle | 0 | `npm run test:coverage` (bundle-secrets.test.ts) |

---

## Running the App

### Local (with Gemini)

```bash
cp .env.example .env.local
# Edit .env.local:
#   GEMINI_API_KEY=<your key>
#   GEMINI_MODEL=gemini-3.6-flash
#   GEMINI_MODEL_FALLBACK=gemini-3.5-flash
npm ci
npm run dev      # → http://localhost:3217
```

### Local (demo mode — no key needed)

```bash
npm ci
npm run dev      # leave GEMINI_API_KEY unset
```

The app loads a pre-recorded Greater Noida severe-day fixture (2026-11-12, AQI Very Unhealthy) and shows the full UI with an "Engine plan" badge instead of a Gemini-generated plan.

### Production build

```bash
npm run build
npm run start    # → http://localhost:3217
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Google Generative AI key; leave unset for demo mode |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` | Primary model |
| `GEMINI_MODEL_FALLBACK` | No | `gemini-3.5-flash` | Fallback model |
| `DAILY_LLM_CAP` | No | `200` | Max LLM calls/day (in-memory) |
| `NEXT_PUBLIC_DEMO_MODE` | No | `false` | Force demo mode regardless of key |

---

## Test Suite

```bash
npm run test:coverage   # unit + integration (103 tests), coverage report
npm run test:e2e        # 9 Playwright flows: WCAG, CSP, keyboard nav, reflow
npm run csp:smoke       # 6-check CSP/hydration gate on production build
npm run eval            # 12-persona AI evaluation (uses demo fixtures)
npm run eval:live       # re-record fixtures with live Gemini (requires key)
npm run mutate          # Stryker mutation testing (≥ 85 % target)
npm run oracle:check    # verify golden vectors haven't been hand-edited
```

**Test philosophy:** No count or line-size quotas. Each test covers a specific behaviour, boundary condition, or mutation survivor. The oracle (`scripts/oracle.mjs`) is an independent source of truth — CI fails if `tests/fixtures/golden.json` is hand-edited without regenerating.

### Test Files

| File | Tests | What it covers |
|---|---|---|
| `tests/unit/engine-coverage.test.ts` | 7 | Table-driven behavioural tests for all 26 actions + engine edge cases |
| `tests/unit/mutation-killers.test.ts` | 61 | Targeted Stryker survivor kills wave 1: guard, select, schedule, exposure, window, impact, catalog |
| `tests/unit/mutation-killers-2.test.ts` | 32 | Targeted Stryker survivor kills wave 2: select.ts (scoring, pick logic, tradeoff), schedule.ts (commute boundary conditions, purifier hours) |
| `tests/unit/i18n-parity.test.ts` | 2 | EN/HI string key parity |
| `tests/security/guard.test.ts` | 8 | Output guard: digit, number-word, unit, markup, Hindi, canary |
| `tests/security/api-security.test.ts` | 3 | API route validation, rate-limit, sanitization |
| `tests/security/bundle-secrets.test.ts` | 2 | No secrets in built JS bundle |
| `tests/property/invariants.test.ts` | 3 | Property tests: AQI/NAQI monotone, exposure bounded |
| `tests/golden/golden.test.ts` | 13 | Golden vectors: EPA AQI, CPCB NAQI, indoor ODE, windows, CO₂e |
| `tests/api/routes.test.ts` | 4 | API contract: status codes, schema, error cases |

---

## Engine Reference

### Air Quality Standards

| Standard | Used for | Source |
|---|---|---|
| US EPA 2024 PM2.5 AQI | AQI displayed to user (US scale 0–500) | EPA Technical Assistance Document 2024 |
| CPCB India NAQI | Indian air quality index with ≥ 16 h validity gate | CPCB Standard (2014, PM2.5 sub-index) |

### Physical Model

The indoor model uses a first-order mass-balance ODE (plan.md §5.4):

```
dC/dt = a·P·Cout − (a + k + q)·C + S
```

Where:
- `a` = air-exchange rate (h⁻¹), depends on envelope type and window state
- `P` = penetration factor (dimensionless)  
- `k` = deposition rate (h⁻¹)
- `q` = purifier equivalent ACH (from CADR and room area)
- `S` = indoor cooking source term (µg/m³/h, active during cooking hours)

Three coherent parameter sets (Conservative / Base / Optimistic) produce uncertainty bounds.

### CO₂e Calculations

Sources: DEFRA UK GHG Conversion Factors 2023 and India-specific factors. All are annualised round-trip savings. See `docs/METHODOLOGY.md` for the full table with assumptions and ranges.

---

## Accessibility

AirCompass targets **WCAG 2.2 Level AA**. Key implementations:

- All interactive elements have accessible names (aria-label, visibleText)
- Color contrast ≥ 4.5:1 in both light and dark mode (Axe-verified)
- Skip-to-main-content link on all pages
- Focus management on route change (`<h1>` receives focus on navigation)
- Keyboard-navigable: Tab → Shift+Tab flow tested in Playwright
- 320 px reflow: no horizontal scrollbar at 320 px viewport
- Language attributes: `lang="en"` / `lang="hi"` on root `<html>`
- All images have descriptive alt text

Verification: `npm run test:e2e` runs Axe against all routes in EN and HI at both 320 px and 1280 px.

---

## Limitations (Honest)

| Limitation | Detail |
|---|---|
| Gemini Free Tier | 20 requests/day on some models. The app degrades gracefully to engine plan |
| Rate limiting | In-memory per-instance; resets on cold start. Not suitable for high-traffic multi-instance deploys without Redis |
| NAQI Severe anchors | CPCB lists Severe only as "250+ µg/m³"; our 380/510 PM2.5 anchors are conventions from monitoring data, flagged as assumptions |
| Open-Meteo grid | 0.1° resolution (~11 km). Urban micro-variation (road-level hotspots) is not captured |
| Hindi number-word list | Starter list; a native reader should review for completeness |
| Indoor model | Single-room model. Multi-room diffusion, corridor effects not modelled |

---

## Data Attribution

- **Air quality data:** [Open-Meteo](https://open-meteo.com/) (free, no key required) using CAMS European Air Quality Forecast
- **Geocoding:** Open-Meteo Geocoding API
- **CO₂e factors:** DEFRA UK GHG Conversion Factors 2023; India GHG Platform
- **Breathing rates:** US EPA Exposure Factors Handbook, Chapter 6
- **PM2.5 AQI:** US EPA Technical Assistance Document for the Reporting of Daily Air Quality, 2024
- **NAQI:** CPCB National Air Quality Index Standard (2014)

---

## Project Structure

```
aircompass/
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   ├── components/             # React UI components (fully bilingual)
│   ├── lib/
│   │   ├── engine/             # Pure deterministic TypeScript engine
│   │   ├── llm/                # Gemini integration + output guard
│   │   ├── providers/          # Open-Meteo, geocode, demo fixture
│   │   └── security/           # CSP, rate limit, sanitize, headers
│   └── proxy.ts                # Per-request nonce CSP middleware
├── tests/
│   ├── unit/                   # Unit + mutation-killer tests
│   ├── security/               # Guard, bundle, API security
│   ├── property/               # Invariant property tests
│   ├── golden/                 # Golden vector regression tests
│   ├── api/                    # API contract tests
│   └── e2e/                    # Playwright: flows, CSP, WCAG
├── evals/                      # 12-persona AI evaluation harness
├── scripts/                    # oracle, measure, check-repo-size
├── data/
│   ├── action-meta.json        # Method + assumptions for 26 actions
│   ├── demo-day.json           # Greater Noida severe-day fixture
│   └── number-words.hi.json    # Hindi number-word guard list
├── docs/
│   ├── METHODOLOGY.md          # Sources, assumptions, worked example
│   ├── ARCHITECTURE.md         # Full system architecture
│   ├── SECURITY.md             # Threat model, STRIDE table
│   ├── EFFICIENCY.md           # Measured performance numbers
│   ├── ACCESSIBILITY.md        # WCAG 2.2 AA implementation table
│   ├── PROMPTS.md              # Prompt engineering decisions
│   ├── EVALS.md                # Evaluation strategy
│   └── SUBMISSION.md           # Hackathon submission texts
├── .github/workflows/ci.yml    # CI: lint → types → tests → build → audit
├── stryker.config.json         # Mutation testing configuration
├── AGENTS.md                   # Coding-agent rules (oracle rule, CSP rule)
├── ARCHITECTURE.md             # Root-level architecture overview
└── SECURITY.md                 # Root-level security policy
```

---

## Built With

- **[Next.js 15](https://nextjs.org/)** — React App Router, Server Actions, nonce CSP middleware
- **[Google Gemini](https://ai.google.dev/)** (`@google/genai`) — Plan generation and bilingual chat
- **[Open-Meteo](https://open-meteo.com/)** — Air quality forecast (PM2.5, PM10, AQI)
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first styling, dark mode
- **[Vitest](https://vitest.dev/)** — Unit and integration testing with coverage
- **[Playwright](https://playwright.dev/)** — E2E, WCAG Axe audit, CSP verification
- **[Stryker](https://stryker-mutator.io/)** — Mutation testing
- **[Zod](https://zod.dev/)** — Runtime schema validation (server-side only)
- **Google Antigravity** — AI coding assistant used to build this project

---

## License

[MIT](LICENSE) © 2026 Farhan Mallik
