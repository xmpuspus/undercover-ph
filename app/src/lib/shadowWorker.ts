import { drawShadows, type ShadowBox, type ShadowTile, type Surface } from "./shadowDraw";

// Draws the ground shadows off the main thread, so the hour scrubber stays smooth on a phone. The page sends tile
// geometry once per tile, then a box and a sun per drawing, and gets an image back.

export type ToWorker =
  | { kind: "tiles"; layer: "buildings" | "trees"; add: ShadowTile[]; keep: string[] }
  | { kind: "draw"; box: ShadowBox; sun: [number, number] };

export interface FromWorker {
  bitmap: ImageBitmap;
  ms: number;
  buildings: number;
  trees: number;
}

const tiles = { buildings: new Map<string, ShadowTile>(), trees: new Map<string, ShadowTile>() };
const surface = (): Surface => {
  const canvas = new OffscreenCanvas(1, 1);
  return { canvas, ctx: canvas.getContext("2d")! };
};
const out = surface();
const scratch = surface();
// The DOM typings describe a window here, whose postMessage takes a target origin.
const scope = self as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(m: FromWorker, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const m = e.data;
  if (m.kind === "tiles") {
    const map = tiles[m.layer];
    const keep = new Set(m.keep);
    for (const key of map.keys()) if (!keep.has(key)) map.delete(key);
    for (const t of m.add) map.set(t.key, t);
    return;
  }
  const t0 = performance.now();
  const n = drawShadows(out, scratch, tiles.buildings.values(), tiles.trees.values(), m.box, m.sun);
  const bitmap = (out.canvas as OffscreenCanvas).transferToImageBitmap();
  scope.postMessage({ bitmap, ms: performance.now() - t0, ...n }, [bitmap]);
};
