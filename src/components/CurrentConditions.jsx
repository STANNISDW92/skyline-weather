import WeatherIcon from "./WeatherIcon.jsx";
import { wmo, fmtTemp, fmtTime } from "../weather.js";

export default function CurrentConditions({ data, loc, unit }) {
  const c = data.current;
  return (
    <section className="now">
      <div>
        <h1 className="place">
          {loc.name}
          <small>{[loc.admin, loc.country].filter(Boolean).join(", ")}</small>
        </h1>
        <div className="temp num">{fmtTemp(c.temperature_2m) + unit}</div>
        <div className="cond">{wmo(c.weather_code)[0]}</div>
      </div>
      <WeatherIcon className="big-icon" code={c.weather_code} isDay={c.is_day} size={null} />
      <div className="facts">
        <div><span>Feels like</span><b className="num">{fmtTemp(c.apparent_temperature)}</b></div>
        <div><span>Humidity</span><b className="num">{c.relative_humidity_2m}%</b></div>
        <div><span>Wind</span><b className="num">{`${Math.round(c.wind_speed_10m)} ${data.current_units.wind_speed_10m}`}</b></div>
        <div><span>Sunrise / sunset</span><b className="num">{`${fmtTime(data.daily.sunrise[0])} / ${fmtTime(data.daily.sunset[0])}`}</b></div>
      </div>
    </section>
  );
}
