import "./style.css";

const $ = id => document.getElementById(id);
const state = { unit: "C", loc: { name: "Toronto", admin: "Ontario", country: "Canada", lat: 43.6532, lon: -79.3832 }, data: null };

try { const u = localStorage.getItem("unit"); if (u === "C" || u === "F") state.unit = u; } catch (e) {}
try { const l = JSON.parse(localStorage.getItem("loc")); if (l && typeof l.lat === "number") state.loc = l; } catch (e) {}

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
const wmo = c => WMO[c] || ["Unknown", "cloud"];

function icon(kind, isDay = 1) {
  const sun = isDay
    ? '<circle cx="32" cy="32" r="11" fill="var(--warm)"/><g stroke="var(--warm)" stroke-width="3" stroke-linecap="round">' +
      [0,45,90,135,180,225,270,315].map(a => { const r = a*Math.PI/180; return `<line x1="${32+17*Math.cos(r)}" y1="${32+17*Math.sin(r)}" x2="${32+23*Math.cos(r)}" y2="${32+23*Math.sin(r)}"/>`; }).join("") + '</g>'
    : '<path d="M38 14a18 18 0 1 0 12 30 15 15 0 0 1-12-30z" fill="var(--accent)"/>';
  const cloud = (y = 0, fill = "var(--muted)") =>
    `<path d="M18 ${46+y}h28a10 10 0 0 0 0-20 14 14 0 0 0-27 3 9 9 0 0 0-1 17z" fill="${fill}" opacity=".9"/>`;
  switch (kind) {
    case "sun": return sun;
    case "partly": return `<g transform="translate(-8,-8) scale(.8)">${sun}</g>` + cloud(4);
    case "cloud": return cloud();
    case "fog": return cloud(-6) + '<g stroke="var(--muted)" stroke-width="3" stroke-linecap="round"><line x1="14" y1="50" x2="50" y2="50"/><line x1="20" y1="57" x2="44" y2="57"/></g>';
    case "rain": return cloud(-6) + '<g stroke="var(--rain)" stroke-width="3" stroke-linecap="round"><line x1="24" y1="48" x2="21" y2="57"/><line x1="33" y1="48" x2="30" y2="57"/><line x1="42" y1="48" x2="39" y2="57"/></g>';
    case "snow": return cloud(-6) + '<g fill="var(--rain)"><circle cx="22" cy="52" r="2.5"/><circle cx="32" cy="56" r="2.5"/><circle cx="42" cy="52" r="2.5"/></g>';
    case "storm": return cloud(-6) + '<path d="M34 44l-8 10h6l-3 9 10-12h-6l3-7z" fill="var(--warm)"/>';
  }
  return cloud();
}
const smallIcon = (code, isDay = 1) => `<svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">${icon(wmo(code)[1], isDay)}</svg>`;

const fmtTemp = t => `${Math.round(t)}°`;
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function setStatus(msg, isError = false) {
  const s = $("status");
  s.textContent = msg || "";
  s.hidden = !msg;
  s.classList.toggle("error", isError);
}

async function loadForecast() {
  const { lat, lon } = state.loc;
  const f = state.unit === "F";
  const url = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "auto", forecast_days: 7,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    temperature_unit: f ? "fahrenheit" : "celsius",
    wind_speed_unit: f ? "mph" : "kmh"
  });
  setStatus("Loading forecast…");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Forecast service returned ${res.status}`);
    state.data = await res.json();
    render();
    setStatus("");
  } catch (err) {
    setStatus("Couldn't load the forecast. Check your internet connection and try again.", true);
    console.error(err);
  }
}

function render() {
  const d = state.data, c = d.current, loc = state.loc;
  $("place").innerHTML = "";
  $("place").append(loc.name);
  const sub = document.createElement("small");
  sub.textContent = [loc.admin, loc.country].filter(Boolean).join(", ");
  $("place").append(sub);
  $("temp").textContent = fmtTemp(c.temperature_2m) + state.unit;
  $("cond").textContent = wmo(c.weather_code)[0];
  $("bigIcon").innerHTML = icon(wmo(c.weather_code)[1], c.is_day);
  $("feels").textContent = fmtTemp(c.apparent_temperature);
  $("hum").textContent = `${c.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(c.wind_speed_10m)} ${d.current_units.wind_speed_10m}`;
  $("sun").textContent = `${fmtTime(d.daily.sunrise[0])} / ${fmtTime(d.daily.sunset[0])}`;
  $("now").hidden = false;

  renderHourly();
  renderDaily();
}

function renderHourly() {
  const h = state.data.hourly;
  const nowHour = state.data.current.time.slice(0, 13);
  let start = h.time.findIndex(t => t.slice(0, 13) >= nowHour);
  if (start < 0) start = 0;
  const idx = Array.from({ length: 24 }, (_, i) => start + i).filter(i => i < h.time.length);
  const temps = idx.map(i => h.temperature_2m[i]);
  const min = Math.min(...temps), max = Math.max(...temps), span = Math.max(max - min, 1);

  const W = 720, H = 210, padX = 24, top = 46, bottom = 150;
  const step = (W - padX * 2) / (idx.length - 1);
  const x = i => padX + i * step;
  const y = t => bottom - ((t - min) / span) * (bottom - top);

  const pts = temps.map((t, i) => [x(i), y(t)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L${x(idx.length - 1)} ${bottom} L${x(0)} ${bottom} Z`;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature over the next 24 hours">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <line x1="${padX}" x2="${W - padX}" y1="${bottom}" y2="${bottom}" stroke="var(--line)"/>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;

  idx.forEach((hi, i) => {
    const px = x(i);
    if (i % 3 === 0) {
      const label = i === 0 ? "Now" : new Date(h.time[hi]).toLocaleTimeString([], { hour: "numeric" });
      svg += `<text class="tlabel num" x="${px}" y="${pts[i][1] - 12}" text-anchor="middle">${fmtTemp(temps[i])}</text>`;
      svg += `<circle cx="${px}" cy="${pts[i][1]}" r="3.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>`;
      svg += `<g transform="translate(${px - 11},${bottom + 6})"><svg viewBox="0 0 64 64" width="22" height="22">${icon(wmo(h.weather_code[hi])[1], h.is_day[hi])}</svg></g>`;
      svg += `<text class="num" x="${px}" y="${bottom + 44}" text-anchor="middle">${label}</text>`;
      const pop = h.precipitation_probability[hi];
      if (pop != null && pop > 0) svg += `<text class="num" x="${px}" y="${bottom + 58}" text-anchor="middle" style="fill:var(--rain)">${pop}%</text>`;
    }
  });
  svg += "</svg>";
  $("chart").innerHTML = svg;
  $("hourlyPanel").hidden = false;
}

function renderDaily() {
  const dd = state.data.daily;
  const lo = Math.min(...dd.temperature_2m_min), hi = Math.max(...dd.temperature_2m_max), span = Math.max(hi - lo, 1);
  $("days").innerHTML = dd.time.map((t, i) => {
    const date = new Date(t + "T12:00");
    const name = i === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" });
    const left = ((dd.temperature_2m_min[i] - lo) / span) * 100;
    const width = ((dd.temperature_2m_max[i] - dd.temperature_2m_min[i]) / span) * 100;
    const pop = dd.precipitation_probability_max[i];
    return `<li class="day" title="${wmo(dd.weather_code[i])[0]}">
      <span class="name">${name}</span>
      ${smallIcon(dd.weather_code[i])}
      <span class="pop num">${pop ? pop + "%" : ""}</span>
      <div class="range num">
        <span class="lo">${fmtTemp(dd.temperature_2m_min[i])}</span>
        <div class="track"><div class="fill" style="left:${left}%;width:${Math.max(width, 3)}%"></div></div>
        <span>${fmtTemp(dd.temperature_2m_max[i])}</span>
      </div>
    </li>`;
  }).join("");
  $("dailyPanel").hidden = false;
}

// City search
let searchTimer, searchCtrl;
$("q").addEventListener("input", e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $("results").hidden = true; return; }
  searchTimer = setTimeout(() => searchCity(q), 250);
});
$("q").addEventListener("keydown", e => {
  if (e.key === "Enter") { const b = $("results").querySelector("button"); if (b) b.click(); }
  if (e.key === "Escape") $("results").hidden = true;
});
document.addEventListener("click", e => { if (!e.target.closest(".search")) $("results").hidden = true; });

async function searchCity(q) {
  searchCtrl?.abort();
  searchCtrl = new AbortController();
  try {
    const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({ name: q, count: 6, language: "en", format: "json" }), { signal: searchCtrl.signal });
    const json = await res.json();
    const list = $("results");
    list.innerHTML = "";
    const items = json.results || [];
    if (!items.length) {
      list.innerHTML = '<li><button type="button" disabled>No matching cities</button></li>';
    }
    items.forEach(r => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = r.name + " ";
      const s = document.createElement("small");
      s.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
      b.append(s);
      b.addEventListener("click", () => {
        setLocation({ name: r.name, admin: r.admin1, country: r.country, lat: r.latitude, lon: r.longitude });
        $("q").value = "";
        list.hidden = true;
      });
      li.append(b);
      list.append(li);
    });
    list.hidden = false;
  } catch (err) {
    if (err.name !== "AbortError") setStatus("City search failed. Check your connection and try again.", true);
  }
}

function setLocation(loc) {
  state.loc = loc;
  try { localStorage.setItem("loc", JSON.stringify(loc)); } catch (e) {}
  loadForecast();
}

// Geolocation
$("locate").addEventListener("click", () => {
  if (!navigator.geolocation) { setStatus("Your browser doesn't support location. Search for a city instead.", true); return; }
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    pos => setLocation({ name: "My location", admin: "", country: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`, lat: pos.coords.latitude, lon: pos.coords.longitude }),
    () => setStatus("Location access was blocked. Search for a city instead.", true),
    { timeout: 10000 }
  );
});

// Units
function setUnit(u) {
  state.unit = u;
  $("uC").setAttribute("aria-pressed", u === "C");
  $("uF").setAttribute("aria-pressed", u === "F");
  try { localStorage.setItem("unit", u); } catch (e) {}
  loadForecast();
}
$("uC").addEventListener("click", () => state.unit !== "C" && setUnit("C"));
$("uF").addEventListener("click", () => state.unit !== "F" && setUnit("F"));
$("uC").setAttribute("aria-pressed", state.unit === "C");
$("uF").setAttribute("aria-pressed", state.unit === "F");

loadForecast();
