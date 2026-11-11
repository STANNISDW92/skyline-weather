import { describe, expect, it } from "vitest";
import {
  computeScene, luminance, moonIllumination, moonPosition, skyPoint, sunPosition, weatherVisuals
} from "./scene.js";

const TORONTO = { lat: 43.6532, lon: -79.3832 };
const at = iso => new Date(iso);
const maxAltitude = (y, m, d, { lat, lon } = TORONTO) => {
  let best = -90;
  for (let min = 0; min < 1440; min++) best = Math.max(best, sunPosition(new Date(Date.UTC(y, m, d, 0, min)), lat, lon).altitude);
  return best;
};

describe("sunPosition", () => {
  // Open-Meteo gives Toronto sunrise 07:05 and sunset 16:57 EST on 2026-11-10;
  // the sun's centre is 0.83° below the horizon at those moments.
  it.each([["2026-11-10T12:05:00Z"], ["2026-11-10T21:57:00Z"]])("is at the horizon at sunrise/sunset %s", iso => {
    expect(sunPosition(at(iso), TORONTO.lat, TORONTO.lon).altitude).toBeCloseTo(-0.83, 0);
  });

  it("reaches the textbook noon heights at the solstices", () => {
    expect(maxAltitude(2026, 5, 21)).toBeCloseTo(90 - 43.65 + 23.44, 0);
    expect(maxAltitude(2026, 11, 21)).toBeCloseTo(90 - 43.65 - 23.44, 0);
  });

  it("rises in the east and sets in the west", () => {
    expect(sunPosition(at("2026-11-10T12:30:00Z"), TORONTO.lat, TORONTO.lon).azimuth).toBeGreaterThan(100);
    expect(sunPosition(at("2026-11-10T12:30:00Z"), TORONTO.lat, TORONTO.lon).azimuth).toBeLessThan(130);
    expect(sunPosition(at("2026-11-10T21:30:00Z"), TORONTO.lat, TORONTO.lon).azimuth).toBeGreaterThan(230);
  });
});

describe("moon", () => {
  it.each([
    ["2024-01-11T11:57:00Z", 0, 0],      // new moon
    ["2024-01-18T03:53:00Z", 0.5, 0.25], // first quarter
    ["2024-01-25T17:54:00Z", 1, 0.5],    // full moon
    ["2024-02-02T23:18:00Z", 0.5, 0.75]  // last quarter
  ])("illumination at %s", (iso, fraction, phase) => {
    const m = moonIllumination(at(iso));
    expect(m.fraction).toBeCloseTo(fraction, 1);
    expect(Math.min(Math.abs(m.phase - phase), 1 - Math.abs(m.phase - phase))).toBeLessThan(0.03);
  });

  it("has a plausible altitude range", () => {
    for (let h = 0; h < 48; h += 3) {
      const { altitude } = moonPosition(new Date(Date.UTC(2026, 10, 11, h)), TORONTO.lat, TORONTO.lon);
      expect(Math.abs(altitude)).toBeLessThanOrEqual(90);
    }
  });
});

describe("skyPoint", () => {
  it("puts east on the left and west on the right in the northern hemisphere", () => {
    expect(skyPoint(10, 120, 43).x).toBeLessThan(0.5);
    expect(skyPoint(10, 240, 43).x).toBeGreaterThan(0.5);
    expect(skyPoint(10, 180, 43).x).toBe(0.5);
  });
  it("mirrors for the southern hemisphere, where the sun passes to the north", () => {
    expect(skyPoint(10, 60, -33).x).toBeGreaterThan(0.5);
    expect(skyPoint(10, 300, -33).x).toBeLessThan(0.5);
  });
  it("is higher on screen for higher altitudes", () => {
    expect(skyPoint(60, 180, 43).y).toBeLessThan(skyPoint(10, 180, 43).y);
    expect(skyPoint(0, 180, 43).y).toBeCloseTo(0.8);
  });
});

describe("weatherVisuals", () => {
  it("uses the API cloud cover", () => {
    expect(weatherVisuals({ weather_code: 2, cloud_cover: 40 }).cover).toBeCloseTo(0.4);
  });
  it("falls back to the weather code when cloud cover is missing", () => {
    expect(weatherVisuals({ weather_code: 3 }).cover).toBe(1);
    expect(weatherVisuals({ weather_code: 0 }).cover).toBe(0);
  });
  it.each([
    [61, "rain", 0.3], [65, "rain", 1], [53, "drizzle", 0.5], [75, "snow", 1], [86, "snow", 1], [0, "none", 0]
  ])("code %i → %s at intensity %d", (code, type, intensity) => {
    expect(weatherVisuals({ weather_code: code }).precip).toMatchObject({ type, intensity });
  });
  it("makes precipitation cloudy even if cloud cover says otherwise", () => {
    expect(weatherVisuals({ weather_code: 63, cloud_cover: 20 }).cover).toBe(0.85);
    expect(weatherVisuals({ weather_code: 80, cloud_cover: 20 }).cover).toBe(0.6); // showers can be sunny
  });
  it("adds lightning and hail for thunderstorms", () => {
    expect(weatherVisuals({ weather_code: 95 })).toMatchObject({ lightning: true, precip: { hail: false } });
    expect(weatherVisuals({ weather_code: 99 })).toMatchObject({ lightning: true, precip: { hail: true } });
  });
  it("adds fog for fog codes", () => {
    expect(weatherVisuals({ weather_code: 45 }).fog).toBeGreaterThan(0.5);
    expect(weatherVisuals({ weather_code: 1 }).fog).toBe(0);
  });
  it("converts wind to km/h and points it the way it blows", () => {
    // 10 mph from the west blows toward the east (screen right).
    const w = weatherVisuals({ wind_speed_10m: 10, wind_direction_10m: 270 }, { wind_speed_10m: "mp/h" });
    expect(w.wind.kmh).toBeCloseTo(16.09, 1);
    expect(w.wind.vx).toBeGreaterThan(16);
    expect(weatherVisuals({ wind_speed_10m: 10, wind_direction_10m: 90 }).wind.vx).toBeLessThan(-9.9);
  });
  it("treats missing weather as clear and calm", () => {
    expect(weatherVisuals(undefined)).toMatchObject({ cover: 0, precip: { type: "none" }, lightning: false, fog: 0 });
  });
});

describe("computeScene", () => {
  const scene = (iso, current) => computeScene(TORONTO, at(iso), current, { wind_speed_10m: "km/h" });
  const NOON = "2026-07-01T17:20:00Z", MIDNIGHT = "2026-07-01T04:20:00Z", SUNSET = "2026-07-02T00:55:00Z";

  it("is bright with dark text on a clear day, and dark with light text at night", () => {
    const day = scene(NOON, { weather_code: 0, cloud_cover: 0 });
    const night = scene(MIDNIGHT, { weather_code: 0, cloud_cover: 0 });
    expect(day.tone).toBe("light");
    expect(night.tone).toBe("dark");
    expect(luminance(day.sky.middle)).toBeGreaterThan(luminance(night.sky.middle) * 10);
    expect(day.stars).toBe(0);
    expect(night.stars).toBeGreaterThan(0.3);
  });

  it("shows the sun by day and hides it at night", () => {
    expect(scene(NOON, { weather_code: 0, cloud_cover: 0 }).sun.opacity).toBeGreaterThan(0.9);
    expect(scene(MIDNIGHT, { weather_code: 0, cloud_cover: 0 }).sun.opacity).toBe(0);
  });

  it("paints a warm horizon around sunset", () => {
    const { bottom } = scene(SUNSET, { weather_code: 0, cloud_cover: 0 }).sky;
    const [r, , b] = [1, 3, 5].map(i => parseInt(bottom.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
  });

  it("greys out the sky and hides the sun under overcast", () => {
    const clear = scene(NOON, { weather_code: 0, cloud_cover: 0 });
    const overcast = scene(NOON, { weather_code: 3, cloud_cover: 100 });
    const sat = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return Math.max(...c) - Math.min(...c); };
    expect(sat(overcast.sky.middle)).toBeLessThan(sat(clear.sky.middle) / 2);
    expect(overcast.sun.opacity).toBeLessThan(0.15);
  });

  it("goes dark enough for light text in a daytime thunderstorm", () => {
    expect(scene(NOON, { weather_code: 95, cloud_cover: 100 }).tone).toBe("dark");
  });

  it("only shows the moon when it is above the horizon", () => {
    for (let h = 0; h < 30; h++) {
      const iso = new Date(Date.UTC(2026, 10, 11, h)).toISOString();
      const s = scene(iso, { weather_code: 0, cloud_cover: 0 });
      if (s.moon.altitude <= 0) expect(s.moon.opacity).toBe(0);
    }
  });
});
