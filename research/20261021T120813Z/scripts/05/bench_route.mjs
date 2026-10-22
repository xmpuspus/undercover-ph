// Time a browser-style router: A* on typed arrays, cost read at arrival time.
// Usage: node bench_route.mjs <region_dir> <pairs> [tile_buffer_m]
// Reads files from build_binary.py. Runs three searches per origin-destination pair:
// shortest (alpha 1), balanced (alpha 2), most shaded (alpha 6), with the CoolWalks
// cost alpha * sun_length + shade_length. Shade is read for the bucket at the time the
// walker reaches each edge, with linear interpolation between half-hour buckets.
// With tile_buffer_m it also counts the nodes and edges inside the origin-destination
// box plus that buffer, which is what a tiled client would download.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, pairsArg, bufferArg] = process.argv.slice(2);
const PAIRS = Number(pairsArg || 100);
const BUFFER_M = bufferArg ? Number(bufferArg) : null;
const load = (f, T) => {
  const b = readFileSync(join(dir, f));
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
};

const t0 = performance.now();
const lat = load("node_lat.f32", Float32Array);
const lon = load("node_lon.f32", Float32Array);
const off = load("offsets.u32", Uint32Array);
const adj = load("adj.u32", Uint32Array);
const adjEdge = load("adj_edge.u32", Uint32Array);
const len = load("edge_len.f32", Float32Array);
const shade = load("shade_24hh_1season.u8", Uint8Array); // 24 half-hour buckets, 06:00-18:00
const NB = 24;
const loadMs = performance.now() - t0;
const N = lat.length;

const R = 6371008.8;
const rad = Math.PI / 180;
const cosLat = Math.cos(14.56 * rad);
function dist(a, b) {
  const dy = (lat[b] - lat[a]) * rad;
  const dx = (lon[b] - lon[a]) * rad * cosLat;
  return R * Math.sqrt(dx * dx + dy * dy);
}

const WALK = 1.3; // m/s
const g = new Float64Array(N).fill(Infinity);
const walked = new Float64Array(N);
const prev = new Int32Array(N);
const stamp = new Uint32Array(N);
let run = 0;
let heapK = new Float64Array(1 << 16);
let heapV = new Int32Array(1 << 16);
let hs = 0;
function push(k, v) {
  if (hs === heapK.length) {
    const nk = new Float64Array(hs * 2); nk.set(heapK); heapK = nk;
    const nv = new Int32Array(hs * 2); nv.set(heapV); heapV = nv;
  }
  let i = hs++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapK[p] <= k) break;
    heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p;
  }
  heapK[i] = k; heapV[i] = v;
}
let lastKey = 0;
function pop() {
  const v = heapV[0];
  lastKey = heapK[0];
  const k = heapK[--hs], x = heapV[hs];
  let i = 0;
  for (;;) {
    let c = 2 * i + 1;
    if (c >= hs) break;
    if (c + 1 < hs && heapK[c + 1] < heapK[c]) c++;
    if (heapK[c] >= k) break;
    heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c;
  }
  heapK[i] = k; heapV[i] = x;
  return v;
}

// alpha >= 1, so every edge costs at least its length and straight-line distance is admissible.
function route(s, t, alpha, departSec) {
  run++;
  hs = 0;
  stamp[s] = run; g[s] = 0; walked[s] = 0; prev[s] = -1;
  push(dist(s, t), s);
  let settled = 0;
  while (hs > 0) {
    const u = pop();
    if (u === t) break;
    if (lastKey > g[u] + dist(u, t) + 1e-6) continue; // stale heap entry
    settled++;
    const gu = g[u];
    const tSec = departSec + walked[u] / WALK;
    const x = Math.min(Math.max((tSec - 6 * 3600) / 1800, 0), NB - 1.0001);
    const b0 = Math.floor(x), f = x - b0;
    for (let i = off[u], end = off[u + 1]; i < end; i++) {
      const v = adj[i], e = adjEdge[i];
      const sh = ((1 - f) * shade[e * NB + b0] + f * shade[e * NB + b0 + 1]) / 15;
      const l = len[e];
      const c = gu + l * (sh + alpha * (1 - sh));
      if (stamp[v] !== run || c < g[v]) {
        stamp[v] = run; g[v] = c; walked[v] = walked[u] + l; prev[v] = u;
        push(c + dist(v, t), v);
      }
    }
  }
  return { settled, metres: walked[t], cost: g[t] };
}

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const times = [], settledAll = [], tileNodes = [], tileEdges = [], lens = [];
const departSec = 8 * 3600 + 15 * 60;
let done = 0, tries = 0;
while (done < PAIRS && tries < PAIRS * 200) {
  tries++;
  const s = Math.floor(rnd() * N), t = Math.floor(rnd() * N);
  const d = dist(s, t);
  if (d < 500 || d > 3000) continue;
  const a = performance.now();
  const r1 = route(s, t, 1, departSec);
  if (!Number.isFinite(r1.cost) || stamp[t] !== run) continue;
  const r2 = route(s, t, 2, departSec);
  const r3 = route(s, t, 6, departSec);
  times.push(performance.now() - a);
  settledAll.push(r1.settled + r2.settled + r3.settled);
  lens.push(r1.metres);
  if (BUFFER_M !== null) {
    const dLat = BUFFER_M / 111320, dLon = BUFFER_M / (111320 * cosLat);
    const la0 = Math.min(lat[s], lat[t]) - dLat, la1 = Math.max(lat[s], lat[t]) + dLat;
    const lo0 = Math.min(lon[s], lon[t]) - dLon, lo1 = Math.max(lon[s], lon[t]) + dLon;
    let nn = 0, ne = 0;
    for (let v = 0; v < N; v++) {
      if (lat[v] >= la0 && lat[v] <= la1 && lon[v] >= lo0 && lon[v] <= lo1) {
        nn++; ne += off[v + 1] - off[v];
      }
    }
    tileNodes.push(nn); tileEdges.push(ne / 2);
  }
  done++;
}
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const out = {
  dir, nodes: N, directed_edges: adj.length, load_ms: +loadMs.toFixed(1),
  pairs: times.length, crow_fly_m: "500-3000",
  three_routes_ms_p50: +q(times, 0.5).toFixed(2), three_routes_ms_p95: +q(times, 0.95).toFixed(2),
  three_routes_ms_max: +Math.max(...times).toFixed(2),
  settled_p50: q(settledAll, 0.5), shortest_route_m_p50: Math.round(q(lens, 0.5)),
  heap_used_mb: +(process.memoryUsage().heapUsed / 1e6).toFixed(1),
  array_buffers_mb: +(process.memoryUsage().arrayBuffers / 1e6).toFixed(1),
};
if (BUFFER_M !== null) {
  Object.assign(out, { tile_buffer_m: BUFFER_M, tile_nodes_p50: q(tileNodes, 0.5), tile_nodes_p95: q(tileNodes, 0.95), tile_edges_p50: q(tileEdges, 0.5), tile_edges_p95: q(tileEdges, 0.95) });
}
console.log(JSON.stringify(out));
