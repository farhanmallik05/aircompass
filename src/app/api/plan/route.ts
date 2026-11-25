import { createGeminiClientFromEnv } from "@/lib/llm/gemini";
import { generatePlanWithFallback } from "@/lib/llm/planner";
import { PlanRequestSchema } from "@/lib/schemas";
import { jsonError, readBoundedJson } from "@/lib/security/headers";
import {
  clientIpFromHeaders,
  takeIpToken,
  tryConsumeDailyLlmQuota,
} from "@/lib/security/rateLimit";

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!takeIpToken("plan", ip)) {
    return jsonError(429, "Rate limit exceeded; please retry shortly.");
  }

  const body = await readBoundedJson(request, 8192);
  if (!body.ok) {
    return jsonError(body.status, body.error);
  }

  const parsed = PlanRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(400, "Invalid plan request payload.");
  }

  const client = createGeminiClientFromEnv();
  const quotaAllowed = client ? tryConsumeDailyLlmQuota() : true;
  const result = await generatePlanWithFallback(
    parsed.data.profile,
    parsed.data.context,
    client,
    { quotaAllowed },
  );

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
