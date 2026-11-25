# ADR 0001 — Code Decides, LLM Words

- **Status:** Accepted (25 Nov 2026)
- **Context:** Health, indoor PM2.5, exposure, and emissions figures cannot tolerate generative hallucination or arithmetic drift, yet households need tailored reasoning across competing actions, member vulnerabilities, and bilingual English/Hindi phrasing.
- **Decision:** All concentrations, AQI/NAQI indices, exposure deltas, uncertainty ranges, and CO₂e numbers are computed exclusively by pure deterministic functions in `src/lib/engine/`. Gemini selects, prioritizes, explains trade-offs, and phrases advice in English or Hindi; a deterministic engine fallback (`src/lib/llm/fallback.ts`) guarantees a valid plan whenever Gemini fails, is rate-limited, or has no API key.
- **Consequences:** Every number displayed is reproducible, unit-testable against an independent oracle (`scripts/oracle.mjs`), and never alters on model hiccups.
