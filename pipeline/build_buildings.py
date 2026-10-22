"""Write buildings.geojson for the building area with one height per outline and per building:part.

Usage: pipeline/.venv/bin/python -I pipeline/build_buildings.py
Reads pipeline/work/buildings_osm.jsonl and pipeline/raw/gob_2023/building_area_height_presence.tif.
Writes pipeline/inputs/buildings.geojson and pipeline/work/buildings_log.json.

Height rule (report 02): OSM height, else building:levels x 3.74 m, else the Google 2023 zonal median
(at least 8 pixels and a median of 2.5 m or more), else a 7.5 m default (2 levels x 3.74 m) for
footprints over 100 m2. Smaller footprints with no height stay null. Each building:part is
its own feature. A part's height never flows to its outline. An outline's Google median uses only the
outline area outside its parts, so a tower part does not raise the podium.
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
import shapely  # noqa: E402
from rasterio.features import rasterize  # noqa: E402
from rasterio.windows import Window  # noqa: E402
from shapely.strtree import STRtree  # noqa: E402

from common import BUILDING_BBOX, BUILDINGS, LEVEL_M, RAW, TO_UTM, WORK, parse_height, parse_levels  # noqa: E402

G_MIN_PX = 8
G_MIN_M = 2.5
G_CAP_P90 = 95.0
PART_COVER_DROP = 0.9
# Decision 2026-10-22: every default is 2 levels x 3.74 m. Overstated height invents shade, so the
# default errs low. Footprints of 100 m2 or less with no height stay null, as report 02 gives no class there.
DEFAULT_LEVELS = 2
DEFAULT_MIN_AREA_M2 = 100.0


def area_default(area_m2):
    return DEFAULT_LEVELS * LEVEL_M if area_m2 > DEFAULT_MIN_AREA_M2 else None


def to_utm(g):
    return shapely.transform(g, lambda a: np.column_stack(TO_UTM.transform(a[:, 0], a[:, 1])))


def zonal(geom, hgt, pres, transform, nodata):
    """Median and p90 of building_height at pixel centres inside geom, plus the presence-masked median."""
    x0, y0, x1, y1 = geom.bounds
    inv = ~transform
    ca, ra = inv * (x0, y1)
    cb, rb = inv * (x1, y0)
    r0, c0 = max(0, math.floor(min(ra, rb))), max(0, math.floor(min(ca, cb)))
    r1 = min(hgt.shape[0], math.ceil(max(ra, rb)) + 1)
    c1 = min(hgt.shape[1], math.ceil(max(ca, cb)) + 1)
    if r1 <= r0 or c1 <= c0:
        return 0, None, None, None
    wt = rasterio.windows.transform(Window(c0, r0, c1 - c0, r1 - r0), transform)
    mask = rasterize([(geom, 1)], out_shape=(r1 - r0, c1 - c0), transform=wt, fill=0, dtype="uint8",
                     all_touched=False).astype(bool)
    h = hgt[r0:r1, c0:c1][mask]
    p = pres[r0:r1, c0:c1][mask]
    ok = h != nodata
    h, p = h[ok], p[ok]
    if not h.size:
        return 0, None, None, None
    hp = h[p >= 0.5]
    return int(h.size), float(np.median(h)), float(np.percentile(h, 90)), (
        float(np.median(hp)) if hp.size >= G_MIN_PX else None)


def main():
    bbox_poly = shapely.box(*BUILDING_BBOX)
    rows = []
    for line in open(WORK / "buildings_osm.jsonl"):
        r = json.loads(line)
        g = shapely.from_wkt(r["wkt"])
        if not g.intersects(bbox_poly) or g.is_empty:
            continue
        r["geom"] = g
        r["utm"] = to_utm(g)
        r["area"] = r["utm"].area
        rows.append(r)
    outlines = [r for r in rows if r["kind"] == "outline"]
    parts = [r for r in rows if r["kind"] == "part"]

    # Parts belong to the outline that contains their representative point (report 02 rule).
    tree = STRtree([o["utm"] for o in outlines])
    for o in outlines:
        o["parts"] = []
    orphan_parts = 0
    for p in parts:
        rp = p["utm"].representative_point()
        hits = [k for k in tree.query(rp, predicate="within")]
        if hits:
            k = min(hits, key=lambda k: outlines[k]["area"])
            outlines[k]["parts"].append(p)
        else:
            orphan_parts += 1

    dropped_outlines = []
    for o in outlines:
        o["sample"] = o["utm"]
        o["part_cover"] = 0.0
        if o["parts"]:
            pu = shapely.union_all([p["utm"] for p in o["parts"]]).buffer(0)
            inter = o["utm"].intersection(pu).area
            o["part_cover"] = inter / o["area"] if o["area"] else 1.0
            rest = o["utm"].difference(pu)
            o["sample"] = rest if not rest.is_empty else None
            if o["part_cover"] >= PART_COVER_DROP:
                dropped_outlines.append(o)

    tif = RAW / "gob_2023/building_area_height_presence.tif"
    with rasterio.open(tif) as src:
        hgt = src.read(1)
        pres = src.read(2)
        transform, nodata = src.transform, src.nodata
    log_g = Counter()
    mask_diff = []
    features = []
    src_count, src_area, kind_src = Counter(), Counter(), Counter()
    null_height, inverted, capped_google, osm_over_100 = 0, 0, 0, 0
    dropped_ids = {id(o) for o in dropped_outlines}
    keep = [o for o in outlines if id(o) not in dropped_ids] + parts
    for r in keep:
        t = r["tags"]
        h_tag = parse_height(t.get("height"))
        lv = parse_levels(t.get("building:levels"))
        source, height = None, None
        if h_tag is not None:
            source, height = "osm", h_tag
        elif lv:
            source, height = "osm_levels", lv * LEVEL_M
        else:
            geom = r["sample"] if r["kind"] == "outline" else r["utm"]
            npx, p50, p90, p50m = zonal(geom, hgt, pres, transform, nodata) if geom is not None else (0, None, None, None)
            if npx >= G_MIN_PX and p50 is not None and p50 >= G_MIN_M:
                source, height = "google_2023", p50
                capped_google += p90 >= G_CAP_P90
                log_g["google_used"] += 1
                if p50m is None or p50m < G_MIN_M:
                    log_g["presence_mask_would_reject"] += 1
                else:
                    mask_diff.append(abs(p50m - p50))
            else:
                height = area_default(r["area"])
                source = "default" if height is not None else None
                reason = "no_google_pixels" if npx < G_MIN_PX else "google_median_below_2_5m"
                log_g[f"{source or 'null'}_because_{reason}"] += 1
        if height is None:
            null_height += 1
        if source == "osm" and height > 100:
            osm_over_100 += 1
        mh = parse_height(t.get("min_height"))
        if mh is None:
            ml = parse_levels(t.get("building:min_level"))
            mh = ml * LEVEL_M if ml else 0.0
        if height is not None and mh >= height:
            inverted += 1
        src_count[source] += 1
        src_area[source] += r["area"]
        kind_src[(r["kind"], source)] += 1
        props = {"height_m": round(height, 1) if height is not None else None, "min_height_m": round(mh, 1),
                 "source": source, "name": t.get("name")}
        polys = list(r["geom"].geoms) if r["geom"].geom_type == "MultiPolygon" else [r["geom"]]
        for poly in polys:
            rings = [[[round(x, 7), round(y, 7)] for x, y in ring.coords]
                     for ring in [poly.exterior, *poly.interiors]]
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": "Polygon", "coordinates": rings}})

    tmp = BUILDINGS.with_suffix(".geojson.tmp")
    with open(tmp, "w") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh, separators=(",", ":"),
                  ensure_ascii=False)
    tmp.replace(BUILDINGS)

    total_area = sum(src_area.values())
    log = {
        "building_bbox": BUILDING_BBOX, "osm_objects": len(keep), "features": len(features),
        "outlines": len(outlines), "parts": len(parts), "parts_without_outline": orphan_parts,
        "outlines_with_parts": sum(1 for o in outlines if o["parts"]),
        "outlines_dropped_parts_cover_ge_90pct": len(dropped_outlines),
        "dropped_outlines_with_osm_height": sum(1 for o in dropped_outlines if parse_height(o["tags"].get("height"))),
        "objects_by_source": {str(k): v for k, v in src_count.items()},
        "area_share_by_source": {str(k): round(v / total_area, 4) for k, v in src_area.items()},
        "objects_by_kind_and_source": {f"{k[0]}:{k[1]}": v for k, v in sorted(kind_src.items(), key=str)},
        "null_height_objects": null_height, "min_height_ge_height": inverted,
        "google_used": log_g["google_used"], "google_p90_at_cap_95m": int(capped_google),
        "osm_height_over_100m": osm_over_100,
        "presence_mask_check": {"would_reject": log_g["presence_mask_would_reject"],
                                "compared": len(mask_diff),
                                "median_abs_diff_m": round(float(np.median(mask_diff)), 2) if mask_diff else None,
                                "share_diff_over_5m": round(float(np.mean(np.array(mask_diff) > 5)), 4) if mask_diff else None},
        "fallback_reasons": {k: v for k, v in log_g.items() if "_because_" in k},
        "levels_factor_m": LEVEL_M, "google_rule": f">= {G_MIN_PX} px and p50 >= {G_MIN_M} m",
        "default_height_m": round(DEFAULT_LEVELS * LEVEL_M, 2), "default_min_area_m2": DEFAULT_MIN_AREA_M2,
    }
    json.dump(log, open(WORK / "buildings_log.json", "w"), indent=1)
    print(json.dumps(log, indent=1))


if __name__ == "__main__":
    main()
