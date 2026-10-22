"""Copy the staged areas into the app and the deploy inputs, and build the two tile files.

Usage: pipeline/.venv/bin/python -I pipeline/districts/publish.py [--no-tiles] [--hold AREA_ID ...]
Run it after pipeline/districts/build.py has staged every area in pipeline/areas.json. It stops on an area
whose last build.py checks failed. `--hold AREA_ID` (repeatable) leaves that area out of the app.
It reads pipeline/stage/<id>/ and writes these files, all kept in git:

- app/public/data/areas.json: the routing areas, their boxes, neighbourhoods and centre.
- app/public/data/places_index.json: every place once, with its area id and node in that area. A place in two
  overlapping areas stays under the area whose graph_rects hold it farthest from their edge.
- app/public/data/areas/<id>/graph.json, places.json and hours.json, compact.
- pipeline/inputs/areas/<id>/manifest_template.json and buildings.geojson.gz, for the deploy build.
- app/public/data/buildings.pmtiles: layer "buildings", zooms 13 to 15, every building at zoom 15.
- app/public/data/trees.pmtiles: layer "trees", zooms 14 to 15, every crown at both zooms.

Each area's canopy.tif stays in pipeline/inputs/areas/<id>/. The tiles need tippecanoe and tile-join.
Where two areas share a building or a tree, the tiles keep one copy: same height values and a centre
within 1 m.
"""
import gzip
import json
import math
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

import shapely

PIPE = Path(__file__).resolve().parents[1]
ROOT = PIPE.parent
STAGE = PIPE / "stage"
INPUTS = PIPE / "inputs/areas"
DATA = ROOT / "app/public/data"
TILES_WORK = PIPE / "work/tiles"
DEDUPE_M = 1.0
PLACE_SAME_M = 150.0
M_PER_DEG = 6371008.8 * math.pi / 180
COS_LAT = math.cos(math.radians(14.6))
# No feature or size limit, no tiny-polygon reduction and no simplification: zoom 15 keeps every footprint.
# Detail 13 puts zoom 15 on a grid of about 0.15 m. At the default 12 (0.29 m), 14 pillar parts under 0.1 m2
# in Manila collapse to nothing.
Z15_KEEP_ALL = ["--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction", "--no-line-simplification",
                "--full-detail=13"]


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(path)


def area_entry(a, m):
    """One areas.json row. The boxes in pipeline/areas.json must match the staged manifest."""
    for key, mkey in (("bbox", "pilot_bbox"), ("graph_bbox", "graph_bbox"), ("graph_rects", "graph_rects")):
        if a[key] != m[mkey]:
            sys.exit(f"{a['id']}: areas.json {key} differs from the staged manifest {mkey}")
    if m["area"]["id"] != a["id"]:
        sys.exit(f"{a['id']}: the staged manifest belongs to {m['area']['id']}")
    w, s, e, n = a["bbox"]
    return {
        "id": a["id"],
        "name": a["name"],
        "cities": a["cities"],
        "bbox": a["bbox"],
        "graph_bbox": a["graph_bbox"],
        "graph_rects": a["graph_rects"],
        "neighbourhoods": [{"id": d["id"], "name": d["name"], "bbox": d["bbox"]} for d in m["area"]["neighbourhoods"]],
        "center": [round((w + e) / 2, 6), round((s + n) / 2, 6)],
    }


def xy(lon, lat):
    """Metres on a flat frame for Metro Manila. Distances under a few km are within 0.1% of the true value."""
    return lon * M_PER_DEG * COS_LAT, lat * M_PER_DEG


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower()) or s.strip().lower()


def dedupe_index(rows, rects):
    """One row per real place. Where areas overlap, a place staged in two areas is the same name within 150 m,
    the radius build_places.py merges a name within. The copy deepest inside its own area's graph_rects stays,
    so its route has the most graph around it."""
    shapes = {a: shapely.union_all([shapely.box(*xy(w, s), *xy(e, n)) for w, s, e, n in r]) for a, r in rects.items()}
    depth = []
    for r in rows:
        pt, shp = shapely.Point(*xy(r["lon"], r["lat"])), shapes[r["area"]]
        d = shp.boundary.distance(pt)
        depth.append(d if shp.contains(pt) else -d)
    kept, keep, dropped = {}, set(), Counter()
    for i in sorted(range(len(rows)), key=lambda i: -depth[i]):
        r = rows[i]
        x, y = xy(r["lon"], r["lat"])
        twins = kept.setdefault(norm(r["name"]), [])
        hit = next((a for a, px, py in twins if a != r["area"] and math.hypot(px - x, py - y) <= PLACE_SAME_M), None)
        if hit:
            dropped[f"{r['area']} copy dropped, {hit} kept"] += 1
            continue
        twins.append((r["area"], x, y))
        keep.add(i)
    return [r for i, r in enumerate(rows) if i in keep], dict(dropped)


def index_row(p, area_id):
    row = {"name": p["name"], "category": p["category"], "lon": p["lon"], "lat": p["lat"],
           "node_id": p["node_id"], "area": area_id}
    if p.get("aliases"):
        row["aliases"] = p["aliases"]
    if p.get("detail"):
        row["detail"] = p["detail"]
    return row


class Seen:
    """Points already written, in 1 m cells, so a second copy from an overlapping area is skipped."""

    def __init__(self):
        self.cells = {}

    def add(self, lon, lat, key):
        x = lon * M_PER_DEG * math.cos(math.radians(lat))
        y = lat * M_PER_DEG
        cx, cy = math.floor(x / DEDUPE_M), math.floor(y / DEDUPE_M)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for px, py, k in self.cells.get((cx + dx, cy + dy), ()):
                    if k == key and math.hypot(px - x, py - y) <= DEDUPE_M:
                        return False
        self.cells.setdefault((cx, cy), []).append((x, y, key))
        return True


def ring_centroid(ring):
    """Area centroid of a closed lon/lat ring (shoelace), else the vertex mean for a degenerate ring."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-18:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return cx / (3 * a), cy / (3 * a)


def write_building_lines(ids, out):
    seen, kept, dup = Seen(), 0, 0
    with open(out, "w") as fh:
        for i in ids:
            fc = json.load(open(STAGE / i / "buildings_display.geojson"))
            for f in fc["features"]:
                p = f["properties"]
                h, mh = p["height_m"], p["min_height_m"]
                if not isinstance(h, (int, float)) or not isinstance(mh, (int, float)):
                    sys.exit(f"{i}: a building without numeric heights")
                lon, lat = ring_centroid(f["geometry"]["coordinates"][0])
                if not seen.add(lon, lat, (float(h), float(mh))):
                    dup += 1
                    continue
                kept += 1
                fh.write(json.dumps({"type": "Feature", "geometry": f["geometry"],
                                     "properties": {"height_m": h, "min_height_m": mh}}, separators=(",", ":")))
                fh.write("\n")
    return kept, dup


def write_tree_lines(ids, out):
    seen, kept, dup = Seen(), 0, 0
    with open(out, "w") as fh:
        for i in ids:
            t = json.load(open(STAGE / i / "trees.json"))
            if t["fields"] != ["lon", "lat", "r_m", "top_m", "base_m"] or len(t["lon"]) != t["count"]:
                sys.exit(f"{i}: trees.json has an unexpected layout")
            for lon, lat, r, top, base in zip(t["lon"], t["lat"], t["r_m"], t["top_m"], t["base_m"]):
                if not seen.add(lon, lat, (float(r), float(top), float(base))):
                    dup += 1
                    continue
                kept += 1
                fh.write(json.dumps({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                     "properties": {"r_m": r, "top_m": top, "base_m": base}}, separators=(",", ":")))
                fh.write("\n")
    return kept, dup


def run(cmd):
    print("+", " ".join(cmd), flush=True)
    # tippecanoe stores its command line in the tile metadata, so every path is relative to the repo root.
    subprocess.run(cmd, check=True, cwd=ROOT)


def rel(path):
    return str(path.relative_to(ROOT))


def build_tiles(ids):
    TILES_WORK.mkdir(parents=True, exist_ok=True)
    attribution = ("OpenStreetMap contributors (ODbL); Google Open Buildings 2.5D Temporal (CC BY 4.0); "
                   "Meta and WRI Global Canopy Height (CC BY 4.0)")
    common = ["tippecanoe", "--force", "-P", "--quiet", "-n", "undercover.ph", "-A", attribution]
    b_lines = TILES_WORK / "buildings.ndjson"
    b_kept, b_dup = write_building_lines(ids, b_lines)
    low, high = TILES_WORK / "buildings-z13-14.pmtiles", TILES_WORK / "buildings-z15.pmtiles"
    heights = ["-T", "height_m:float", "-T", "min_height_m:float"]
    # Zooms 13 and 14 may drop the smallest footprints to keep tiles light. Zoom 15 keeps every footprint
    # unsimplified, and the app overzooms it past 15.
    run(common + ["-o", rel(low), "-l", "buildings", "-Z13", "-z14", "--drop-smallest-as-needed", *heights,
                  rel(b_lines)])
    run(common + ["-o", rel(high), "-l", "buildings", "-Z15", "-z15", *Z15_KEEP_ALL, *heights, rel(b_lines)])
    run(["tile-join", "-f", "-q", "-pk", "-n", "undercover.ph buildings",
         "-A", attribution, "-o", rel(DATA / "buildings.pmtiles"), rel(low), rel(high)])
    t_lines = TILES_WORK / "trees.ndjson"
    t_kept, t_dup = write_tree_lines(ids, t_lines)
    # Drop rate 1 keeps every crown at zoom 14 too, so tree shadows look the same at 14 and 15.
    run(common + ["-o", rel(DATA / "trees.pmtiles"), "-l", "trees", "-Z14", "-z15", "-r1", "--no-feature-limit",
                  "--no-tile-size-limit", "-T", "r_m:float", "-T", "top_m:float", "-T", "base_m:float",
                  rel(t_lines)])
    return {"buildings": b_kept, "buildings_duplicates": b_dup, "trees": t_kept, "trees_duplicates": t_dup,
            "buildings_pmtiles_bytes": (DATA / "buildings.pmtiles").stat().st_size,
            "trees_pmtiles_bytes": (DATA / "trees.pmtiles").stat().st_size}


def main(tiles=True, hold=()):
    areas = json.load(open(PIPE / "areas.json"))["areas"]
    unknown = set(hold) - {a["id"] for a in areas}
    if unknown:
        sys.exit(f"--hold names unknown areas: {sorted(unknown)}")
    areas = [a for a in areas if a["id"] not in hold]
    ids = [a["id"] for a in areas]
    rows, index, report = [], [], {"held_back": list(hold)}
    for a in areas:
        i = a["id"]
        stage = STAGE / i
        # An area ships only when its last build.py checks passed. --hold leaves a failing area out.
        summary = PIPE / "work/districts" / i / "summary.json"
        if summary.exists() and not json.load(open(summary))["checks_passed"]:
            sys.exit(f"{i}: build.py checks failed (see {summary.relative_to(ROOT)}); fix it or pass --hold {i}")
        m = json.load(open(stage / "manifest_template.json"))
        graph = json.load(open(stage / "graph.json"))
        places = json.load(open(stage / "places.json"))
        hours = json.load(open(stage / "hours.json"))
        if m["counts"]["places"] != len(places) or m["counts"]["edges"] != len(graph["edges"]):
            sys.exit(f"{i}: the manifest template counts do not match the staged files; rerun build.py --checks {i}")
        rows.append(area_entry(a, m))
        out = DATA / "areas" / i
        dump(out / "graph.json", graph)
        dump(out / "places.json", places)
        dump(out / "hours.json", hours)
        index += [index_row(p, i) for p in places]
        inp = INPUTS / i
        inp.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(stage / "manifest_template.json", inp / "manifest_template.json")
        shutil.copyfile(stage / "buildings.geojson.gz", inp / "buildings.geojson.gz")
        if not (inp / "canopy.tif").exists():
            sys.exit(f"{inp / 'canopy.tif'} is missing")
        with gzip.open(inp / "buildings.geojson.gz") as fh:
            n_b = len(json.load(fh)["features"])
        report[i] = {"places": len(places), "edges": len(graph["edges"]), "buildings_full": n_b}
    index, dropped = dedupe_index(index, {r["id"]: r["graph_rects"] for r in rows})
    dump(DATA / "areas.json", {"areas": rows})
    dump(DATA / "places_index.json", index)
    report["places_index"] = len(index)
    report["places_index_copies_dropped"] = dropped
    if tiles:
        report["tiles"] = build_tiles(ids)
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    args = sys.argv[1:]
    held = [x for i, x in enumerate(args) if i > 0 and args[i - 1] == "--hold"]
    main(tiles="--no-tiles" not in args, hold=held)
