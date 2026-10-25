"""Fail when an area's noon shade is not below its 16:00 shade: a sign of a sun-direction or time zone error.

Usage: python3 -I pipeline/shade/check_sun_order.py AREA_DIR [AREA_DIR ...]
AREA_DIR is app/public/data/areas/<id> with manifest.json, graph.json and shade/<date>.bin.

At noon the sun is high, so shadows are short. At 16:00 it is low in the west, so they are long. Over a whole
area the length-weighted shade at 12:00 is therefore lower than at 16:00 on every date. A walk sample of 22
trips held this without exception (tmp/improve-plan-20261023/behaviour.md, P2). Shade cast for the wrong hour,
time zone or azimuth breaks it. 08:00 against 12:00 is not checked: on east-west streets a low east sun shades
less than the noon sun (item 22a), so that order is correct. PLAN.md item 20 (2026-10-23).
Standard library only.
"""
import json
import sys
from pathlib import Path

NOON, LATE = 720, 960
NIGHT = 255


def mean_shade(building, tree, lengths, b, n_edges):
    """Length-weighted percent of open walkway in building or tree shadow in bucket b. None at night."""
    total = shaded = 0.0
    base = b * n_edges
    for e, length in lengths:
        v = building[base + e]
        if v == NIGHT:
            continue
        total += length
        shaded += length * min(100, v + tree[base + e])
    return shaded / total if total else None


def check(area_dir):
    """Return a list of failure lines for one area. An empty list means every date holds the order."""
    d = Path(area_dir)
    m = json.loads((d / "manifest.json").read_text())
    s = m["shade"]
    n_buckets, n_edges = s["n_buckets"], s["n_edges"]
    buckets = m["buckets_min"]
    if NOON not in buckets or LATE not in buckets:
        return []
    graph = json.loads((d / "graph.json").read_text())
    if len(graph["edges"]) != n_edges:
        return [f"{d.name}: graph.json has {len(graph['edges'])} edges, the shade header {n_edges}"]
    # Roofed edges count as full cover in the app at every sun position, so the order check leaves them out.
    lengths = [(i, e["len_m"]) for i, e in enumerate(graph["edges"]) if not (e.get("flags", 0) & 7) and e["len_m"] > 0]
    fails = []
    for date, name in zip(m["dates"], s["files"]):
        raw = (d / name).read_bytes()
        plane = n_buckets * n_edges
        if len(raw) != 2 * plane:
            fails.append(f"{d.name} {date}: {name} has {len(raw)} bytes, want {2 * plane}")
            continue
        building, tree = raw[:plane], raw[plane:]
        noon = mean_shade(building, tree, lengths, buckets.index(NOON), n_edges)
        late = mean_shade(building, tree, lengths, buckets.index(LATE), n_edges)
        if noon is None or late is None:
            fails.append(f"{d.name} {date}: 12:00 or 16:00 is marked as night")
        elif noon >= late:
            fails.append(f"{d.name} {date}: shade at 12:00 is {noon:.1f}%, not below 16:00 at {late:.1f}%")
    return fails


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    fails = [f for a in sys.argv[1:] for f in check(a)]
    print("\n".join(fails) if fails else f"noon shade is below 16:00 shade in {len(sys.argv) - 1} area(s) on every date")
    sys.exit(1 if fails else 0)
