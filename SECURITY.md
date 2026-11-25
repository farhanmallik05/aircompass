# Security Policy & Threat Model — AirCompass

## Security Controls

1. **Server-Only Secrets:** `GEMINI_API_KEY` is read exclusively in server modules (`src/lib/llm/gemini.ts`). No `NEXT_PUBLIC_` secret environment variables exist, and `tests/security/bundle-secrets.test.ts` scans `.next/static` for leaked key or canary patterns.
2. **Strict Input Validation & Size Caps:** Every API route (`/api/context`, `/api/plan`, `/api/chat`) enforces `application/json`, a strict `8192`-byte payload cap (`readBoundedJson`), and Zod `.strictObject()` schemas (`src/lib/schemas.ts`).
3. **Prompt-Injection Isolation & Output Guard:**
   - User notes (`<= 300` chars) and chat messages (`<= 500` chars) have control characters stripped and notes are isolated inside `<user_note>...</user_note>`.
   - `/api/plan` outputs must pass JSON Schema + Zod validation + candidate `actionId` allow-list + `findViolations()` (`src/lib/llm/guard.ts` NFKC/`\p{Cf}` normalization, digit/number-word/unit/markup/medical/canary checks) + `languageOk()`. Failures trigger at most 1 repair call before deterministic fallback.
   - `/api/chat` has no tools other than `simulate_scenario` and validates finished replies against `unfaithfulNumbers()` before finalizing.
4. **Nonce Content Security Policy & Security Headers:**
   - `src/proxy.ts` emits a per-request cryptographic nonce CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`, `style-src 'self' 'nonce-...'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`).
   - `next.config.ts` disables `cacheComponents` and `partialPrefetching` (ADR 0005), disables `poweredByHeader`, and applies `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=()`, and `Cross-Origin-Opener-Policy: same-origin` across all routes including `/api/*`.
5. **Rate Limiting & Cost Caps (Serverless Disclosure):**
   - `src/lib/security/rateLimit.ts` enforces a SHA-256 hashed-IP token bucket and `DAILY_LLM_CAP` (`default: 200`), degrading cleanly to the deterministic engine plan when exceeded.
   - **Plain limitation:** In-memory rate limits and daily counters run **per serverless instance (best-effort)** rather than across globally shared Redis state.
6. **SSRF & Privacy:**
   - Upstream HTTP calls allow only fixed Open-Meteo origins (`air-quality-api.open-meteo.com`, `api.open-meteo.com`, `geocoding-api.open-meteo.com`) with 5s timeouts.
   - Zero server-side profile storage or cookies; household profiles stay in browser `localStorage` with a one-click `"Delete my data"` action.

## STRIDE-Lite Threat Table

| Threat | Target | Mitigation | Verification |
|---|---|---|---|
| Prompt Injection | `notes`, `/api/chat` | Delimited `<user_note>`, strict Zod schema, guard canary `CANARY-7f3a91`, `simulate_scenario` only | `tests/security/api-security.test.ts`, eval `I7` |
| Key Leakage | Client JS bundle, logs | Server-only env var, no key logging, `.env*` gitignored | `tests/security/bundle-secrets.test.ts`, `gitleaks` CI |
| Abuse / Cost Exhaustion | `/api/plan`, `/api/chat` | 8 KB body cap, hashed-IP token bucket, `DAILY_LLM_CAP` graceful fallback | `tests/security/api-security.test.ts` |
| XSS / Script Injection | Rendered UI, CSP | React escaping, zero `dangerouslySetInnerHTML`, zero inline `style`, nonce CSP | `tests/e2e/csp.spec.ts`, `tests/security/guard.test.ts` |
| SSRF | `/api/context` | Fixed 3-origin Open-Meteo allow-list, lat/lon numeric bounds | `src/lib/providers/openMeteo.ts`, `tests/api/routes.test.ts` |
| Privacy Exposure | Household health data | `localStorage`-only profiles, hashed IP in memory only, no analytics | `docs/ADR/0004-localstorage-only.md` |

## Supply Chain & Dependency Audit Note

- Production audit gate: `npm audit --omit=dev --audit-level=high` reports **0 production vulnerabilities** (verified 25 Nov 2026).
- Accepted dev-only advisory: full `npm audit` flags a dev-tool `tinypool` advisory via `vitest@3.2.7`, because `@stryker-mutator/vitest-runner@10.1.1` peer-depends on `vitest@^3.x`. Revisit once Stryker supports Vitest 4/5; never ships to production users.
