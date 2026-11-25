#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDemoContext, SAMPLE_FAMILY_PROFILE } from "../src/lib/providers/demo";
import { generatePlanWithFallback } from "../src/lib/llm/planner";

async function main() {
  const ctx = getDemoContext();
  const sample = await generatePlanWithFallback(SAMPLE_FAMILY_PROFILE, ctx, null);
  const outPath = fileURLToPath(new URL("../data/sample-plan.json", import.meta.url));
  writeFileSync(outPath, JSON.stringify(sample, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath} (${sample.plan.cards.length} cards)`);
}

void main();
