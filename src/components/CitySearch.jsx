import { useEffect, useRef, useState } from "react";
import { searchCities } from "../api.js";

export default function CitySearch({ onSelect, onError }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const timerRef = useRef();
  const ctrlRef = useRef();

  // Close the list when clicking anywhere outside the search box.
  useEffect(() => {
    const onDocClick = e => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
      clearTimeout(timerRef.current);
      ctrlRef.current?.abort();
    };
  }, []);

  async function runSearch(q) {
    ctrlRef.current?.abort();
    const ctrl = ctrlRef.current = new AbortController();
    try {
      const items = await searchCities(q, ctrl.signal);
      setResults(items);
      setOpen(true);
    } catch (err) {
      if (err.name !== "AbortError") onError("City search failed. Check your connection and try again.");
    }
  }

  function onInput(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(timerRef.current);
    const q = value.trim();
    if (q.length < 2) { setOpen(false); return; }
    timerRef.current = setTimeout(() => runSearch(q), 250);
  }

  function choose(city) {
    onSelect(city);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && results.length) choose(results[0]);
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="search" ref={rootRef}>
      <input type="search" placeholder="Search a city" autoComplete="off" aria-label="Search a city"
        value={query} onChange={onInput} onKeyDown={onKeyDown} />
      <ul className="results" hidden={!open}>
        {results.length === 0 && <li><button type="button" disabled>No matching cities</button></li>}
        {results.map((r, i) => (
          <li key={`${r.lat},${r.lon},${i}`}>
            <button type="button" onClick={() => choose(r)}>
              {r.name + " "}
              <small>{[r.admin, r.country].filter(Boolean).join(", ")}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
