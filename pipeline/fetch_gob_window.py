"""Read the Google Open Buildings 2.5D Temporal 2023 bands for the building area from the public COG.

Usage: pipeline/.venv/bin/python -I pipeline/fetch_gob_window.py
Anonymous HTTP range reads, the same method as research scripts/02/gob_window.py. No account.
Writes pipeline/raw/gob_2023/building_area_height_presence.tif (band 1 height, band 2 presence) at 0.5 m.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rasterio  # noqa: E402
from rasterio.windows import from_bounds  # noqa: E402

from common import BUILDING_BBOX, RAW, RESEARCH, TO_UTM  # noqa: E402

MARGIN_M = 60.0


def main():
    hits = json.load(open(RESEARCH / "raw/02/gob_temporal_manifest/tile_hits_2023.json"))["hits"]
    hit = next(h for h in hits if h["box"] == "makati")
    url = hit["uri"].replace("gs://", "https://storage.googleapis.com/")
    w, s, e, n = BUILDING_BBOX
    xs, ys = zip(*[TO_UTM.transform(x, y) for x, y in ((w, s), (e, s), (w, n), (e, n))])
    box = (min(xs) - MARGIN_M, min(ys) - MARGIN_M, max(xs) + MARGIN_M, max(ys) + MARGIN_M)
    tx0, ty0, tx1, ty1 = hit["tile_extent"]
    if not (box[0] >= tx0 and box[1] >= ty0 and box[2] <= tx1 and box[3] <= ty1):
        sys.exit(f"building area {box} is not inside tile {hit['tile_extent']}")
    out_dir = RAW / "gob_2023"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "building_area_height_presence.tif"
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3",
               CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
    t0 = time.time()
    with rasterio.Env(**env), rasterio.open("/vsicurl/" + url) as r:
        win = from_bounds(*box, r.transform).round_offsets().round_lengths()
        data = r.read([2, 3], window=win)
        prof = r.profile.copy()
        prof.update(count=2, width=win.width, height=win.height, transform=r.window_transform(win),
                    compress="deflate", tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
        descriptions = r.descriptions
    with rasterio.open(out, "w", **prof) as d:
        d.write(data)
        d.set_band_description(1, "building_height")
        d.set_band_description(2, "building_presence")
    log = {"source": url, "source_bands": [descriptions[1], descriptions[2]],
           "tile_props": hit["props"], "box_utm51n": box, "building_bbox": BUILDING_BBOX,
           "window": [win.col_off, win.row_off, win.width, win.height],
           "seconds": round(time.time() - t0, 1), "height_max": float(data[0].max()),
           "presence_max": float(data[1].max()), "nodata": prof.get("nodata"),
           "retrieved": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    json.dump(log, open(out_dir / "window_log.json", "w"), indent=1)
    print(json.dumps(log))


if __name__ == "__main__":
    main()
