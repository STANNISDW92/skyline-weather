// A trimmed Open-Meteo /v1/forecast response with the same shape and fields
// the app requests (see fetchForecast in src/api.js). Starts Tue 2026-11-10.

const pad = n => String(n).padStart(2, "0");

const days = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];

const hourlyTimes = days.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${pad(h)}:00`));

export function makeForecast(overrides = {}) {
  return {
    latitude: 43.65, longitude: -79.38,
    timezone: "America/Toronto", timezone_abbreviation: "GMT-5", utc_offset_seconds: -18000,
    current_units: {
      time: "iso8601", interval: "seconds", temperature_2m: "°C", apparent_temperature: "°C",
      relative_humidity_2m: "%", wind_speed_10m: "km/h", weather_code: "wmo code", is_day: ""
    },
    current: {
      time: "2026-11-10T18:15", interval: 900,
      temperature_2m: 10.4, apparent_temperature: 7.1, relative_humidity_2m: 60,
      wind_speed_10m: 9.3, weather_code: 0, is_day: 0
    },
    hourly: {
      time: hourlyTimes,
      temperature_2m: hourlyTimes.map((_, i) => Math.round((8 + 5 * Math.sin(i / 4)) * 10) / 10),
      precipitation_probability: hourlyTimes.map((_, i) => (i % 5) * 10),
      weather_code: hourlyTimes.map((_, i) => [0, 2, 3, 61][i % 4]),
      is_day: hourlyTimes.map(t => { const h = +t.slice(11, 13); return h >= 7 && h < 17 ? 1 : 0; })
    },
    daily: {
      time: days,
      weather_code:                  [3,  61, 63, 2, 71, 0, 95],
      temperature_2m_max:            [17, 11, 7,  6, 5,  8, 9],
      temperature_2m_min:            [6,  3,  3,  2, 5,  4, 4],
      precipitation_probability_max: [2,  57, 70, 0, 7,  0, 85],
      sunrise: days.map(d => `${d}T07:05`),
      sunset: days.map(d => `${d}T16:57`)
    },
    ...overrides
  };
}
