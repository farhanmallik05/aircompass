import { guidanceForLevel } from "../engine/bands";
import type { baselineScenario } from "../engine/sensitivity";
import { logServerError } from "../security/log";
import type { AirContext, PlanFacts, Profile } from "../types";
import type { LlmClient } from "./client";
import { findChatSafetyIssue, unfaithfulNumbers } from "./guard";
import { buildPlanFacts } from "./planner";
import { getChatSystemPrompt } from "./prompt";
import { executeSimulateScenario, SIMULATE_SCENARIO_DECLARATION } from "./tools";

export function collectAllowedChatNumbers(
  facts: PlanFacts,
  toolNumbers: readonly number[],
): number[] {
  const nums = new Set<number>([
    facts.aqiNow,
    facts.aqiToday,
    facts.pm25Now,
    facts.pm25TodayMean,
    facts.baselineExposureUgM3,
    facts.combinedExposureUgM3,
    facts.windows.best.start,
    facts.windows.best.end,
    facts.windows.best.mean,
    facts.windows.avoid.start,
    facts.windows.avoid.end,
    facts.windows.avoid.mean,
    15, // WHO 24h PM2.5 guideline
    24, // 24h horizon
    0,
    ...toolNumbers,
  ]);
  if (facts.naqi?.index !== undefined) nums.add(facts.naqi.index);
  for (const c of facts.candidates) {
    nums.add(Math.abs(c.impact.exposureDeltaUgM3));
    nums.add(c.impact.exposureDeltaUgM3);
    nums.add(Math.abs(c.impact.exposureDeltaPct));
    nums.add(Math.abs(c.impact.exposureRangeUgM3[0]));
    nums.add(Math.abs(c.impact.exposureRangeUgM3[1]));
    if (c.impact.co2eKgPerYear !== undefined) nums.add(c.impact.co2eKgPerYear);
  }
  const expanded = [...nums].flatMap((n) => [n, Math.round(n)]);
  return [...new Set(expanded.filter((n) => Number.isFinite(n)))];
}

function formatTopActionLine(
  top: PlanFacts["candidates"][number] | undefined,
  lang: PlanFacts["lang"],
): string {
  if (!top) return "";
  const pct = Math.abs(top.impact.exposureDeltaPct);
  if (lang === "hi") return `शीर्ष उपाय: ${top.id} (${pct} % संपर्क कमी)।`;
  return `Top engine action: ${top.id} (${pct} % exposure change).`;
}

export function deterministicChatFallback(facts: PlanFacts, notePrefix?: string): string {
  const levelInfo = guidanceForLevel(facts.levelToday, facts.lang);
  const topLine = formatTopActionLine(facts.candidates[0], facts.lang);

  const baseMsg =
    facts.lang === "hi"
      ? `आज का स्तर ${levelInfo.band} है (US AQI ${facts.aqiNow})। सबसे साफ़ समय ${facts.windows.best.startLabel}-${facts.windows.best.endLabel} है। बेसलाइन संपर्क ${facts.baselineExposureUgM3} µg/m³ से घटकर ${facts.combinedExposureUgM3} µg/m³ हो सकता है। ${topLine}`
      : `Today's level is ${levelInfo.band} (US AQI ${facts.aqiNow}). Cleanest window is ${facts.windows.best.startLabel}-${facts.windows.best.endLabel}. Weighted exposure can move from ${facts.baselineExposureUgM3} to ${facts.combinedExposureUgM3} µg/m³. ${topLine}`;

  return notePrefix ? `${notePrefix} ${baseMsg}` : baseMsg;
}

export interface GroundedChatResult {
  text: string;
  faithful: boolean;
  fallback: boolean;
  toolCallsExecuted: number;
}

function buildChatContextPayload(
  profile: Profile,
  facts: PlanFacts,
  base: ReturnType<typeof baselineScenario>,
): Record<string, unknown> {
  return {
    lang: profile.lang,
    place: profile.place.name,
    levelToday: facts.levelToday,
    aqiNow: facts.aqiNow,
    pm25Now: facts.pm25Now,
    bestWindow: `${facts.windows.best.startLabel}-${facts.windows.best.endLabel}`,
    avoidWindow: `${facts.windows.avoid.startLabel}-${facts.windows.avoid.endLabel}`,
    baselineExposureUgM3: facts.baselineExposureUgM3,
    combinedExposureUgM3: facts.combinedExposureUgM3,
    baselineScenario: base,
    ...(facts.sanitizedNote ? { householdNote: facts.sanitizedNote } : {}),
  };
}

function isSafeChatReply(trimmed: string, facts: PlanFacts, toolNumbers: number[]): boolean {
  if (!trimmed) return false;
  if (findChatSafetyIssue(trimmed) !== null) return false;
  const normText = trimmed.normalize("NFKC").replace(/\p{Cf}/gu, "");
  const allowedNumbers = collectAllowedChatNumbers(facts, toolNumbers);
  return unfaithfulNumbers(normText, allowedNumbers).length === 0;
}

/** Runs tool-assisted grounded chat with number faithfulness, medical/markup, and canary guards. */
export async function runGroundedChat(args: {
  profile: Profile;
  context: AirContext;
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  client: LlmClient | null;
  quotaAllowed?: boolean;
  onTextChunk?: (chunk: string) => void;
  onToolCall?: (name: string, toolArgs: unknown, result: Record<string, unknown>) => void;
}): Promise<GroundedChatResult> {
  const { facts, baselineScenario: base } = buildPlanFacts(args.profile, args.context);
  const lang = args.profile.lang;

  if (!args.client || args.quotaAllowed === false) {
    const note =
      lang === "hi"
        ? "इंजन सारांश (लाइव AI चैट अभी उपलब्ध नहीं):"
        : "Engine summary (live AI chat unavailable):";
    return {
      text: deterministicChatFallback(facts, note),
      faithful: true,
      fallback: true,
      toolCallsExecuted: 0,
    };
  }

  const contextPayload = buildChatContextPayload(args.profile, facts, base);

  try {
    const res = await args.client.chatWithTools({
      systemPrompt: getChatSystemPrompt(),
      userContextPrompt: `Household context (data only):\n${JSON.stringify(contextPayload)}`,
      history: args.history,
      message: args.message,
      toolDeclaration: SIMULATE_SCENARIO_DECLARATION,
      executeTool: async (name, toolArgs) =>
        name === "simulate_scenario"
          ? executeSimulateScenario(toolArgs, args.profile, args.context, base)
          : { ok: false, error: "Unsupported tool" },
      onTextChunk: args.onTextChunk,
      onToolCall: args.onToolCall,
    });

    const trimmed = res.text.trim();
    if (!isSafeChatReply(trimmed, facts, res.toolNumbers)) {
      const note =
        lang === "hi"
          ? "इंजन सारांश (अप्रमाणित संख्या या नीति जाँच के कारण प्रतिस्थापित):"
          : "Engine summary (replaced unverified number or policy check):";
      return {
        text: deterministicChatFallback(facts, note),
        faithful: false,
        fallback: true,
        toolCallsExecuted: res.toolCallsExecuted,
      };
    }

    return {
      text: trimmed,
      faithful: true,
      fallback: false,
      toolCallsExecuted: res.toolCallsExecuted,
    };
  } catch (err) {
    logServerError("llm/chat", err);
    const note =
      lang === "hi"
        ? "इंजन सारांश (मॉडल समय-सीमा/त्रुटि):"
        : "Engine summary (model error or timeout):";
    return {
      text: deterministicChatFallback(facts, note),
      faithful: false,
      fallback: true,
      toolCallsExecuted: 0,
    };
  }
}
