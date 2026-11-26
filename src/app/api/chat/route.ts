import { runGroundedChat } from "@/lib/llm/chat";
import { createGeminiClientFromEnv } from "@/lib/llm/gemini";
import { ChatRequestSchema } from "@/lib/schemas";
import { validateJsonPost, logServerError } from "@/lib/security/headers";
import { tryConsumeDailyLlmQuota } from "@/lib/security/rateLimit";

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Streams grounded what-if Q&A over SSE using the simulate_scenario engine tool. */
export async function POST(request: Request): Promise<Response> {
  const validated = await validateJsonPost(
    request,
    "chat",
    ChatRequestSchema,
    "Invalid chat request payload.",
  );
  if (!validated.ok) return validated.response;

  const client = createGeminiClientFromEnv();
  const quotaAllowed = client ? tryConsumeDailyLlmQuota(validated.ip) : true;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runGroundedChat({
          profile: validated.data.profile,
          context: validated.data.context,
          history: validated.data.history,
          message: validated.data.message,
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
      } catch (err) {
        logServerError("api/chat", err);
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
