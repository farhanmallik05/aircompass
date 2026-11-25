# ADR 0002 — Numbers by Reference (`{{tokens}}`) & Latin Digits

- **Status:** Accepted (25 Nov 2026)
- **Context:** Asking an LLM to copy numbers from a prompt still allows silent rounding, unit conversion errors, or invented statistics. Bilingual Hindi output can also emit Devanagari numerals (`४०`), complicating downstream numeric validation.
- **Decision:** For structured plans (`/api/plan` and `/brief`), Gemini must never emit digits, spelled-out quantities, or units. Instead, it emits symbolic placeholders (`{{aqi.now}}`, `{{impact.<actionId>.pct}}`, etc.) resolved server-side after passing the Unicode-normalising guard (`src/lib/llm/guard.ts`). Both English and Hindi outputs keep Latin digits when tokens render. For conversational `/api/chat`, `unfaithfulNumbers()` rejects any response containing numbers outside the supplied engine facts or `simulate_scenario` tool results.
- **Consequences:** Prevents hallucinated health or impact statistics, enforces strict unit formatting, and enables deterministic regression testing via `tests/security/guard.corpus.json`.
