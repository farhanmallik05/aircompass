import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

describe("client bundle & source secret hygiene", () => {
  it("contains no NEXT_PUBLIC_ secret env vars in src/", () => {
    const srcFiles = walkFiles(path.resolve(process.cwd(), "src")).filter((f) =>
      /\.(ts|tsx|js|jsx)$/.test(f),
    );
    const bad = srcFiles.filter((f) =>
      /NEXT_PUBLIC_.*(?:KEY|SECRET|TOKEN|CANARY)/i.test(readFileSync(f, "utf8")),
    );
    expect(bad).toEqual([]);
  });

  it("compiled .next/static client chunks contain zero Google API key or canary literals when built", () => {
    const staticDir = path.resolve(process.cwd(), ".next", "static");
    if (!existsSync(staticDir)) return;
    const files = walkFiles(staticDir).filter((f) => /\.(js|css)$/.test(f));
    const leaks: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (/AIza[0-9A-Za-z_-]{35}/.test(content) || content.includes("CANARY-7f3a91")) {
        leaks.push(file);
      }
    }
    expect(leaks).toEqual([]);
  });
});
