import type { FunctionDeclaration } from "@google/genai";

export interface PlanGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  timeoutMs?: number;
}

export interface PlanGenerationResponse {
  rawText: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatToolRoundRequest {
  systemPrompt: string;
  userContextPrompt: string;
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
  toolDeclaration: FunctionDeclaration;
  executeTool: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  onTextChunk?: (chunk: string) => void;
  onToolCall?: (name: string, args: unknown, result: Record<string, unknown>) => void;
  timeoutMs?: number;
}

export interface ChatToolRoundResponse {
  text: string;
  toolCallsExecuted: number;
  toolNumbers: number[];
  model: string;
}

export interface LlmClient {
  generatePlanJson(req: PlanGenerationRequest): Promise<PlanGenerationResponse>;
  chatWithTools(req: ChatToolRoundRequest): Promise<ChatToolRoundResponse>;
}
