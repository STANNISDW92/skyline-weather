import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchForecast } from "./api.js";
import { computeScene } from "./scene.js";
import Sky from "./components/Sky.jsx";
import CitySearch from "./components/CitySearch.jsx";
import CurrentConditions from "./components/CurrentConditions.jsx";
import HourlyChart from "./components/HourlyChart.jsx";
import DailyForecast from "./components/DailyForecast.jsx";

const DEFAULT_LOC = { name: "Toronto", admin: "Ontario", country: "Canada", lat: 43.6532, lon: -79.3832 };
const CLOCK_MS = 60 * 1000;           // sun and moon move with the real clock
const REFRESH_MS = 15 * 60 * 1000;    // keep "current" weather current

// Current time, updated every minute and whenever the tab becomes visible again.
function useNow(interval) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, interval);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [interval]);
  return now;
}

function readStored(key, valid) {
  try {
    const raw = localStorage.getItem(key);
    const v = key === "unit" ? raw : JSON.parse(raw);
    return valid(v) ? v : null;
  } catch (e) { return null; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch (e) {}
}

export default function App() {
  const [unit, setUnit] = useState(() => readStored("unit", u => u === "C" || u === "F") || "C");
  const [loc, setLoc] = useState(() => readStored("loc", l => l && typeof l.lat === "number") || DEFAULT_LOC);
  const [data, setData] = useState(null);
  const [dataLoc, setDataLoc] = useState(loc);
  const [dataUnit, setDataUnit] = useState(unit);
  const [status, setStatus] = useState({ msg: "Loading forecast…", error: false });
  const [refreshKey, setRefreshKey] = useState(0);
  const shownRef = useRef(null); // { loc, unit } of the forecast on screen
  const now = useNow(CLOCK_MS);

  const showStatus = (msg, error = false) => setStatus({ msg, error });

  // Refetch whenever the location or unit changes, and quietly every REFRESH_MS.
  useEffect(() => {
    const id = setInterval(() => setRefreshKey(k => k + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const ctrl = new AbortController();
    const shown = shownRef.current;
    const silent = !!shown && shown.loc === loc && shown.unit === unit; // background refresh
    if (!silent) showStatus("Loading forecast…");
    fetchForecast(loc, unit, ctrl.signal)
      .then(d => {
        setData(d); setDataLoc(loc); setDataUnit(unit);
        shownRef.current = { loc, unit };
        if (!silent) showStatus("");
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        if (!silent) showStatus("Couldn't load the forecast. Check your internet connection and try again.", true);
        console.error(err);
      });
    return () => ctrl.abort();
  }, [loc, unit, refreshKey]);

  // The background shows the place whose forecast is on screen (or the chosen place before the first load).
  const skyLoc = data ? dataLoc : loc;
  const scene = useMemo(
    () => computeScene(skyLoc, now, data?.current, data?.current_units),
    [skyLoc, now, data]
  );
  // Layout effect so the first paint already has the right sky and text tone.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.tone = scene.tone;
    root.style.setProperty("--sky-top", scene.sky.top);
    root.style.setProperty("--sky-mid", scene.sky.middle);
    root.style.setProperty("--sky-bottom", scene.sky.bottom);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", scene.sky.top);
    // Animate later changes (clock, refreshes, new places), but show the first real weather immediately.
    if (data && !("skyReady" in root.dataset)) requestAnimationFrame(() => { root.dataset.skyReady = ""; });
  }, [scene, data]);

  function changeLocation(next) {
    setLoc(next);
    writeStored("loc", next);
  }

  function changeUnit(u) {
    if (u === unit) return;
    setUnit(u);
    writeStored("unit", u);
  }

  function locate() {
    if (!navigator.geolocation) { showStatus("Your browser doesn't support location. Search for a city instead.", true); return; }
    showStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      pos => changeLocation({
        name: "My location", admin: "",
        country: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
        lat: pos.coords.latitude, lon: pos.coords.longitude
      }),
      () => showStatus("Location access was blocked. Search for a city instead.", true),
      { timeout: 10000 }
    );
  }

  return (
    <>
      <Sky scene={scene} />
      <main>
        <header className="top">
          <div className="brand">Skyline Weather</div>
          <div className="controls">
            <CitySearch onSelect={changeLocation} onError={msg => showStatus(msg, true)} />
            <button className="btn" type="button" title="Use my location" onClick={locate}>My location</button>
            <div className="units" role="group" aria-label="Temperature units">
              <button type="button" aria-pressed={unit === "C"} onClick={() => changeUnit("C")}>°C</button>
              <button type="button" aria-pressed={unit === "F"} onClick={() => changeUnit("F")}>°F</button>
            </div>
          </div>
        </header>

        <p className={"status" + (status.error ? " error" : "")} hidden={!status.msg}>{status.msg}</p>

        {data && <>
          <CurrentConditions data={data} loc={dataLoc} unit={dataUnit} />
          <HourlyChart data={data} />
          <DailyForecast data={data} />
        </>}

        <footer>Data from <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></footer>
      </main>
    </>
  );
}
