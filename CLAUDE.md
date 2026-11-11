# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The repo has two independent projects: `web/` (the React weather app, npm) and `ml/` (forecast-accuracy data and models, Python/uv). Run commands from inside the relevant directory. `.github/workflows/ci.yml` runs one CI job per project on every push and pull request.

## web/ — React app

### Commands

Requires Node.js 22+ (the test tooling — jsdom, jest-dom — needs it; CI runs Node 22).

```bash
cd web
npm install
npm run dev                          # Vite dev server at http://localhost:5173
npm run build                        # production build to web/dist/
npm run preview                      # serve the built dist/ locally
npm test                             # Vitest, single run
npm run test:watch                   # Vitest watch mode
npx vitest run src/weather.test.js   # one file
npx vitest run -t "next24HourIndices" # tests whose name matches
```

No linter or formatter is configured for web/. Deployed on Vercel with Root Directory set to `web`.

### Tests

Vitest + React Testing Library, configured in the `test` block of `web/vite.config.js` (jsdom environment, setup in `src/test/setup.js`). Test files sit next to the code as `*.test.js(x)`.

- `src/test/forecastFixture.js` exports `makeForecast(overrides)`, an Open-Meteo-shaped response (week of Tue 2026-11-10). Use it rather than hand-building `data` objects.
- To test `App`, stub the network with `vi.stubGlobal("fetch", ...)`; `setup.js` unstubs globals, restores mocks and clears `localStorage` after each test.
- `execArgv: ["--no-experimental-webstorage"]` in the test config is required: on Node 25+ Node's own `localStorage` global otherwise hides jsdom's, and because the app wraps storage in try/catch, persistence would silently go untested.
- Weekday labels depend on the runtime locale, so tests derive expected names with `toLocaleDateString` instead of hard-coding them.

### Architecture

A React 19 single-page app bundled with Vite (`@vitejs/plugin-react`). `index.html` only provides `<div id="root">`; `src/main.jsx` mounts `App` in `StrictMode` and imports `src/style.css`. Paths below are relative to `web/`.

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

## ml/ — forecast accuracy (Python, uv)

### Commands

Python 3.12 (`ml/.python-version`), dependencies locked in `ml/uv.lock`. Flat scripts, not an installable package (`[tool.uv] package = false`).

```bash
cd ml
uv sync                                   # create .venv from the lockfile
uv run python ingest.py                   # backfill 2 years -> ml/data/*.parquet (gitignored)
uv run python ingest.py --start 2025-01-01 --end 2025-03-31 --out /tmp/x
uv run python baseline.py                 # MAE by lead time and by month
uv run pytest                             # all tests
uv run pytest tests/test_ingest.py -k dst # subset
uv run ruff check . && uv run ruff format --check .   # what CI runs
```

### Data pipeline

`ingest.py` fetches **hourly UTC** series and derives daily highs/lows itself, using one function (`hourly_to_daily`) for both forecasts and actuals so they're aggregated identically:

- **Forecasts:** Previous Runs API (`previous-runs-api.open-meteo.com`), `temperature_2m_previous_dayN` for N = 1–3 = the value predicted N×24 h before that hour, from the default `best_match` model (what the web app shows). The API has no daily `_previous_dayN` variables; requesting them errors.
- **Actuals:** Historical Weather API (`archive-api.open-meteo.com`, ERA5 reanalysis) hourly `temperature_2m`. The default end date is 7 days before today because the archive's newest days are model analysis until ERA5 catches up.
- **Why UTC:** Open-Meteo applies one fixed UTC offset to a whole request and ignores DST, so requesting `timezone=America/Toronto` mislabels summer hours. We request `timezone=GMT`, convert with pandas, and only keep local days with every hour present (23/25 on DST days). The UTC request window is padded one day past the end; the partial edge days are dropped (expect a few "dropping incomplete day" log lines).
- `join_daily` inner-joins forecasts to actuals on date with `validate="many_to_one"`; errors are forecast − observed (positive = forecast too warm).
- Requests are chunked (`CHUNK_DAYS`) and `fetch_json` retries timeouts, 429/5xx and empty bodies (Open-Meteo occasionally returns an empty 200), but fails fast on `{"error": true}`.

Outputs: `forecast_hourly.parquet` (time_utc, lead_days, temp_c), `actual_hourly.parquet`, and `daily.parquet` (date, lead_days, fc_high/low, obs_high/low, err_high/low). Source grids and fetch time are stored in each file's pandas `attrs`.

**Known data quirks (verified Nov 2026):**
- For Toronto, `best_match` = `gfs_seamless`: lead 1 is NOAA **HRRR** (~48 h horizon), leads 2–3 are **GFS**. That model hand-off is why lead-1 errors look different from leads 2–3 (lead-1 lows run ~0.9 °C cold, leads 2–3 ~0.8 °C warm). Open-Meteo lists HRRR as discontinued from 2026-11-30, so lead-1 data after that will come from a different model.
- Forecast and ERA5 grid points differ (~43.65,-79.38 vs ~43.69,-79.41).

### Tests

`ml/tests/` uses small hand-built frames plus a `FakeOpenMeteo` session for an end-to-end `ingest()` run into `tmp_path` — no network. Pass a fake object with `.get(url, params, timeout)` as `session`; `ingest()` only sets the User-Agent on sessions it creates.
