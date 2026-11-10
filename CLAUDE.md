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

A React 19 single-page app bundled with Vite (`@vitejs/plugin-react`, configured in `vite.config.js`). `index.html` only provides `<div id="root">`; `src/main.jsx` mounts `App` in `StrictMode` and imports `src/style.css`.

- `src/api.js` — all Open-Meteo calls: `fetchForecast(loc, unit, signal)` and `searchCities(name, signal)` (normalizes results to `{ name, admin, country, lat, lon }`).
- `src/weather.js` — the `WMO` code table (`wmo(code)` → `[label, iconKind]`) and `fmtTemp` / `fmtTime`.
- `src/App.jsx` — owns all state and the header controls (location button, °C/°F toggle).
- `src/components/` — `CitySearch`, `CurrentConditions`, `HourlyChart`, `DailyForecast`, plus `WeatherIcon` (`IconShapes` is the bare SVG contents, reused inside the hourly chart's SVG).

**Data flow.** `App` holds `unit` and `loc`; a `useEffect` on `[loc, unit]` calls `fetchForecast` (aborting the previous request on change) and stores the response in `data`. The location/unit that produced the current `data` are kept separately (`dataLoc`, `dataUnit`), so if a refetch fails the old forecast stays on screen with its matching labels. The three display components are pure functions of `data`; nothing renders until the first fetch succeeds. Status and error messages all go through `showStatus(msg, isError)`; `CitySearch` reports failures via its `onError` prop.

- **Units are converted by the API, not the client.** Switching °C/°F refetches with `temperature_unit` / `wind_speed_unit` params. Don't add client-side conversion.
- **Persistence:** `unit` and `loc` are saved to `localStorage` (all access wrapped in try/catch). The default location is Toronto.
- **City search** debounces 250ms, needs ≥2 characters, aborts the in-flight request on each new search; Enter picks the first result, Escape or an outside click closes the list.
- **Times** come back in the location's local timezone (`timezone: "auto"`).
- **Charts are hand-built SVG** — the 24-hour chart (fixed 720×210 viewBox, labels every 3rd hour) and the 7-day range bars (positioned by percentage across the week's min/max). No charting library.

**Theming.** All colors are CSS custom properties on `:root` in `style.css`, with dark-mode overrides under `prefers-color-scheme: dark` (guarded by `:root:not([data-theme="light"])`) and duplicated under `:root[data-theme="dark"]`. Icons and charts reference these variables (`var(--accent)`, `var(--warm)`, `var(--rain)`, etc.), so new colors should be added as tokens in both light and dark blocks rather than hard-coded. Styling is plain class names in `style.css`; the JSX keeps the original class names and markup structure.

**Text rendering gotcha.** Values like `"7:05 AM / 4:57 PM"` are built as a single template string rather than JSX like `{a} / {b}`: separate text nodes shape slightly differently in Chrome, which shifted pixels compared to the pre-React version.
