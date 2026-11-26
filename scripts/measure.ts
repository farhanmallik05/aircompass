#!/usr/bin/env tsx
/**
 * Measures real engine p50/p95 over 200 runs, planner latency (mocked and live if GEMINI_API_KEY is set),
 * token usage metadata, and compiled .next/static asset sizes, writing docs/EFFICIENCY.md.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "../src/lib/providers/demo";
import { createGeminiClientFromEnv } from "../src/lib/llm/gemini";
import { buildPlanFacts, generatePlanWithFallback } from "../src/lib/llm/planner";
import { buildPlannerUserPrompt, getPlannerSystemPrompt } from "../src/lib/llm/prompt";
import { buildTokens } from "../src/lib/llm/tokens";
import { PlanOutSchema } from "../src/lib/schemas";
import type { AirContext } from "../src/lib/types";

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round((sorted[idx] ?? 0) * 100) / 100;
}

function walkSizes(dir: string): { totalRaw: number; totalGzip: number; jsGzip: number } {
  if (!existsSync(dir)) return { totalRaw: 0, totalGzip: 0, jsGzip: 0 };
  let totalRaw = 0;
  let totalGzip = 0;
  let jsGzip = 0;
  const stack = [dir];
  let cur = stack.pop();
  while (cur) {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        const gz = gzipSync(readFileSync(full)).length;
        totalRaw += statSync(full).size;
        totalGzip += gz;
        if (entry.name.endsWith(".js")) jsGzip += gz;
      }
    }
    cur = stack.pop();
  }
  return { totalRaw, totalGzip, jsGzip };
}

function formatLiveError(err: unknown): string {
  let reason = err instanceof Error ? err.message : "unknown";
  try {
    const parsed = JSON.parse(reason) as {
      error?: { code?: number; status?: string; message?: string };
    };
    if (parsed.error) {
      const shortMsg = parsed.error.message?.split("\n")[0] ?? parsed.error.status ?? "API error";
      reason = `HTTP ${parsed.error.code ?? "?"} ${parsed.error.status ?? ""}: ${shortMsg}`.trim();
    }
  } catch {
    // Non-JSON error string; keep truncated line
  }
  return `Skipped due to transient API error (${reason.slice(0, 180)})`;
}

async function measureLiveSummary(ctx: AirContext): Promise<string> {
  const liveClient = createGeminiClientFromEnv();
  if (!liveClient) return "Not measured (GEMINI_API_KEY not set)";
  try {
    const { facts } = buildPlanFacts(SAMPLE_FAMILY_PROFILE, ctx);
    const tokens = buildTokens(facts);
    const t0 = performance.now();
    const res = await liveClient.generatePlanJson({
      systemPrompt: getPlannerSystemPrompt(),
      userPrompt: buildPlannerUserPrompt(SAMPLE_FAMILY_PROFILE, facts, tokens),
      schema: z.toJSONSchema(PlanOutSchema),
    });
    const elapsed = Math.round(performance.now() - t0);
    return `${elapsed} ms (${res.model}, inputTokens=${res.inputTokens ?? "n/a"}, outputTokens=${res.outputTokens ?? "n/a"})`;
  } catch (err) {
    return formatLiveError(err);
  }
}

async function main() {
  const ctx = getDemoContext();
  const engineTimes = Array.from({ length: 200 }, () => {
    const t0 = performance.now();
    buildPlanFacts(SAMPLE_FAMILY_PROFILE, ctx);
    return performance.now() - t0;
  }).sort((a, b) => a - b);

  const mockTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, null);
    mockTimes.push(performance.now() - t0);
  }
  mockTimes.sort((a, b) => a - b);

  const liveSummary = await measureLiveSummary(ctx);
  const staticStats = walkSizes(path.resolve(process.cwd(), ".next", "static"));
  const dateStr = new Date().toISOString();

  const md = [
    "# Efficiency & Performance Measurements",
    "",
    `Measured on **${dateStr}** (Node ${process.version}, ${process.platform} ${process.arch}).`,
    "",
    "## Measured Metrics",
    "",
    "| Metric | Result | Target / Budget |",
    "|---|---|---|",
    `| Deterministic engine (\`buildPlanFacts\`, 200 runs) | p50: **${percentile(engineTimes, 50)} ms**, p95: **${percentile(engineTimes, 95)} ms** | < 5 ms |`,
    `| Fallback planner pipeline (20 runs) | p50: **${percentile(mockTimes, 50)} ms**, p95: **${percentile(mockTimes, 95)} ms** | < 10 ms |`,
    `| Live Gemini \`generatePlanJson\` | **${liveSummary}** | 1 call (< 12 s timeout) |`,
    `| Compiled \`.next/static\` JS (total gzipped across all chunks) | **${(staticStats.jsGzip / 1024).toFixed(1)} KB** | No chart lib, self-hosted fonts |`,
    `| Compiled \`.next/static\` total (raw / gzip) | ${(staticStats.totalRaw / 1024).toFixed(1)} KB / ${(staticStats.totalGzip / 1024).toFixed(1)} KB | Compact asset footprint |`,
    "",
    "## Architectural Efficiency Tactics",
    "",
    "- **Single structured LLM call per plan:** Compact 14-candidate JSON payload + static cache-friendly system prompt prefix + `maxOutputTokens: 1600` + minimal thinking (`ThinkingLevel.MINIMAL` on Gemini 3.x, `thinkingBudget: 0` on Gemini 2.5).",
    "- **Parallel upstream fetching + 1 h cache:** Air quality and weather endpoints execute via `Promise.all` with `0.1°` lat/lon cache key (`revalidate: 3600`).",
    "- **Zero client-side chart bundles:** 24-hour pollution strips use native inline SVG presentation attributes + `<meter>`, saving JS parse/hydration cost and respecting strict nonce CSP.",
    "- **Zero-round-trip What-If simulator:** `/impact` computes exposure and community CO2e directly in browser memory using the pure TypeScript engine.",
    "- **Nonce CSP trade-off:** Every document page calls `await connection()` to generate a fresh per-request CSP nonce (preventing stale cached HTML nonces per ADR 0005), trading edge HTML caching for strict XSS protection while static JS/CSS chunks remain edge-cached.",
    "",
  ].join("\n");

  const outPath = fileURLToPath(new URL("../docs/EFFICIENCY.md", import.meta.url));
  writeFileSync(outPath, md, "utf8");
  console.log(`Updated ${outPath}`);
}

void main();
