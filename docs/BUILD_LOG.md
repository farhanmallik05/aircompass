# Build Log — AirCompass

Every ticket is logged with the scope, artifacts produced, manual adjustments, and verification results.

## T01 — Gate G0 Scaffold & Cross-Platform CSP Baseline

- **Scope:** Copied `aircompass-day1-kit` into `aircompass/`, installed `zod`, `@google/genai`, `@vitest/coverage-v8`, `fast-check`, `@axe-core/playwright`, `prettier`, `tsx`, and `eslint-plugin-jsx-a11y`. Added `.gitattributes`, `.env.example`, `LICENSE`, `vitest.config.ts`, `eslint.config.mjs`, and `docs/ADR/0001..0005.md`.
- **Fixes:** Resolved Windows URL/space path bug in `scripts/oracle.mjs` via `fileURLToPath` + CRLF normalization; updated `playwright.config.ts` local binary fallback while preserving default CI Playwright Chromium; fixed `package.json` `typecheck` to run `next typegen && tsc --noEmit`.
- **Verification:** `oracle:check` green, `npm audit --omit=dev --audit-level=high` 0 vulnerabilities, production `npm run csp:smoke` 6/6 green.

## T02 — Frozen Domain Contracts, Strict Schemas, & Bilingual i18n

- **Produced:** `src/lib/types.ts`, `src/lib/schemas.ts`, `src/i18n/en.json`, `src/i18n/hi.json`, `tests/unit/i18n-parity.test.ts`.
- **Verification:** TypeScript strict compilation and automated EN/HI key + placeholder + Latin-digit parity checks passed.

## T03–T09 — Deterministic Physics, Exposure, Emissions, Windows, & Ranking Engine

- **Produced:** `bands.ts`, `naqi.ts`, `sensitivity.ts`, `schedule.ts`, `exposure.ts`, `emissions.ts`, `window.ts`, `catalog.ts` (26 actions), `myths.ts` (4 cards), `impact.ts`, `select.ts`, `data/guidance.json`, `data/emission-factors.json`.
- **Manual adjustments:** Updated `shift_exercise_to_best_window` in `catalog.ts` so sensitive households (`children > 0`, `seniors > 0`, or health conditions) at `L >= 3` never receive outdoor exercise suggestions (`eval` I3 invariant). Completed all three `it.todo` golden tests (`T05`, `T06`, `T07`) and added `tests/property/invariants.test.ts` (including severe-day ordering and transit trade-off verification).

## T10–T11 — Data Providers, Recorded Severe-Day Fixture, & `/api/context`

- **Produced:** `src/lib/providers/{openMeteo,geocode,demo,calibrate}.ts`, `scripts/record-fixture.ts`, `data/demo-day.json` (live Open-Meteo Greater Noida 72h window `2026-11-12`, mean `166.1 µg/m³`), `src/lib/security/{rateLimit,sanitize,headers}.ts`, `src/app/api/context/route.ts`.
- **CSP Fix discovered by `csp:smoke`:** Separated `applyCalibration` into `src/lib/providers/calibrate.ts` so client components never import `zod` v4 (`new Function` JIT), eliminating a `script-src` `eval` CSP violation in production builds.

## T12, T13, T17, T20 — Gemini Structured Output, Repair/Fallback, Streaming Chat, & 12-Persona Evals

- **Produced:** `prompts/{planner.system.md,chat.system.md,planner.fewshot.json}`, `src/lib/llm/{client,gemini,prompt,tokens,fallback,tools,planner,chat}.ts`, `src/app/api/{plan,chat}/route.ts`, `evals/{personas.json,run.ts,fixtures/*.json,REPORT.md}`, `tests/api/routes.test.ts`, `tests/security/api-security.test.ts`.
- **Live Gemini discoveries:** Configured `httpOptions: { apiVersion: "v1beta" }` for `systemInstruction`, simplified `z.toJSONSchema` serving bounds (`simplifySchemaForGemini`) while preserving full server-side Zod validation, enabled `ThinkingLevel.MINIMAL` for Gemini 3.x models to prevent JSON truncation, and aligned `fewshotReference` summary tokens to global tokens only.
- **Verification:** `evals/run.ts` passes all 12 personas (`I1–I12`) deterministically on `ai` outcomes; mocked contract tests pass all malformed upstream/LLM failure paths.

## T14–T19, T21–T22 — Accessible Bilingual UI, Community Brief, E2E + Axe, & Docs

- **Produced:** Self-hosted Noto Sans & Noto Sans Devanagari `.woff2` (`next/font/local`), `src/components/{AppShell,AirCompassProvider,AirChart,Icons,SetupForm,TodayView,PlanView,ChatDrawer,ImpactView,BriefView}.tsx`, `src/app/{page,plan/page,impact/page,brief/page}.tsx`, `tests/e2e/flows-and-a11y.spec.ts`, `tests/security/bundle-secrets.test.ts`, `scripts/{build-sample,measure,check-chars,check-repo-size}.ts`.
- **Accessibility & CSP fixes verified by Playwright + Axe:** Replaced `dark:bg-teal-600` (`3.66:1`) with `dark:bg-teal-300 dark:text-slate-950` (`> 12:1` contrast), restricted `<h1>` focus shift to subsequent route transitions so initial `Tab` hits `"Skip to main content"`, and verified 0 Axe violations across all 16 `route × lang × colorScheme` audits + 320px reflow.

## T23 — Mutation Hardening, README Evidence, & Public Repo Readiness

- **Produced:** `tests/unit/{mutation-killers,mutation-killers-2}.test.ts`, expanded boundary specs in `tests/unit/engine-coverage.test.ts` and `tests/security/guard.test.ts`, `docs/assets/aircompass-today.png`, judging `README.md`, and `docs/{CHALLENGE,SCORE_LOG,SUBMISSION}.md`.
- **Refinement:** Removed a redundant `commuteDaysPerWeek < 7` outer guard in `src/lib/engine/schedule.ts` and cleaned JSON API error formatting in `scripts/measure.ts`.
- **Verification:** `npm run verify` green (`143/143` tests, `88.26%` branches, `91.61%` functions, `12/12` evals, Next 16.4.6 build), `npm run mutate` **91.20 %** overall (`90.93 %` engine, `94.55 %` guard), `npm run test:e2e` **9/9** green (incl. `6/6` CSP gate & Axe WCAG 2.2 AA), `npm audit --omit=dev --audit-level=high` 0 vulnerabilities. Public GitHub repository live at `https://github.com/farhanmallik05/aircompass`.
