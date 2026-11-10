// Open-Meteo API calls (free, no key).

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// Units are converted by the API: switching °C/°F refetches with different params.
export async function fetchForecast({ lat, lon }, unit, signal) {
  const f = unit === "F";
  const url = FORECAST_URL + "?" + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    temperature_unit: f ? "fahrenheit" : "celsius",
    wind_speed_unit: f ? "mph" : "kmh"
  });
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Forecast service returned ${res.status}`);
  return res.json();
}

// Returns a list of { name, admin, country, lat, lon }.
export async function searchCities(name, signal) {
  const res = await fetch(GEOCODING_URL + "?" +
    new URLSearchParams({ name, count: 6, language: "en", format: "json" }), { signal });
  const json = await res.json();
  return (json.results || []).map(r => ({
    name: r.name, admin: r.admin1, country: r.country, lat: r.latitude, lon: r.longitude
  }));
}
