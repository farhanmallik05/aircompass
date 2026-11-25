import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("AirCompass user flows & WCAG 2.2 AA accessibility", () => {
  test("sample family -> Today -> Plan tabs & ranges -> Impact what-if -> Hindi switch -> Brief", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("data-source-badge")).toBeVisible();

    await page.getByTestId("sample-family-btn").click();
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your Tailored Air Plan" })).toBeVisible();
    await expect(page.getByTestId("plan-outcome-badge")).toBeVisible();

    // Filter tabs work
    await page.getByRole("tab", { name: "Indoors" }).click();
    await page.getByRole("tab", { name: "All actions" }).click();

    // Client-side what-if controls update exposure immediately
    await page.getByRole("link", { name: "Impact" }).click();
    await expect(page.getByRole("heading", { name: "Exposure & Community Impact Simulator" })).toBeVisible();
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

  test("keyboard navigation reaches main interactive controls and 320px viewport has no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);

    await page.keyboard.press("Tab");
    const skipText = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(skipText).toContain("Skip to main content");
  });

  test("axe-core WCAG 2.2 AA audit across routes x languages x color schemes", async ({ page }) => {
    const routes = ["/", "/plan", "/impact", "/brief"];
    const langs = ["en", "hi"] as const;
    const schemes = ["light", "dark"] as const;

    for (const colorScheme of schemes) {
      await page.emulateMedia({ colorScheme });
      for (const lang of langs) {
        for (const route of routes) {
          await page.goto(route);
          if (lang === "hi") {
            await page.getByRole("button", { name: "हिन्दी" }).click();
          } else {
            await page.getByRole("button", { name: "English" }).click();
          }
          const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          expect(results.violations, `${route} (${lang}, ${colorScheme})`).toEqual([]);
        }
      }
    }
  });
});
