# Architecture — AirCompass

## Design Principle: Code Decides, LLM Words

AirCompass separates **deterministic physics & health computation** from **generative selection and multilingual explanation**:

1. **Data Layer (`src/lib/providers/`)**:
   - `openMeteo.ts`: parallel fetch of Open-Meteo Air Quality & Weather APIs with `0.1°` coordinate caching (`revalidate: 3600`), 5s timeout + 1 retry, Zod schema validation, strict host allow-list, and resolution tagging (`cams_europe_11km` vs `cams_global_25_45km`).
   - `geocode.ts`: Open-Meteo place search (`count=5`).
   - `demo.ts`: serves the labelled Greater Noida severe-winter-day fixture (`data/demo-day.json`).
2. **Deterministic Engine (`src/lib/engine/`)**:
   - `bands.ts`: US EPA 2024 PM2.5 AQI (`aqiFromPm25`, `levelOfPm25`), next-24h mean, and level guidance (`data/guidance.json`).
   - `naqi.ts`: CPCB India PM-based NAQI with trailing-24h `>= 16` valid hours sufficiency gate and documented Severe upper-anchor assumptions.
   - `indoor.ts` + `sensitivity.ts`: exact hourly analytical mass-balance solution (`dC/dt = P·a·Cout + S - (a + k + q)·C`) across Conservative, Base, and Optimistic parameter sets.
   - `schedule.ts` + `exposure.ts`: 24 hourly fractional sub-slots weighted by US EPA Exposure Factors Handbook Ch. 6 inhalation rates.
   - `emissions.ts`: round-trip annual CO2e calculations backed by `data/emission-factors.json` (DEFRA & India GHG Program ranges).
   - `window.ts`: cleanest 2h Go-out window (08:00–20:00) and worst 3h Avoid window with earliest tie-break and `< 24h` edge handling.
   - `catalog.ts` + `impact.ts` + `select.ts` + `myths.ts`: 26 household/community actions, 3-set uncertainty bounds, honest negative-delta trade-off preservation, budget/audience ranking, and 4 myth cards.
3. **LLM & Safety Layer (`src/lib/llm/`)**:
   - `client.ts` + `gemini.ts`: `@google/genai` behind an interface for offline unit/contract/eval mocking (`GEMINI_MODEL` + `GEMINI_MODEL_FALLBACK`).
   - `tokens.ts` + `guard.ts`: numbers-by-reference (`{{tokens}}`), NFKC + `\p{Cf}` normalization, EN/HI number-word detection, unit/markup/medical/canary blocking (`CANARY-7f3a91`), and script-level language verification.
   - `planner.ts` + `fallback.ts`: schema + guard + 1-shot repair + deterministic engine fallback (`outcome: "ai" | "repaired" | "fallback"`).
   - `tools.ts` + `chat.ts`: SSE streaming grounded Q&A calling `simulate_scenario` (max 2 rounds) and validated with `unfaithfulNumbers()`.
4. **Presentation & Security (`src/app/`, `src/components/`, `src/proxy.ts`, `src/lib/security/`)**:
   - Dynamic pages calling `await connection()` receive per-request nonce CSP from `src/proxy.ts` alongside static headers in `next.config.ts`.
   - Zero inline `style={{}}`, zero `dangerouslySetInnerHTML`, zero chart libraries, self-hosted Noto Sans / Devanagari `.woff2` fonts, `localStorage`-only profiles.

See `docs/ADR/0001..0005.md` for key architectural decision records.
