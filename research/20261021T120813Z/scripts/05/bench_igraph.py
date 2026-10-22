"""Time a Python server router: igraph Dijkstra with weights built per request.

Usage: venv/bin/python -I bench_igraph.py <derived_dir> <region> <pairs>

Measures the cold-start parts a Cloud Run or Fly.io instance pays (imports, file load,
graph build) and the per-request time for three routes. The weight vector is rebuilt per
request from one departure-time shade bucket, because igraph cannot read a cost at
arrival time.
"""

import json
import os
import sys
import time

t_start = time.perf_counter()
import igraph as ig  # noqa: E402
import numpy as np  # noqa: E402

t_import = time.perf_counter() - t_start


def main(derived, region, pairs):
    d = os.path.join(derived, region)
    t0 = time.perf_counter()
    g = np.load(os.path.join(derived, f"graph_{region}.npz"))
    src, dst, length = g["src"], g["dst"], g["length"].astype(np.float64)
    lat, lon = g["lat"], g["lon"]
    shade = np.fromfile(os.path.join(d, "shade_24hh_1season.u8"), dtype=np.uint8).reshape(-1, 24)
    t_load = time.perf_counter() - t0

    t0 = time.perf_counter()
    graph = ig.Graph(n=len(lat), edges=np.stack([src, dst], 1).tolist(), directed=False)
    t_build = time.perf_counter() - t0

    rng = np.random.default_rng(7)
    cos_lat = np.cos(np.radians(14.56))
    times, weight_ms = [], []
    done = 0
    while done < pairs:
        s, t = rng.integers(0, len(lat), 2)
        dy = np.radians(lat[t] - lat[s]) * 6371008.8
        dx = np.radians(lon[t] - lon[s]) * 6371008.8 * cos_lat
        if not 500 <= np.hypot(dx, dy) <= 3000:
            continue
        a = time.perf_counter()
        sh = shade[:, 4] / 15.0  # 08:00 bucket
        w_list = []
        for alpha in (1.0, 2.0, 6.0):
            w_list.append(length * (sh + alpha * (1 - sh)))
        b = time.perf_counter()
        ok = True
        for w in w_list:
            p = graph.get_shortest_path(int(s), int(t), weights=w, output="vpath")
            if not p:
                ok = False
                break
        if not ok:
            continue
        weight_ms.append((b - a) * 1000)
        times.append((time.perf_counter() - a) * 1000)
        done += 1
    out = {
        "region": region,
        "import_s": round(t_import, 2),
        "load_s": round(t_load, 2),
        "graph_build_s": round(t_build, 2),
        "pairs": len(times),
        "three_routes_ms_p50": round(float(np.percentile(times, 50)), 1),
        "three_routes_ms_p95": round(float(np.percentile(times, 95)), 1),
        "weight_build_ms_p50": round(float(np.percentile(weight_ms, 50)), 1),
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
