import type { Step } from "../router/types";

export interface Sight { name: string; kind: string; lon: number; lat: number; src: string }
export interface JogAttrs {
  graph_sha256: string;
  edges: { road: Uint8Array; lit: Uint8Array; surface: Uint8Array; park: Uint8Array; water: Uint8Array; sight: Int32Array; hours: Float64Array };
  sights: Sight[];
  litShare: number;
}
export type SightGrade = "thin" | "some" | "rich";
export type StreetPoint = [way: number, side: number, lonE5: number, latE5: number];
export interface RunRecord { id: string; area: string; date: string; length_m: number; streets: StreetPoint[] }
export interface JogQuery {
  start: number;
  targetM: number;
  dateIdx: number;
  bucketIdx: number;
  departMin: number;
  paceMinPerKm: number;
  history?: RunRecord[];
  preferNew?: boolean;
  seed?: number;
  budgetMs?: number;
  now?: () => number;
}
export interface Loop {
  edgeIds: number[];
  nodes: number[];
  coords: [number, number][];
  length_m: number;
  minutes: number;
  dark: boolean;
  shade_pct: number | null;
  crossings: { signals: number; marked: number; unmarked: number; unmarkedBig: number };
  lit_m: number;
  unlit_m: number;
  unknownLit_m: number;
  sights: string[];
  new_pct: number | null;
  shared_m: number;
  repeat_pct: number;
  turnsPerKm: number;
  score: number;
  steps: Step[];
  kmMarks: { km: number; at: [number, number] }[];
  warnings: string[];
}
export interface JogResult {
  state: "ok" | "no_loop" | "outside";
  loops: Loop[];
  notes: string[];
  elapsedMs: number;
  searches: number;
  budgetHit: boolean;
  dark: boolean;
}
