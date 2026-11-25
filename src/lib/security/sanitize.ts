import { PROMPT_CANARY } from "../llm/guard";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips control characters and normalises untrusted user strings. */
export function sanitizeUserText(raw: string, maxLen: number): string {
  return raw.replace(CONTROL_CHARS, "").trim().slice(0, maxLen);
}

/** Wraps untrusted notes inside explicit data tags so prompts never confuse user text for instructions. */
export function wrapUntrustedNote(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = sanitizeUserText(raw, 300)
    .replace(/<\/?user_note>/gi, "")
    .replaceAll(PROMPT_CANARY, "[redacted]");
  if (!cleaned) return undefined;
  return `<user_note>${cleaned}</user_note>`;
}
