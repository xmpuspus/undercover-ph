// Test the three-route method (shortest, recommended, most shaded) on Makati pairs.
// Usage: node three_routes.mjs <region_dir> <pairs> <out_json>
//
// Shade is the STAND-IN field from build_binary.py (random canyon and tree draws, real
// bearings, real sun). Shelter and steps flags are real OSM tags (edge_osm_flags.u8).
// Cost per edge: len * (1 + k * sun) for sun mode, with sun = 1 - shade at arrival time.
// This equals bench_route.mjs with alpha = 1 + k.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir, pairsArg, outPath] = process.argv.slice(2);
const PAIRS = Number(pairsArg || 20);
const load = (f, T) => {
  const b = readFileSync(join(dir, f));
  return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
};
const lat = load("node_lat.f32", Float32Array);
const lon = load("node_lon.f32", Float32Array);
const off = load("offsets.u32", Uint32Array);
const adj = load("adj.u32", Uint32Array);
const adjEdge = load("adj_edge.u32", Uint32Array);
const len = load("edge_len.f32", Float32Array);
const shade = load("shade_24hh_1season.u8", Uint8Array);
const osm = load("edge_osm_flags.u8", Uint8Array);
const NB = 24;
const N = lat.length;
const SHELTER = 1 | 2; // covered_or_tunnel, indoor_or_corridor
const STEPS = 16;

const R = 6371008.8, rad = Math.PI / 180, cosLat = Math.cos(14.555 * rad);
const dist = (a, b) => {
  const dy = (lat[b] - lat[a]) * rad, dx = (lon[b] - lon[a]) * rad * cosLat;
  return R * Math.sqrt(dx * dx + dy * dy);
};
const WALK = 1.3;

// Shade fraction of edge e at time tSec. fixedSec !== null freezes time at departure.
function shadeAt(e, tSec) {
  const x = Math.min(Math.max((tSec - 6 * 3600) / 1800, 0), NB - 1.0001);
  const b0 = Math.floor(x), f = x - b0;
  return ((1 - f) * shade[e * NB + b0] + f * shade[e * NB + b0 + 1]) / 15;
}

const g = new Float64Array(N), walked = new Float64Array(N);
const prevE = new Int32Array(N), prevN = new Int32Array(N), stamp = new Uint32Array(N);
let run = 0;
let hk = new Float64Array(1 << 14), hv = new Int32Array(1 << 14), hs = 0, lastKey = 0;
function push(k, v) {
  if (hs === hk.length) {
    const a = new Float64Array(hs * 2); a.set(hk); hk = a;
    const b = new Int32Array(hs * 2); b.set(hv); hv = b;
  }
  let i = hs++;
  while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
  hk[i] = k; hv[i] = v;
}
function pop() {
  const v = hv[0]; lastKey = hk[0];
  const k = hk[--hs], x = hv[hs];
  let i = 0;
  for (;;) {
    let c = 2 * i + 1; if (c >= hs) break;
    if (c + 1 < hs && hk[c + 1] < hk[c]) c++;
    if (hk[c] >= k) break;
    hk[i] = hk[c]; hv[i] = hv[c]; i = c;
  }
  hk[i] = k; hv[i] = x; return v;
}

// opt: {k, departSec, frozen, rain, stepsBlocked}. Every multiplier is >= 1, so A* stays admissible.
function route(s, t, opt) {
  run++; hs = 0;
  stamp[s] = run; g[s] = 0; walked[s] = 0; prevE[s] = -1; prevN[s] = -1;
  push(dist(s, t), s);
  while (hs > 0) {
    const u = pop();
    if (u === t) break;
    if (lastKey > g[u] + dist(u, t) + 1e-6) continue;
    const tSec = opt.frozen ? opt.departSec : opt.departSec + walked[u] / WALK;
    for (let i = off[u], end = off[u + 1]; i < end; i++) {
      const v = adj[i], e = adjEdge[i];
      if (opt.stepsBlocked && (osm[e] & STEPS)) continue;
      let m = 1;
      if (opt.k) m += opt.k * (1 - shadeAt(e, tSec));
      if (opt.rain) m += opt.rain * ((osm[e] & SHELTER) ? 0 : 1);
      const c = g[u] + len[e] * m;
      if (stamp[v] !== run || c < g[v]) {
        stamp[v] = run; g[v] = c; walked[v] = walked[u] + len[e]; prevE[v] = e; prevN[v] = u;
        push(c + dist(v, t), v);
      }
    }
  }
  if (stamp[t] !== run) return null;
  const edges = [];
  for (let v = t; prevE[v] >= 0; v = prevN[v]) edges.push(prevE[v]);
  edges.reverse();
  // Score the path with arrival-time shade, whatever the search used.
  let m = 0, sun = 0, shelter = 0, steps = 0;
  for (const e of edges) {
    const sh = shadeAt(e, opt.departSec + m / WALK);
    sun += len[e] * (1 - sh);
    if (osm[e] & SHELTER) shelter += len[e];
    if (osm[e] & STEPS) steps++;
    m += len[e];
  }
  return { m, sun, shelter, steps, key: [...edges].sort((a, b) => a - b).join(",") };
}

// Pairs: crow-fly 500 to 2000 m, both ends connected.
let seed = 20261021;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const pairs = [];
while (pairs.length < PAIRS) {
  const s = Math.floor(rnd() * N), t = Math.floor(rnd() * N);
  const d = dist(s, t);
  if (d < 500 || d > 2000) continue;
  if (!route(s, t, { departSec: 0 })) continue;
  pairs.push([s, t, Math.round(d)]);
}

const KS = [0, 0.25, 0.5, 1, 2, 4, 8, 16];
const DEPARTS = { "08:30": 8.5 * 3600, "12:00": 12 * 3600, "15:30": 15.5 * 3600 };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r3 = (x) => Math.round(x * 1000) / 1000;

const out = { stand_in_shade: true, pairs: pairs.map(([s, t, d]) => ({ s, t, crow_m: d })), by_depart: {} };
const t0 = performance.now();
for (const [label, departSec] of Object.entries(DEPARTS)) {
  const sweep = pairs.map(([s, t]) => KS.map((k) => route(s, t, { k, departSec })));
  const rows = sweep.map((rs) => rs.map((r) => ({
    detour: r3(r.m / rs[0].m - 1), sun_cut: r3(1 - r.sun / rs[0].sun), key: r.key,
  })));
  const perK = {};
  KS.forEach((k, j) => {
    perK[k] = {
      detour_p50: med(rows.map((r) => r[j].detour)), detour_p95: pct(rows.map((r) => r[j].detour), 0.95),
      detour_max: Math.max(...rows.map((r) => r[j].detour)),
      sun_cut_p50: med(rows.map((r) => r[j].sun_cut)),
      differs_from_shortest: rows.filter((r) => r[j].key !== r[0].key).length,
    };
  });
  // Rule: recommended = largest k whose length <= (1 + D) x shortest; keep it only if
  // sun-exposed metres drop by at least G, else show the shortest route.
  const rules = {};
  for (const D of [0.15, 0.2, 0.25]) for (const G of [0.1, 0.15, 0.2]) {
    const picks = rows.map((r) => {
      let j = 0;
      KS.forEach((k, i) => { if (r[i].detour <= D + 1e-9) j = i; });
      return r[j].sun_cut >= G ? j : 0;
    });
    const fired = picks.filter((j) => j > 0);
    const most = KS.indexOf(8);
    rules[`D${D}_G${G}`] = {
      fired: fired.length,
      sun_cut_p50_when_fired: med(picks.map((j, i) => (j > 0 ? rows[i][j].sun_cut : null)).filter((x) => x !== null)),
      detour_p50_fired: med(picks.map((j, i) => (j > 0 ? rows[i][j].detour : null)).filter((x) => x !== null)),
      k_chosen: picks.map((j) => KS[j]),
      three_distinct: rows.filter((r, i) => r[0].key !== r[picks[i]].key && r[picks[i]].key !== r[most].key && r[0].key !== r[most].key).length,
    };
  }
  // Variant: start at k = 2, step down to a smaller k until the detour is <= D, same gain test.
  for (const D of [0.15, 0.2, 0.25]) {
    const G = 0.15;
    const picks = rows.map((r) => {
      let j = KS.indexOf(2);
      while (j > 0 && r[j].detour > D + 1e-9) j--;
      return r[j].sun_cut >= G ? j : 0;
    });
    const most = KS.indexOf(8);
    rules[`k2cap_D${D}_G${G}`] = {
      fired: picks.filter((j) => j > 0).length,
      sun_cut_p50_when_fired: med(picks.map((j, i) => (j > 0 ? rows[i][j].sun_cut : null)).filter((x) => x !== null)),
      detour_p50_fired: med(picks.map((j, i) => (j > 0 ? rows[i][j].detour : null)).filter((x) => x !== null)),
      k_chosen: picks.map((j) => KS[j]),
      three_distinct: rows.filter((r, i) => r[0].key !== r[picks[i]].key && r[picks[i]].key !== r[most].key && r[0].key !== r[most].key).length,
    };
  }
  out.by_depart_rows = out.by_depart_rows || {};
  out.by_depart_rows[label] = rows.map((r) => r.map(({ detour, sun_cut }) => ({ detour, sun_cut })));
  // Fixed k = 2 against the rule D 0.2, G 0.15.
  const j2 = KS.indexOf(2);
  const fixed2 = {
    detour_p50: med(rows.map((r) => r[j2].detour)), detour_max: Math.max(...rows.map((r) => r[j2].detour)),
    over_20pct: rows.filter((r) => r[j2].detour > 0.2).length,
    sun_cut_p50: med(rows.map((r) => r[j2].sun_cut)),
  };
  // Frozen departure bucket against arrival-time shade, for k = 2 and k = 8.
  const frozen = {};
  for (const k of [2, 8]) {
    let differ = 0; const sunGap = [];
    pairs.forEach(([s, t]) => {
      const a = route(s, t, { k, departSec }), b = route(s, t, { k, departSec, frozen: true });
      if (a.key !== b.key) differ++;
      sunGap.push(r3(b.sun / a.sun - 1));
    });
    frozen[k] = { routes_differ: differ, frozen_extra_sun_p50: med(sunGap), frozen_extra_sun_max: Math.max(...sunGap) };
  }
  out.by_depart[label] = { per_k: perK, rules, fixed_k2: fixed2, frozen_vs_arrival: frozen };
}

// Rain mode with real OSM shelter tags, and an accessible profile with steps removed.
const rain = {};
for (const r of [0, 1, 3, 9]) {
  const res = pairs.map(([s, t]) => [route(s, t, { departSec: 0 }), route(s, t, { departSec: 0, rain: r })]);
  rain[r] = {
    sheltered_share_p50: med(res.map(([, b]) => r3(b.shelter / b.m))),
    sheltered_share_max: Math.max(...res.map(([, b]) => r3(b.shelter / b.m))),
    pairs_with_any_shelter: res.filter(([, b]) => b.shelter > 0).length,
    detour_p50: med(res.map(([a, b]) => r3(b.m / a.m - 1))), detour_max: Math.max(...res.map(([a, b]) => r3(b.m / a.m - 1))),
  };
}
const acc = pairs.map(([s, t]) => [route(s, t, { departSec: 0 }), route(s, t, { departSec: 0, stepsBlocked: true })]);
out.rain_real_osm_shelter = rain;
out.accessible_no_steps = {
  shortest_routes_with_steps: acc.filter(([a]) => a.steps > 0).length,
  unreachable_without_steps: acc.filter(([, b]) => !b).length,
  detour_p50_when_changed: med(acc.filter(([a, b]) => b && a.key !== b.key).map(([a, b]) => r3(b.m / a.m - 1))),
};
out.runtime_ms = Math.round(performance.now() - t0);
writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const [label, v] of Object.entries(out.by_depart)) {
  console.log(label, JSON.stringify({ per_k: v.per_k, fixed_k2: v.fixed_k2, frozen: v.frozen_vs_arrival }));
  for (const [rk, rv] of Object.entries(v.rules)) console.log("  ", rk, JSON.stringify(rv));
}
console.log("rain", JSON.stringify(rain));
console.log("accessible", JSON.stringify(out.accessible_no_steps), "runtime_ms", out.runtime_ms);
