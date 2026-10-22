"""Read Google Open Buildings temporal bands for each pilot box (60 m margin) from a remote COG.

Usage: python3 -I gob_window.py URL OUTDIR BOX [BOX ...]
Writes BOX_height_presence.tif (band 1 building_height, band 2 building_presence) at native 0.5 m.
"""
import json
import sys
import time

import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

url, out, names = sys.argv[1], sys.argv[2].rstrip("/") + "/", sys.argv[3:]
boxes = {"makati": (14.548, 121.012, 14.562, 121.032), "bgc": (14.545, 121.040, 14.560, 121.058),
         "ortigas": (14.578, 121.053, 14.592, 121.067)}
tr = Transformer.from_crs("EPSG:4326", "EPSG:32651", always_xy=True)
log = {}
env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")
with rasterio.Env(**env), rasterio.open("/vsicurl/" + url) as r:
    for k in names:
        s, w, n, e = boxes[k]
        xs, ys = zip(*[tr.transform(x, y) for x, y in ((w, s), (e, s), (w, n), (e, n))])
        win = from_bounds(min(xs) - 60, min(ys) - 60, max(xs) + 60, max(ys) + 60, r.transform).round_offsets().round_lengths()
        t0 = time.time()
        data = r.read([2, 3], window=win)
        prof = r.profile.copy()
        prof.update(count=2, width=win.width, height=win.height, transform=r.window_transform(win),
                    compress="deflate", tiled=True, blockxsize=512, blockysize=512, BIGTIFF="IF_SAFER")
        with rasterio.open(out + f"{k}_height_presence.tif", "w", **prof) as d:
            d.write(data)
            d.set_band_description(1, "building_height")
            d.set_band_description(2, "building_presence")
        log[k] = {"window": [win.col_off, win.row_off, win.width, win.height], "seconds": round(time.time() - t0, 1),
                  "height_max": float(data[0].max()), "presence_max": float(data[1].max())}
        print(k, log[k], flush=True)
log["source"] = url
log["retrieved"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(log, open(out + "window_log.json", "w"), indent=1)
