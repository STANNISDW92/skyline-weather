// WMO weather codes → label + icon kind
const WMO = {
  0: ["Clear sky", "sun"], 1: ["Mainly clear", "sun"], 2: ["Partly cloudy", "partly"], 3: ["Overcast", "cloud"],
  45: ["Fog", "fog"], 48: ["Freezing fog", "fog"],
  51: ["Light drizzle", "rain"], 53: ["Drizzle", "rain"], 55: ["Heavy drizzle", "rain"],
  56: ["Freezing drizzle", "rain"], 57: ["Freezing drizzle", "rain"],
  61: ["Light rain", "rain"], 63: ["Rain", "rain"], 65: ["Heavy rain", "rain"],
  66: ["Freezing rain", "rain"], 67: ["Freezing rain", "rain"],
  71: ["Light snow", "snow"], 73: ["Snow", "snow"], 75: ["Heavy snow", "snow"], 77: ["Snow grains", "snow"],
  80: ["Rain showers", "rain"], 81: ["Rain showers", "rain"], 82: ["Violent showers", "rain"],
  85: ["Snow showers", "snow"], 86: ["Heavy snow showers", "snow"],
  95: ["Thunderstorm", "storm"], 96: ["Thunderstorm with hail", "storm"], 99: ["Thunderstorm with hail", "storm"]
};
export const wmo = c => WMO[c] || ["Unknown", "cloud"];

// Indices into hourly.time for up to 24 hours, starting at the hour containing
// currentTime (ISO "YYYY-MM-DDTHH:MM", local to the forecast location).
// Falls back to the first hour if currentTime is past the end of the data.
export function next24HourIndices(times, currentTime) {
  const nowHour = currentTime.slice(0, 13);
  let start = times.findIndex(t => t.slice(0, 13) >= nowHour);
  if (start < 0) start = 0;
  return Array.from({ length: 24 }, (_, i) => start + i).filter(i => i < times.length);
}

export const fmtTemp = t => `${Math.round(t)}°`;
export const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
