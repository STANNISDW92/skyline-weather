# Skyline Weather

A small React weather app: city search, current conditions, a 24-hour temperature chart and a 7-day forecast. Data comes from [Open-Meteo](https://open-meteo.com/) (free, no API key).

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serves the built site locally
```

## Test

```bash
npm test             # run once
npm run test:watch   # re-run on change
```

GitHub Actions runs the tests and the build on every push and pull request.

## Project layout

```
index.html          page shell (#root)
src/main.jsx        React entry point
src/App.jsx         app state, header controls, layout
src/api.js          Open-Meteo forecast and geocoding calls
src/weather.js      weather-code labels and formatters
src/components/     CitySearch, CurrentConditions, HourlyChart, DailyForecast, WeatherIcon
src/style.css       styles and light/dark theme tokens
src/test/           test setup and a mocked Open-Meteo response
```
