# Technical Requirements Document (TRD) — AirCompass

## 1. Architecture & Runtime Invariants

- **Framework:** Next.js 16.4.6 (App Router, `cacheComponents` and `partialPrefetching` disabled), React 19, TypeScript `strict`, Tailwind CSS v4, Zod v4, `@google/genai` v3.
- **CSP & Security:** Per-request nonce CSP in `src/proxy.ts` (`await connection()` on pages), static headers (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`) in `next.config.ts`, zero inline `style={{}}`, zero `dangerouslySetInnerHTML`, zero `NEXT_PUBLIC_` secrets, `poweredByHeader: false`.
- **LLM Safety:** Structured JSON schema output (`responseMimeType` + `responseJsonSchema`) validated with Zod `.strictObject()`, symbolic `{{tokens}}` only, NFKC + `\p{Cf}` normalising guard (`guard.ts`) against raw digits, Unicode/spelled EN/HI number words, units, markup, medical claims, and prompt canary `CANARY-7f3a91`. Single repair attempt before deterministic engine fallback (`fallback.ts`).
- **Chat Grounding:** `@google/genai` function calling (`simulate_scenario`, max 2 rounds) with `unfaithfulNumbers()` post-check and medical/off-topic refusal.

## 2. Quality Gates

- **Oracle Integrity:** `npm run oracle:check` ensures `tests/fixtures/golden.json` matches `scripts/oracle.mjs`.
- **Test Coverage & Mutation:** Vitest v8 thresholds (`≥ 80%` lines/functions/statements, `≥ 75%` branches on `src/lib/**`); Stryker mutation score target `≥ 85%` on `src/lib/engine/**` and `src/lib/llm/guard.ts`.
- **Offline Evals:** `npm run eval` executes 12-persona invariant checks `I1–I12` deterministically and outputs `evals/REPORT.md`.
- **E2E & Accessibility:** Playwright production CSP smoke (`npm run csp:smoke`) + E2E user flows + `@axe-core/playwright` matrix (routes × EN/HI × light/dark) + 320px reflow.
