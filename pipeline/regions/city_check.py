"""Check that each regional area's boxes lie in the cities it names, and write pipeline/regions/city_check.json.

Usage: pipeline/.venv/bin/python -I pipeline/regions/city_check.py
publish.py ships a regional area only when this file gives it PASS. On 2026-10-22 the Lapu-Lapu boxes sat
mostly on Mandaue, and half the Mandaue boxes on Cebu City. Route checks and reach did not see that.

Boundaries are the admin_level=6 cities and municipalities of the source extract (region.SOURCE_PBF), cut
once with osmium into pipeline/raw/regions/bounds/admin6.geojsonseq. Share = land in the boxes inside the
named cities / land in the boxes inside any city, so water counts in neither. PASS at 50% or more.
Some cities have no boundary in OSM (Vigan, Laoag, Pagadian and Surigao on 2026-10-20). Those pass when
the city's place=city or place=town point lies inside the boxes.
"""
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from shapely.geometry import Point, box, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import region  # noqa: E402

BOUNDS = region.RAW / "bounds"
OUT = region.HERE / "city_check.json"
MIN_SHARE = 0.5


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\bcity of\b|\bmunicipality of\b|\bcity\b", " ", s)
    return "".join(c for c in s if c.isalnum())


def names(city):
    """ "San Fernando (Pampanga)" gives san fernando, "Angeles and Clark" gives angeles and clark."""
    city = re.sub(r"\(.*?\)", "", city)
    return [norm(x) for x in re.split(r"\band\b|,|/", city) if norm(x)]


def features(path):
    for line in open(path):
        f = json.loads(line.strip("\x1e"))
        if f.get("geometry"):
            yield f


def osmium(*args):
    subprocess.run(["osmium", *map(str, args)], check=True, capture_output=True)


def boundaries():
    out = BOUNDS / "admin6.geojsonseq"
    if not out.exists():
        BOUNDS.mkdir(parents=True, exist_ok=True)
        osmium("tags-filter", region.SOURCE_PBF, "r/admin_level=6", "-O", "-o", BOUNDS / "admin6.osm.pbf")
        osmium("export", BOUNDS / "admin6.osm.pbf", "-f", "geojsonseq", "--geometry-types=polygon", "-O", "-o", out)
    polys, labels = [], []
    for f in features(out):
        if f["properties"].get("name"):
            polys.append(shape(f["geometry"]).buffer(0))
            labels.append(f["properties"]["name"])
    return polys, labels


def place_points(region_id):
    out = BOUNDS / f"places-{region_id}.geojsonseq"
    if not out.exists():
        pbf = BOUNDS / f"places-{region_id}.osm.pbf"
        osmium("tags-filter", region.OSM_DIR / f"{region_id}.osm.pbf", "n/place=city,town", "-O", "-o", pbf)
        osmium("export", pbf, "-f", "geojsonseq", "-O", "-o", out)
    pts = []
    for f in features(out):
        p = f["properties"]
        keys = {norm(p[k]) for k in ("name", "name:en", "official_name", "alt_name") if p.get(k)}
        pts.append((keys, Point(f["geometry"]["coordinates"])))
    return pts


def check(a, polys, labels, tree, keys):
    boxes = unary_union([box(*r) for r in a["graph_rects"]])
    want = {n for c in a["cities"] for n in names(c)}
    near = [int(i) for i in tree.query(boxes)]
    cover = {i: polys[i].intersection(boxes).area for i in near}
    land = unary_union([polys[i].intersection(boxes) for i in near]).area
    top = sorted(((round(cover[i] / land, 3), labels[i]) for i in near if land and cover[i] > 0), reverse=True)[:3]
    chosen = [max(h, key=cover.get) for n in want if (h := [i for i in near if keys[i] == n and cover[i] > 0])]
    if chosen and land:
        share = round(unary_union([polys[i].intersection(boxes) for i in chosen]).area / land, 3)
        return {"method": "boundary", "share": share, "verdict": "PASS" if share >= MIN_SHARE else "FAIL", "top": top}
    inside = [sorted(k)[0] for k, pt in place_points(a["region"]) if k & want and boxes.buffer(0.003).contains(pt)]
    return {"method": "place point", "inside": inside, "verdict": "PASS" if inside else "FAIL", "top": top}


def main():
    polys, labels = boundaries()
    tree, keys = STRtree(polys), [norm(n) for n in labels]
    areas = json.load(open(region.AREAS_FILE))["areas"]
    report = {a["id"]: {"cities": a["cities"], "graph_rects": a["graph_rects"], **check(a, polys, labels, tree, keys)}
              for a in areas}
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n")
    bad = {i: r for i, r in report.items() if r["verdict"] != "PASS"}
    for i, r in bad.items():
        print(i, r)
    print(f"{len(report) - len(bad)} of {len(report)} areas PASS; wrote {OUT.relative_to(region.ROOT)}")


if __name__ == "__main__":
    main()
