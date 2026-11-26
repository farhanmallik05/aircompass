# Methodology & Sources — AirCompass

All numeric indicators, ranges, and health bands shown in AirCompass originate from the deterministic engine (`src/lib/engine/`) and `scripts/oracle.mjs`.

## Sources & Starter Assumptions

| Quantity | Value / Range | Source / Convention | Verified On |
|---|---|---|---|
| US EPA PM2.5 AQI breakpoints | `0-9.0 / 9.1-35.4 / 35.5-55.4 / 55.5-125.4 / 125.5-225.4 / 225.5-325.4` (301–500 single bracket, truncated to `0.1 µg/m³`, capped 500) | US EPA 2024 Final PM NAAQS AQI Revision (40 CFR Part 58 App. G) | 2026-11-25 |
| India CPCB NAQI breakpoints | PM2.5 `0-30 / 31-60 / 61-90 / 91-120 / 121-250 / 250+`; PM10 `0-50 / ... / 430+`; ≥ 16 valid trailing hours | CPCB National Air Quality Index Technical Report (PM-based approximation) | 2026-11-25 |
| NAQI Severe upper anchors (`250+` / `430+`) | `380 µg/m³` (PM2.5) and `510 µg/m³` (PM10) | **Assumption / convention** (CPCB table states open-ended `250+`/`430+`); flagged `assumption: true` in `golden.json`; category `Severe` is primary | 2026-11-25 |
| WHO 24h PM2.5 guideline | `15 µg/m³` | WHO Global Air Quality Guidelines (2021) | 2026-11-25 |
| Forecast resolution | Europe: `~11 km` hourly (`CAMS Europe`); Rest of world incl. India: `~25–45 km` 3-hourly interpolated (`CAMS Global`) | Open-Meteo Air Quality API documentation (disclosed in UI badge) | 2026-11-25 |
| Inhalation weighting `v` | Sleep `0.8`, indoor rest `1.0`, walk `2.0`, cycle `3.0`, outdoor exercise `4.0`, indoor exercise `2.5` (assumption) | US EPA Exposure Factors Handbook Ch. 6 (short-term ventilation rates relative to rest) | 2026-11-25 |
| Indoor single-zone mass balance | `P` `0.8` (`0.7–0.9`), `k` `0.3` (`0.2–0.4 h⁻¹`), `a` sealed `0.3`, normal closed `0.7` (`0.5–1.0`), leaky `2.0`, open `4.0` | **Assumption + 3-parameter sensitivity range** (Conservative / Base / Optimistic) | 2026-11-25 |
| Purifier CADR & derate | HEPA `250 m³/h`, DIY box-fan `200 m³/h`, derate `0.5` (`0.3–0.7`), ceiling `2.7 m`, cap `80 %` | Conservative field-derated CADR assumption; single-zone well-mixed room | 2026-11-25 |
| Cooking PM2.5 source `S` | Biomass `60`, other `25`, LPG `10`, induction `0 µg/m³/h` at hours 07 & 19 (`cookVent` halves `S`) | **Assumption (±50 % sensitivity range)** | 2026-11-25 |
| N95 residual penetration | `0.2` base (`0.1–0.4` sensitivity range) for open-air slots only | **Assumption + range** accounting for real-world strap/nose-bridge fit | 2026-11-25 |
| Transport CO₂e factors | Car `0.17`, two-wheeler `0.10`, auto `0.09`, bus `0.07`, metro `0.035 kg CO₂e/pkm` (`48 wks/yr`, round trip) | UK DEFRA GHG Conversion Factors & India GHG Program Road Transport Emission Factors (mode ranges stored in `data/emission-factors.json`) | 2026-11-25 |
| Cigarette equivalence | `exposure / 22` | Berkeley Earth 24h PM2.5 rule of thumb (explicitly labelled not a clinical measure) | 2026-11-25 |

## Worked Example (Synthetic Severe Winter Day)

For `Golden DAY` (outdoor PM2.5 `135–310 µg/m³`, mean `239`), `15 m²` LPG room, normal windows, `12 km` commute:
- **Best 2h window (08:00–20:00):** `12:00–14:00` (`137.5 µg/m³`, still L4 `noGoodWindow = true` -> advise keeping windows shut).
- **Avoid 3h window:** `04:00–07:00` (`303.3 µg/m³`).
- **Action hierarchy:** Adding HEPA (`-55+ µg/m³`) or DIY filtration (`-48+ µg/m³`) and fitted N95 masks on open exposure vastly outperform timing tweaks (`~9–12 µg/m³`).
- **Honest trade-off:** Switching a `12 km` 5-day petrol car commute (`0.6 × Cout` cabin) to public bus (`1.0 × Cout`) saves `576 kg CO₂e/yr` while slightly **raising** unmasked breathing exposure; AirCompass surfaces this negative delta transparently and pairs it with a fitted N95 mask.

## Known Guard Gaps (`src/lib/llm/guard.ts`)

See `docs/PROMPTS.md` and `src/lib/llm/guard.ts` for guard enforcement details:
1. Letter-spaced words (`"f o r t y"`).
2. Languages outside English and Hindi.
3. Roman numerals (`"XIV"`).
4. Hindi compound number spellings outside `data/number-words.hi.json` (which remains flagged for periodic native-reader review).
5. Numberless qualitative exaggeration (`"completely eliminates smog"`).

These gaps are mitigated through structured JSON schema constraints, the 12-persona evaluation harness (`evals/`), and a corpus-first regression workflow (`tests/security/guard.corpus.json`).
