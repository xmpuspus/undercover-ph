import type { Data, HoursRow } from "./types";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function toMinute(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v <= 1440 ? v : null;
}

// One day's rule as [open, close] string pairs. Accepts ["10:00", "21:00"],
// [["10:00", "14:00"], ["15:00", "21:00"]], or "10:00-21:00".
function pairs(rule: unknown): [string, string][] {
  if (typeof rule === "string") {
    const [a, b] = rule.split("-");
    return a && b ? [[a, b]] : [];
  }
  if (!Array.isArray(rule) || rule.length === 0) return [];
  if (typeof rule[0] === "string") {
    return typeof rule[1] === "string" ? [[rule[0], rule[1]]] : [];
  }
  return rule.flatMap((r: unknown) => pairs(r));
}

/** Open intervals per day of week (0 = Sunday). An interval past midnight spills into the next day. */
export function parseHours(rows: HoursRow[]): number[][][] {
  return rows.map((row) => {
    const days: number[][] = DAY_KEYS.map(() => []);
    DAY_KEYS.forEach((key, d) => {
      for (const [a, b] of pairs(row.rules?.[key])) {
        const open = toMinute(a);
        const close = toMinute(b);
        if (open === null || close === null) continue;
        if (close > open) {
          days[d].push(open, close);
        } else {
          days[d].push(open, 1440);
          if (close > 0) days[(d + 1) % 7].push(0, close);
        }
      }
    });
    return days;
  });
}

/** Day of week (0 = Sunday) for "YYYY-MM-DD". UTC avoids a shift from the local time zone. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// The interval [open, close] that contains the minute, or null.
function intervalAt(data: Data, hoursIdx: number, dateIdx: number, minute: number): [number, number] | null {
  const row = data.hoursOpen[hoursIdx];
  const dow0 = data.dateDow[dateIdx];
  if (!row || dow0 === undefined) return null;
  const dayShift = Math.floor(minute / 1440);
  const dow = (((dow0 + dayShift) % 7) + 7) % 7;
  const m = minute - dayShift * 1440;
  const iv = row[dow];
  for (let i = 0; i < iv.length; i += 2) {
    if (m >= iv[i] && m < iv[i + 1]) return [iv[i] + dayShift * 1440, iv[i + 1] + dayShift * 1440];
  }
  return null;
}

/** True when hours row hoursIdx is open on manifest date dateIdx at the minute after midnight. */
export function openAt(data: Data, hoursIdx: number, dateIdx: number, minute: number): boolean {
  return intervalAt(data, hoursIdx, dateIdx, minute) !== null;
}

/** Closing minute of the open interval that contains the minute, or null when closed. */
export function closesAtMinute(data: Data, hoursIdx: number, dateIdx: number, minute: number): number | null {
  const iv = intervalAt(data, hoursIdx, dateIdx, minute);
  return iv ? iv[1] : null;
}

export function hhmm(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 21:00 becomes "9 PM", 21:30 becomes "9:30 PM". */
export function clock12(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "AM" : "PM";
  return min === 0 ? `${h12} ${suffix}` : `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}
