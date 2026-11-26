import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SIMULATE_SCENARIO_DECLARATION } from "@/lib/llm/tools";

const generateContentMock = vi.fn();
const generateContentStreamMock = vi.fn();

vi.mock("@google/genai", () => {
  return {
    ThinkingLevel: { MINIMAL: "MINIMAL" },
    createPartFromFunctionResponse: (
      id: string,
      name: string,
      response: Record<string, unknown>,
    ) => ({
      functionResponse: { id, name, response },
    }),
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: generateContentMock,
        generateContentStream: generateContentStreamMock,
      };
    },
  };
});

import {
  GeminiClient,
  createGeminiClientFromEnv,
  getGeminiModels,
  simplifySchemaForGemini,
  thinkingConfigForModel,
} from "@/lib/llm/gemini";

describe("gemini.ts SDK adapter and model failover", () => {
  const prevKey = process.env.GEMINI_API_KEY;
  const prevModel = process.env.GEMINI_MODEL;
  const prevFallback = process.env.GEMINI_MODEL_FALLBACK;

  beforeEach(() => {
    generateContentMock.mockReset();
    generateContentStreamMock.mockReset();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_FALLBACK;
  });

  afterEach(() => {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    else delete process.env.GEMINI_API_KEY;
    if (prevModel !== undefined) process.env.GEMINI_MODEL = prevModel;
    else delete process.env.GEMINI_MODEL;
    if (prevFallback !== undefined) process.env.GEMINI_MODEL_FALLBACK = prevFallback;
    else delete process.env.GEMINI_MODEL_FALLBACK;
  });

  it("handles env model resolution, deduplication, and thinking config variants", () => {
    expect(getGeminiModels()).toEqual(["gemini-3.6-flash", "gemini-3.5-flash"]);
    process.env.GEMINI_MODEL = "gemini-3.5-flash";
    process.env.GEMINI_MODEL_FALLBACK = "gemini-3.5-flash";
    expect(getGeminiModels()).toEqual(["gemini-3.5-flash"]);

    expect(thinkingConfigForModel("gemini-3.6-flash")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(thinkingConfigForModel("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigForModel("custom-model")).toBeUndefined();

    expect(createGeminiClientFromEnv()).toBeNull();
    process.env.GEMINI_API_KEY = "   ";
    expect(createGeminiClientFromEnv()).toBeNull();
    process.env.GEMINI_API_KEY = "test-key";
    expect(createGeminiClientFromEnv()).toBeInstanceOf(GeminiClient);
  });

  it("simplifies JSON Schema recursively without altering allowed constraints", () => {
    const raw = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 80 },
        items: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: [{ type: "string", minLength: 2 }],
        },
      },
    };
    const out = simplifySchemaForGemini(raw) as Record<string, unknown>;
    expect(out.$schema).toBeUndefined();
    const props = out.properties as Record<string, Record<string, unknown>>;
    expect(props.title?.minLength).toBeUndefined();
    expect(props.title?.maxLength).toBeUndefined();
    expect(props.items?.minItems).toBeUndefined();
    expect(props.items?.maxItems).toBeUndefined();
    expect(props.items?.type).toBe("array");
  });

  it("generatePlanJson returns metadata on primary success and falls back cleanly on primary failure", async () => {
    const client = new GeminiClient("fake-key");
    generateContentMock.mockResolvedValueOnce({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80 },
    });

    const first = await client.generatePlanJson({
      systemPrompt: "sys",
      userPrompt: "usr",
      schema: { type: "object" },
    });
    expect(first).toEqual({
      rawText: '{"ok":true}',
      model: "gemini-3.6-flash",
      inputTokens: 120,
      outputTokens: 80,
    });

    generateContentMock.mockRejectedValueOnce(new Error("primary 503"));
    generateContentMock.mockResolvedValueOnce({ text: '{"repaired":true}' });
    const fallback = await client.generatePlanJson({
      systemPrompt: "sys",
      userPrompt: "usr",
      schema: { type: "object" },
      timeoutMs: 5000,
    });
    expect(fallback.model).toBe("gemini-3.5-flash");
    expect(fallback.rawText).toBe('{"repaired":true}');

    generateContentMock.mockRejectedValue(new Error("all down"));
    await expect(
      client.generatePlanJson({ systemPrompt: "sys", userPrompt: "usr", schema: {} }),
    ).rejects.toThrow("all down");
  });

  it("chatWithTools handles direct reply, 2-round tool execution, streaming tail, and failover", async () => {
    const client = new GeminiClient("fake-key");
    const chunks: string[] = [];

    // Direct reply without function calls
    generateContentMock.mockResolvedValueOnce({ text: "Best window is 15:00-17:00." });
    const direct = await client.chatWithTools({
      systemPrompt: "sys",
      userContextPrompt: "ctx",
      history: [{ role: "assistant", text: "Hi" }],
      message: "When should I go out?",
      toolDeclaration: SIMULATE_SCENARIO_DECLARATION,
      executeTool: async () => ({}),
      onTextChunk: (c) => chunks.push(c),
    });
    expect(direct.toolCallsExecuted).toBe(0);
    expect(direct.text).toBe("Best window is 15:00-17:00.");
    expect(chunks).toEqual(["Best window is 15:00-17:00."]);

    // Exhausts 2 tool rounds, then streams final text
    generateContentMock.mockResolvedValueOnce({
      functionCalls: [{ id: "c1", name: "simulate_scenario", args: { purifier: "hepa" } }],
    });
    generateContentMock.mockResolvedValueOnce({
      functionCalls: [{ name: "simulate_scenario", args: { n95Outdoors: true } }],
    });
    generateContentStreamMock.mockResolvedValueOnce(
      (async function* () {
        yield { text: "Exposure drops " };
        yield { text: "to 45.2 ug/m3." };
      })(),
    );

    const toolEvents: string[] = [];
    const streamedChunks: string[] = [];
    const streamed = await client.chatWithTools({
      systemPrompt: "sys",
      userContextPrompt: "ctx",
      history: [{ role: "user", text: "Prior question" }],
      message: "What with HEPA + N95?",
      toolDeclaration: SIMULATE_SCENARIO_DECLARATION,
      executeTool: async () => ({ ok: true, afterUgM3: 45.2, rangeUgM3: [38, 52] }),
      onToolCall: (name) => toolEvents.push(name),
      onTextChunk: (c) => streamedChunks.push(c),
      timeoutMs: 8000,
    });

    expect(streamed.toolCallsExecuted).toBe(2);
    expect(streamed.toolNumbers).toEqual([45.2, 38, 52, 45.2, 38, 52]);
    expect(streamed.text).toBe("Exposure drops to 45.2 ug/m3.");
    expect(toolEvents).toEqual(["simulate_scenario", "simulate_scenario"]);
    expect(streamedChunks).toEqual(["Exposure drops ", "to 45.2 ug/m3."]);

    // Custom model without thinkingConfig, sparse functionCall defaults, and empty response text
    process.env.GEMINI_MODEL = "custom-model";
    process.env.GEMINI_MODEL_FALLBACK = "custom-model";
    generateContentMock.mockResolvedValueOnce({ functionCalls: [{}] });
    generateContentMock.mockResolvedValueOnce({});
    const customRes = await client.chatWithTools({
      systemPrompt: "sys",
      userContextPrompt: "ctx",
      history: [],
      message: "Check",
      toolDeclaration: SIMULATE_SCENARIO_DECLARATION,
      executeTool: async () => ({ ok: true }),
    });
    expect(customRes.toolCallsExecuted).toBe(1);
    expect(customRes.text).toBe("");

    generateContentMock.mockResolvedValueOnce({});
    const emptyPlan = await client.generatePlanJson({
      systemPrompt: "sys",
      userPrompt: "usr",
      schema: { type: "object" },
    });
    expect(emptyPlan.rawText).toBe("");

    // Non-Error rejection falls back to wrapped Error message cleanly
    generateContentMock.mockRejectedValue("raw failure");
    await expect(
      client.chatWithTools({
        systemPrompt: "sys",
        userContextPrompt: "ctx",
        history: [],
        message: "Help",
        toolDeclaration: SIMULATE_SCENARIO_DECLARATION,
        executeTool: async () => ({}),
      }),
    ).rejects.toThrow("Gemini chat failed");
    await expect(
      client.generatePlanJson({ systemPrompt: "sys", userPrompt: "usr", schema: {} }),
    ).rejects.toThrow("Gemini plan generation failed");
  });
});
