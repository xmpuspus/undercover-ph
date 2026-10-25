import type { Mode, Result, Route, SegKind } from "../types";
import { COLORS } from "../config";

// One drawn route. Two router labels can share one geometry, for example
// when the recommended route is the shortest route; they merge into one card and one bubble.
export interface DisplayRoute {
  key: string;
  route: Route;
  labels: Route["label"][];
  title: string;
  short: string;
  pct: number;
  pctWord: string;
}

export function coverWord(mode: Mode, night: boolean): string {
  if (night) return "sheltered";
  return mode === "shade" ? "shaded" : "sheltered";
}

function labelText(label: Route["label"], mode: Mode, night: boolean): string {
  if (label === "recommended") return "Recommended";
  if (label === "shortest") return "Shortest";
  return night || mode === "rain" ? "Most sheltered" : "Most shaded";
}

const ORDER: Route["label"][] = ["recommended", "shortest", "most"];

export function toDisplay(result: Result, mode: Mode): DisplayRoute[] {
  const night = result.state === "night";
  const groups = new Map<string, DisplayRoute>();
  const sorted = [...result.routes].sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
  for (const r of sorted) {
    const key = r.edgeIds.join(",");
    const g = groups.get(key);
    if (g) {
      g.labels.push(r.label);
      continue;
    }
    // The router counts roof only in rain mode and at night, and rounds down.
    groups.set(key, {
      key,
      route: r,
      labels: [r.label],
      title: "",
      short: "",
      pct: Math.floor(r.covered_pct),
      pctWord: coverWord(mode, night),
    });
  }
  const list = [...groups.values()];
  for (const g of list) {
    if (result.recommendedIsShortest && g.labels.includes("shortest") && !g.labels.includes("recommended") && !night) {
      g.labels.unshift("recommended");
    }
    g.title = g.labels.map((l) => labelText(l, mode, night)).join(" and ");
    g.short = labelText(g.labels[0], mode, night);
  }
  return list;
}

// Map colour for one segment of the selected route.
// Shade mode: any cover is blue, sun is yellow.
// Rain mode: only a roof keeps you dry, so building and tree shade count as open.
// Night: never yellow; open parts use a pale blue, because there is no sun to avoid.
export function segColor(kind: SegKind, mode: Mode, night: boolean): string {
  if (kind === "unchecked") return COLORS.unchecked;
  if (night) return kind === "roof" ? COLORS.blue : COLORS.nightOpen;
  if (mode === "rain") return kind === "roof" ? COLORS.blue : COLORS.sun;
  return kind === "sun" ? COLORS.sun : COLORS.blue;
}

export function hasUnchecked(r: Route): boolean {
  return r.segments.some((s) => s.kind === "unchecked") || r.steps.some((s) => s.flags.includes("unchecked"));
}
