#!/usr/bin/env node
import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

let total = 0;
for (const f of files) {
  try {
    total += statSync(f).size;
  } catch {
    // Ignore deleted tracked files in index
  }
}

const mb = total / (1024 * 1024);
console.log(`Tracked repo size: ${mb.toFixed(2)} MB (${files.length} files)`);
if (mb >= 10) {
  console.error("Tracked repository size exceeds 10 MB limit!");
  process.exit(1);
}
