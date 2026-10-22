import { useEffect, useRef, useState } from "react";
import type { Mode, Weather } from "../types";
import { dateLabel, dateShort, fmtMinute, fmtStamp } from "../lib/time";
import { heatBand, uvWord, weatherAt } from "../lib/weather";
import { CalendarIcon, ChevronDown, ClockIcon, MoonIcon, PauseIcon, PlayIcon, RainIcon, SunIcon } from "./Icons";

// Tighter on phones, so Now, the date, the hour, and play fit one row from 360 px.
const chip =
  "flex h-11 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-[13px] text-ink shadow-sm hover:border-slate-300 md:gap-1.5 md:px-3 md:text-[14px]";

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
  // Phones get one "when" chip that opens Now, the dates, the hours, and Play in one panel.
  compact?: boolean;
  play?: { playing: boolean; onToggle: () => void } | null;
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
  return p.compact ? <WhenChip {...p} /> : <TimeChipRow {...p} />;
}

function HourGrid({ p, onPicked }: { p: Props; onPicked: () => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {p.buckets.map((b) => (
        <button
          key={b.min}
          type="button"
          onClick={() => {
            p.onBucket(b.idx);
            onPicked();
          }}
          className={`flex min-h-11 items-center justify-center gap-1 rounded-full border px-1 text-[13px] ${
            b.idx === p.bucketIdx ? "border-brand bg-blue-50 font-medium text-brand" : "border-slate-200 text-ink hover:border-slate-300"
          }`}
          data-testid={`hour-option-${b.min}`}
          aria-label={b.night ? `${fmtMinute(b.min)}, sun too low for shade` : undefined}
        >
          {b.night && <MoonIcon size={12} className="text-slate-500" />}
          {fmtMinute(b.min, true)}
        </button>
      ))}
    </div>
  );
}

function SlotNote({ p }: { p: Props }) {
  if (p.bucketsMin.length < 2) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1 px-1 text-[12px] text-slate-500">
      <span>
        Shade is computed every {p.bucketsMin[1] - p.bucketsMin[0]} minutes, {fmtMinute(p.bucketsMin[0], true)} to {fmtMinute(p.bucketsMin[p.bucketsMin.length - 1], true)}.
      </span>
      {p.buckets.some((b) => b.night) && (
        <span className="inline-flex items-center gap-1">
          <MoonIcon size={11} /> means the sun is too low for shade.
        </span>
      )}
    </p>
  );
}

function WhenChip(p: Props) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = (refocus: boolean) => {
    if (refocus) btn.current?.focus();
    setOpen(false);
  };
  const ref = useOutside(open, close);
  const date = p.allDates[p.dateIdx];
  const minute = p.bucketsMin[p.bucketIdx];
  const label = p.now.active ? `Now ${fmtMinute(p.now.minute)}` : `${date ? dateLabel(date, p.today) : "Date"} ${minute != null ? fmtMinute(minute, true) : "time"}`;
  return (
    <div ref={ref} className="pointer-events-auto relative">
      <button
        ref={btn}
        type="button"
        className={`${chip} ${p.now.active ? "border-brand bg-blue-50 text-brand" : ""} ${p.play?.playing ? "border-brand" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Leaving ${label}. Change the time`}
        data-testid="when-chip"
      >
        {p.play?.playing && <PauseIcon size={13} />}
        {/* A fixed width for the hour part keeps the row still while Play steps through the day. */}
        {p.now.active ? (
          <span className="whitespace-nowrap">{label}</span>
        ) : (
          <span className="whitespace-nowrap">
            {date ? dateLabel(date, p.today) : "Date"} <span className="inline-block min-w-[4.4em] tabular-nums">{minute != null ? fmtMinute(minute, true) : "time"}</span>
          </span>
        )}
        <ChevronDown size={13} className="text-slate-500" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-40 w-[min(340px,calc(100vw-24px))] rounded-card border border-slate-200 bg-white p-2 shadow-card max-h-[calc(100dvh-9rem)] overflow-y-auto" role="dialog" aria-label="When you leave" data-testid="when-panel">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                p.now.onClick();
                close(true);
              }}
              aria-pressed={p.now.active}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[14px] ${p.now.active ? "border-brand bg-blue-50 font-medium text-brand" : "border-slate-200 text-ink"}`}
              data-testid="when-now"
            >
              Leave now, {fmtMinute(p.now.minute)}
            </button>
            {p.play && (
              <button
                type="button"
                data-scrubber
                onClick={() => {
                  p.play?.onToggle();
                  close(false);
                }}
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[14px] text-ink"
                data-testid="when-play"
              >
                {p.play.playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                {p.play.playing ? "Stop" : "Play the day"}
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="listbox" aria-label="Date">
            {p.dates.map((d) => (
              <button
                key={d.date}
                type="button"
                role="option"
                aria-selected={d.idx === p.dateIdx}
                onClick={() => p.onDate(d.idx)}
                className={`flex min-h-11 shrink-0 flex-col items-center justify-center rounded-xl border px-3 text-[13px] leading-tight ${
                  d.idx === p.dateIdx ? "border-brand bg-blue-50 font-medium text-brand" : "border-slate-200 text-ink"
                }`}
                data-testid="date-option"
                data-label={dateLabel(d.date, p.today)}
              >
                <span>{dateLabel(d.date, p.today)}</span>
                <span className="text-[11px] text-slate-500">{dateShort(d.date)}</span>
              </button>
            ))}
          </div>
          <div className="mt-2">
            <HourGrid p={p} onPicked={() => close(true)} />
          </div>
          <SlotNote p={p} />
        </div>
      )}
    </div>
  );
}

function TimeChipRow(p: Props) {
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
          <span className="inline-block min-w-[4.4em] tabular-nums">{minute != null ? fmtMinute(minute, true) : "Time"}</span>
          <ChevronDown size={14} className="text-slate-500" />
        </button>
      </div>
      {menu === "date" && (
        <div
          className="absolute left-0 top-12 z-40 w-56 rounded-card border border-slate-200 bg-white p-1 shadow-card max-h-[calc(100dvh-9rem)] overflow-y-auto"
          role="listbox"
          aria-label="Date"
          // Up and down arrows move between dates, as in the ARIA listbox pattern.
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const opts = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]')];
            const at = opts.indexOf(document.activeElement as HTMLElement);
            opts[Math.min(opts.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
          }}
        >
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
        <div className="absolute left-0 top-12 z-40 w-[min(332px,calc(100vw-24px))] rounded-card border border-slate-200 bg-white p-2 shadow-card max-h-[calc(100dvh-9rem)] overflow-y-auto" role="dialog" aria-label="Departure time">
          <HourGrid p={p} onPicked={() => close(true)} />
          <SlotNote p={p} />
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
      aria-label={`Now ${hm} ${ap}, Manila time. Leave now`}
      title="Manila time now. Tap to leave now."
      className={`${chip} ${active ? "border-brand bg-blue-50 text-brand" : ""}`}
      data-testid="now-chip"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-brand" : "border border-slate-500"}`} aria-hidden="true" />
      <span className="font-medium">Now</span>
      {/* Phones show the clock only while Now is chosen, so the time chips keep to one row. */}
      <span className={`tabular-nums ${active ? "" : "hidden md:inline"}`}>
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

export function WeatherChips({
  weather,
  date,
  minute,
  mode,
  dark,
  compact = false,
}: {
  weather: Weather | null;
  date: string;
  minute: number;
  mode: Mode;
  dark: boolean;
  compact?: boolean;
}) {
  const small = "flex h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-3 text-[13px] text-ink shadow-sm";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("pointerdown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  if (!weather) return null;
  if (weather.status !== "ok") {
    return (
      <div className="pointer-events-auto flex gap-2" data-testid="weather">
        <span className={small}>Weather unavailable</span>
      </div>
    );
  }
  const w = weatherAt(weather, date, minute);
  const source = `${weather.source.replace(/ \(CC BY 4.0\)$/, "")} forecast for ${fmtMinute(Math.floor(minute / 60) * 60, true)}, fetched ${fmtStamp(weather.fetched_at)}.`;
  if (!w || w.temp == null) {
    return (
      <div className="pointer-events-auto flex gap-2" data-testid="weather">
        <span className={small}>No forecast for this hour</span>
      </div>
    );
  }
  const band = w.feels != null ? heatBand(w.feels) : null;
  // Touch screens have no hover, so the band, the air temperature, and the source open on a tap.
  return (
    <div ref={ref} className="pointer-events-auto relative flex flex-wrap gap-2" data-testid="weather">
      <button
        type="button"
        className={`${small} ${band ? HEAT[band.level] : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="weather-details"
        aria-label={w.feels != null ? `Feels like ${Math.round(w.feels)}°C${band ? `, ${band.name}` : ""}. Weather details` : "Weather details"}
        data-testid="heat-chip"
        data-band={band?.name ?? "none"}
      >
        {w.feels != null ? (
          <>
            <span className={`h-2 w-2 shrink-0 rounded-full ${band ? HEAT_DOT[band.level] : "bg-slate-300"}`} aria-hidden="true" />
            {compact ? `${Math.round(w.feels)}°C` : `Feels like ${Math.round(w.feels)}°C`}
          </>
        ) : (
          `${Math.round(w.temp)}°C${w.condition ? `, ${w.condition}` : ""}`
        )}
      </button>
      {mode === "shade" && w.uv != null && !dark && !compact && (
        <span className={small}>
          <SunIcon size={14} className="text-amber-500" />
          UV {Math.round(w.uv)}
, {uvWord(w.uv)}
        </span>
      )}
      {mode === "rain" && w.rain != null && (
        <span className={small}>
          <RainIcon size={14} className="text-brand" />
          {Math.round(w.rain)}%{compact ? "" : " chance of rain"}
        </span>
      )}
      {open && (
        <div
          id="weather-details"
          role="dialog"
          aria-label="Weather details"
          className={`absolute top-12 z-40 w-[min(300px,calc(100vw-24px))] rounded-card border border-slate-200 bg-white p-3 text-[13px] leading-snug text-slate-700 shadow-card max-h-[calc(100dvh-9rem)] overflow-y-auto ${compact ? "left-1/2 -translate-x-1/2" : "left-0"}`}
          data-testid="weather-details"
        >
          {w.feels != null && (
            <p className="font-medium text-ink">
              Feels like {Math.round(w.feels)}°C{band ? `: ${band.name} (${band.range})` : ""}
            </p>
          )}
          <p className="mt-1">
            Air {Math.round(w.temp)}°C{w.condition ? `, ${w.condition.toLowerCase()}` : ""}
            {w.uv != null ? `. UV ${Math.round(w.uv)}, ${uvWord(w.uv)}` : ""}
            {w.rain != null ? `. ${Math.round(w.rain)}% chance of rain` : ""}.
          </p>
          {band ? (
            <p className="mt-1.5 text-slate-500">The bands are PAGASA heat index bands. The number is Open-Meteo&apos;s feels-like temperature, not a PAGASA reading.</p>
          ) : (
            w.feels != null && <p className="mt-1.5 text-slate-500">Below the PAGASA heat index bands, which start at 27°C.</p>
          )}
          <p className="mt-1.5 text-slate-500">{source}</p>
        </div>
      )}
    </div>
  );
}
