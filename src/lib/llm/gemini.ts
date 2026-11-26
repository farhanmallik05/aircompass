import {
  GoogleGenAI,
  ThinkingLevel,
  createPartFromFunctionResponse,
  type Content,
  type GenerateContentConfig,
  type Part,
  type ThinkingConfig,
} from "@google/genai";
import type {
  ChatToolRoundRequest,
  ChatToolRoundResponse,
  LlmClient,
  PlanGenerationRequest,
  PlanGenerationResponse,
} from "./client";

const DEFAULT_PRIMARY_MODEL = "gemini-3.6-flash";
const DEFAULT_FALLBACK_MODEL = "gemini-3.5-flash";
const PLAN_TIMEOUT_MS = 12_000;
const CHAT_TIMEOUT_MS = 15_000;

function extractNumbersFromRecord(obj: unknown, out: number[]): void {
  if (typeof obj === "number" && Number.isFinite(obj)) {
    out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) extractNumbersFromRecord(item, out);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) extractNumbersFromRecord(v, out);
  }
}

export function getGeminiModels(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY_MODEL;
  const fallback = process.env.GEMINI_MODEL_FALLBACK?.trim() || DEFAULT_FALLBACK_MODEL;
  return primary === fallback ? [primary] : [primary, fallback];
}

const STRIPPED_JSON_SCHEMA_KEYS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
]);

/** Simplifies Zod-generated JSON Schema so Gemini's FSM compiler stays well under serving state limits, while server-side Zod enforces full bounds. */
export function simplifySchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifySchemaForGemini);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (STRIPPED_JSON_SCHEMA_KEYS.has(k)) continue;
      out[k] = simplifySchemaForGemini(v);
    }
    return out;
  }
  return node;
}

export function thinkingConfigForModel(model: string): ThinkingConfig | undefined {
  if (model.startsWith("gemini-3")) return { thinkingLevel: ThinkingLevel.MINIMAL };
  if (model.startsWith("gemini-2.5")) return { thinkingBudget: 0 };
  return undefined;
}

function buildChatContents(req: ChatToolRoundRequest): Content[] {
  return [
    { role: "user", parts: [{ text: req.userContextPrompt }] },
    ...req.history.map((turn) => ({
      role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: req.message }] },
  ];
}

async function runToolCallBatch(
  calls: NonNullable<
    Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>["functionCalls"]
  >,
  round: number,
  req: ChatToolRoundRequest,
  toolNumbers: number[],
): Promise<Part[]> {
  const responseParts: Part[] = [];
  for (const fc of calls) {
    const name = fc.name ?? "simulate_scenario";
    const result = await req.executeTool(name, fc.args ?? {});
    extractNumbersFromRecord(result, toolNumbers);
    req.onToolCall?.(name, fc.args ?? {}, result);
    responseParts.push(createPartFromFunctionResponse(fc.id ?? `${name}-${round}`, name, result));
  }
  return responseParts;
}

async function streamFinalTurn(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
  thinkingConfig: ThinkingConfig | undefined,
  req: ChatToolRoundRequest,
): Promise<string> {
  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: req.systemPrompt,
      temperature: 0.2,
      maxOutputTokens: 900,
      ...(thinkingConfig ? { thinkingConfig } : {}),
      abortSignal: AbortSignal.timeout(req.timeoutMs ?? CHAT_TIMEOUT_MS),
    },
  });

  let fullText = "";
  for await (const chunk of stream) {
    const piece = chunk.text ?? "";
    if (piece) {
      fullText += piece;
      req.onTextChunk?.(piece);
    }
  }
  return fullText;
}

async function runSingleModelChat(
  ai: GoogleGenAI,
  model: string,
  req: ChatToolRoundRequest,
): Promise<ChatToolRoundResponse> {
  const contents = buildChatContents(req);
  const toolNumbers: number[] = [];
  let toolCallsExecuted = 0;
  const thinkingConfig = thinkingConfigForModel(model);

  for (let round = 0; round < 2; round++) {
    const res = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: req.systemPrompt,
        temperature: 0.2,
        maxOutputTokens: 900,
        tools: [{ functionDeclarations: [req.toolDeclaration] }],
        ...(thinkingConfig ? { thinkingConfig } : {}),
        abortSignal: AbortSignal.timeout(req.timeoutMs ?? CHAT_TIMEOUT_MS),
      },
    });

    const calls = res.functionCalls ?? [];
    if (calls.length === 0) {
      const text = res.text ?? "";
      if (text && req.onTextChunk) req.onTextChunk(text);
      return { text, toolCallsExecuted, toolNumbers, model };
    }

    contents.push({ role: "model", parts: calls.map((fc) => ({ functionCall: fc })) });
    const responseParts = await runToolCallBatch(calls, round, req, toolNumbers);
    toolCallsExecuted += calls.length;
    contents.push({ role: "user", parts: responseParts });
  }

  const fullText = await streamFinalTurn(ai, model, contents, thinkingConfig, req);
  return { text: fullText, toolCallsExecuted, toolNumbers, model };
}

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
  }

  async generatePlanJson(req: PlanGenerationRequest): Promise<PlanGenerationResponse> {
    const models = getGeminiModels();
    const servingSchema = simplifySchemaForGemini(req.schema);
    let lastError: unknown;

    for (const model of models) {
      try {
        const thinkingConfig = thinkingConfigForModel(model);
        const config: GenerateContentConfig = {
          systemInstruction: req.systemPrompt,
          temperature: 0.3,
          maxOutputTokens: 1600,
          responseMimeType: "application/json",
          responseJsonSchema: servingSchema,
          ...(thinkingConfig ? { thinkingConfig } : {}),
          abortSignal: AbortSignal.timeout(req.timeoutMs ?? PLAN_TIMEOUT_MS),
        };
        const res = await this.ai.models.generateContent({
          model,
          contents: req.userPrompt,
          config,
        });
        return {
          rawText: res.text ?? "",
          model,
          inputTokens: res.usageMetadata?.promptTokenCount,
          outputTokens: res.usageMetadata?.candidatesTokenCount,
        };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Gemini plan generation failed");
  }

  async chatWithTools(req: ChatToolRoundRequest): Promise<ChatToolRoundResponse> {
    const models = getGeminiModels();
    let lastError: unknown;
    for (const model of models) {
      try {
        return await runSingleModelChat(this.ai, model, req);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Gemini chat failed");
  }
}

export function createGeminiClientFromEnv(): LlmClient | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GeminiClient(apiKey);
}
