# Skyline Weather

A small React weather app: city search, current conditions, a 24-hour temperature chart and a 7-day forecast. Data comes from [Open-Meteo](https://open-meteo.com/) (free, no API key).

## Run locally

Requires Node.js 18 or newer.

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

## Project layout

```
index.html          page shell (#root)
src/main.jsx        React entry point
src/App.jsx         app state, header controls, layout
src/api.js          Open-Meteo forecast and geocoding calls
src/weather.js      weather-code labels and formatters
src/components/     CitySearch, CurrentConditions, HourlyChart, DailyForecast, WeatherIcon
src/style.css       styles and light/dark theme tokens
```
