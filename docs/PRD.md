# Product Requirements Document (PRD) — AirCompass

## 1. Purpose

Families facing severe winter smog and urban air pollution lack practical, household-tailored guidance that translates hourly air-quality forecasts into safe routines, indoor filtration steps, and honest commute or fuel alternatives. AirCompass pairs a verified deterministic environmental/exposure engine with Google Gemini reasoning so every family sees **what to do, when to do it, what impact it makes (with uncertainty ranges), and what trade-offs exist**.

## 2. Target Users & Personas

- **Primary:** Urban families in high-smog regions (e.g., Delhi-NCR / Indo-Gangetic Plain) managing children, older adults, asthma/cardiac/pregnancy sensitivities, cooking fuels, and daily commutes.
- **Secondary:** Residents' Welfare Associations (RWAs) and schools printing a single-page Community Brief (`/brief`).
- **Judges / Evaluators:** Opening `/` on any day (including clean-air days) via one-click `"Try a sample family"` and **Live / Recorded severe-winter day** toggle.

## 3. Core Flows (≤ 6 Screens, Mobile-First)

1. **Landing & Today (`/`):** One-click sample family, household setup drawer/form (`localStorage` only + `"Delete my data"`), Live vs Recorded severe-winter day toggle with exact date/source badge, US AQI + India NAQI (when `country === "IN"`), *Now* vs *Today's level*, 24h Go-out / Air-house / Avoid window strip + WHO 15 µg/m³ chart + accessible table toggle, per-member risk chips, local reading calibration (`0.5x–3x`), and static medical emergency banner.
2. **Action Plan (`/plan`):** Tabs for *Routine · Indoors · Swaps*, AI-worded vs Engine fallback badge, cards with `[min, max]` impact ranges, negative-delta trade-off badges paired with N95/mitigation advice, expandable `"How we calculated"` explanations, 4 myth cards, and grounded **What-if Chat** drawer (`simulate_scenario` tool calls).
3. **Impact & Simulator (`/impact`):** Before/after breathing-weighted exposure hero + cigarette-equivalent intuition (labelled rule of thumb), instant client-side what-if controls (commute mode/days, purifier, windows, N95, cooking vent), and community multiplier (`1–500` households).
4. **Community Brief (`/brief`):** Print-ready 1-page RWA/school brief (`@media print`) + WhatsApp/clipboard family summary share.

## 4. Non-Goals

No user accounts, no server-side profile database, no push notifications, no medical diagnosis or medication dosing, and no invented local tailpipe pollutant gram estimates.
