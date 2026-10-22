"""List indoor, corridor and building-passage edges of a staged area by the named footprint they sit in.

Usage: UC_AREA=<id> pipeline/.venv/bin/python -I pipeline/districts/indoor_report.py
Shows which malls or buildings would need a cited hours row before their indoor edges can route.
Writes <work>/indoor_report.json.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shapely  # noqa: E402
from shapely.strtree import STRtree  # noqa: E402

from ctx import OUT, WORK, write_json  # noqa: E402


def main():
    graph = json.load(open(OUT / "graph.json"))
    hours = json.load(open(OUT / "hours.json"))
    feats = [json.loads(line) for line in open(WORK / "features.jsonl")]
    polys = [(f["tags"]["name"], f["tags"].get("shop"), f["osm"], shapely.from_wkt(f["wkt"]))
             for f in feats if f["type"] == "area" and (f["tags"].get("building") or f["tags"].get("shop")
                                                       or f["tags"].get("railway") or f["tags"].get("public_transport"))]
    tree = STRtree([p[3] for p in polys])
    by = defaultdict(lambda: {"edges": 0, "m": 0.0, "routable": 0, "hours": set(), "shop": None, "osm": None})
    for e in graph["edges"]:
        if not e["flags"] & 4:
            continue
        line = shapely.LineString(e["geom"])
        best = None
        for k in tree.query(line, predicate="intersects"):
            share = line.intersection(polys[k][3]).length
            if best is None or share > best[0] or (share == best[0] and polys[k][3].area < polys[best[1]][3].area):
                best = (share, k)
        key = polys[best[1]][0] if best else "(no named footprint)"
        r = by[key]
        r["edges"] += 1
        r["m"] += e["len_m"]
        r["routable"] += e["routable"]
        if best:
            r["shop"], r["osm"] = polys[best[1]][1], polys[best[1]][2]
        if e["hours_idx"] is not None:
            r["hours"].add(hours[e["hours_idx"]]["name"])
    rows = sorted(({"footprint": k, **{kk: (sorted(v) if isinstance(v, set) else round(v, 1) if isinstance(v, float) else v)
                                         for kk, v in r.items()}} for k, r in by.items()), key=lambda x: -x["m"])
    write_json(WORK / "indoor_report.json", rows, indent=1)
    for r in rows:
        print(f"{r['m']:8.1f} m {r['edges']:4d} edges routable={r['routable']:3d} shop={r['shop']} {r['osm']} {r['footprint']} hours={r['hours']}")


if __name__ == "__main__":
    main()
