import { useEffect, useRef, useState } from "react";
import type { Mode, Weather } from "../types";
import { dateLabel, dateShort, fmtMinute, fmtStamp } from "../lib/time";
import { heatBand, uvWord, weatherAt } from "../lib/weather";
import { CalendarIcon, ChevronDown, ClockIcon, MoonIcon, RainIcon, SunIcon } from "./Icons";

const chip =
  "flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[14px] text-ink shadow-sm hover:border-slate-300";

interface Props {
  // The live Manila clock. Tapping the chip picks the next half hour.
  now: { minute: number; active: boolean; onClick: () => void };
  today: string;
  dates: { date: string; idx: number }[];
  dateIdx: number;
  buckets: { min: number; idx: number; night: boolean }[];
  bucketIdx: number;
  allDates: string[];
  bucketsMin: number[];
  onDate: (idx: number) => void;
  onBucket: (idx: number) => void;
}

// Close on a tap outside, or on Escape (which also returns focus to the chip that opened the menu).
function useOutside(open: boolean, close: (refocus: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open, close]);
  return ref;
}

export function TimeChips(p: Props) {
  const [menu, setMenu] = useState<"date" | "hour" | null>(null);
  const dateBtn = useRef<HTMLButtonElement>(null);
  const hourBtn = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    if (refocus) (menu === "date" ? dateBtn : hourBtn).current?.focus();
    setMenu(null);
  };
  const ref = useOutside(menu !== null, close);
  const date = p.allDates[p.dateIdx];
  const minute = p.bucketsMin[p.bucketIdx];
  return (
    <div ref={ref} className="pointer-events-auto relative">
      <div className="flex flex-wrap gap-2">
        <NowChip {...p.now} />
        <button ref={dateBtn} type="button" className={chip} onClick={() => setMenu(menu === "date" ? null : "date")} aria-expanded={menu === "date"} aria-haspopup="listbox" data-testid="date-chip">
          <CalendarIcon size={16} className="hidden md:block" />
          {date ? dateLabel(date, p.today) : "Date"}
          <ChevronDown size={14} className="text-slate-500" />
        </button>
        <button ref={hourBtn} type="button" className={chip} onClick={() => setMenu(menu === "hour" ? null : "hour")} aria-expanded={menu === "hour"} aria-haspopup="dialog" data-testid="hour-chip">
          <ClockIcon size={16} className="hidden md:block" />
          {minute != null ? fmtMinute(minute, true) : "Time"}
          <ChevronDown size={14} className="text-slate-500" />
        </button>
      </div>
      {menu === "date" && (
        <div className="absolute left-0 top-12 z-40 w-56 rounded-card border border-slate-200 bg-white p-1 shadow-card" role="listbox" aria-label="Date">
          {p.dates.map((d) => (
            <button
              key={d.date}
              type="button"
              role="option"
              aria-selected={d.idx === p.dateIdx}
              onClick={() => {
                p.onDate(d.idx);
                close(true);
              }}
              className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[14px] hover:bg-slate-50 ${d.idx === p.dateIdx ? "font-medium text-brand" : "text-ink"}`}
              data-testid="date-option"
              data-label={dateLabel(d.date, p.today)}
            >
              <span>{dateLabel(d.date, p.today)}</span>
              <span className="text-[12px] text-slate-500">{dateShort(d.date)}</span>
            </button>
          ))}
        </div>
      )}
      {menu === "hour" && (
        <div className="absolute left-0 top-12 z-40 w-[min(332px,calc(100vw-24px))] rounded-card border border-slate-200 bg-white p-2 shadow-card" role="dialog" aria-label="Departure time">
          <div className="grid grid-cols-4 gap-1.5">
            {p.buckets.map((b) => (
              <button
                key={b.min}
                type="button"
                onClick={() => {
                  p.onBucket(b.idx);
                  close(true);
                }}
                className={`flex min-h-11 items-center justify-center gap-1 rounded-full border px-1 text-[13px] ${
                  b.idx === p.bucketIdx ? "border-brand bg-blue-50 font-medium text-brand" : "border-slate-200 text-ink hover:border-slate-300"
                }`}
                data-testid={`hour-option-${b.min}`}
                title={b.night ? "Sun very low or down: shade does not apply" : undefined}
              >
                {b.night && <MoonIcon size={12} className="text-slate-500" />}
                {fmtMinute(b.min, true)}
              </button>
            ))}
          </div>
          {p.bucketsMin.length > 1 && (
            <p className="mt-2 px-1 text-[12px] text-slate-500">
              Shade is computed every {p.bucketsMin[1] - p.bucketsMin[0]} minutes, {fmtMinute(p.bucketsMin[0], true)} to{" "}
              {fmtMinute(p.bucketsMin[p.bucketsMin.length - 1], true)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NowChip({ minute, active, onClick }: Props["now"]) {
  const [hm, ap] = fmtMinute(minute).split(" ");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Leave now. Manila time ${hm} ${ap}`}
      title="Manila time now. Tap to leave now."
      className={`${chip} ${active ? "border-brand bg-blue-50 text-brand" : ""}`}
      data-testid="now-chip"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-brand" : "border border-slate-500"}`} aria-hidden="true" />
      <span className="font-medium">Now</span>
      <span className="tabular-nums">
        {hm}
        <span className="hidden md:inline"> {ap}</span>
      </span>
    </button>
  );
}

// Chip colours per PAGASA band. Each text colour passes WCAG AA on its background.
const HEAT: Record<1 | 2 | 3 | 4, string> = {
  1: "border-yellow-300 bg-yellow-50 text-yellow-900",
  2: "border-orange-300 bg-orange-50 text-orange-900",
  3: "border-red-300 bg-red-50 text-red-800",
  4: "border-red-900 bg-red-900 text-white",
};
const HEAT_DOT: Record<1 | 2 | 3 | 4, string> = { 1: "bg-yellow-400", 2: "bg-orange-500", 3: "bg-red-600", 4: "bg-white" };

export function WeatherChips({ weather, date, minute, mode, dark }: { weather: Weather | null; date: string; minute: number; mode: Mode; dark: boolean }) {
  const small = "flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[13px] text-ink shadow-sm";
  if (!weather) return null;
  if (weather.status !== "ok") {
    return (
      <div className="pointer-events-auto flex gap-2" data-testid="weather">
        <span className={small} title={`Checked ${fmtStamp(weather.fetched_at)}`}>
          Weather unavailable
        </span>
      </div>
    );
  }
  const w = weatherAt(weather, date, minute);
  const hint = `${weather.source.replace(/ \(CC BY 4.0\)$/, "")} for ${fmtMinute(Math.floor(minute / 60) * 60, true)}, fetched ${fmtStamp(weather.fetched_at)}`;
  if (!w || w.temp == null) {
    return (
      <div className="pointer-events-auto flex gap-2" data-testid="weather">
        <span className={small} title={hint}>
          No forecast for this hour
        </span>
      </div>
    );
  }
  const air = `Air ${Math.round(w.temp)}°C${w.condition ? `, ${w.condition.toLowerCase()}` : ""}.`;
  const band = w.feels != null ? heatBand(w.feels) : null;
  const heatTitle =
    w.feels == null
      ? `${air} ${hint}.`
      : `${band ? `${band.name}: PAGASA heat index band, ${band.range}.` : "Below the PAGASA heat index bands, which start at 27°C."} ` +
        `This is Open-Meteo's feels-like temperature, not a PAGASA reading. ${air} ${hint}.`;
  return (
    <div className="pointer-events-auto flex flex-wrap gap-2" data-testid="weather">
      <span
        className={`${small} ${band ? HEAT[band.level] : ""}`}
        title={heatTitle}
        aria-label={w.feels != null ? `Feels like ${Math.round(w.feels)}°C${band ? `, ${band.name}` : ""}` : undefined}
        data-testid="heat-chip"
        data-band={band?.name ?? "none"}
      >
        {w.feels != null ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${band ? HEAT_DOT[band.level] : "bg-slate-300"}`} aria-hidden="true" />
            Feels like {Math.round(w.feels)}°C
          </>
        ) : (
          `${Math.round(w.temp)}°C${w.condition ? `, ${w.condition}` : ""}`
        )}
      </span>
      {mode === "shade" && w.uv != null && !dark && (
        <span className={small} title={hint}>
          <SunIcon size={14} className="text-amber-500" />
          UV {Math.round(w.uv)}, {uvWord(w.uv)}
        </span>
      )}
      {mode === "rain" && w.rain != null && (
        <span className={small} title={hint}>
          <RainIcon size={14} className="text-brand" />
          {Math.round(w.rain)}% chance of rain
        </span>
      )}
    </div>
  );
}
