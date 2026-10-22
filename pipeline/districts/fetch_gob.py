"""Read the Google Open Buildings 2.5D Temporal 2023 bands for each district's building area.

Usage: pipeline/.venv/bin/python -I pipeline/districts/fetch_gob.py DISTRICT_ID [DISTRICT_ID ...]
Anonymous HTTP range reads of the public COGs, as for Makati. No account. A building area that spans
several tiles is pasted together on the shared 0.5 m pixel grid. Where tiles overlap, the first tile
with a valid pixel wins, and the log counts overlapping valid pixels that disagree.
Writes pipeline/raw/districts/<id>/gob_2023/building_area_height_presence.tif and window_log.json.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.transform import Affine  # noqa: E402
from rasterio.windows import Window  # noqa: E402

import dcommon  # noqa: E402
from common import RESEARCH, TO_UTM  # noqa: E402

MARGIN_M = 60.0
RES = 0.5
NODATA = -99.0
MANIFESTS = [RESEARCH / "raw/02/gob_temporal_manifest" / m
             for m in ("33_EPSG_32651_2023_06_30.json", "35_EPSG_32651_2023_06_30.json")]
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="2",
           CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")


def tile_sources():
    out = []
    for mf in MANIFESTS:
        m = json.load(open(mf))
        for ts in m["tilesets"]:
            for s in ts["sources"]:
                a, d = s["affineTransform"], s["dimensions"]
                x0, y1 = a["translateX"], a["translateY"]
                x1, y0 = x0 + a["scaleX"] * d["width"], y1 + a["scaleY"] * d["height"]
                url = (m["uriPrefix"] + s["uris"][0]).replace("gs://", "https://storage.googleapis.com/")
                out.append({"url": url, "extent": (x0, y0, x1, y1), "props": m["properties"]})
    return out


def fetch(d, sources):
    w, s, e, n = d.building_bbox
    xs, ys = zip(*[TO_UTM.transform(x, y) for x, y in ((w, s), (e, s), (w, n), (e, n))])
    hits = [t for t in sources if t["extent"][0] < max(xs) + MARGIN_M and t["extent"][2] > min(xs) - MARGIN_M
            and t["extent"][1] < max(ys) + MARGIN_M and t["extent"][3] > min(ys) - MARGIN_M]
    if not hits:
        sys.exit(f"{d.id}: no Google tile covers the building area")
    # Snap the output box to the pixel lattice of the first tile; all tiles share it.
    gx, gy = hits[0]["extent"][0], hits[0]["extent"][3]
    x0 = gx + np.floor((min(xs) - MARGIN_M - gx) / RES) * RES
    y1 = gy + np.ceil((max(ys) + MARGIN_M - gy) / RES) * RES
    width = int(np.ceil((max(xs) + MARGIN_M - x0) / RES))
    height = int(np.ceil((y1 - (min(ys) - MARGIN_M)) / RES))
    hgt = np.full((height, width), NODATA, np.float32)
    pres = np.full((height, width), NODATA, np.float32)
    log_tiles, conflicts = [], 0
    t0 = time.time()
    with rasterio.Env(**ENV):
        for t in hits:
            tx0, ty0, tx1, ty1 = t["extent"]
            ox, oy = (tx0 - x0) / RES, (y1 - ty1) / RES  # tile origin in output pixels
            if abs(ox - round(ox)) > 1e-6 or abs(oy - round(oy)) > 1e-6:
                sys.exit(f"{d.id}: tile {t['url']} is off the pixel grid")
            ox, oy = int(round(ox)), int(round(oy))
            c0, r0 = max(0, ox), max(0, oy)
            c1, r1 = min(width, ox + int((tx1 - tx0) / RES)), min(height, oy + int((ty1 - ty0) / RES))
            if c1 <= c0 or r1 <= r0:
                continue
            with rasterio.open("/vsicurl/" + t["url"]) as src:
                if src.nodata != NODATA or src.res != (RES, RES):
                    sys.exit(f"{d.id}: unexpected nodata or resolution in {t['url']}")
                win = Window(c0 - ox, r0 - oy, c1 - c0, r1 - r0)
                data = src.read([2, 3], window=win)
                descriptions = src.descriptions
            if descriptions[1:3] != ("building_height", "building_presence"):
                sys.exit(f"{d.id}: unexpected band names {descriptions}")
            dh, dp = data[0], data[1]
            cur_h = hgt[r0:r1, c0:c1]
            cur_p = pres[r0:r1, c0:c1]
            valid = dh != NODATA
            both = valid & (cur_h != NODATA)
            conflicts += int((both & (np.abs(cur_h - dh) > 0.01)).sum())
            take = valid & (cur_h == NODATA)
            cur_h[take] = dh[take]
            cur_p[take] = dp[take]
            log_tiles.append({"url": t["url"], "rows": [r0, r1], "cols": [c0, c1],
                              "valid_px": int(valid.sum()), "taken_px": int(take.sum())})
    out_dir = d.raw / "gob_2023"
    out_dir.mkdir(parents=True, exist_ok=True)
    transform = Affine(RES, 0.0, x0, 0.0, -RES, y1)
    prof = dict(driver="GTiff", dtype="float32", count=2, width=width, height=height, crs="EPSG:32651",
                transform=transform, nodata=NODATA, compress="deflate", tiled=True, blockxsize=512,
                blockysize=512, BIGTIFF="IF_SAFER")
    with rasterio.open(out_dir / "building_area_height_presence.tif", "w", **prof) as dst:
        dst.write(np.stack([hgt, pres]))
        dst.set_band_description(1, "building_height")
        dst.set_band_description(2, "building_presence")
    log = {"district": d.id, "building_bbox": d.building_bbox, "box_utm51n": [x0, y1 - height * RES, x0 + width * RES, y1],
           "size_px": [width, height], "tiles": log_tiles, "overlap_conflict_px": conflicts,
           "nodata_px": int((hgt == NODATA).sum()), "height_max": float(hgt.max()),
           "tile_props": hits[0]["props"], "seconds": round(time.time() - t0, 1),
           "retrieved": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    json.dump(log, open(out_dir / "window_log.json", "w"), indent=1)
    print(json.dumps({k: v for k, v in log.items() if k != "tiles"}), flush=True)


def main(ids):
    sources = tile_sources()
    for i in ids:
        d = dcommon.get(i)
        if (d.raw / "gob_2023/window_log.json").exists():
            print(f"{i}: already fetched", flush=True)
            continue
        fetch(d, sources)


if __name__ == "__main__":
    main(sys.argv[1:])
