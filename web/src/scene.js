// What the sky looks like right now at a location: sun and moon position, sky
// colours, clouds, precipitation, fog and wind. Pure functions only; the canvas
// engine (src/sky/engine.js) and <Sky> render the result.
//
// Sun and moon positions use the low-precision formulas popularised by
// SunCalc (after Meeus / Schlyter): roughly 0.1–0.5° for the sun and ~1° for the
// moon, which is plenty for placing them on screen.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = date => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;
const altitudeOf = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
// Measured from south, positive towards west (SunCalc convention).
const azimuthOf = (H, phi, dec) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const toCompass = az => (((az / RAD + 180) % 360) + 360) % 360;

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Sun position: altitude in degrees above the horizon, azimuth in compass degrees (N=0, E=90). */
export function sunPosition(date, lat, lon) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { altitude: altitudeOf(H, phi, c.dec) / RAD, azimuth: toCompass(azimuthOf(H, phi, c.dec)) };
}

/** Moon position, with atmospheric refraction applied to the altitude. */
export function moonPosition(date, lat, lon) {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitudeOf(H, phi, c.dec);
  const hr = Math.max(h, 0);
  h += 0.0002967 / Math.tan(hr + 0.00312536 / (hr + 0.08901179));
  return { altitude: h / RAD, azimuth: toCompass(azimuthOf(H, phi, c.dec)) };
}

/** Moon illumination: fraction lit (0–1) and phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter). */
export function moonIllumination(date) {
  const d = toDays(date);
  const s = sunCoords(d), m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const phase = 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI;
  return { fraction: (1 + Math.cos(inc)) / 2, phase: ((phase % 1) + 1) % 1 };
}

// ---------------------------------------------------------------------------
// Colour helpers

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = rgb => "#" + rgb.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => lerp(v, B[i], clamp(t))));
};
/** WCAG relative luminance of a hex colour. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Sky gradients keyed by sun altitude: [altitude, top, middle, horizon].
const CLEAR_SKY = [
  [-90, "#03060f", "#060b1a", "#0a1226"],
  [-18, "#03060f", "#060b1a", "#0a1226"],
  [-12, "#071330", "#122150", "#24306a"],
  [-6, "#122a63", "#3a4a8c", "#8a6a9a"],
  [-3, "#1d3f86", "#5d6fb0", "#e0896f"],
  [0, "#2a5aa8", "#7f93c9", "#ffae7a"],
  [4, "#3369b8", "#86ade0", "#ffd2a1"],
  [10, "#3474c9", "#7fb3e8", "#d8ebf8"],
  [30, "#2b6fd0", "#6aaeee", "#c6e3fa"],
  [90, "#2468cc", "#62a8ec", "#bfe0fa"],
];
const OVERCAST_SKY = [
  [-90, "#07090d", "#0b0e13", "#10141a"],
  [-12, "#0d1118", "#141922", "#1c212b"],
  [-4, "#2a303c", "#3d4350", "#565560"],
  [2, "#5b6370", "#737a85", "#8b8e93"],
  [10, "#8a949f", "#a2aab3", "#b8bec5"],
  [90, "#97a1ac", "#adb5be", "#c4cad0"],
];

function paletteAt(stops, altitude) {
  const a = clamp(altitude, -90, 90);
  let i = stops.findIndex(s => s[0] >= a);
  if (i <= 0) i = 1;
  const [a0, ...c0] = stops[i - 1], [a1, ...c1] = stops[i];
  const t = a1 === a0 ? 0 : (a - a0) / (a1 - a0);
  return c0.map((c, k) => mix(c, c1[k], t));
}

// ---------------------------------------------------------------------------
// Weather → visuals

// WMO code → precipitation type, intensity (0–1), and extras.
const PRECIP = {
  51: ["drizzle", 0.3], 53: ["drizzle", 0.5], 55: ["drizzle", 0.8], 56: ["drizzle", 0.4], 57: ["drizzle", 0.7],
  61: ["rain", 0.3], 63: ["rain", 0.6], 65: ["rain", 1], 66: ["rain", 0.4], 67: ["rain", 0.8],
  71: ["snow", 0.3], 73: ["snow", 0.6], 75: ["snow", 1], 77: ["snow", 0.25],
  80: ["rain", 0.4], 81: ["rain", 0.7], 82: ["rain", 1],
  85: ["snow", 0.5], 86: ["snow", 1],
  95: ["rain", 0.8], 96: ["rain", 0.9], 99: ["rain", 1],
};
const SHOWERS = new Set([80, 81, 82, 85, 86]);
const CLOUD_FROM_CODE = { 0: 0, 1: 0.2, 2: 0.5, 3: 1, 45: 0.6, 48: 0.6 };
const WIND_TO_KMH = { "km/h": 1, "mp/h": 1.609344, mph: 1.609344, "m/s": 3.6, kn: 1.852 };

/** Interpret Open-Meteo `current` weather as visual parameters. Missing data → clear and calm. */
export function weatherVisuals(current, units) {
  const code = current?.weather_code;
  const [type, intensity] = PRECIP[code] || ["none", 0];
  let cover = current?.cloud_cover != null ? current.cloud_cover / 100 : (CLOUD_FROM_CODE[code] ?? (type !== "none" ? 0.9 : 0));
  if (type !== "none") cover = Math.max(cover, SHOWERS.has(code) ? 0.6 : 0.85);
  const toKmh = WIND_TO_KMH[units?.wind_speed_10m] ?? 1;
  const speed = (current?.wind_speed_10m ?? 0) * toKmh;
  const dir = current?.wind_direction_10m;
  // Wind direction is where it blows FROM; on screen, east is to the right.
  const vx = dir == null ? speed : -Math.sin(dir * RAD) * speed;
  return {
    code,
    cover: clamp(cover),
    precip: { type, intensity, hail: code === 96 || code === 99 },
    lightning: code === 95 || code === 96 || code === 99,
    fog: code === 45 ? 0.75 : code === 48 ? 0.9 : 0,
    // 0 = bright clouds, 1 = dark storm base.
    storm: code >= 95 ? 1 : type === "rain" || type === "drizzle" ? 0.35 + 0.45 * intensity : type === "snow" ? 0.25 : 0,
    wind: { kmh: speed, vx },
  };
}

// ---------------------------------------------------------------------------
// Placement on screen. Viewers face the equator: south in the northern
// hemisphere (east on the left), north in the southern hemisphere.

const HORIZON_Y = 0.8;
const ZENITH_Y = 0.07;
const wrap180 = a => ((((a + 180) % 360) + 360) % 360) - 180;

export function skyPoint(altitude, azimuth, lat) {
  const rel = lat >= 0 ? wrap180(azimuth - 180) : wrap180(azimuth);
  const x = clamp(0.5 + rel / 240, 0.05, 0.95);
  const y = HORIZON_Y - Math.pow(clamp(altitude / 90), 0.75) * (HORIZON_Y - ZENITH_Y);
  return { x, y };
}

/** Everything the background needs, for `loc` ({lat, lon}) at `now`, given Open-Meteo `current`. */
export function computeScene(loc, now, current, units) {
  const { lat, lon } = loc;
  const sun = sunPosition(now, lat, lon);
  const moon = moonPosition(now, lat, lon);
  const illum = moonIllumination(now);
  const w = weatherVisuals(current, units);

  // Sky: clear palette, blended toward overcast by cloud cover, darkened by storms, hazed by fog.
  const clear = paletteAt(CLEAR_SKY, sun.altitude);
  const grey = paletteAt(OVERCAST_SKY, sun.altitude);
  const overcastMix = 0.9 * Math.pow(clamp((w.cover - 0.15) / 0.85), 1.2);
  let sky = clear.map((c, i) => mix(c, grey[i], overcastMix));
  if (w.storm) sky = sky.map(c => mix(c, "#000000", 0.4 * w.storm * w.cover));
  if (w.fog) {
    const fogColor = mix("#20242b", "#c9ced3", clamp((sun.altitude + 6) / 16));
    sky = sky.map((c, i) => mix(c, fogColor, w.fog * [0.45, 0.65, 0.8][i]));
  }
  const [top, middle, bottom] = sky;
  const brightness = (luminance(top) + 2 * luminance(middle) + luminance(bottom)) / 4;

  const day = clamp((sun.altitude + 2) / 10); // 0 night .. 1 full day
  const sunPt = skyPoint(sun.altitude, sun.azimuth, lat);
  const moonPt = skyPoint(moon.altitude, moon.azimuth, lat);
  const sunColor = sun.altitude < 8
    ? mix("#ff8a4c", "#ffd58a", clamp(sun.altitude / 8))
    : mix("#ffd58a", "#fffbe8", clamp((sun.altitude - 8) / 17));

  // Cloud lighting: sunlit white by day, warm at sunrise/sunset, dim blue-grey at night.
  const goldenT = clamp(1 - Math.abs(sun.altitude - 2) / 8);
  let cloudLight = mix("#4a5468", "#ffffff", day);
  cloudLight = mix(cloudLight, "#ffc9a3", goldenT * 0.75 * (1 - w.storm));
  const cloudShade = mix(mix("#151a23", "#9aa5b1", day), "#3b434e", w.storm * 0.85 * day);
  // Rain and thick overcast are dull and low-contrast, not bright white puffs.
  const dull = clamp(w.storm * 0.75 + Math.max(0, w.cover - 0.7) * 1.2);
  cloudLight = mix(cloudLight, mix(cloudShade, cloudLight, 0.45), dull);

  return {
    tone: brightness > 0.28 ? "light" : "dark",
    sky: { top, middle, bottom },
    sun: {
      ...sun, ...sunPt, color: sunColor,
      opacity: clamp((sun.altitude + 1) / 3) * (1 - 0.88 * Math.pow(w.cover, 1.4)) * (1 - 0.6 * w.fog),
      low: clamp(1 - sun.altitude / 12),
      // Through thick cloud only a diffuse glow shows, not the disk.
      disk: clamp(1 - Math.max(0, w.cover - 0.45) / 0.35) * (1 - w.fog),
    },
    moon: {
      ...moon, ...moonPt, ...illum,
      waxing: illum.phase < 0.5,
      southern: lat < 0,
      opacity: moon.altitude <= 0 ? 0
        : (sun.altitude > 0 ? 0.35 : lerp(0.35, 1, clamp(-sun.altitude / 6))) * (1 - 0.92 * Math.pow(w.cover, 1.2)) * (1 - w.fog * 0.7),
    },
    stars: clamp((-sun.altitude - 6) / 10) * Math.pow(1 - w.cover, 1.5) * (1 - w.fog)
      * (1 - (moon.altitude > 0 ? 0.4 * illum.fraction : 0)),
    clouds: { cover: w.cover, light: cloudLight, shade: cloudShade, storm: w.storm },
    precip: w.precip,
    lightning: w.lightning,
    fog: w.fog,
    fogColor: mix("#3a3f47", "#e2e6ea", day),
    wind: w.wind,
    day,
  };
}
