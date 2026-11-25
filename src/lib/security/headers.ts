const MAX_BODY_BYTES = 8192;

export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413 | 415; error: string };

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
