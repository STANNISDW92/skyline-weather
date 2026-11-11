# Skyline Weather

A small React weather app: city search, current conditions, a 24-hour temperature chart and a 7-day forecast. Data comes from [Open-Meteo](https://open-meteo.com/) (free, no API key).

The repo has two parts:

```
web/   the React app (Vite, npm)
ml/    forecast-accuracy data and baselines (Python, uv)
```

## Web app

Requires Node.js 22 or newer. Run everything from `web/`.

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # outputs to web/dist/
npm run preview      # serves the built site locally
npm test             # run tests once
npm run test:watch   # re-run on change
```

### Deploying on Vercel

The app lives in `web/`, not the repository root. In the Vercel project go to **Settings → Build and Deployment** and set **Root Directory** to `web`. Vercel then detects Vite and uses `npm run build` with output directory `dist`.

### Layout

```
web/index.html          page shell (#root)
web/src/main.jsx        React entry point
web/src/App.jsx         app state, header controls, layout
web/src/api.js          Open-Meteo forecast and geocoding calls
web/src/weather.js      weather-code labels and formatters
web/src/components/     CitySearch, CurrentConditions, HourlyChart, DailyForecast, WeatherIcon
web/src/style.css       styles and light/dark theme tokens
web/src/test/           test setup and a mocked Open-Meteo response
```

## Forecast accuracy (ml/)

Measures how accurate the official Open-Meteo forecast has been for Toronto's daily highs and lows, 1–3 days ahead, over the last two years. Requires [uv](https://docs.astral.sh/uv/).

```bash
cd ml
uv sync
uv run python ingest.py     # download 2 years of forecasts and actuals to ml/data/ (Parquet)
uv run python baseline.py   # print MAE by lead time and by month
uv run pytest
```

- **Forecasts:** the [Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api), i.e. what the default model predicted 1, 2 and 3 days before each hour.
- **Actuals:** the [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) (ERA5 reanalysis).

Both are fetched hourly and turned into Toronto calendar-day highs and lows the same way. `ml/data/` is not committed; re-run `ingest.py` to rebuild it.

## CI

GitHub Actions runs the web tests and build, plus the ml lint and tests, on every push and pull request.
