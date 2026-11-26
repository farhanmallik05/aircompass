# Accessibility Compliance — AirCompass (WCAG 2.2 AA)

## Implemented Standards

| Criterion | Implementation | Verification |
|---|---|---|
| **Landmarks & Page Titles** | `<a href="#main-content">` skip link to `<main tabIndex={-1}>`, localized `<nav>` & overview ARIA labels, `<header>`, `<main>`, `<footer>`, distinct Next.js route `<title>` metadata + bilingual EN/HI `document.title` sync, single `<h1>` per route with programmatic focus on navigation | `eslint-plugin-jsx-a11y`, `flows-and-a11y.spec.ts` |
| **Form Labelling & Errors** | Explicit `<label htmlFor>`, `<fieldset>`/`<legend>`, `aria-invalid`, field `aria-describedby` errors, `role="alert"` focus management, `autocomplete="address-level2"` | `SetupForm.tsx`, `flows-and-a11y.spec.ts` |
| **Status & Live Updates** | `aria-live="polite"` plan update, impact community multiplier, and data-delete announcements; `sr-only` speaker prefixes (`You` / `AirCompass`) on chat turns; `(opens in new window)` link notice; text loading & error banners (`planError`, `copyError`, geolocation errors) | `PlanView.tsx`, `ChatDrawer.tsx`, `BriefView.tsx`, `AppShell.tsx` |
| **Non-Color Indicators & Contrast** | High-contrast palette (`slate-950` / `stone-50`, `slate-100` / `slate-950`), dark-mode SVG strokes (`stroke-slate-900 dark:stroke-slate-100`), distinct geometric `<LevelIcon>` shapes + numeric band + text per level `L0–L5` | `Icons.tsx`, `AirChart.tsx`, Axe light & dark matrix |
| **Accessible Charts & Tables** | Inline `<svg role="img">` with localized `<title>`/`<desc>` + WHO `15 µg/m³` marker + `"Show as table"` toggle; zero inline `style` attributes | `AirChart.tsx`, `csp.spec.ts` |
| **Keyboard & Touch Targets** | Global high-contrast `:focus-visible` outline (`#0f766e` light / `#5eead4` dark), all buttons/links/tabs/sliders/disclosures sized `>= 44 px` (`min-h-11`), `aria-valuetext` on range sliders, WAI-ARIA `role="tablist"` with `ArrowLeft`/`ArrowRight`/`Home`/`End` navigation & `role="tabpanel"` | Keyboard Tab + Tabs E2E tests |
| **Reflow & Preferences** | `320px` single-column reflow with zero horizontal scroll; `@media (prefers-reduced-motion: reduce)`, `@media (forced-colors: active)`, and `@media print` for `/brief` | `globals.css`, `flows-and-a11y.spec.ts` |
| **Bilingual `lang` & Fonts** | `<html lang>` and `document.title` switch dynamically (`en` / `hi`), 100% localized UI labels/descriptions including EN/HI 404/error states, self-hosted Noto Sans & Noto Sans Devanagari via `next/font/local` | `AppShell.tsx`, `layout.tsx`, Axe EN/HI matrix |

## Automated & Manual Verification Notes

- **Automated Axe Matrix + Populated States:** `tests/e2e/flows-and-a11y.spec.ts` runs `@axe-core/playwright` (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) across all 4 routes (`/`, `/plan`, `/impact`, `/brief`) × 2 languages (`en`, `hi`) × 2 color schemes (`light`, `dark`) plus populated states (SetupForm error state and Plan + Chat reply).
- **Keyboard Journey & Live Regions:** Playwright verifies the skip link, validation alert focus recovery, `h1` focus on navigation, WAI-ARIA `role="tablist"` keyboard controls, focusable `tabIndex={0}` tabpanel, `PlanView` `role="status"` announcements, and `ChatDrawer` `aria-live="polite"` updates.
- **Manual Screen Reader Check:** Full spoken NVDA/VoiceOver audio pass remains a human manual step and is intentionally left un-claimed here.
