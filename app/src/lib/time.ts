import { TZ } from "../config";

export interface Clock {
  date: string;
  minute: number;
}

function nowOverride(): RegExpExecArray | null {
  const override = new URLSearchParams(window.location.search).get("now");
  return override ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(override) : null;
}

// True when `?now=` pins the clock. A pinned clock does not tick.
export const clockPinned = () => nowOverride() !== null;

// Manila wall clock. `?now=2026-10-22T10:00` overrides it for tests and screenshots.
export function manilaNow(): Clock {
  const m = nowOverride();
  if (m) return { date: m[1], minute: Number(m[2]) * 60 + Number(m[3]) };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function dateShort(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fmtMinute(m: number, compact = false): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  const ap = h < 12 ? "AM" : "PM";
  if (compact && mm === 0) return `${h12} ${ap}`;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

// "21:00" -> "9 PM"
export function fmtHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return fmtMinute(h * 60 + (m || 0), true);
}

export function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtKm(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function fmtDist(m: number): string {
  return m < 1000 ? `${Math.max(1, Math.round(m))} m` : `${(m / 1000).toFixed(1)} km`;
}
