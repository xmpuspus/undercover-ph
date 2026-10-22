"""District copy of pipeline/route_check.py. Run through pipeline/districts/build.py, which sets UC_AREA.

Shortest walk between two places on routable edges only, from the written graph.json and places.json.

Usage: pipeline/.venv/bin/python -I pipeline/route_check.py "Ayala MRT" "Greenbelt" [K] [closed]
Matches a place by exact name or alias, case-insensitive. Writes pipeline/work/route_check.json.
With K, the cost is len_m x (1 + K) on unsheltered edges and len_m on sheltered edges (flags & 7),
the rain-mode exposure rule. Without K, the route is the shortest. The word "closed" drops every edge
with an hours_idx, as at a time when the malls are shut. Otherwise hours are ignored.

The search follows the browser router's side-switch rule (app/src/lib/router/astar.ts, sideSwitch).
A move between opposite side edges of one road is free at a node with flag 1 or 2 (crossing or signals).
At a node with flag 4 (junction) it costs 60 m x (1 + K). Anywhere else it is forbidden.
Two side edges are on opposite sidewalks when the walker has them on different hands, from each edge's
side and the direction walked, or on the same hand after a U-turn between the same two nodes.
So each search state is a directed edge, as in the browser, not a node. As in the browser, a walk never
turns back along the edge it just walked, because that U-turn would dodge the side-switch rule.
"""
import heapq
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402

from ctx import OUT, WORK, haversine  # noqa: E402

# Same values as app/src/lib/router/astar.ts.
JUNCTION_PENALTY_M = 60.0
NODE_CROSSING, NODE_SIGNALS, NODE_JUNCTION = 1, 2, 4
OTHER_HAND = {"left": "right", "right": "left"}
FREE, JUNCTION, FORBIDDEN, NONE = "free", "junction", "forbidden", None


def find_place(places, q):
    q = q.strip().lower()
    hits = [p for p in places if p["name"].lower() == q or q in (a.lower() for a in p["aliases"])]
    if not hits:
        sys.exit(f"no place named {q!r}")
    return hits[0], [h["name"] for h in hits]


def cost(e, k):
    return e["len_m"] * (1 + (0 if e["flags"] & 7 else k))


def same_road(a, b):
    if a["name"] is not None and a["name"] == b["name"]:
        return True
    if a["way_id"] is not None and a["way_id"] == b["way_id"]:
        return True
    return {a["u"], a["v"]} == {b["u"], b["v"]}


def side_switch(edges, node_flags, a, b, x):
    """The browser's sideSwitch: the kind of move from edge a to edge b at node x."""
    ea, eb = edges[a], edges[b]
    if ea["side"] not in OTHER_HAND or eb["side"] not in OTHER_HAND:
        return NONE
    if not same_road(ea, eb):
        return NONE
    # A side is relative to the edge's u-to-v direction. Walking against it puts the sidewalk on the other hand.
    hand_a = OTHER_HAND[ea["side"]] if ea["u"] == x else ea["side"]
    hand_b = OTHER_HAND[eb["side"]] if eb["v"] == x else eb["side"]
    same_arm = {ea["u"], ea["v"]} == {eb["u"], eb["v"]}
    if (hand_a != hand_b) if same_arm else (hand_a == hand_b):
        return NONE
    if node_flags is None:
        return FREE
    f = node_flags[x]
    if f & (NODE_CROSSING | NODE_SIGNALS):
        return FREE
    if f & NODE_JUNCTION:
        return JUNCTION
    return FORBIDDEN


def search(graph, src, dst, k, closed):
    """Dijkstra over directed edges. State 2e walks edge e from u to v, 2e + 1 from v to u."""
    edges = graph["edges"]
    nf = graph.get("node_flags")
    node_flags = nf if isinstance(nf, list) and len(nf) == len(graph["nodes"]) else None
    ok = [e["routable"] and not (closed and e["hours_idx"] is not None) and e["u"] != e["v"] for e in edges]
    adj = {}
    for e in edges:
        if ok[e["id"]]:
            adj.setdefault(e["u"], []).append(e["id"])
            adj.setdefault(e["v"], []).append(e["id"])
    penalty = JUNCTION_PENALTY_M * (1 + k)
    dist, prev, heap = {}, {}, []

    def relax(frm, x, e, g):
        c = g + cost(edges[e], k)
        if frm is not None:
            sw = side_switch(edges, node_flags, frm >> 1, e, x)
            if sw == FORBIDDEN:
                return
            if sw == JUNCTION:
                c += penalty
        d = 2 * e if edges[e]["u"] == x else 2 * e + 1
        if c < dist.get(d, math.inf):
            dist[d] = c
            prev[d] = frm
            heapq.heappush(heap, (c, d))

    for e in adj.get(src, []):
        relax(None, src, e, 0.0)
    goal = None
    while heap:
        g, d = heapq.heappop(heap)
        if g > dist[d]:
            continue
        e = d >> 1
        x = edges[e]["u"] if d & 1 else edges[e]["v"]
        if x == dst:
            goal = d
            break
        for e2 in adj.get(x, []):
            if e2 != e:  # as in the browser: no turning back along the edge just walked
                relax(d, x, e2, g)
    if goal is None:
        return None, 0
    states, d = [], goal
    while d is not None:
        states.append(d)
        d = prev[d]
    states.reverse()
    # A state's tail node is where the walker entered its edge: u for 2e, v for 2e + 1.
    tail = [edges[d >> 1]["v"] if d & 1 else edges[d >> 1]["u"] for d in states]
    junctions = sum(side_switch(edges, node_flags, states[i - 1] >> 1, states[i] >> 1, tail[i]) == JUNCTION
                    for i in range(1, len(states)))
    return [edges[d >> 1] for d in states], junctions


def main(a, b, k=0.0, closed=False):
    graph = json.load(open(OUT / "graph.json"))
    places = json.load(open(OUT / "places.json"))
    src, src_hits = find_place(places, a)
    dst, dst_hits = find_place(places, b)
    out = {"k_unsheltered": k, "hours_edges_dropped": closed, "side_switch_rule": "browser",
           "from": src["name"], "from_matches": src_hits, "from_node": src["node_id"],
           "to": dst["name"], "to_matches": dst_hits, "to_node": dst["node_id"]}
    path, junctions = ([], 0) if src["node_id"] == dst["node_id"] else search(
        graph, src["node_id"], dst["node_id"], k, closed)
    if path is None:
        out["length_m"] = None
        out["result"] = "no routable path"
    else:
        sheltered = sum(e["len_m"] for e in path if e["flags"] & 7)
        length = float(sum(e["len_m"] for e in path))
        straight = haversine(src["lat"], src["lon"], dst["lat"], dst["lon"])
        out.update(straight_m=round(straight, 1), detour_ratio=round(length / straight, 2) if straight else None)
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
