"use client";

export interface SseEventCallbacks {
  onTool: () => void;
  onChunk: (deltaText: string) => void;
  onDone: (finalText: string, usedTool: boolean) => void;
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

  let payload: { text?: string; toolCallsExecuted?: number };
  try {
    payload = JSON.parse(dataLine.slice(5).trim()) as {
      text?: string;
      toolCallsExecuted?: number;
    };
  } catch (err) {
    console.warn(
      "[sseChat] Skipping malformed SSE frame:",
      err instanceof Error ? err.message : String(err),
    );
    return;
  }

  const evName = evLine.slice(6).trim();
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
