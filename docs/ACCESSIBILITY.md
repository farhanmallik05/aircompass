# Accessibility Compliance — AirCompass (WCAG 2.2 AA)

## Implemented Standards

| Criterion | Implementation | Verification |
|---|---|---|
| **Landmarks & Heading Hierarchy** | `<a href="#main-content">` skip link to `<main tabIndex={-1}>`, `<header>`, `<nav>`, `<main>`, `<footer>`, single `<h1>` per route with programmatic focus on navigation | `eslint-plugin-jsx-a11y`, `flows-and-a11y.spec.ts` |
| **Form Labelling & Errors** | Explicit `<label htmlFor>`, `<fieldset>`/`<legend>`, `aria-invalid`, field `aria-describedby` errors, `role="alert"` focus management, `autocomplete="address-level2"` | `SetupForm.tsx`, `flows-and-a11y.spec.ts` |
| **Status & Live Updates** | `aria-live="polite"` plan update & data-delete status announcements; text loading messages & explicit error banners (`planError`, `copyError`, geolocation errors) | `PlanView.tsx`, `BriefView.tsx`, `AppShell.tsx` |
| **Non-Color Indicators & Contrast** | High-contrast palette (`slate-950` / `stone-50`, `slate-100` / `slate-950`), dark-mode SVG strokes (`stroke-slate-900 dark:stroke-slate-100`), distinct geometric `<LevelIcon>` shapes + numeric band + text per level `L0–L5` | `Icons.tsx`, `AirChart.tsx`, Axe light & dark matrix |
| **Accessible Charts & Tables** | Inline `<svg role="img">` with `<title>`/`<desc>` + WHO `15 µg/m³` marker + `"Show as table"` toggle; zero inline `style` attributes | `AirChart.tsx`, `csp.spec.ts` |
| **Keyboard & Touch Targets** | All interactive buttons/links/tabs sized `>= 44 px` (`min-h-11`), visible focus outlines, WAI-ARIA `role="tablist"` with `ArrowLeft`/`ArrowRight`/`Home`/`End` navigation & `role="tabpanel"` | Keyboard Tab + Tabs E2E tests |
| **Reflow & Preferences** | `320px` single-column reflow with zero horizontal scroll; `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`, and `@media print` for `/brief` | `globals.css`, `flows-and-a11y.spec.ts` |
| **Bilingual `lang` & Fonts** | `<html lang>` switches dynamically (`en` / `hi`), self-hosted Noto Sans & Noto Sans Devanagari via `next/font/local` | `AppShell.tsx`, `layout.tsx`, Axe EN/HI matrix |

## Automated & Manual Verification Notes

- **Automated Axe Matrix:** `tests/e2e/flows-and-a11y.spec.ts` runs `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) across all 4 routes (`/`, `/plan`, `/impact`, `/brief`) × 2 languages (`en`, `hi`) × 2 color schemes (`light`, `dark`) = **16 full-page audits**.
- **Manual Screen Reader Check:** Full NVDA/VoiceOver manual audio narration verification is marked for pre-submission desktop/mobile pass; automated DOM semantics, focus order, live regions, and keyboard tab flow are verified in Playwright.
