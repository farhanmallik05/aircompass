import { createGeminiClientFromEnv } from "@/lib/llm/gemini";
import { generatePlanWithFallback } from "@/lib/llm/planner";
import { PlanRequestSchema } from "@/lib/schemas";
import { validateJsonPost } from "@/lib/security/headers";
import { tryConsumeDailyLlmQuota } from "@/lib/security/rateLimit";

/** Generates a tailored household action plan from engine facts and optional Gemini wording. */
export async function POST(request: Request): Promise<Response> {
  const validated = await validateJsonPost(
    request,
    "plan",
    PlanRequestSchema,
    "Invalid plan request payload.",
  );
  if (!validated.ok) return validated.response;

  const client = createGeminiClientFromEnv();
  const quotaAllowed = client ? tryConsumeDailyLlmQuota() : true;
  const result = await generatePlanWithFallback(
    validated.data.profile,
    validated.data.context,
    client,
    { quotaAllowed },
  );

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
