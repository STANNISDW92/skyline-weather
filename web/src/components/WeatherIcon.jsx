import { wmo } from "../weather.js";

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function Sun({ isDay }) {
  if (!isDay) return <path d="M38 14a18 18 0 1 0 12 30 15 15 0 0 1-12-30z" fill="var(--accent)" />;
  return (
    <>
      <circle cx="32" cy="32" r="11" fill="var(--warm)" />
      <g stroke="var(--warm)" strokeWidth="3" strokeLinecap="round">
        {RAY_ANGLES.map(a => {
          const r = a * Math.PI / 180;
          return <line key={a} x1={32 + 17 * Math.cos(r)} y1={32 + 17 * Math.sin(r)} x2={32 + 23 * Math.cos(r)} y2={32 + 23 * Math.sin(r)} />;
        })}
      </g>
    </>
  );
}

const Cloud = ({ y = 0, fill = "var(--muted)" }) =>
  <path d={`M18 ${46 + y}h28a10 10 0 0 0 0-20 14 14 0 0 0-27 3 9 9 0 0 0-1 17z`} fill={fill} opacity=".9" />;

// SVG contents (no wrapper) for an icon kind, drawn in a 64×64 box.
export function IconShapes({ kind, isDay = 1 }) {
  switch (kind) {
    case "sun": return <Sun isDay={isDay} />;
    case "partly": return <><g transform="translate(-8,-8) scale(.8)"><Sun isDay={isDay} /></g><Cloud y={4} /></>;
    case "fog": return (
      <><Cloud y={-6} />
        <g stroke="var(--muted)" strokeWidth="3" strokeLinecap="round"><line x1="14" y1="50" x2="50" y2="50" /><line x1="20" y1="57" x2="44" y2="57" /></g></>
    );
    case "rain": return (
      <><Cloud y={-6} />
        <g stroke="var(--rain)" strokeWidth="3" strokeLinecap="round"><line x1="24" y1="48" x2="21" y2="57" /><line x1="33" y1="48" x2="30" y2="57" /><line x1="42" y1="48" x2="39" y2="57" /></g></>
    );
    case "snow": return (
      <><Cloud y={-6} />
        <g fill="var(--rain)"><circle cx="22" cy="52" r="2.5" /><circle cx="32" cy="56" r="2.5" /><circle cx="42" cy="52" r="2.5" /></g></>
    );
    case "storm": return <><Cloud y={-6} /><path d="M34 44l-8 10h6l-3 9 10-12h-6l3-7z" fill="var(--warm)" /></>;
    default: return <Cloud />;
  }
}

// Standalone icon for a WMO code.
export default function WeatherIcon({ code, isDay = 1, size = 28, className }) {
  return (
    <svg className={className} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <IconShapes kind={wmo(code)[1]} isDay={isDay} />
    </svg>
  );
}
