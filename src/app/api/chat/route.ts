import { runGroundedChat } from "@/lib/llm/chat";
import { createGeminiClientFromEnv } from "@/lib/llm/gemini";
import { ChatRequestSchema } from "@/lib/schemas";
import { jsonError, readBoundedJson } from "@/lib/security/headers";
import {
  clientIpFromHeaders,
  takeIpToken,
  tryConsumeDailyLlmQuota,
} from "@/lib/security/rateLimit";

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!takeIpToken("chat", ip)) {
    return jsonError(429, "Rate limit exceeded; please retry shortly.");
  }

  const body = await readBoundedJson(request, 8192);
  if (!body.ok) {
    return jsonError(body.status, body.error);
  }

  const parsed = ChatRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid chat request payload.");
  }

  const client = createGeminiClientFromEnv();
  const quotaAllowed = client ? tryConsumeDailyLlmQuota() : true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runGroundedChat({
          profile: parsed.data.profile,
          context: parsed.data.context,
          history: parsed.data.history,
          message: parsed.data.message,
          client,
          quotaAllowed,
          onToolCall(name, args, toolResult) {
            controller.enqueue(sseEvent("tool", { name, args, result: toolResult }));
          },
          onTextChunk(chunk) {
            controller.enqueue(sseEvent("chunk", { text: chunk }));
          },
        });
        controller.enqueue(sseEvent("done", result));
      } catch {
        controller.enqueue(
          sseEvent("done", {
            text: "Unable to process chat request safely right now.",
            faithful: false,
            fallback: true,
            toolCallsExecuted: 0,
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
