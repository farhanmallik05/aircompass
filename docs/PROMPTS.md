# Prompt Engineering & Evaluation — AirCompass

All prompts live under `prompts/` as versioned Markdown/JSON files and never accept unescaped user instructions.

## 1. Planner Prompt (`prompts/planner.system.md` + `prompts/planner.fewshot.json`)

- **Goal:** Select 5–8 unique actions strictly from the engine-ranked `candidates` (covering every available section: `routine`, `indoor`, `swap`), explain *why this over that* per household member, keep negative-delta trade-offs explicit, and write in `en` or `hi`.
- **Numbers-by-Reference Policy:** The model is forbidden from outputting raw digits, spelled number words, times, or unit symbols. It inserts symbolic `{{tokens}}` resolved post-guard (`src/lib/llm/tokens.ts`).
- **Safety:** Embeds `CANARY-7f3a91` to detect prompt leaks, blocks medical diagnoses/dosages, strips HTML/URLs, and isolates optional household notes inside `<user_note>...</user_note>`.
- **Schema Handling:** `PlanOutSchema` uses `z.toJSONSchema()` simplified cleanly for Gemini's FSM serving limits (`simplifySchemaForGemini`), then re-validates strictly with Zod `.strictObject()` on the server.
- **Evaluation:** Tested across all 12 personas (`evals/run.ts`, invariants `I1–I12`) plus 9+ malformed/adversarial contract tests in `tests/api/routes.test.ts`.

## 2. Grounded Chat Prompt (`prompts/chat.system.md`)

- **Goal:** Answer household "what if" questions in `en` or `hi` using live `simulate_scenario` tool calls against the deterministic engine (max 2 tool rounds).
- **Numeric Faithfulness:** `unfaithfulNumbers()` verifies every number emitted in chat matches supplied engine facts or `simulate_scenario` tool outputs (within `max(0.5, 1%)` tolerance), replacing any ungrounded reply with the deterministic engine summary.
- **Evaluation:** Verified in `tests/api/routes.test.ts` and `tests/security/guard.test.ts` (including non-ASCII digit rejection).
