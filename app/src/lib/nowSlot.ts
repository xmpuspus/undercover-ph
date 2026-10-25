import { fmtMinute } from "./time";
import type { Mode } from "../types";

export interface NowSlot {
  bucketIdx: number;
  min: number;
  night: boolean;
}

// The shade slot a "Now" trip uses: the first slot at or after the clock. After the day's last slot there is
// no slot ahead, so use the last one when it is night (the router returns state "night" for it).
// At sunset the next slot can be night while the sun is still up now (5:01 PM, slot 5:30 PM at 0.2 degrees).
// The choice uses the sun height now, read between the two slots: above the night line, keep the earlier
// daylight slot.
// Null means today has no slot that fits, and the caller must say so.
export function nowSlot(bucketsMin: number[], sunAlt: (number | undefined)[] | undefined, clockMin: number, nightAlt: number): NowSlot | null {
  const alt = (i: number) => sunAlt?.[i] ?? 90;
  const night = (i: number) => alt(i) <= nightAlt;
  const ahead = bucketsMin.findIndex((m) => m >= clockMin);
  if (ahead > 0 && night(ahead) && !night(ahead - 1)) {
    const t = (clockMin - bucketsMin[ahead - 1]) / (bucketsMin[ahead] - bucketsMin[ahead - 1] || 1);
    const altNow = alt(ahead - 1) + t * (alt(ahead) - alt(ahead - 1));
    if (altNow > nightAlt) return { bucketIdx: ahead - 1, min: bucketsMin[ahead - 1], night: false };
  }
  if (ahead >= 0) return { bucketIdx: ahead, min: bucketsMin[ahead], night: night(ahead) };
  const last = bucketsMin.length - 1;
  if (last >= 0 && night(last)) return { bucketIdx: last, min: bucketsMin[last], night: true };
  return null;
}

// "now, 12:40 PM, with the 1 PM shade". The clock minute is the real departure time; the slot is the shade data used.
// sunAlt is the slot's sun height: a night slot with the sun still above the horizon is low sun, not dark.
export function nowLabel(clockMin: number, slot: NowSlot, mode: Mode, sunAlt = -90): string {
  if (slot.night) return `now, ${fmtMinute(clockMin)}, ${sunAlt > 0 ? "sun too low for shade" : "after dark"}`;
  return `now, ${fmtMinute(clockMin)}, with the ${fmtMinute(slot.min, true)} ${mode === "shade" ? "shade" : "forecast"}`;
}
