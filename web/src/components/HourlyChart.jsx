import { IconShapes } from "./WeatherIcon.jsx";
import { wmo, fmtTemp, next24HourIndices } from "../weather.js";

const W = 720, H = 210, padX = 24, top = 46, bottom = 150;

// Temperature line for the next 24 hours, labelled every third hour.
export default function HourlyChart({ data }) {
  const h = data.hourly;
  const idx = next24HourIndices(h.time, data.current.time);
  const temps = idx.map(i => h.temperature_2m[i]);
  const min = Math.min(...temps), max = Math.max(...temps), span = Math.max(max - min, 1);

  const step = (W - padX * 2) / (idx.length - 1);
  const x = i => padX + i * step;
  const y = t => bottom - ((t - min) / span) * (bottom - top);

  const pts = temps.map((t, i) => [x(i), y(t)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${line} L${x(idx.length - 1)} ${bottom} L${x(0)} ${bottom} Z`;

  return (
    <section className="panel">
      <h2>Next 24 hours</h2>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Temperature over the next 24 hours">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={padX} x2={W - padX} y1={bottom} y2={bottom} stroke="var(--line)" />
          <path d={area} fill="url(#g)" />
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
          {idx.map((hi, i) => {
            if (i % 3 !== 0) return null;
            const px = x(i);
            const label = i === 0 ? "Now" : new Date(h.time[hi]).toLocaleTimeString([], { hour: "numeric" });
            const pop = h.precipitation_probability[hi];
            return (
              <g key={hi}>
                <text className="tlabel num" x={px} y={pts[i][1] - 12} textAnchor="middle">{fmtTemp(temps[i])}</text>
                <circle cx={px} cy={pts[i][1]} r="3.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
                <g transform={`translate(${px - 11},${bottom + 6})`}>
                  <svg viewBox="0 0 64 64" width="22" height="22"><IconShapes kind={wmo(h.weather_code[hi])[1]} isDay={h.is_day[hi]} /></svg>
                </g>
                <text className="num" x={px} y={bottom + 44} textAnchor="middle">{label}</text>
                {pop != null && pop > 0 &&
                  <text className="num" x={px} y={bottom + 58} textAnchor="middle" style={{ fill: "var(--rain)" }}>{pop}%</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
