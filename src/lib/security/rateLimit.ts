import { createHash } from "node:crypto";

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const ipBuckets = new Map<string, Bucket>();
let dailyLlmState = { date: new Date().toISOString().slice(0, 10), count: 0 };
let dailyIpLlmState = {
  date: new Date().toISOString().slice(0, 10),
  counts: new Map<string, number>(),
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_TOKENS = 40;
export const MAX_BUCKETS = 10_000;

export function hashIp(rawIp: string): string {
  return createHash("sha256").update(rawIp).digest("hex").slice(0, 16);
}

/**
 * Extracts client IP preferring platform-verified headers (x-vercel-forwarded-for, x-real-ip)
 * before client-modifiable x-forwarded-for.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 64);
  if (vercelIp) return vercelIp;
  const realIp = headers.get("x-real-ip")?.trim().slice(0, 64);
  if (realIp) return realIp;
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim().slice(0, 64);
    if (first) return first;
  }
  return "127.0.0.1";
}

function evictStaleOrOldestBuckets(nowMs: number, maxBuckets = MAX_BUCKETS): void {
  if (ipBuckets.size < maxBuckets) return;
  for (const [k, bucket] of ipBuckets) {
    if (nowMs - bucket.lastRefillMs >= WINDOW_MS) ipBuckets.delete(k);
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

function parsePositiveCap(envVal: string | undefined, fallback: number): number {
  const parsed = Number(envVal ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

/**
 * Enforces both global daily LLM cap (DAILY_LLM_CAP) and per-IP daily quota (DAILY_IP_LLM_CAP).
 * Degrades cleanly to deterministic fallback without throwing.
 */
export function tryConsumeDailyLlmQuota(nowOrIp?: Date | string, maybeNow?: Date): boolean {
  const now = nowOrIp instanceof Date ? nowOrIp : (maybeNow ?? new Date());
  const rawIp = typeof nowOrIp === "string" ? nowOrIp : "global";
  const today = now.toISOString().slice(0, 10);

  if (dailyLlmState.date !== today) dailyLlmState = { date: today, count: 0 };
  if (dailyIpLlmState.date !== today) {
    dailyIpLlmState = { date: today, counts: new Map() };
  }

  const globalCap = parsePositiveCap(process.env.DAILY_LLM_CAP, 200);
  const ipCap = parsePositiveCap(process.env.DAILY_IP_LLM_CAP, 20);
  if (dailyLlmState.count >= globalCap) return false;

  const ipKey = hashIp(rawIp);
  const ipUsed = dailyIpLlmState.counts.get(ipKey) ?? 0;
  if (ipUsed >= ipCap) return false;

  if (!dailyIpLlmState.counts.has(ipKey) && dailyIpLlmState.counts.size >= MAX_BUCKETS) {
    const oldest = dailyIpLlmState.counts.keys().next().value;
    if (oldest !== undefined) dailyIpLlmState.counts.delete(oldest);
  }
  dailyIpLlmState.counts.set(ipKey, ipUsed + 1);
  dailyLlmState.count += 1;
  return true;
}

export function getBucketCountForTest(): number {
  return ipBuckets.size;
}

export function resetRateLimitsForTest(): void {
  ipBuckets.clear();
  const today = new Date().toISOString().slice(0, 10);
  dailyLlmState = { date: today, count: 0 };
  dailyIpLlmState = { date: today, counts: new Map() };
}
