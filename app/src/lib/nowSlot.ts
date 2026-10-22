import { fmtMinute } from "./time";
import type { Mode } from "../types";

export interface NowSlot {
  bucketIdx: number;
  min: number;
  night: boolean;
}

// The shade slot a "Now" trip uses: the first slot at or after the clock. After the day's last slot there is
// no slot ahead, so use the last one when it is night (the router returns state "night" for it).
// Null means today has no slot that fits, and the caller must say so.
export function nowSlot(bucketsMin: number[], sunAlt: (number | undefined)[] | undefined, clockMin: number, nightAlt: number): NowSlot | null {
  const night = (i: number) => (sunAlt?.[i] ?? 90) <= nightAlt;
  const ahead = bucketsMin.findIndex((m) => m >= clockMin);
  if (ahead >= 0) return { bucketIdx: ahead, min: bucketsMin[ahead], night: night(ahead) };
  const last = bucketsMin.length - 1;
  if (last >= 0 && night(last)) return { bucketIdx: last, min: bucketsMin[last], night: true };
  return null;
}

// "now, 12:40 PM, shade for 1 PM". The clock minute is the real departure time; the slot is the shade data used.
export function nowLabel(clockMin: number, slot: NowSlot, mode: Mode): string {
  if (slot.night) return `now, ${fmtMinute(clockMin)}, after dark`;
  return `now, ${fmtMinute(clockMin)}, ${mode === "shade" ? "shade" : "weather"} for ${fmtMinute(slot.min, true)}`;
}
