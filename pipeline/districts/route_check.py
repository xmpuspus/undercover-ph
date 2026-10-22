"""District copy of pipeline/route_check.py. Run through pipeline/districts/build.py, which sets UC_DISTRICT.

Shortest walk between two places on routable edges only, from the written graph.json and places.json.

Usage: pipeline/.venv/bin/python -I pipeline/route_check.py "Ayala MRT" "Greenbelt" [K] [closed]
Matches a place by exact name or alias, case-insensitive. Writes pipeline/work/route_check.json.
With K, the cost is len_m x (1 + K) on unsheltered edges and len_m on sheltered edges (flags & 7),
the rain-mode exposure rule. Without K, the route is the shortest. The word "closed" drops every edge
with an hours_idx, as at a time when the malls are shut. Otherwise hours are ignored.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
from scipy.sparse import csr_matrix  # noqa: E402
from scipy.sparse.csgraph import dijkstra  # noqa: E402

from ctx import OUT, WORK, haversine  # noqa: E402


def find_place(places, q):
    q = q.strip().lower()
    hits = [p for p in places if p["name"].lower() == q or q in (a.lower() for a in p["aliases"])]
    if not hits:
        sys.exit(f"no place named {q!r}")
    return hits[0], [h["name"] for h in hits]


def cost(e, k):
    return e["len_m"] * (1 + (0 if e["flags"] & 7 else k))


def main(a, b, k=0.0, closed=False):
    graph = json.load(open(OUT / "graph.json"))
    places = json.load(open(OUT / "places.json"))
    src, src_hits = find_place(places, a)
    dst, dst_hits = find_place(places, b)
    best = {}
    for e in graph["edges"]:
        if not e["routable"] or (closed and e["hours_idx"] is not None):
            continue
        for key in ((e["u"], e["v"]), (e["v"], e["u"])):
            if key not in best or cost(e, k) < cost(best[key], k):
                best[key] = e
    n = len(graph["nodes"])
    rows, cols = zip(*best)
    w = np.array([cost(best[key], k) for key in best]) + 1e-6  # keep zero-length links as real arcs
    mat = csr_matrix((w, (rows, cols)), shape=(n, n))
    dist, pred = dijkstra(mat, directed=True, indices=src["node_id"], return_predecessors=True)
    d = dist[dst["node_id"]]
    out = {"k_unsheltered": k, "hours_edges_dropped": closed, "from": src["name"], "from_matches": src_hits, "from_node": src["node_id"],
           "to": dst["name"], "to_matches": dst_hits, "to_node": dst["node_id"]}
    if not np.isfinite(d):
        out["length_m"] = None
        out["result"] = "no routable path"
    else:
        path, cur = [], dst["node_id"]
        while cur != src["node_id"]:
            prev = pred[cur]
            path.append(best[(prev, cur)])
            cur = prev
        path.reverse()
        sheltered = sum(e["len_m"] for e in path if e["flags"] & 7)
        length = float(sum(e["len_m"] for e in path))
        straight = haversine(src["lat"], src["lon"], dst["lat"], dst["lon"])
        out.update(straight_m=round(straight, 1), detour_ratio=round(length / straight, 2) if straight else None)
        out.update(length_m=round(length, 1), edges=len(path), sheltered_m=round(sheltered, 1),
                   sheltered_share=round(sheltered / length, 4) if length else None,
                   minutes_at_1_1_m_s=int(np.ceil(length / 1.1 / 60)),
                   steps=[{"id": e["id"], "len_m": e["len_m"], "name": e["name"], "side": e["side"],
                           "landmark": e["landmark"], "flags": e["flags"]} for e in path])
    path_out = WORK / "route_check.json"
    runs = json.load(open(path_out)) if path_out.exists() else {}
    runs[f"{a} -> {b}" + (f" k={k:g}" if k else "") + (" closed" if closed else "")] = out
    json.dump(runs, open(path_out, "w"), indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "steps"}, indent=1))
    for s in out.get("steps", []):
        print(f"  {s['id']:5d} {s['len_m']:7.1f} m  flags={s['flags']:4d} {s['side']:6s} {s['name']} | {s['landmark']}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.0,
         len(sys.argv) > 4 and sys.argv[4] == "closed")
