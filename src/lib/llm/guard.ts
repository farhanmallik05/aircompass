import hiWords from "../../../data/number-words.hi.json";

/**
 * Output guard for LLM text. Policy: the model never writes a figure. It writes {{tokens}}; code renders them.
 * Anything that looks like a quantity, a time, a unit, a link, markup, a medical claim or a prompt leak is a violation.
 * Layered on top of schema validation, id allow-lists and (for chat) numeric faithfulness.
 * Known gaps are listed in docs/METHODOLOGY.md (letter-spaced numbers, non-EN/HI languages, Hindi words not in the list).
 */
export const PROMPT_CANARY = "CANARY-7f3a91";
export type Tokens = Record<string, string>;

const TOKEN = /\{\{([a-z0-9_.]+)\}\}/gi;
/** Terms that legitimately contain digits. Unicode-aware boundaries (\b is ASCII-only and fails next to Devanagari). */
const ALLOWED_TERMS =
  /(?<![\p{L}\p{N}])(?:N95|FFP2|PM2\.5|PM10|CO2e|HEPA|MERV-?13)(?![\p{L}\p{N}])/gu;

const ONE_TO_TWELVE = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const EN_BIG =
  /\b(?:eleven|twelve|(?:thir|four|fif|six|seven|eigh|nine)teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|dozens?|half|halves|double[ds]?|triple[ds]?|twice|thrice|quarters?|thirds|fifths|tenths|per ?cent|percent(?:age)?s?)\b/;
const EN_FRACTION = new RegExp(
  `\\b${ONE_TO_TWELVE}[- ](?:half|halves|third|thirds|fourth|fourths|fifth|fifths|quarter|quarters|tenth|tenths)\\b`,
);
const EN_WITH_UNIT = new RegExp(
  `\\b${ONE_TO_TWELVE}[- ]?(?:o['’]?clock|a\\.?m\\.?|p\\.?m\\.?|hours?|hrs?|minutes?|mins?|days?|weeks?|degrees?)(?![a-z])`,
);
const EN_AT_TIME = new RegExp(
  `\\b(?:at|between|from|until|till|by|around|after|before)\\s+${ONE_TO_TWELVE}\\b`,
);
const UNIT_OR_SIGN = /[%٪﹪％]|µg|μg|\bug\/m|°|\bdegrees? (?:c|f|celsius|fahrenheit)\b/;
const MARKUP = /<\/?[a-z!][^>]*>|https?:\/\/|www\.|\]\(|javascript:|data:text|&#?\w+;/i;
const MEDICAL_EN =
  /\b(?:cures?|cured|curing|diagnos\w*|prescri\w*|dosage|doses?|mg|mcg|ml|antibiotics?|steroids?|guarantee[ds]?|risk-free|(?:completely|totally|100) ?(?:%|percent)? safe)\b/;
const MEDICAL_HI = ["इलाज", "खुराक", "गारंटी", "निदान", "नुस्खा"];

const norm = (s: string) => s.normalize("NFKC").replace(/\p{Cf}/gu, "");
const hiNorm = (s: string) => norm(s).replace(/ँ/g, "ं").toLowerCase(); // chandrabindu -> anusvara
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hiAny = (words: string[]) =>
  new RegExp(
    `(?<![\\p{L}\\p{M}])(?:${words.map((w) => esc(hiNorm(w))).join("|")})(?![\\p{L}\\p{M}])`,
    "u",
  );

const HI_BLOCKED = hiAny([...hiWords.always_blocked]);
const HI_WITH_UNIT = new RegExp(
  `(?<![\\p{L}\\p{M}])(?:${hiWords.blocked_only_with_unit.map((w) => esc(hiNorm(w))).join("|")})\\s*(?:${hiWords.units.map((u) => esc(hiNorm(u))).join("|")})(?![\\p{L}\\p{M}])`,
  "u",
);
const HI_MEDICAL = hiAny(MEDICAL_HI);

function pushEnglishViolations(low: string, out: string[]): void {
  if (EN_BIG.test(low) || EN_FRACTION.test(low)) out.push("number word (en)");
  if (EN_WITH_UNIT.test(low) || EN_AT_TIME.test(low)) out.push("spelled time or count (en)");
  if (MEDICAL_EN.test(low)) out.push("medical claim (en)");
}

function pushHindiViolations(hi: string, out: string[]): void {
  if (HI_BLOCKED.test(hi) || HI_WITH_UNIT.test(hi)) out.push("number word (hi)");
  if (HI_MEDICAL.test(hi)) out.push("medical claim (hi)");
}

/** Returns a list of violation labels; empty means the text is acceptable. `tokens` is the set of valid token keys. */
export function findViolations(raw: string, tokens: Tokens): string[] {
  const v: string[] = [];
  const text = norm(raw);

  for (const m of text.matchAll(TOKEN)) {
    if (!Object.hasOwn(tokens, m[1].toLowerCase())) v.push(`unknown token: ${m[1]}`);
  }

  const bare = text.replace(TOKEN, " ").replace(ALLOWED_TERMS, " ");
  if (/\{|\}|\$\{|<%/.test(bare)) v.push("malformed placeholder");
  if (/\p{Nd}/u.test(bare)) v.push("raw digit");
  if (UNIT_OR_SIGN.test(bare.toLowerCase())) v.push("unit or percent sign");
  if (MARKUP.test(bare)) v.push("markup or link");

  pushEnglishViolations(bare.toLowerCase(), v);
  pushHindiViolations(hiNorm(bare), v);

  if (raw.includes(PROMPT_CANARY) || text.includes(PROMPT_CANARY)) v.push("prompt leak");
  return v;
}

/** Substitute tokens after the guard passed. Own-property lookup blocks prototype keys. */
export const render = (t: string, k: Tokens): string =>
  t.replace(TOKEN, (_m, key: string) => {
    const low = key.toLowerCase();
    return Object.hasOwn(k, low) ? (k[low] ?? "") : "";
  });

/** Script-level language check (not semantic): Hindi needs mostly Devanagari letters, English almost none. */
export function languageOk(text: string, lang: "en" | "hi"): boolean {
  const letters = [
    ...norm(text).replace(TOKEN, " ").replace(ALLOWED_TERMS, " ").matchAll(/\p{L}/gu),
  ].map((m) => m[0]);
  if (letters.length < 20) return true;
  const dev = letters.filter((ch) => /\p{Script=Devanagari}/u.test(ch)).length / letters.length;
  return lang === "hi" ? dev >= 0.5 : dev < 0.05;
}

/** Chat: every number in the answer must match a number the engine supplied (facts or tool results). */
export function unfaithfulNumbers(
  text: string,
  allowed: readonly number[],
  tol = { abs: 0.5, rel: 0.01 },
): string[] {
  const t = norm(text).replace(ALLOWED_TERMS, " ");
  if (/[\u0966-\u096F\u0660-\u0669]/.test(t)) return ["non-ascii digit"];
  const bad: string[] = [];
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (!allowed.some((a) => Math.abs(a - n) <= Math.max(tol.abs, Math.abs(a) * tol.rel)))
      bad.push(m[0]);
  }
  return bad;
}
