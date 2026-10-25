import type { Data } from "../router/types";

/** Weighted distances before hours and side changes. Their differences are lower bounds for
 * searches with the same permitted edges and costs, or additional restrictions and costs. */
export function distancePotential(data: Data, extra: Float32Array, start: number, opts: { allowed?: Uint8Array; stopAt?: number } = {}): Float64Array {
  const distance = new Float64Array(data.nodeCount).fill(Infinity);
  const heap: { node: number; cost: number }[] = [];
  const push = (node: number, cost: number) => {
    let i = heap.length;
    heap.push({ node, cost });
    while (i) {
      const parent = (i - 1) >> 1;
      if (heap[parent].cost <= cost) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = { node, cost };
  };
  distance[start] = 0; push(start, 0);
  while (heap.length) {
    const { node, cost } = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
        if (heap[child].cost >= last.cost) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    if (cost !== distance[node]) continue;
    if (node === opts.stopAt) {
      // All smaller distances are settled. Flattening the rest at this cost keeps the
      // bound consistent across every allowed edge without exploring the rest of the area.
      for (let n = 0; n < distance.length; n++) if (distance[n] > cost) distance[n] = cost;
      return distance;
    }
    for (let j = data.adjOff[node]; j < data.adjOff[node + 1]; j++) {
      const e = data.adjEdge[j], to = data.adjNode[j];
      if ((opts.allowed && !opts.allowed[e]) || !data.edgeRoutable[e] || data.edgeLen[e] <= 0) continue;
      const next = cost + data.edgeLen[e] * (1 + extra[e]);
      if (next < distance[to]) { distance[to] = next; push(to, next); }
    }
  }
  return distance;
}
