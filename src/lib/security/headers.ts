import type { ZodType } from "zod";
import { clientIpFromHeaders, takeIpToken } from "./rateLimit";

const MAX_BODY_BYTES = 8192;

export type JsonBodyResult =
  { ok: true; data: unknown } | { ok: false; status: 400 | 413 | 415; error: string };

/** Enforces JSON content-type and <= 8 KB payload cap before parsing. */
export async function readBoundedJson(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<JsonBodyResult> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return { ok: false, status: 415, error: "Expected application/json content-type" };
  }

  const lenHeader = request.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > maxBytes) {
    return { ok: false, status: 413, error: "Request body exceeds 8 KB limit" };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, status: 413, error: "Request body exceeds 8 KB limit" };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON payload" };
  }
}

export function jsonError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/** Applies rate limiting, bounded JSON parsing, and Zod validation for POST routes. */
export async function validateJsonPost<T>(
  request: Request,
  scope: string,
  schema: ZodType<T>,
  invalidMessage: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const ip = clientIpFromHeaders(request.headers);
  if (!takeIpToken(scope, ip)) {
    return { ok: false, response: jsonError(429, "Rate limit exceeded; please retry shortly.") };
  }

  const body = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return { ok: false, response: jsonError(body.status, body.error) };
  }

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, invalidMessage) };
  }

  return { ok: true, data: parsed.data };
}
