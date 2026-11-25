#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const submissionPath = fileURLToPath(new URL("../docs/SUBMISSION.md", import.meta.url));
const md = readFileSync(submissionPath, "utf8");

function extractBlock(heading) {
  const re = new RegExp(`## ${heading}[\\s\\S]*?\`\`\`text\\r?\\n([\\s\\S]*?)\\r?\\n\`\`\``);
  const m = re.exec(md);
  if (!m) {
    console.error(`Missing code block for ${heading}`);
    process.exit(1);
  }
  return m[1].trim();
}

const textA = extractBlock("Text A");
const textB = extractBlock("Text B");
console.log(`Text A length: ${textA.length}/1024`);
console.log(`Text B length: ${textB.length}/1024`);
if (textA.length > 1024 || textB.length > 1024) {
  console.error("Submission text exceeds 1,024 character limit!");
  process.exit(1);
}
