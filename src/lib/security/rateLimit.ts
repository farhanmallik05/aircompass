import { createHash } from "node:crypto";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const ipBuckets = new Map<string, Bucket>();
let dailyLlmState = { date: new Date().toISOString().slice(0, 10), count: 0 };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TOKENS = 40;
export const MAX_BUCKETS = 10_000;

export function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp).digest("hex").slice(0, 16);
}

/** Extracts and normalizes a client IP identifier from reverse-proxy headers. */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim().slice(0, 64);
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim().slice(0, 64);
  return realIp || "127.0.0.1";
}

function evictStaleOrOldestBuckets(nowMs: number, maxBuckets = MAX_BUCKETS): void {
  if (ipBuckets.size < maxBuckets) return;
  for (const [k, bucket] of ipBuckets) {
    if (nowMs - bucket.lastRefillMs >= WINDOW_MS) {
      ipBuckets.delete(k);
    }
    if (ipBuckets.size < maxBuckets) return;
  }
  while (ipBuckets.size >= maxBuckets) {
    const oldestKey = ipBuckets.keys().next().value;
    if (oldestKey === undefined) break;
    ipBuckets.delete(oldestKey);
  }
}

/**
 * Bounded per-instance token bucket rate limiter (documented in SECURITY.md).
 * Caps map growth against spoofed IP header memory exhaustion and returns true if allowed.
 */
export function takeIpToken(
  routeKey: string,
  rawIp: string,
  nowMs = Date.now(),
  maxBuckets = MAX_BUCKETS,
): boolean {
  const key = `${routeKey}:${hashIp(rawIp)}`;
  const existing = ipBuckets.get(key);
  if (!existing) {
    evictStaleOrOldestBuckets(nowMs, maxBuckets);
    ipBuckets.set(key, { tokens: MAX_TOKENS - 1, lastRefillMs: nowMs });
    return true;
  }
  const elapsed = Math.max(0, nowMs - existing.lastRefillMs);
  const refill = (elapsed / WINDOW_MS) * MAX_TOKENS;
  const current = Math.min(MAX_TOKENS, existing.tokens + refill);
  ipBuckets.delete(key);
  if (current < 1) {
    ipBuckets.set(key, { tokens: current, lastRefillMs: nowMs });
    return false;
  }
  ipBuckets.set(key, { tokens: current - 1, lastRefillMs: nowMs });
  return true;
}

/** Global per-instance daily LLM call cap. Degrades gracefully to deterministic fallback when exhausted. */
export function tryConsumeDailyLlmQuota(now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  if (dailyLlmState.date !== today) {
    dailyLlmState = { date: today, count: 0 };
  }
  const parsedCap = Number(process.env.DAILY_LLM_CAP ?? 200);
  const cap = Number.isFinite(parsedCap) ? Math.max(0, parsedCap) : 200;
  if (dailyLlmState.count >= cap) return false;
  dailyLlmState.count += 1;
  return true;
}

export function getBucketCountForTest(): number {
  return ipBuckets.size;
}

export function resetRateLimitsForTest(): void {
  ipBuckets.clear();
  dailyLlmState = { date: new Date().toISOString().slice(0, 10), count: 0 };
}
