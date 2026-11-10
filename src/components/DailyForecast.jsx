import WeatherIcon from "./WeatherIcon.jsx";
import { wmo, fmtTemp } from "../weather.js";

// 7-day list; each range bar is positioned across the week's overall min/max.
export default function DailyForecast({ data }) {
  const dd = data.daily;
  const lo = Math.min(...dd.temperature_2m_min), hi = Math.max(...dd.temperature_2m_max), span = Math.max(hi - lo, 1);

  return (
    <section className="panel">
      <h2>7-day forecast</h2>
      <ul className="days">
        {dd.time.map((t, i) => {
          const date = new Date(t + "T12:00");
          const name = i === 0 ? "Today" : date.toLocaleDateString([], { weekday: "short" });
          const left = ((dd.temperature_2m_min[i] - lo) / span) * 100;
          const width = ((dd.temperature_2m_max[i] - dd.temperature_2m_min[i]) / span) * 100;
          const pop = dd.precipitation_probability_max[i];
          return (
            <li key={t} className="day" title={wmo(dd.weather_code[i])[0]}>
              <span className="name">{name}</span>
              <WeatherIcon code={dd.weather_code[i]} />
              <span className="pop num">{pop ? pop + "%" : ""}</span>
              <div className="range num">
                <span className="lo">{fmtTemp(dd.temperature_2m_min[i])}</span>
                <div className="track"><div className="fill" style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }} /></div>
                <span>{fmtTemp(dd.temperature_2m_max[i])}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
