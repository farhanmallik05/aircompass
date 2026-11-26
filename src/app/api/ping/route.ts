/** Lightweight health-check endpoint with no-store caching. */
export function GET(): Response {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
