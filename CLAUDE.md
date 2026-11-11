# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node.js 22+ (the test tooling — jsdom, jest-dom — needs it; CI runs Node 22).

```bash
npm install
npm run dev                          # Vite dev server at http://localhost:5173
npm run build                        # production build to dist/
npm run preview                      # serve the built dist/ locally
npm test                             # Vitest, single run
npm run test:watch                   # Vitest watch mode
npx vitest run src/weather.test.js   # one file
npx vitest run -t "next24HourIndices" # tests whose name matches
```

No linter or formatter is configured. `.github/workflows/ci.yml` runs `npm ci`, `npm test` and `npm run build` on every push and pull request.

## Tests

Vitest + React Testing Library, configured in the `test` block of `vite.config.js` (jsdom environment, setup in `src/test/setup.js`). Test files sit next to the code as `*.test.js(x)`.

- `src/test/forecastFixture.js` exports `makeForecast(overrides)`, an Open-Meteo-shaped response (week of Tue 2026-11-10). Use it rather than hand-building `data` objects.
- To test `App`, stub the network with `vi.stubGlobal("fetch", ...)`; `setup.js` unstubs globals, restores mocks and clears `localStorage` after each test.
- `execArgv: ["--no-experimental-webstorage"]` in the test config is required: on Node 25+ Node's own `localStorage` global otherwise hides jsdom's, and because the app wraps storage in try/catch, persistence would silently go untested.
- Weekday labels depend on the runtime locale, so tests derive expected names with `toLocaleDateString` instead of hard-coding them.

## Architecture

A React 19 single-page app bundled with Vite (`@vitejs/plugin-react`, configured in `vite.config.js`). `index.html` only provides `<div id="root">`; `src/main.jsx` mounts `App` in `StrictMode` and imports `src/style.css`.

- `src/api.js` — all Open-Meteo calls: `fetchForecast(loc, unit, signal)` and `searchCities(name, signal)` (normalizes results to `{ name, admin, country, lat, lon }`).
- `src/weather.js` — pure helpers: the `WMO` code table (`wmo(code)` → `[label, iconKind]`), `fmtTemp` / `fmtTime`, and `next24HourIndices(times, currentTime)` (which hours the chart shows). Keep testable logic here rather than inside components.
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
