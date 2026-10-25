"""Compare OSM and Google Open Buildings v3 outlines per area: coverage and detail.

Usage: pipeline/shade/.venv/bin/python -I -W ignore pipeline/tools/compare_outlines.py OUT_JSON [AREA_ID ...]
Inputs: each area's OSM outlines (pipeline/work/districts/<area>/buildings_osm.jsonl, building:part rows left out) and
its v3 outlines at Google's 80%-precision cutoff (pipeline/raw/districts/<id>/gob_v3/outlines.jsonl.gz). Only outlines
whose centre lies in the area's graph boxes count.

Coverage: the share of the Google 2023 raster's building area (presence >= 0.5, height >= 2.5 m, read at 2 m, each
district's own box) that each set covers. The raster is Google's too, so it can be biased toward v3. An imagery sample is the check.
Detail, from overlaps between the two sets:
- same: one OSM and one v3 outline with intersection over union 0.5 or more.
- osm_coarser: one OSM outline holds 2 or more v3 outlines, each at least half inside it.
- v3_coarser: one v3 outline holds 2 or more OSM outlines, each at least half inside it.
- osm_only and v3_only: an outline that overlaps no outline of the other set by 10% of its area or more.
"""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
STEP = 4  # read the 0.5 m raster at 2 m


def districts():
    rows = {}
    for f in ("pipeline/districts.json", "pipeline/regions/districts.json"):
        for d in json.load(open(ROOT / f))["districts"]:
            rows[d["id"]] = d
    return rows


def in_rects(x, y, rects):
    return any(w <= x <= e and s <= y <= n for w, s, e, n in rects)


def load(area, members, rects, to_utm):
    osm = []
    for line in open(ROOT / "pipeline/work/districts" / area / "buildings_osm.jsonl"):
        r = json.loads(line)
        if r["kind"] != "outline":
            continue
        g = shapely.from_wkt(r["wkt"])
        c = g.centroid
        if g.is_empty or not in_rects(c.x, c.y, rects):
            continue
        t = r["tags"]
        osm.append((shapely.transform(g, to_utm), bool(t.get("height") or t.get("building:levels"))))
    seen, v3 = set(), []
    for d in members:
        for line in gzip.open(ROOT / "pipeline/raw/districts" / d / "gob_v3/outlines.jsonl.gz", "rt"):
            r = json.loads(line)
            if r["plus"] in seen or r["conf"] < r["thr"]:
                continue
            seen.add(r["plus"])
            g = shapely.from_wkt(r["wkt"])
            c = g.centroid
            if in_rects(c.x, c.y, rects):
                v3.append(shapely.transform(g, to_utm))
    return osm, v3


def detail(osm, v3):
    og = [g for g, _ in osm]
    o_tree, v_tree = STRtree(og), STRtree(v3)
    rel = Counter()
    for i, g in enumerate(og):
        hits = v_tree.query(g, predicate="intersects")
        inside = [k for k in hits if v3[k].intersection(g).area >= 0.5 * v3[k].area]
        if len(inside) >= 2:
            rel["osm_coarser"] += 1
            continue
        best = max((g.intersection(v3[k]).area / g.union(v3[k]).area for k in hits), default=0.0)
        if best >= 0.5:
            rel["same"] += 1
        elif sum(g.intersection(v3[k]).area for k in hits) < 0.1 * g.area:
            rel["osm_only"] += 1
        else:
            rel["osm_partial"] += 1
    for k, g in enumerate(v3):
        hits = o_tree.query(g, predicate="intersects")
        inside = [i for i in hits if og[i].intersection(g).area >= 0.5 * og[i].area]
        if len(inside) >= 2:
            rel["v3_coarser"] += 1
        elif sum(g.intersection(og[i]).area for i in hits) < 0.1 * g.area:
            rel["v3_only"] += 1
    return rel


def coverage(members, rows, osm, v3):
    ref = o_hit = v_hit = u_hit = 0
    for d in members:
        path = ROOT / "pipeline/raw/districts" / d / "gob_2023/building_area_height_presence.tif"
        with rasterio.open(path) as src:
            h, w = src.height // STEP, src.width // STEP
            data = src.read([1, 2], out_shape=(2, h, w), resampling=Resampling.average)
            tr = src.transform * src.transform.scale(src.width / w, src.height / h)
            to = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform
            own = shapely.transform(shapely.box(*rows[d]["bbox"]), lambda a: np.column_stack(to(a[:, 0], a[:, 1])))
            mine = rasterize([own], out_shape=(h, w), transform=tr, fill=0, default_value=1).astype(bool)
            g = (data[1] >= 0.5) & (data[0] >= 2.5) & mine

            def burn(geoms):
                return rasterize(geoms, out_shape=(h, w), transform=tr, fill=0, default_value=1).astype(bool) if geoms else np.zeros((h, w), bool)

            o = burn([x for x, _ in osm])
            v = burn(v3)
            ref += g.sum()
            o_hit += (g & o).sum()
            v_hit += (g & v).sum()
            u_hit += (g & (o | v)).sum()
    return {k: round(float(x / ref), 3) if ref else None for k, x in (("osm", o_hit), ("v3", v_hit), ("union", u_hit))}


def main():
    rows = districts()
    areas = {a["id"]: a for a in json.load(open(ROOT / "app/public/data/areas.json"))["areas"]}
    want = sys.argv[2:] or list(areas)
    out = {}
    for area in want:
        a = areas[area]
        members = [n["id"] for n in a["neighbourhoods"]]
        lat = (a["bbox"][1] + a["bbox"][3]) / 2
        epsg = 32651 if a["center"][0] >= 120 else 32650
        t = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
        to_utm = lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1]))  # noqa: E731
        osm, v3 = load(area, members, a["graph_rects"], to_utm)
        rel = detail(osm, v3)
        cov = coverage(members, rows, osm, v3) if v3 or osm else {}
        out[area] = {
            "region": a["region"]["id"], "osm": len(osm), "v3": len(v3),
            "osm_with_height_tag": round(sum(h for _, h in osm) / len(osm), 3) if osm else None,
            "median_m2": {"osm": round(float(np.median([g.area for g, _ in osm])), 1) if osm else None,
                          "v3": round(float(np.median([g.area for g in v3])), 1) if v3 else None},
            "coverage": cov, "detail": dict(rel), "lat": round(lat, 3),
        }
        print(area, json.dumps(out[area]), flush=True)
    Path(sys.argv[1]).write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
