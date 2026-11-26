# Hack2skill Submission Pack (PromptWars Challenge 06)

## GitHub Repository
**https://github.com/farhanmallik05/aircompass** (public)

## Deployed URL
**https://aircompass-delta.vercel.app**

---

## Text A — "Describe the changes/updates made in the deployed version"
*(≤ 1024 chars — verified by `node scripts/check-chars.mjs`)*

```text
AirCompass turns winter-smog data into a household plan. (1) Hourly PM2.5/PM10 from Open-Meteo/CAMS with US AQI and India NAQI, plus a labelled recorded severe-winter day so every visitor sees the full flow. (2) A tested engine models indoor air (mass balance), breathing-weighted exposure, CO2e and best go-out window; every figure shows a range, "How we calculated", and honest trade-offs. (3) Gemini selects and words 26 actions; a guard blocks un-tokenised numbers with deterministic fallback. (4) What-if chat uses Gemini function calling on the engine. (5) Hindi/English, WCAG 2.2 AA tabs/forms, printable Community Brief. (6) Zod + localStorage schema validation, bounded rate limits, HSTS/CORP + nonce CSP. 158 tests, 96.74% stmts / 90.89% branches / 98.33% fn, 91.20% mutation, 12/12 evals, 10/10 E2E+Axe pass. npm run verify runs format+lint+types+oracle+tests+evals+build.
```

## Text B — "Mention the Gen AI services utilized in the submission, and where did you utilize it?"
*(≤ 1024 chars — currently 672 chars)*

```text
Google Gemini API (@google/genai, gemini-3.6-flash / gemini-3.5-flash fallback), server-side only. (1) /api/plan: one structured-JSON call picks and orders 5-8 actions from the engine's ranked candidates, explains trade-offs per household member, and writes in English or Hindi using {{tokens}} for every number; output is Zod-validated and guarded, retried once, else a deterministic engine plan is shown with a badge. (2) /api/chat: streaming grounded Q&A with function calling to simulate_scenario, so what-if figures come from the engine. (3) Community Brief wording. Built with Google Antigravity and Gemini coding assistance; prompts logged in docs/BUILD_LOG.md and docs/PROMPTS.md.
```

---

## LinkedIn Post Draft

> Built AirCompass for PromptWars Challenge 06: a Gemini-powered assistant that turns Delhi-NCR winter smog into a plan a family can follow. What I learned: on a severe day, filtration and masks beat timing tweaks, and some "green" swaps raise your exposure unless you mask. The engine shows that, Gemini explains it. Code decides the numbers, the LLM words them. Hindi + English, WCAG 2.2 AA, 158 tests (96.74% statement coverage), 91.20% mutation score, and evals verified. Live: https://aircompass-delta.vercel.app · Repo: https://github.com/farhanmallik05/aircompass · Built with Google Antigravity. #PromptWars #GoogleForDevelopers #Hack2Skill #Gemini #AirQuality

---

## Demo Video Script (≤ 3 min, 1080p, unlisted, captions on)

| Time | Shot |
|---|---|
| 0:00 | Hook: Today's level for Greater Noida on the labelled recorded severe winter smog day |
| 0:15 | One click: "Try a sample family" → Today screen, Go-out and Avoid windows |
| 0:40 | Plan tabs; expand "How we calculated" showing 3-set uncertainty range |
| 1:10 | Trade-off moment: commute swap cuts CO2e while raising exposure, paired with N95 mask |
| 1:30 | Impact what-if simulator: select HEPA purifier, numbers update instantly client-side |
| 1:50 | Grounded Chat: ask a what-if, show `simulate_scenario` engine tool call badge + reply |
| 2:10 | Hindi toggle + Community Brief print preview |
| 2:35 | Terminal: `npm run verify`, then `npm run mutate`, then `evals/REPORT.md`, and Axe/CSP gates |

---

## Vercel Deployment Steps

1. Go to https://vercel.com/new
2. Import `farhanmallik05/aircompass` from GitHub
3. Framework: **Next.js** (auto-detected)
4. Root directory: leave blank (repo root)
5. Add environment variables:
   ```
   GEMINI_API_KEY=<your key>
   GEMINI_MODEL=gemini-3.6-flash
   GEMINI_MODEL_FALLBACK=gemini-3.5-flash
   DAILY_LLM_CAP=200
   NEXT_PUBLIC_DEMO_MODE=false
   ```
6. Deploy to **Production** (not Preview — Preview may be login-protected)
7. Once live, run CSP check:
   ```powershell
   $env:BASE_URL="https://<project>.vercel.app"
   npx playwright test csp
   ```
8. Update this file with the live URL.

---

## Final Pre-Submission Checklist

- [x] `npm run verify` green on clean clone
- [x] `npm run csp:smoke` green on production build
- [x] `npm run mutate` ≥ 85% (91.20%)
- [x] `npm run test:e2e` 10/10 green, Axe clean
- [x] `npm run eval` 12/12 pass
- [x] `node scripts/check-repo-size.mjs` < 10 MB
- [x] `node scripts/check-chars.mjs` Text A ≤ 1024, Text B ≤ 1024
- [x] Repo public: `gh api repos/farhanmallik05/aircompass --jq '.visibility'` = "public"
- [x] No secrets in bundle: `npm run test:coverage` (bundle-secrets.test.ts)
- [ ] Demo video unlisted, captions on
- [ ] LinkedIn post live with correct URLs
- [ ] Vercel deployment accessible logged-out
- [ ] Demo mode works without GEMINI_API_KEY
