import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import DailyForecast from "./DailyForecast.jsx";
import App from "../App.jsx";
import { makeForecast } from "../test/forecastFixture.js";

// Weekday names come from the runtime locale, so build expectations the same way.
const weekday = iso => new Date(iso + "T12:00").toLocaleDateString([], { weekday: "short" });

function rows() {
  return within(screen.getByRole("list")).getAllByRole("listitem");
}

describe("DailyForecast", () => {
  it("renders one row per day, labelling the first as Today", () => {
    const data = makeForecast();
    render(<DailyForecast data={data} />);

    expect(screen.getByRole("heading", { name: "7-day forecast" })).toBeInTheDocument();
    const items = rows();
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent(/^Today/);
    data.daily.time.slice(1).forEach((day, i) => {
      expect(items[i + 1].querySelector(".name")).toHaveTextContent(weekday(day));
    });
  });

  it("shows the condition, precipitation chance and low/high for each day", () => {
    render(<DailyForecast data={makeForecast()} />);
    const items = rows();

    expect(items[1]).toHaveAttribute("title", "Light rain");
    expect(items[1].querySelector(".pop")).toHaveTextContent("57%");
    expect(items[1].querySelector(".range")).toHaveTextContent(/^3°.*11°$/);

    expect(items[6]).toHaveAttribute("title", "Thunderstorm");
    expect(items[6].querySelector(".pop")).toHaveTextContent("85%");
  });

  it("leaves the precipitation chance blank when it is 0%", () => {
    render(<DailyForecast data={makeForecast()} />);
    expect(rows()[3].querySelector(".pop")).toBeEmptyDOMElement();
  });

  it("positions each range bar across the week's overall low and high", () => {
    // Week runs from 2° to 17°, a span of 15°.
    render(<DailyForecast data={makeForecast()} />);
    const fill = i => rows()[i].querySelector(".fill").style;

    // Today 6°–17°
    expect(parseFloat(fill(0).left)).toBeCloseTo((4 / 15) * 100);
    expect(parseFloat(fill(0).width)).toBeCloseTo((11 / 15) * 100);
    // Fri 2°–6° starts at the left edge
    expect(parseFloat(fill(3).left)).toBe(0);
    // Sat 5°–5° has no range but keeps a minimum 3% sliver visible
    expect(fill(4).width).toBe("3%");
  });

  it("renders a weather icon for every day", () => {
    render(<DailyForecast data={makeForecast()} />);
    for (const item of rows()) expect(item.querySelector("svg")).not.toBeNull();
  });
});

describe("App with a mocked Open-Meteo response", () => {
  it("fetches the forecast and shows the 7-day list", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(makeForecast()), {
      status: 200, headers: { "Content-Type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "7-day forecast" })).toBeInTheDocument();
    expect(rows()).toHaveLength(7);
    expect(screen.getByText("10°C")).toBeInTheDocument();
    expect(screen.queryByText("Loading forecast…")).not.toBeInTheDocument();

    const url = new URL(fetchMock.mock.calls.at(-1)[0]);
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("forecast_days")).toBe("7");
    expect(url.searchParams.get("daily")).toContain("temperature_2m_max");
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(url.searchParams.get("current")).toContain("cloud_cover");
    expect(url.searchParams.get("current")).toContain("wind_direction_10m");
  });

  it("renders a decorative sky and sets the text tone on <html>", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(makeForecast()))));
    const { container } = render(<App />);
    await screen.findByRole("heading", { name: "7-day forecast" });
    expect(container.querySelector(".sky")).toHaveAttribute("aria-hidden", "true");
    expect(["light", "dark"]).toContain(document.documentElement.dataset.tone);
    expect(document.documentElement.style.getPropertyValue("--sky-top")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("requests the saved location and unit from localStorage", async () => {
    localStorage.setItem("unit", "F");
    localStorage.setItem("loc", JSON.stringify({ name: "Tokyo", admin: "Tokyo", country: "Japan", lat: 35.69, lon: 139.69 }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(makeForecast())));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Tokyo/);
    const url = new URL(fetchMock.mock.calls.at(-1)[0]);
    expect(url.searchParams.get("latitude")).toBe("35.69");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(url.searchParams.get("wind_speed_unit")).toBe("mph");
  });

  it("shows an error and no forecast when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<App />);

    expect(await screen.findByText(/Couldn't load the forecast/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "7-day forecast" })).not.toBeInTheDocument();
  });
});
