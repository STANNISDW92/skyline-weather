import { describe, expect, it } from "vitest";
import { wmo, fmtTemp, next24HourIndices } from "./weather.js";

describe("wmo", () => {
  it.each([
    [0, "Clear sky", "sun"],
    [2, "Partly cloudy", "partly"],
    [3, "Overcast", "cloud"],
    [45, "Fog", "fog"],
    [55, "Heavy drizzle", "rain"],
    [66, "Freezing rain", "rain"],
    [75, "Heavy snow", "snow"],
    [86, "Heavy snow showers", "snow"],
    [95, "Thunderstorm", "storm"],
    [99, "Thunderstorm with hail", "storm"]
  ])("maps code %i to %s / %s", (code, label, kind) => {
    expect(wmo(code)).toEqual([label, kind]);
  });

  it("covers every WMO code Open-Meteo documents with a drawable icon kind", () => {
    const documented = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
    const kinds = new Set(["sun", "partly", "cloud", "fog", "rain", "snow", "storm"]);
    for (const code of documented) {
      const [label, kind] = wmo(code);
      expect(label, `code ${code}`).not.toBe("Unknown");
      expect(kinds.has(kind), `code ${code} kind ${kind}`).toBe(true);
    }
  });

  it.each([4, 100, -1, null, undefined])("falls back to Unknown / cloud for %s", code => {
    expect(wmo(code)).toEqual(["Unknown", "cloud"]);
  });
});

describe("fmtTemp", () => {
  it.each([
    [21, "21°"],
    [21.4, "21°"],
    [21.5, "22°"],
    [0, "0°"],
    [-0.4, "0°"], // Math.round gives -0, which must not print as "-0°"
    [-2.5, "-2°"],
    [-2.6, "-3°"],
    [104.9, "105°"]
  ])("formats %d as %s", (t, expected) => {
    expect(fmtTemp(t)).toBe(expected);
  });
});

describe("next24HourIndices", () => {
  const hours = (date, from, to) =>
    Array.from({ length: to - from }, (_, i) => `${date}T${String(from + i).padStart(2, "0")}:00`);
  const twoDays = [...hours("2026-11-10", 0, 24), ...hours("2026-11-11", 0, 24)];
  const range = (start, n) => Array.from({ length: n }, (_, i) => start + i);

  it("starts at the hour containing the current time when it is mid-hour", () => {
    expect(next24HourIndices(twoDays, "2026-11-10T09:45")).toEqual(range(9, 24));
  });

  it("starts at the current hour when the current time is on the hour", () => {
    expect(next24HourIndices(twoDays, "2026-11-10T09:00")).toEqual(range(9, 24));
  });

  it("crosses midnight into the next day", () => {
    const idx = next24HourIndices(twoDays, "2026-11-10T23:30");
    expect(idx).toEqual(range(23, 24));
    expect(twoDays[idx.at(-1)]).toBe("2026-11-11T22:00");
  });

  it("returns fewer than 24 hours when the data runs out", () => {
    expect(next24HourIndices(twoDays, "2026-11-11T20:15")).toEqual([44, 45, 46, 47]);
  });

  it("starts at the first hour when the current time is before the data", () => {
    expect(next24HourIndices(twoDays, "2026-11-09T22:00")).toEqual(range(0, 24));
  });

  it("falls back to the first hour when the current time is after the data", () => {
    expect(next24HourIndices(twoDays, "2026-11-12T03:00")).toEqual(range(0, 24));
  });

  it("returns nothing for empty hourly data", () => {
    expect(next24HourIndices([], "2026-11-10T09:00")).toEqual([]);
  });
});
