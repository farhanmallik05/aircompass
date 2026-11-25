<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AirCompass agent rules (read plan.md first)

1. `plan.md` is the spec. `src/lib/types.ts` is frozen unless a ticket says otherwise.
2. Every ticket ends with `npm run verify` green. Never commit red. Commit messages: conventional commits.
3. **Numbers come from the engine, expectations come from the oracle.** Never compute an expected value in a test with product code. Never hand-edit `tests/fixtures/golden.json`; change `scripts/oracle.mjs`, regenerate, and explain the diff in the commit.
4. **Test for behaviour that can break, not for count.** Do NOT write: tests that assert constants, getters or pass-through wrappers; snapshots of whole objects; tests that mock the unit under test; one `it()` per trivial input (use a table and one assertion that lists every failing row). Do write: golden vectors, invariants/properties, bypass corpora (add the new bypass to `tests/security/guard.corpus.json` first, then fix the guard), API contract tests with malformed upstream and model payloads, and a few end-to-end flows.
5. **Module size follows responsibility, not a line quota.** One reason to change per module. Do not split a file to hit a number, and do not create a file for a function used once. Soft ceiling about 300 lines; above it, justify or split along a real seam.
6. No `any`. No `dangerouslySetInnerHTML`. No inline `style={{}}` attributes (blocked by the CSP): use Tailwind classes, SVG presentation attributes, `<meter>`/`<progress>`.
7. **Do not change the CSP, `cacheComponents`, `partialPrefetching`, `proxy.ts` or `next.config.ts` headers** without rerunning `npm run csp:smoke` against a production build. Never add `export const runtime` to route files while Cache Components could be on.
8. No network in tests. Secrets never printed or committed. Never copy code, prompts or text from other submissions.
9. Log each ticket in `docs/BUILD_LOG.md`: the prompt used, what was produced, what you changed by hand.
10. If a rule conflicts with a ticket, stop and ask.
