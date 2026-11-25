/**
 * AirCompass — Submission Screenshot Capture (12 distinct showcases)
 * Run with: node scripts/capture-screenshots.mjs
 * Requires: Next.js server running on http://localhost:3218
 */

import { chromium } from '../node_modules/@playwright/test/index.mjs';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3218';
const OUT = join(__dirname, '..', 'docs', 'assets');

mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1280, height: 860 };
const MOBILE  = { width: 390,  height: 844 };

async function shot(page, name) {
  const dest = join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`  ✓ ${name}`);
  return dest;
}

async function waitReady(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function loadSampleFamily(page) {
  const btn = page.getByTestId('sample-family-btn');
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1000);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('\n📸 AirCompass — capturing 12 distinct submission screenshots\n');

  // ── SHOT 01: Today view EN light desktop (AQI 259, NAQI 316, Go-out/Avoid windows) ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await shot(pg, 'aircompass-01-today-en.png');
    await ctx.close();
  }

  // ── SHOT 02: Today view — 24h PM2.5 chart, sensitivity & urgent medical care ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.evaluate(() => window.scrollBy(0, 720));
    await pg.waitForTimeout(400);
    await shot(pg, 'aircompass-02-today-chart.png');
    await ctx.close();
  }

  // ── SHOT 03: Mobile responsive layout (390x844, WCAG reflow) ──
  {
    const ctx = await browser.newContext({ viewport: MOBILE, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await shot(pg, 'aircompass-03-mobile.png');
    await ctx.close();
  }

  // ── SHOT 04: Household setup form ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    const setupBtn = pg.getByRole('button', { name: /set up my household/i });
    if (await setupBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await setupBtn.click();
      await pg.waitForTimeout(500);
    }
    await shot(pg, 'aircompass-04-setup.png');
    await ctx.close();
  }

  // ── SHOT 05: Plan view — All actions tab ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await shot(pg, 'aircompass-05-plan-all.png');
    await ctx.close();
  }

  // ── SHOT 06: Plan view — Indoors tab ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    const indoorsTab = pg.getByRole('tab', { name: /indoors/i });
    if (await indoorsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await indoorsTab.click();
      await pg.waitForTimeout(400);
    }
    await shot(pg, 'aircompass-06-plan-indoors.png');
    await ctx.close();
  }

  // ── SHOT 07: Plan view — amber trade-off badge + expanded "How we calculated" ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    const badge = pg.locator('[data-testid^="tradeoff-badge"]').first();
    if (await badge.isVisible({ timeout: 5000 }).catch(() => false)) {
      const card = badge.locator('xpath=ancestor::article[1]');
      const summary = card.locator('summary').first();
      if (await summary.isVisible({ timeout: 2000 }).catch(() => false)) {
        await summary.click();
        await pg.waitForTimeout(300);
      }
      await badge.scrollIntoViewIfNeeded();
      await pg.waitForTimeout(400);
    }
    await shot(pg, 'aircompass-07-plan-tradeoff.png');
    await ctx.close();
  }

  // ── SHOT 08: Impact simulator WITH active interventions (HEPA + N95 + metro + best 2h window) ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/impact`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await pg.selectOption('#sim-purifier', 'hepa');
    await pg.selectOption('#sim-commute', 'metro');
    const checkboxes = pg.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.nth(i).check();
    }
    await pg.waitForTimeout(400);
    await shot(pg, 'aircompass-08-impact.png');
    await ctx.close();
  }

  // ── SHOT 09: Plan view — Myth busters & Grounded Chat Drawer ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/plan`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await pg.waitForTimeout(500);
    await shot(pg, 'aircompass-09-plan-myths-chat.png');
    await ctx.close();
  }

  // ── SHOT 10: Community & RWA Clean-Air Brief ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await pg.goto(`${BASE}/brief`, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await shot(pg, 'aircompass-10-brief.png');
    await ctx.close();
  }

  // ── SHOT 11: Full Hindi bilingual view ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'light' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    const hindiBtn = pg.getByRole('button', { name: /हिन्दी|hindi/i });
    if (await hindiBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await hindiBtn.click();
      await pg.waitForTimeout(700);
    }
    await shot(pg, 'aircompass-11-hindi.png');
    await ctx.close();
  }

  // ── SHOT 12: Dark mode ──
  {
    const ctx = await browser.newContext({ viewport: DESKTOP, colorScheme: 'dark' });
    const pg  = await ctx.newPage();
    await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitReady(pg);
    await loadSampleFamily(pg);
    await shot(pg, 'aircompass-12-dark.png');
    await ctx.close();
  }

  await browser.close();
  console.log('\n✅ All 12 distinct screenshots saved to docs/assets/\n');
})();
