import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe("AirCompass user flows & WCAG 2.2 AA accessibility", () => {
  test("sample family -> Today -> Plan tabs & ranges -> Impact what-if -> Hindi switch -> Brief", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(page).toHaveTitle("Today's Air & Household Plan — AirCompass");
    await expect(page.getByTestId("data-source-badge")).toBeVisible();

    await page.getByRole("button", { name: "Show as table" }).click();
    const hourlyTable = page.getByRole("table");
    await expect(hourlyTable.locator("caption")).toHaveCount(1);
    await expect(hourlyTable.locator('th[scope="col"]')).toHaveCount(4);
    await expect(hourlyTable.locator('th[scope="row"]').first()).toBeVisible();

    await page.getByTestId("sample-family-btn").click();
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page).toHaveTitle(/— AirCompass$/);
    await expect(page.getByRole("heading", { name: "Your Tailored Air Plan" })).toBeVisible();
    const badge = page.getByTestId("plan-outcome-badge");
    await expect(badge).toBeVisible();
    if (!process.env.LIVE_E2E && !process.env.BASE_URL) {
      await expect(badge).toContainText("Engine plan");
    }
    await expect(page.getByRole("status").filter({ hasText: "Plan updated:" })).toBeAttached();

    // Filter tabs work (click + WAI-ARIA ArrowRight/Home/End keyboard pattern)
    const allTab = page.getByRole("tab", { name: "All actions" });
    await allTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Routine" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Swaps" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(allTab).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Indoors" }).click();
    await allTab.click();

    // Grounded what-if chat live region updates with fallback simulation reply
    await page.locator("#whatif-chat-input").fill("What if we add a HEPA purifier?");
    await page.getByRole("button", { name: "Ask" }).click();
    const chatSection = page.locator(
      "section[aria-labelledby='chat-heading'] div[aria-live='polite']",
    );
    await expect(chatSection).toContainText("AQI");

    // Client-side what-if controls update exposure immediately
    await page.getByRole("link", { name: "Impact" }).click();
    await expect(
      page.getByRole("heading", { name: "Exposure & Community Impact Simulator" }),
    ).toBeVisible();
    const beforeText = await page.getByTestId("impact-after-ugm3").textContent();
    await page.locator("#sim-purifier").selectOption("hepa");
    const afterText = await page.getByTestId("impact-after-ugm3").textContent();
    expect(afterText).not.toBe(beforeText);

    // Language switch updates <html lang="hi">
    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Community brief loads cleanly
    await page.getByRole("link", { name: "Community Brief" }).click();
    await expect(
      page.getByRole("heading", { name: "Community & RWA Clean-Air Brief", exact: true }),
    ).toBeVisible();
  });

  test("full keyboard journey: skip link, setup validation/recovery, tabs, chat, route h1 focus & 320px reflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");

    // Keyboard open setup -> Enter inside #place-search runs place search without closing form -> trigger error -> fix -> submit
    await page.getByTestId("toggle-setup-btn").focus();
    await page.keyboard.press("Enter");
    await page.route("**/api/context?q=**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          places: [{ name: "Delhi", admin1: "Delhi", country: "IN", lat: 28.61, lon: 77.21 }],
        }),
      });
    });
    const placeSearch = page.locator("#place-search");
    await placeSearch.fill("Delhi");
    await placeSearch.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "1 matching places shown" }),
    ).toBeVisible();
    await expect(placeSearch).toBeVisible();
    await page.locator("#room-area").fill("2");
    await page.getByRole("button", { name: "Build my household plan" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("alert").filter({ hasText: "Please check the highlighted fields" }),
    ).toBeFocused();
    await expect(page.locator("#room-area")).toHaveAttribute("aria-invalid", "true");
    await page.locator("#room-area").fill("16");
    await page.getByRole("button", { name: "Build my household plan" }).click();

    // Navigate via link and verify h1 receives programmatic focus + tabpanel is keyboard reachable
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your Tailored Air Plan" })).toBeFocused();
    await expect(page.locator("#plan-tabpanel")).toHaveAttribute("tabindex", "0");
  });

  test("surface honest upstream fallback notice when live data fails without relabeling Greater Noida", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const demoData = (await (await page.request.get("/api/context?mode=demo")).json()) as {
      context: unknown;
    };
    await page.route("**/api/context?**mode=live**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          context: demoData.context,
          requestedPlace: { name: "Delhi", lat: 28.61, lon: 77.21, country: "IN" },
          upstreamFallback: true,
        }),
      });
    });
    await page.getByRole("button", { name: "Live forecast" }).click();
    await expect(page.getByTestId("upstream-fallback-banner")).toContainText("Greater Noida");
  });

  test("axe-core WCAG 2.2 AA audit across routes x languages x color schemes + populated states", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const routes = ["/", "/plan", "/impact", "/brief"];
    const langs = ["en", "hi"] as const;
    const schemes = ["light", "dark"] as const;

    for (const colorScheme of schemes) {
      await page.emulateMedia({ colorScheme });
      for (const lang of langs) {
        for (const route of routes) {
          await page.goto(route);
          await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
          if (lang === "hi") {
            await page.getByRole("button", { name: "हिन्दी" }).click();
          } else {
            await page.getByRole("button", { name: "English" }).click();
          }
          const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          expect(results.violations, `${route} (${lang}, ${colorScheme})`).toEqual([]);
        }
      }
    }

    // Populated state audits: Setup form error state + Plan with sample family + Chat reply
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByRole("button", { name: "English" }).click();
    await page.getByTestId("toggle-setup-btn").click();
    await page.locator("#room-area").fill("2");
    await page.getByRole("button", { name: "Build my household plan" }).click();
    const formErrAudit = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(formErrAudit.violations, "populated SetupForm error state").toEqual([]);

    await page.getByTestId("sample-family-btn").click();
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await page.locator("#whatif-chat-input").fill("What if I seal windows?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(
      page.locator("section[aria-labelledby='chat-heading'] div[aria-live='polite']"),
    ).toContainText("AQI");
    const planChatAudit = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(planChatAudit.violations, "populated Plan + Chat state").toEqual([]);
  });
});
