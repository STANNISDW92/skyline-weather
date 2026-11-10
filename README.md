# Skyline Weather

A small weather app: city search, current conditions, a 24-hour temperature chart and a 7-day forecast. Data comes from [Open-Meteo](https://open-meteo.com/) (free, no API key).

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
index.html      page markup
src/main.js     data fetching and rendering
src/style.css   styles and light/dark theme tokens
```
