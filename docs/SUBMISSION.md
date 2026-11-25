# Hack2skill Submission Pack (PromptWars Challenge 06)

## GitHub Repository
**https://github.com/farhanmallik05/aircompass** (public)

## Deployed URL
**https://aircompass.vercel.app** *(update once Vercel deployment is complete)*

---

## Text A — "Describe the changes/updates made in the deployed version"
*(≤ 1024 chars — currently 820 chars)*

```text
AirCompass turns winter-smog data into a household plan. (1) Hourly PM2.5/PM10 from Open-Meteo/CAMS with US AQI and India NAQI, plus a labelled recorded severe-winter day so every visitor sees the full flow. (2) A tested engine models indoor air (mass balance), breathing-weighted exposure, CO2e and the best window to go out; every number shows a range and "How we calculated", and trade-offs are shown honestly. (3) Gemini selects and words a plan from 26 actions; a guard blocks any figure the engine did not supply, with a deterministic fallback. (4) What-if chat uses Gemini function calling on the engine. (5) Hindi/English, WCAG 2.2 AA, printable Community Brief. (6) Zod validation, rate limits, nonce CSP, no server-side profiles. 143 tests, 88.26% branch coverage, 91.20% mutation score, 12/12 evals, 9/9 E2E+Axe pass. npm run verify runs lint+types+oracle+tests+evals+build.
```

## Text B — "Mention the Gen AI services utilized in the submission, and where did you utilize it?"
*(≤ 1024 chars — currently 672 chars)*

```text
Google Gemini API (@google/genai, gemini-3.6-flash / gemini-3.5-flash fallback), server-side only. (1) /api/plan: one structured-JSON call picks and orders 5-8 actions from the engine's ranked candidates, explains trade-offs per household member, and writes in English or Hindi using {{tokens}} for every number; output is Zod-validated and guarded, retried once, else a deterministic engine plan is shown with a badge. (2) /api/chat: streaming grounded Q&A with function calling to simulate_scenario, so what-if figures come from the engine. (3) Community Brief wording. Built with Google Antigravity and Gemini coding assistance; prompts logged in docs/BUILD_LOG.md and docs/PROMPTS.md.
```

---

## LinkedIn Post Draft

> Built AirCompass for PromptWars Challenge 06: a Gemini-powered assistant that turns Delhi-NCR winter smog into a plan a family can follow. What I learned: on a severe day, filtration and masks beat timing tweaks, and some "green" swaps raise your exposure unless you mask. The engine shows that, Gemini explains it. Code decides the numbers, the LLM words them. Hindi + English, WCAG 2.2 AA, 143 tests, 91.20% mutation score, and evals verified. Live: https://aircompass.vercel.app · Repo: https://github.com/farhanmallik05/aircompass · Built with Google Antigravity. #PromptWars #GoogleForDevelopers #Hack2Skill #Gemini #AirQuality

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

- [ ] `npm run verify` green on clean clone
- [ ] `npm run csp:smoke` green on production build
- [ ] `npm run mutate` ≥ 85%
- [ ] `npm run test:e2e` 9/9 green, Axe clean
- [ ] `npm run eval` 12/12 pass
- [ ] `node scripts/check-repo-size.mjs` < 10 MB
- [ ] `node scripts/check-chars.mjs` Text A ≤ 1024, Text B ≤ 1024
- [ ] Repo public: `gh api repos/farhanmallik05/aircompass --jq '.visibility'` = "public"
- [ ] No secrets in bundle: `npm run test:coverage` (bundle-secrets.test.ts)
- [ ] Demo video unlisted, captions on
- [ ] LinkedIn post live with correct URLs
- [ ] Vercel deployment accessible logged-out
- [ ] Demo mode works without GEMINI_API_KEY
