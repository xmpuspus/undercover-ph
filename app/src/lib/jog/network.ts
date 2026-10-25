import type { Data } from "../router/types";

/** Reuse the page's labels in the worker's cloned area data. */
export function networkOf(data: Data): NonNullable<Data["network"]> {
  if (data.network) return data.network;
  const comp = new Int32Array(data.nodeCount).fill(-1), cycles: boolean[] = [];
  let main = -1, largest = 0;
  for (let start = 0; start < data.nodeCount; start++) {
    if (comp[start] >= 0 || !data.routableNode[start]) continue;
    const id = cycles.length, queue = [start], corridors = new Set<number>();
    comp[start] = id;
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      for (let j = data.adjOff[n]; j < data.adjOff[n + 1]; j++) {
        const e = data.adjEdge[j], v = data.adjNode[j];
        if (!data.edgeRoutable[e] || data.edgeLen[e] <= 0) continue;
        corridors.add(Math.min(n, v) * data.nodeCount + Math.max(n, v));
        if (comp[v] < 0) { comp[v] = id; queue.push(v); }
      }
    }
    cycles.push(corridors.size >= queue.length);
    if (queue.length > largest) { largest = queue.length; main = id; }
  }
  return data.network = { comp, main, cycles };
}

/** Location fixes can fall on isolated indoor paths. Keep a run on the largest walkable piece. */
export function snapJogStart(data: Data, lon: number, lat: number): { node: number; dist_m: number } | null {
  const { comp, main } = networkOf(data);
  if (main < 0) return null;
  const x = lon * data.mPerLon, y = lat * data.mPerLat;
  let node = -1, distance = Infinity;
  for (let n = 0; n < data.nodeCount; n++) {
    if (comp[n] !== main) continue;
    const d = (data.nodeX[n] - x) ** 2 + (data.nodeY[n] - y) ** 2;
    if (d < distance) { distance = d; node = n; }
  }
  return node < 0 ? null : { node, dist_m: Math.sqrt(distance) };
}
