import type { Loop, SightGrade } from "./types";

export const JOG_COPY = {
  safety: "Safety here means traffic: crossings and road size. We have no crime data.",
  dark: "Shade does not apply before sunrise or after sunset.",
  lightsUnknown: "Street lights are not mapped on most streets here.",
  fewSights: "Few sights are mapped here.",
  missing: "Street data for sights, light and road size did not load.",
  safari: "Safari can delete saved runs if you skip this site for a week. Add it to your Home Screen to keep them.",
};

export function loopFacts(loop: Loop, { litShare, grade }: { litShare: number | null; grade: SightGrade }): string[] {
  const lines = [`${(loop.length_m / 1000).toFixed(1)} km · ${loop.minutes} min`];
  lines.push(loop.dark ? JOG_COPY.dark : `Shade ${loop.shade_pct ?? 0}%`);
  if (litShare === null) lines.push(JOG_COPY.missing);
  else if (loop.dark) {
    lines.push(`${(loop.lit_m / 1000).toFixed(1)} of ${(loop.length_m / 1000).toFixed(1)} km mapped as lit`);
    if (litShare < 0.3) lines.push(JOG_COPY.lightsUnknown);
  }
  const c = loop.crossings;
  lines.push(`Crossings: ${c.signals} with signals, ${c.marked} marked, ${c.unmarked} without a marked crossing.`);
  if (c.unmarkedBig) lines.push(`${c.unmarkedBig} unmarked across a secondary road or larger.`);
  const sights = loop.sights.filter(Boolean);
  if (sights.length) lines.push(`Sights: ${sights.join(", ")}`);
  if (litShare !== null && grade === "thin") lines.push(JOG_COPY.fewSights);
  if (loop.new_pct !== null) lines.push(`${loop.new_pct}% new streets`);
  lines.push(JOG_COPY.safety);
  return lines;
}
