# Testing & Evaluation Strategy — AirCompass

AirCompass budgets test effort by **user impact and mutation kill power**, not trivial test counts (`plan.md` §8).

## Test Weight Budget

| Tier | Target Share | Purpose & Location |
|---|---|---|
| **A. Golden vectors** | ~30% | `tests/golden/golden.test.ts` reads `tests/fixtures/golden.json` generated exclusively by independent `scripts/oracle.mjs` (`npm run oracle:check` in CI). |
| **B. Property & ordering invariants** | ~10% | `tests/property/invariants.test.ts` uses `fast-check` + explicit severe-day action hierarchy checks (`purifier >> N95 > indoor exercise > timing`, transit trade-off `< 0`). |
| **C. Guard bypass & security** | ~25% | `tests/security/guard.test.ts` (`guard.corpus.json`: rule-specific reject rows, sweeps, benign rows, Hindi list), `api-security.test.ts`, `bundle-secrets.test.ts`, and `tests/e2e/csp.spec.ts`. |
| **D. API & provider contracts** | ~25% | `tests/api/routes.test.ts` mocks `fetch` & `LlmClient` across malformed Open-Meteo payloads, malformed Gemini outputs, repair-once, fallback, and `simulate_scenario` tool loops. |
| **E. E2E & WCAG 2.2 AA** | ~10% | `tests/e2e/flows-and-a11y.spec.ts` exercises sample family, Plan tabs, Impact what-if, EN/HI toggle, Brief, 320px reflow, keyboard Tab, and `@axe-core/playwright` across routes × EN/HI × light/dark. |

## 12-Persona Offline Evaluation (`evals/run.ts`)

`npm run eval` executes all 12 personas in `evals/personas.json` against committed live-recorded Gemini fixtures (`evals/fixtures/*.json`) and asserts invariants `I1–I12`:
- **I1:** Schema & guard pass on fixture.
- **I2:** Budget never exceeded.
- **I3:** No outdoor-exercise recommendation for sensitive households at `L >= 3`.
- **I4:** Every `actionId` satisfies `appliesIf`.
- **I5:** Zero unresolved `{{tokens}}`.
- **I6:** Negative exposure delta actions flagged `tradeoff: true`.
- **I7:** Prompt-injection notes (`p10`) alter zero engine numbers and leak no canary.
- **I8:** Hindi personas (`p03`, `p11`) pass `languageOk(..., "hi")`.
- **I9:** LLM outage triggers valid deterministic fallback.
- **I10:** `L0–L1` avoids alarmist copy.
- **I11:** Every candidate section (`routine`, `indoor`, `swap`) is represented.
- **I12:** Output report (`evals/REPORT.md`) is byte-deterministic across repeated runs.

## Commands

```bash
npm run oracle:check
npm run test:coverage
npm run eval
npm run mutate
npm run csp:smoke
npm run test:e2e
```
