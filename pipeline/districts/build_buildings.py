"""District copy of pipeline/build_buildings.py. Run through pipeline/districts/build.py, which sets UC_DISTRICT.

Write buildings.geojson for the building area with one height per outline and per building:part.

Usage: pipeline/.venv/bin/python -I pipeline/build_buildings.py
Reads pipeline/work/buildings_osm.jsonl and pipeline/raw/gob_2023/building_area_height_presence.tif.
Writes pipeline/inputs/buildings.geojson and pipeline/work/buildings_log.json.

Height rule (report 02): OSM height, else building:levels x 3.74 m, else the Google 2023 zonal median
(at least 8 pixels and a median of 2.5 m or more), else a 7.5 m default (2 levels x 3.74 m) for
footprints over 100 m2. Smaller footprints with no height stay null. Each building:part is
its own feature. A part's height never flows to its outline. An outline's Google median uses only the
outline area outside its parts, so a tower part does not raise the podium.

Google Open Buildings v3 outlines (pipeline/districts/fetch_gob_v3.py) fill the buildings OSM has not drawn
(decision 2026-10-23). One goes in only when two Google sources agree: its v3 confidence reaches the 80%-precision
threshold of its S2 cell, and the 2023 height raster sees a building in it (at least 8 pixels with presence 0.5 or
more, and a median height of 2.5 m or more on those pixels). It must not overlap an OSM outline or part by 10% of
its area or more. Its height is the raster median, with no default, because a wrong outline would invent shade.
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

import gzip  # noqa: E402

import v3_rule  # noqa: E402
from ctx import AREA, BUILDING_BBOX, BUILDINGS, LEVEL_M, RASTERS, TO_UTM, WORK, parse_height, parse_levels  # noqa: E402

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


class MultiRaster:
    """Member Google windows read as one raster on their shared 0.5 m grid. Overlaps hold equal pixels."""

    def __init__(self, paths):
        self.ds = [rasterio.open(p) for p in paths]
        self.transform = self.ds[0].transform
        self.nodata = self.ds[0].nodata
        inv = ~self.transform
        self.offsets = []
        for d in self.ds:
            if d.res != self.ds[0].res or d.nodata != self.nodata:
                sys.exit(f"raster {d.name} does not match the first member raster")
            c, r = inv * (d.transform.c, d.transform.f)
            if abs(c - round(c)) > 1e-6 or abs(r - round(r)) > 1e-6:
                sys.exit(f"raster {d.name} is off the shared pixel grid")
            self.offsets.append((int(round(r)), int(round(c))))

    def window(self, r0, r1, c0, c1):
        hgt = np.full((r1 - r0, c1 - c0), self.nodata, np.float32)
        pres = np.full((r1 - r0, c1 - c0), self.nodata, np.float32)
        for d, (orow, ocol) in zip(self.ds, self.offsets):
            a0, a1 = max(r0, orow), min(r1, orow + d.height)
            b0, b1 = max(c0, ocol), min(c1, ocol + d.width)
            if a1 <= a0 or b1 <= b0:
                continue
            data = d.read([1, 2], window=Window(b0 - ocol, a0 - orow, b1 - b0, a1 - a0))
            sub_h = hgt[a0 - r0:a1 - r0, b0 - c0:b1 - c0]
            sub_p = pres[a0 - r0:a1 - r0, b0 - c0:b1 - c0]
            take = (sub_h == self.nodata) & (data[0] != self.nodata)
            sub_h[take] = data[0][take]
            sub_p[take] = data[1][take]
        return hgt, pres


def zonal(geom, mr):
    """Median and p90 of building_height at pixel centres inside geom, plus the presence-masked median."""
    x0, y0, x1, y1 = geom.bounds
    inv = ~mr.transform
    ca, ra = inv * (x0, y1)
    cb, rb = inv * (x1, y0)
    r0, c0 = math.floor(min(ra, rb)), math.floor(min(ca, cb))
    r1, c1 = math.ceil(max(ra, rb)) + 1, math.ceil(max(ca, cb)) + 1
    if r1 <= r0 or c1 <= c0:
        return 0, None, None, None
    wt = rasterio.windows.transform(Window(c0, r0, c1 - c0, r1 - r0), mr.transform)
    mask = rasterize([(geom, 1)], out_shape=(r1 - r0, c1 - c0), transform=wt, fill=0, dtype="uint8",
                     all_touched=False).astype(bool)
    hgt, pres = mr.window(r0, r1, c0, c1)
    nodata = mr.nodata
    h = hgt[mask]
    p = pres[mask]
    ok = h != nodata
    h, p = h[ok], p[ok]
    if not h.size:
        return 0, None, None, None
    hp = h[p >= 0.5]
    return int(h.size), float(np.median(h)), float(np.percentile(h, 90)), (
        float(np.median(hp)) if hp.size >= G_MIN_PX else None)


def google_v3(bbox_poly, osm_geoms, mr):
    """Google v3 outlines that fill OSM gaps, as rows with a raster height, and the counts behind the choice."""
    seen, cands = set(), []
    for d in AREA.members:
        path = d.raw / "gob_v3/outlines.jsonl.gz"
        if not path.exists():
            sys.exit(f"{path} is missing; run pipeline/districts/fetch_gob_v3.py {d.id}")
        for line in gzip.open(path, "rt"):
            r = json.loads(line)
            if r["plus"] not in seen:
                seen.add(r["plus"])
                cands.append(r)
    log = Counter(candidates=len(cands))
    tree = STRtree(osm_geoms)
    rows = []
    for r in cands:
        if r["conf"] < r["thr"]:
            log["below_80pct_precision"] += 1
            continue
        g = shapely.from_wkt(r["wkt"])
        if g.is_empty or not g.intersects(bbox_poly):
            log["outside_box"] += 1
            continue
        u = to_utm(g)
        near = tree.query(u, predicate="intersects")
        overlap = sum(u.intersection(osm_geoms[k]).area for k in near) / u.area if near.size and u.area else 0.0
        p50m = zonal(u, mr)[3] if overlap < v3_rule.MAX_OSM_OVERLAP else None
        why = v3_rule.verdict(r["conf"], r["thr"], overlap, p50m)
        log[why] += 1
        if why == "added":
            rows.append({"geom": g, "height": p50m, "area": u.area, "conf": r["conf"]})
    return rows, log


def main():
    bbox_poly = shapely.union_all([shapely.box(*r) for r in BUILDING_BBOX.rects])
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

    mr = MultiRaster(RASTERS)
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
            npx, p50, p90, p50m = zonal(geom, mr) if geom is not None else (0, None, None, None)
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
        if height is not None and round(mh, 1) >= round(height, 1):  # compare the stored 0.1 m values
            # A roof at or below its own base has no usable height: a flat part in OSM, or a default
            # below a raised part's min_height. It stays null, like other unknown heights.
            inverted += 1
            height, source = None, None
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

    # Area inputs are stored gzipped (decision 2026-10-22). mtime=0 keeps the bytes reproducible.
    osm_geoms = [r["utm"] for r in rows]
    v3_rows, v3_log = google_v3(bbox_poly, osm_geoms, mr)
    for r in v3_rows:
        src_count["google_v3"] += 1
        src_area["google_v3"] += r["area"]
        props = {"height_m": round(r["height"], 1), "min_height_m": 0.0, "source": "google_v3", "name": None}
        polys = list(r["geom"].geoms) if r["geom"].geom_type == "MultiPolygon" else [r["geom"]]
        for poly in polys:
            rings = [[[round(x, 7), round(y, 7)] for x, y in ring.coords]
                     for ring in [poly.exterior, *poly.interiors]]
            features.append({"type": "Feature", "properties": props,
                             "geometry": {"type": "Polygon", "coordinates": rings}})

    tmp = BUILDINGS.with_name(BUILDINGS.name + ".gz.tmp")
    with gzip.GzipFile(tmp, "wb", compresslevel=9, mtime=0) as gz:
        gz.write(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":"),
                            ensure_ascii=False).encode())
    tmp.replace(BUILDINGS.with_name(BUILDINGS.name + ".gz"))

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
        "google_v3": dict(v3_log), "google_v3_rule": "confidence >= 80%-precision threshold of its S2 cell, raster presence "
        f">= 0.5 on >= {G_MIN_PX} px with median >= {v3_rule.MIN_HEIGHT_M} m, overlap with OSM < {v3_rule.MAX_OSM_OVERLAP:.0%}",
    }
    json.dump(log, open(WORK / "buildings_log.json", "w"), indent=1)
    print(json.dumps(log, indent=1))


if __name__ == "__main__":
    main()
