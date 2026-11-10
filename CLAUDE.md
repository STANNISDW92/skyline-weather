# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node.js 18+.

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # production build to dist/
npm run preview   # serve the built dist/ locally
```

There is no test suite, linter, or formatter configured.

## Architecture

A no-framework, single-page vanilla JS app bundled with Vite (the only dependency). Everything lives in three files: `index.html` (static markup with fixed element IDs), `src/main.js` (all logic), and `src/style.css` (imported from `main.js`).

**Data flow.** `main.js` holds one module-level `state` object (`unit`, `loc`, `data`). Every user action (city pick, geolocation, unit toggle) updates `state` and calls `loadForecast()`, which refetches from the Open-Meteo forecast API and then calls `render()` → `renderHourly()` + `renderDaily()`. Rendering is a full rebuild of each section via `innerHTML`; there is no diffing or incremental update.

- **Units are converted by the API, not the client.** Switching °C/°F refetches with `temperature_unit` / `wind_speed_unit` query params. Don't add client-side conversion.
- **Persistence:** `unit` and `loc` are saved to `localStorage` (all access wrapped in try/catch). The default location is Toronto.
- **External APIs (no key):** `api.open-meteo.com/v1/forecast` for weather, `geocoding-api.open-meteo.com/v1/search` for city search (debounced 250ms, previous request aborted via `AbortController`). Times come back in the location's local timezone (`timezone: "auto"`).
- **Weather codes:** the `WMO` table maps WMO codes to `[label, iconKind]`; `icon(kind, isDay)` returns inline SVG fragments for those kinds. Add new conditions there.
- **Charts are hand-built SVG strings** — the 24-hour chart in `renderHourly()` (fixed 720×210 viewBox, labels every 3rd hour) and the 7-day range bars in `renderDaily()` (positioned by percentage across the week's min/max). No charting library.
- **Sections** (`#now`, `#hourlyPanel`, `#dailyPanel`) start `hidden` in the HTML and are revealed on first successful render; errors go to `#status` via `setStatus(msg, isError)`.

**Theming.** All colors are CSS custom properties on `:root` in `style.css`, with dark-mode overrides under `prefers-color-scheme: dark` (guarded by `:root:not([data-theme="light"])`) and duplicated under `:root[data-theme="dark"]`. SVG icons and charts reference these variables (`var(--accent)`, `var(--warm)`, `var(--rain)`, etc.), so new colors should be added as tokens in both light and dark blocks rather than hard-coded.

**Escaping.** User-visible strings from the geocoding API (city/region names) are inserted with `textContent`/`append`, not `innerHTML`. Keep it that way when touching search results or the place heading.
