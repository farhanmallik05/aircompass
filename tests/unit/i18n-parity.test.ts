import { describe, it, expect } from "vitest";
import en from "../../src/i18n/en.json";
import hi from "../../src/i18n/hi.json";

function collectLeafKeys(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof obj === "string") {
    out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => Object.assign(out, collectLeafKeys(item, `${prefix}[${idx}]`)));
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      Object.assign(out, collectLeafKeys(v, next));
    }
  }
  return out;
}

const placeholdersOf = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();

describe("i18n parity (en vs hi)", () => {
  const enLeaves = collectLeafKeys(en);
  const hiLeaves = collectLeafKeys(hi);

  it("has identical keys across English and Hindi dictionaries", () => {
    expect(Object.keys(hiLeaves).sort()).toEqual(Object.keys(enLeaves).sort());
  });

  it("preserves identical interpolation placeholders and avoids Devanagari digits", () => {
    const mismatches: string[] = [];
    for (const [key, enVal] of Object.entries(enLeaves)) {
      const hiVal = hiLeaves[key] ?? "";
      if (JSON.stringify(placeholdersOf(enVal)) !== JSON.stringify(placeholdersOf(hiVal))) {
        mismatches.push(`placeholder mismatch at ${key}`);
      }
      if (/[\u0966-\u096F]/.test(hiVal)) {
        mismatches.push(`devanagari digit at ${key}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
