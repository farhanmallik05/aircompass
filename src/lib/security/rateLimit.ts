import { createHash } from "node:crypto";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const ipBuckets = new Map<string, Bucket>();
let dailyLlmState = { date: new Date().toISOString().slice(0, 10), count: 0 };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TOKENS = 40;

export function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp).digest("hex").slice(0, 16);
}

export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip") ?? "127.0.0.1";
}

/**
 * Best-effort per-instance token bucket rate limiter (explicitly documented in SECURITY.md).
 * Returns true if the request is allowed, false if throttled.
 */
export function takeIpToken(routeKey: string, rawIp: string, nowMs = Date.now()): boolean {
  const key = `${routeKey}:${hashIp(rawIp)}`;
  const existing = ipBuckets.get(key);
  if (!existing) {
    ipBuckets.set(key, { tokens: MAX_TOKENS - 1, lastRefillMs: nowMs });
    return true;
  }
  const elapsed = Math.max(0, nowMs - existing.lastRefillMs);
  const refill = (elapsed / WINDOW_MS) * MAX_TOKENS;
  const current = Math.min(MAX_TOKENS, existing.tokens + refill);
  if (current < 1) {
    existing.tokens = current;
    existing.lastRefillMs = nowMs;
    return false;
  }
  existing.tokens = current - 1;
  existing.lastRefillMs = nowMs;
  return true;
}

/** Global per-instance daily LLM call cap. Degrades gracefully to deterministic fallback when exhausted. */
export function tryConsumeDailyLlmQuota(now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  if (dailyLlmState.date !== today) {
    dailyLlmState = { date: today, count: 0 };
  }
  const cap = Math.max(0, Number(process.env.DAILY_LLM_CAP ?? 200));
  if (dailyLlmState.count >= cap) return false;
  dailyLlmState.count += 1;
  return true;
}

export function resetRateLimitsForTest(): void {
  ipBuckets.clear();
  dailyLlmState = { date: new Date().toISOString().slice(0, 10), count: 0 };
}
