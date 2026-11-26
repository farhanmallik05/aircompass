/** Logs server-side errors cleanly while stripping potential query-string and Google API-key secrets. */
export function logServerError(scope: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  const redacted = raw
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\bAIza[0-9A-Za-z_-]{16,}\b/g, "[REDACTED_KEY]");
  console.warn(`[${scope}] ${redacted.slice(0, 240)}`);
}
