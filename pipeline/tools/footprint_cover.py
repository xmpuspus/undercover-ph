"""Share of Google's building area that a building outline covers, per area, inside each district's own box.

Usage: pipeline/shade/.venv/bin/python -I -W ignore pipeline/tools/footprint_cover.py OUT_JSON [AREA_ID ...]
publish.py copies the share into areas.json as buildings_mapped (OUT_JSON pipeline/regions/footprint_cover.json),
and coverage_table.py prints it in the README. Run it after the areas are staged.
Google building pixel: presence >= 0.5 and height >= 2.5 m (band 2 and band 1 of the district window),
read at 2 m. Outlines come from OSM and, since 2026-10-23, from Google Open Buildings v3 where OSM has none. Shade comes
only from outlines, so a low share means missing building shade. With OSM alone on 2026-10-22, Metro Manila areas
measured 0.53 to 0.74 and Baliwag 0.12. The v3 fill raised Baliwag to 0.47.
"""
import gzip
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.features import rasterize
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
STEP = 4  # 0.5 m pixels read 4 to 1


def districts():
    rows = {}
    for f in ("pipeline/districts.json", "pipeline/regions/districts.json"):
        for d in json.load(open(ROOT / f))["districts"]:
            rows[d["id"]] = d
    return rows


def cover(area, members):
    stage = ROOT / "pipeline/stage" / area
    feats = json.load(gzip.open(stage / "buildings.geojson.gz"))["features"]
    rects = json.load(open(stage / "manifest_template.json"))["graph_rects"]
    google = osm = 0.0
    for d in members:
        path = ROOT / "pipeline/raw/districts" / d / "gob_2023/building_area_height_presence.tif"
        with rasterio.open(path) as src:
            h, w = src.height // STEP, src.width // STEP
            data = src.read([1, 2], out_shape=(2, h, w), resampling=Resampling.average)
            tr = src.transform * src.transform.scale(src.width / w, src.height / h)
            to = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True).transform
            zone = transform(to, unary_union([box(*r) for r in rects])).intersection(box(*src.bounds))
            inside = rasterize([zone], out_shape=(h, w), transform=tr, fill=0, default_value=1).astype(bool)
            # Count each pixel once across overlapping district windows: only pixels of this district's own box.
            own = transform(to, box(*d_bbox[d]))
            mine = rasterize([own], out_shape=(h, w), transform=tr, fill=0, default_value=1).astype(bool)
            g = (data[1] >= 0.5) & (data[0] >= 2.5) & inside & mine
            shapes = [transform(to, shape(f["geometry"])) for f in feats if f["properties"].get("height_m")]
            fp = rasterize(shapes, out_shape=(h, w), transform=tr, fill=0, default_value=1).astype(bool) if shapes else np.zeros((h, w), bool)
            google += g.sum()
            osm += (g & fp).sum()
    return round(float(osm / google), 3) if google else None, int(google * (0.5 * STEP) ** 2)


if __name__ == "__main__":
    rows = districts()
    d_bbox = {k: v["bbox"] for k, v in rows.items()}
    areas = {}
    for f in ("app/public/data/areas.json",):
        for a in json.load(open(ROOT / f))["areas"]:
            areas[a["id"]] = [n["id"] for n in a["neighbourhoods"]]
    want = sys.argv[2:] or list(areas)
    out = {}
    for a in want:
        share, m2 = cover(a, areas[a])
        out[a] = {"outline_share_of_google_building_area": share, "google_building_m2": m2}
        print(a, share, m2, flush=True)
    Path(sys.argv[1]).write_text(json.dumps(out, indent=1) + "\n")
