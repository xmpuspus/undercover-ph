"""Shortest walk between two places on routable edges only, from the written graph.json and places.json.

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

from common import OUT, WORK  # noqa: E402
from districts.route_check import cost, find_place, search  # noqa: E402,F401


def main(a, b, k=0.0, closed=False):
    graph = json.load(open(OUT / "graph.json"))
    places = json.load(open(OUT / "places.json"))
    src, src_hits = find_place(places, a)
    dst, dst_hits = find_place(places, b)
    path, junctions = search(graph, src["node_id"], dst["node_id"], k, closed)
    out = {"k_unsheltered": k, "hours_edges_dropped": closed, "side_switch_rule": "browser",
           "from": src["name"], "from_matches": src_hits, "from_node": src["node_id"],
           "to": dst["name"], "to_matches": dst_hits, "to_node": dst["node_id"]}
    if path is None:
        out["length_m"] = None
        out["result"] = "no routable path"
    else:
        sheltered = sum(e["len_m"] for e in path if e["flags"] & 7)
        length = float(sum(e["len_m"] for e in path))
        out.update(length_m=round(length, 1), edges=len(path), sheltered_m=round(sheltered, 1),
                   sheltered_share=round(sheltered / length, 4) if length else None,
                   minutes_at_1_1_m_s=int(np.ceil(length / 1.1 / 60)), junction_side_switches=junctions,
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
