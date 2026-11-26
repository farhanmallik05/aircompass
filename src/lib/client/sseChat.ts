"use client";

import { isRecord } from "@/lib/client/storage";

interface SseEventCallbacks {
  onTool: () => void;
  onChunk: (deltaText: string) => void;
  onDone: (finalText: string, usedTool: boolean) => void;
}

interface ParsedSsePayload {
  text?: string;
  toolCallsExecuted?: number;
}

function parseSsePayload(rawJson: string): ParsedSsePayload | null {
  const parsed: unknown = JSON.parse(rawJson);
  if (!isRecord(parsed)) return null;
  return {
    text: typeof parsed.text === "string" ? parsed.text : undefined,
    toolCallsExecuted:
      typeof parsed.toolCallsExecuted === "number" ? parsed.toolCallsExecuted : undefined,
  };
}

function dispatchSseEvent(
  evName: string,
  payload: ParsedSsePayload,
  state: { usedTool: boolean },
  cb: SseEventCallbacks,
): void {
  if (evName === "tool") {
    state.usedTool = true;
    cb.onTool();
  } else if (evName === "chunk" && payload.text) {
    cb.onChunk(payload.text);
  } else if (evName === "done" && payload.text !== undefined) {
    const used = state.usedTool || (payload.toolCallsExecuted ?? 0) > 0;
    cb.onDone(payload.text, used);
  }
}

function dispatchSseBlock(
  rawEvent: string,
  state: { usedTool: boolean },
  cb: SseEventCallbacks,
): void {
  const lines = rawEvent.split("\n");
  const evLine = lines.find((l) => l.startsWith("event:"));
  const dataLine = lines.find((l) => l.startsWith("data:"));
  if (!evLine || !dataLine) return;

  let payload: ParsedSsePayload | null;
  try {
    payload = parseSsePayload(dataLine.slice(5).trim());
  } catch (err) {
    console.warn(
      "[sseChat] Skipping malformed SSE frame:",
      err instanceof Error ? err.message : String(err),
    );
    return;
  }
  if (!payload) return;
  dispatchSseEvent(evLine.slice(6).trim(), payload, state, cb);
}

/** Reads an SSE ReadableStream from /api/chat and dispatches tool, chunk, and done callbacks. */
export async function consumeChatSseStream(
  body: ReadableStream<Uint8Array>,
  cb: SseEventCallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { usedTool: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const rawEvent of events) {
      dispatchSseBlock(rawEvent, state, cb);
    }
  }
}
