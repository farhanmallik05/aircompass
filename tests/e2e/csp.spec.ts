import { test, expect, type Page } from "@playwright/test";

/**
 * Production CSP regression gate. Run against production build locally or deployed URL:
 *   BASE_URL=https://<project>.vercel.app npx playwright test csp
 * Fails on: CSP violations, console/page errors, missing nonces, dead hydration, cacheable HTML, missing headers.
 */
type Violation = { directive: string; blocked: string; sample: string };

async function watch(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    (window as unknown as { __csp: unknown[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      (window as unknown as { __csp: unknown[] }).__csp.push({
        directive: e.violatedDirective,
        blocked: e.blockedURI,
        sample: e.sample,
      }),
    );
  });
  return {
    errors,
    violations: () =>
      page.evaluate(() => (window as unknown as { __csp: Violation[] }).__csp),
  };
}

const nonceOf = (csp: string | undefined) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

test("page hydrates with no CSP violations or console errors", async ({ page }) => {
  const w = await watch(page);
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  const setupToggle = page.getByTestId("toggle-setup-btn");
  await expect(setupToggle).toHaveAttribute("aria-expanded", "false");
  await setupToggle.click();
  await expect(setupToggle).toHaveAttribute("aria-expanded", "true"); // proves React hydration ran under nonce CSP
  expect(await w.violations(), "CSP violations").toEqual([]);
  expect(w.errors, "console/page errors").toEqual([]);
});

test("every script and style tag carries the response nonce, and nonces are per request", async ({ page, request }) => {
  const a = await request.get("/");
  const b = await request.get("/");
  const na = nonceOf(a.headers()["content-security-policy"]);
  const nb = nonceOf(b.headers()["content-security-policy"]);
  expect(na).toBeTruthy();
  expect(nb).toBeTruthy();
  expect(na).not.toBe(nb);

  const html = await a.text();
  const tags = [...html.matchAll(/<(script|style)\b[^>]*>/g)].map((m) => m[0]);
  const bad = tags.filter((t) => !t.includes(`nonce="${na}"`) && !/\bsrc=|\bhref=/.test(t));
  expect(bad, "inline tags without the matching nonce").toEqual([]);
  void page;
});

test("client-side navigation works under the CSP", async ({ page }) => {
  const w = await watch(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your Tailored Air Plan" })).toBeVisible();
  expect(await w.violations()).toEqual([]);
  expect(w.errors).toEqual([]);
});

test("CSP is strict: no unsafe-inline/unsafe-eval for scripts in production", async ({ request }) => {
  const csp = (await request.get("/")).headers()["content-security-policy"] ?? "";
  const script = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  expect(script).toContain("'strict-dynamic'");
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) expect(csp).toContain(d);
});

test("document responses are not publicly cacheable (a cached nonce would break the page)", async ({ request }) => {
  const h = (await request.get("/")).headers();
  expect(h["cache-control"] ?? "").not.toMatch(/s-maxage|public/i);
  expect(h["x-vercel-cache"] ?? "", "edge must not serve cached HTML").not.toBe("HIT");
});

test("static security headers on pages and API routes", async ({ request }) => {
  for (const path of ["/", "/api/ping"]) {
    const h = (await request.get(path)).headers();
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
});
