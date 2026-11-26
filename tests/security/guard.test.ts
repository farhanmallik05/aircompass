import { describe, it, expect } from "vitest";
import corpus from "./guard.corpus.json";
import hiWords from "../../data/number-words.hi.json";
import {
  findChatSafetyIssue,
  findViolations,
  languageOk,
  render,
  unfaithfulNumbers,
} from "@/lib/llm/guard";

const TOKENS = {
  "aqi.now": "312",
  "best.start": "13:00",
  "level.name": "Hazardous",
  "impact.hepa.pct": "38 %",
};
const rules = (text: string) => findViolations(text, TOKENS);

/** One test per policy, many rows per test; a failure lists every offending row at once. */
describe("output guard", () => {
  it("rejects every adversarial row, and by the SPECIFIC rule named in the corpus", () => {
    const wrong = (corpus.reject as string[][])
      .filter(([, text, rule]) => !rules(text).some((v) => v.startsWith(rule)))
      .map(([name, , rule]) => `${name} (expected: ${rule})`);
    expect(wrong).toEqual([]);
  });

  it("sweeps every alternative inside each rule (a regex edit must not silently drop one)", () => {
    const wrong: string[] = [];
    for (const { rule, template, items } of corpus.sweeps)
      for (const item of items)
        if (!rules(template.replace("{}", item)).some((v) => v.startsWith(rule)))
          wrong.push(`${item} (expected: ${rule})`);
    expect(wrong).toEqual([]);
  });

  it("detects every entry of the Hindi list, with and without chandrabindu spelling", () => {
    const wrong: string[] = [];
    for (const w of hiWords.always_blocked) {
      for (const form of [w, w.replace(/ं/g, "ँ")])
        if (!rules(`यह ${form} है`).includes("number word (hi)")) wrong.push(form);
    }
    for (const w of hiWords.blocked_only_with_unit)
      for (const u of hiWords.units)
        if (!rules(`${w} ${u} में`).includes("number word (hi)")) wrong.push(`${w} ${u}`);
    expect(wrong).toEqual([]);
  });

  it("accepts every benign row (false positives would cause needless repair calls and fallbacks)", () => {
    const wrong = (corpus.accept as string[][])
      .map(([name, text]) => [name, rules(text)] as const)
      .filter(([, v]) => v.length > 0);
    expect(wrong).toEqual([]);
  });

  it("renders only known tokens, case-insensitively, never leaving braces; unknown renders empty", () => {
    expect(render("Open at {{BEST.START}}; level {{level.name}}.", TOKENS)).toBe(
      "Open at 13:00; level Hazardous.",
    );
    expect(render("a {{nope}} b", TOKENS)).toBe("a  b");
    expect(render("{{constructor}}{{__proto__}}{{toString}}", TOKENS)).toBe("");
  });

  it("checks language at script level, and does not judge very short text", () => {
    const wrong = (corpus.language as [string, string, boolean][]).filter(
      ([lang, text, ok]) => languageOk(text, lang as "en" | "hi") !== ok,
    );
    expect(wrong).toEqual([]);
    expect(languageOk("ठीक है", "en")).toBe(true);
    expect(languageOk("ok then", "hi")).toBe(true);
    const nineteen = "abcdefghijklmnopqrs";
    expect(languageOk(nineteen, "hi")).toBe(true);
    expect(languageOk(`${nineteen}t`, "hi")).toBe(false);
    // Exact 0.50 and 0.05 Devanagari ratio boundaries on 20-letter strings
    expect(languageOk("कखगघङचछजझञabcdefghij", "hi")).toBe(true);
    expect(languageOk("कabcdefghijklmnopqrs", "en")).toBe(false);
    expect(languageOk("कabcdefghijklmnopqrs", "hi")).toBe(false);
  });

  it("inserts word boundary space when stripping tokens so adjacent words cannot merge", () => {
    expect(rules("one{{aqi.now}}hours")).toContain("spelled time or count (en)");
  });
});

describe("chat numeric faithfulness", () => {
  const allowed = [312, 58, 38.2, 13, 1000];
  it("accepts engine numbers within tolerance and flags invented ones", () => {
    expect(
      unfaithfulNumbers("AQI is 312; a purifier lowers exposure by about 58 and 38.", allowed),
    ).toEqual([]);
    expect(unfaithfulNumbers("A purifier lowers exposure by 75", allowed)).toEqual(["75"]);
    expect(unfaithfulNumbers("Go out at 14:00", allowed)).toEqual(["14", "00"]);
    expect(unfaithfulNumbers("about 13.4 and 14", allowed)).toEqual(["14"]); // small values: absolute tolerance 0.5
    expect(unfaithfulNumbers("about 1005 and 1011", allowed)).toEqual(["1011"]); // large values: relative tolerance 1 %
    expect(unfaithfulNumbers("about 311 and 316", allowed)).toEqual(["316"]); // 312 +- 3.12
    expect(unfaithfulNumbers("Exposure delta is 38.25", [38.25])).toEqual([]); // multi-decimal digits stay intact
  });
  it("flags non-ASCII digits outright and ignores digits inside allowed terms", () => {
    expect(unfaithfulNumbers("AQI ३१२", allowed)).toEqual(["non-ascii digit"]);
    expect(unfaithfulNumbers("Wear an N95 or FFP2 mask", [])).toEqual([]);
  });

  it("findChatSafetyIssue identifies prompt leaks, markup/links, and EN/HI medical claims", () => {
    expect(findChatSafetyIssue("Normal advice for air quality.")).toBeNull();
    expect(findChatSafetyIssue("Leak: CANARY-\u200B7f3a91")).toBe("prompt leak");
    expect(findChatSafetyIssue("See [guide](data:text/html,hi)")).toBe("markup or link");
    expect(findChatSafetyIssue("This CURES asthma quickly")).toBe("medical claim");
    expect(findChatSafetyIssue("यह बीमारी का इलाज है")).toBe("medical claim");
  });
});
