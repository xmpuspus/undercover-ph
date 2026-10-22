import { useEffect, useRef, useState } from "react";
import { NIGHT_ALT_DEG } from "../config";
import { compass16, type SunDay, type SunView } from "../lib/sun";
import { fmtMinute } from "../lib/time";

const W = 56;
const H = 30;
const BASE = 25;

// Sky arc for the day: time runs left (sunrise, east) to right (sunset, west), height is the sun's altitude.
function Dial({ day, altitude, accent }: { day: SunDay; altitude: number; accent: string }) {
  const span = day.sunset - day.sunrise || 1;
  const x = (m: number) => 3 + ((W - 6) * (m - day.sunrise)) / span;
  const y = (alt: number) => BASE - (22 * Math.max(0, alt)) / 70;
  const pts: [number, number][] = [[day.sunrise, 0], ...day.path.filter(([m, a]) => m > day.sunrise && m < day.sunset && a > 0), [day.sunset, 0]];
  const d = pts.map(([m, a], i) => `${i ? "L" : "M"}${x(m).toFixed(1)} ${y(a).toFixed(1)}`).join(" ");
  const up = altitude > 0 && day.minute > day.sunrise && day.minute < day.sunset;
  const sx = x(Math.min(day.sunset, Math.max(day.sunrise, day.minute)));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0" data-testid="sun-dial">
      <path d={`${d} Z`} fill={accent} fillOpacity={0.14} stroke="none" />
      <path d={d} fill="none" stroke="#94A3B8" strokeWidth={1.2} strokeDasharray="2 2" />
      <line x1={1} x2={W - 1} y1={BASE} y2={BASE} stroke="#64748B" strokeWidth={1.2} />
      {up ? (
        <circle cx={sx} cy={y(altitude)} r={4} fill={accent} stroke="#A16207" strokeWidth={1.2} />
      ) : (
        <circle cx={sx} cy={BASE + 3} r={3} fill="#CBD5E1" stroke="#64748B" strokeWidth={1} />
      )}
    </svg>
  );
}

// Points from the sun toward the ground shadows. Rotated by (azimuth - map bearing), so it matches the map.
function ShadowArrow({ deg }: { deg: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }} data-testid="sun-arrow">
      <path d="M12 3v17M6.5 14.5 12 20l5.5-5.5" />
    </svg>
  );
}

export default function SunChip({ sun, bearing, day, accent }: { sun: SunView | null; bearing: number; day: SunDay | null; accent: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("pointerdown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  if (!sun) return null;
  const low = sun.altitude <= NIGHT_ALT_DEG;
  const shadowWord = compass16(sun.azimuth + 180);
  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        ref={btn}
        type="button"
        aria-controls="sun-explainer"
        className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white/95 pl-2 pr-3 text-ink shadow-sm hover:border-slate-300"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-testid="sun-chip"
      >
        {day && <Dial day={day} altitude={sun.altitude} accent={accent} />}
        <span className="flex flex-col items-start leading-[15px]">
          <span className="whitespace-nowrap text-[13px]">
            {sun.altitude <= 0 ? "Sun down" : low ? `Sun ${sun.compass} · too low for shade` : `Sun ${sun.compass} · ${Math.round(sun.altitude)}° up`}
          </span>
          {!low && (
            <span className="flex items-center gap-1 whitespace-nowrap text-[11.5px] text-slate-600">
              <ShadowArrow deg={sun.azimuth - bearing} />
              Shadows fall {shadowWord}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-40 w-[min(300px,calc(100vw-24px))] rounded-card border border-slate-200 bg-white p-3 text-[13px] leading-snug text-slate-700 shadow-card" role="dialog" aria-label="Sun and shade" id="sun-explainer" data-testid="sun-explainer">
          <p>Shade falls on the side of the street toward the sun. In the morning that is the east side, in the afternoon the west side.</p>
          {!low && sun.shadySide && <p className="mt-1.5 font-medium text-ink">At this hour: {sun.shadySide.replace(/\.+$/, "")}.</p>}
          {!low && <p className="mt-1.5 text-slate-500">The arrow points from the sun toward the shadows on the map.</p>}
          {day && (
            <p className="mt-1.5 text-slate-500">
              The arc is this day&apos;s sun, from sunrise at {fmtMinute(day.sunrise)} to sunset at {fmtMinute(day.sunset)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
