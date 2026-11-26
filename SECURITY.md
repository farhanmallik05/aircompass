# Security Policy & Threat Model — AirCompass

## Security Controls

1. **Server-Only Secrets:** `GEMINI_API_KEY` is read exclusively in server modules (`src/lib/llm/gemini.ts`). No `NEXT_PUBLIC_` secret environment variables exist, and `tests/security/bundle-secrets.test.ts` scans `.next/static` for leaked key or canary patterns. Server error logs across `/api/*`, `planner.ts`, `chat.ts`, `gemini.ts`, and `openMeteo.ts` pass through `logServerError()` (`src/lib/security/log.ts`) to redact URL query API keys (`?key=`) and Google API key tokens (`AIza...`).
2. **Strict Input Validation & Streaming Size Caps:** Every API route (`/api/context`, `/api/plan`, `/api/chat`) enforces `application/json`, a strict numeric `Content-Length` check (`400` on malformed values), an `8192`-byte payload cap enforced via incremental stream reading (`readStreamWithLimit` cancels oversized chunked payloads immediately instead of buffering unbounded memory), and Zod `.strictObject()` schemas (`src/lib/schemas.ts`). `/api/context` rejects empty or unpaired numeric coordinates with `400` and returns `502` on geocoding failures rather than masking them inside forecast fallbacks. Client fetchers (`contextFetchers.ts`, `sseChat.ts`, `PlaceSelector.tsx`) validate untrusted JSON responses with runtime type predicates (zero `as` casts and zero `zod` JIT).
3. **Prompt-Injection Isolation & Pre-Wire Output Guard:**
   - User notes (`<= 300` chars), chat messages (`<= 500` chars), and client-supplied chat history turns (`ChatTurnSchema.text`, `<= 1500` chars) have control characters stripped and `CANARY-7f3a91` redacted, with notes isolated inside `<user_note>...</user_note>`.
   - `/api/plan` outputs must pass JSON Schema + Zod validation + candidate `actionId` allow-list + `findViolations()` (`src/lib/llm/guard.ts` NFKC/`\p{Cf}` normalization, `Object.hasOwn()` exact token lookup preventing `constructor`/`__proto__`/`toString` prototype bypasses, and digit/number-word/unit/markup/medical/canary checks) + `languageOk()`. Failures trigger at most 1 repair call before deterministic fallback.
   - `/api/chat` has no tools other than `simulate_scenario`, **buffers model chunks in `runGroundedChat()` until `findChatSafetyIssue()` and `unfaithfulNumbers()` pass** (so unverified numbers, canary strings, markup links, or medical claims are never streamed as `event: chunk`), and emits only the safe deterministic fallback when rejected.
4. **Nonce Content Security Policy, Metadata, & Security Headers:**
   - `src/proxy.ts` emits a per-request cryptographic nonce CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`, `style-src 'self' 'nonce-...'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`).
   - `next.config.ts` disables `cacheComponents` and `partialPrefetching` (ADR 0005), disables `poweredByHeader`, and applies `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-DNS-Prefetch-Control: off`, `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, and strict `/api/*` headers (`X-Robots-Tag: noindex, nofollow`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`), reinforced by `src/app/robots.ts` (`Disallow: /api/`).
5. **Rate Limiting & Cost Caps (Serverless Disclosure):**
   - `src/lib/security/rateLimit.ts` extracts client identity preferring trusted reverse-proxy headers (`x-vercel-forwarded-for`, `x-real-ip`) before `x-forwarded-for`, enforces a SHA-256 hashed-IP token bucket bounded at `MAX_BUCKETS = 10_000` (with stale/oldest eviction against header-spoofing memory exhaustion), emits `Retry-After: 60` on HTTP `429` responses, and enforces both `DAILY_IP_LLM_CAP` (`default: 20` per IP) and global `DAILY_LLM_CAP` (`default: 200`), degrading cleanly to the deterministic engine plan when exceeded.
   - **Plain limitation:** In-memory rate limits and daily counters run **per serverless instance (best-effort)** rather than across globally shared Redis state.
6. **SSRF & Privacy:**
   - Upstream HTTP calls allow only fixed Open-Meteo origins (`air-quality-api.open-meteo.com`, `api.open-meteo.com`, `geocoding-api.open-meteo.com`) with 5s timeouts. Upstream failures preserve `requestedPlace` and show a transparent fallback notice (`upstreamFallback: true`) instead of silently relabeling Greater Noida demo data.
   - Zero server-side profile storage or cookies; household profiles stay in browser `localStorage` validated at runtime (`src/lib/client/storage.ts`) with a one-click `"Delete my data"` action.

## STRIDE-Lite Threat Table

| Threat | Target | Mitigation | Verification |
|---|---|---|---|
| Prompt Injection / Token Bypass | `notes`, `/api/chat`, `guard.ts` | Delimited `<user_note>`, strict Zod schema, `Object.hasOwn()` token check, canary `CANARY-7f3a91`, `simulate_scenario` only | `tests/security/api-security.test.ts`, `tests/security/guard.test.ts`, eval `I7` |
| Key Leakage | Client JS bundle, logs | Server-only env var, `logServerError` redaction, `.env*` gitignored | `tests/security/bundle-secrets.test.ts` |
| Abuse / Cost Exhaustion | `/api/plan`, `/api/chat` | Streaming 8 KB body cap, trusted-proxy IP extraction, hashed-IP token bucket, `DAILY_IP_LLM_CAP` + `DAILY_LLM_CAP` fallback | `tests/security/api-security.test.ts` |
| XSS / Script Injection | Rendered UI, CSP | React escaping, zero `dangerouslySetInnerHTML`, zero inline `style`, nonce CSP | `tests/e2e/csp.spec.ts`, `tests/security/guard.test.ts` |
| SSRF | `/api/context` | Fixed 3-origin Open-Meteo allow-list, lat/lon numeric bounds | `src/lib/providers/openMeteo.ts`, `tests/api/routes.test.ts` |
| Privacy Exposure | Household health data | `localStorage`-only profiles, hashed IP in memory only, no analytics | `docs/ADR/0004-localstorage-only.md` |

## Supply Chain & Dependency Audit Note

- Production audit gate: `npm audit --omit=dev --audit-level=high` reports **0 production vulnerabilities** (verified 26 Nov 2026).
- Accepted dev-only advisory: full `npm audit` flags a dev-tool `tinypool` advisory via `vitest@3.2.7`, because `@stryker-mutator/vitest-runner@10.1.1` peer-depends on `vitest@^3.x`. Revisit once Stryker supports Vitest 4/5; never ships to production users.
