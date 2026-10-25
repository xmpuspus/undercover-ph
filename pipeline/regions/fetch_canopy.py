"""Write an area's canopy.tif from the Meta and WRI CHMv2 canopy height tiles on AWS, with no account.

Usage:
  pipeline/shade/.venv/bin/python pipeline/regions/fetch_canopy.py AREA_ID [--force]
  pipeline/shade/.venv/bin/python pipeline/regions/fetch_canopy.py --check [AREA_ID]

Run it after pipeline/districts/build.py has staged the area, because the shade grid comes from the
area's manifest_template.json. CHMv2 tiles are zoom-10 quadkey COGs with 512 px blocks and overviews,
so the script reads only the blocks under the area's canopy window over HTTP: 1.3 to 13.5 MB per area,
273 MB for all 67 areas, against 140 to 430 MB per whole v1 tile. Only a HEAD record per tile is kept,
in pipeline/raw/regions/canopy_meta/v2_<quadkey>.json.

CHMv2 uses the same Maxar Vivid2 imagery as v1 (Brandt et al. 2026, section 2.2). In the Philippines the
per-tile acquisition windows run from 2010 to 2019-11-18, so the switch brings a better model but no newer trees.

The output keeps the grid of the Metro Manila raster from leaves-ph (canopy_height_ncr.tif):
- CHMv2 tiles (s3://dataforgood-fb-data/forests/v2/global/dinov3_global_chm_v2_ml3/chm/), uint8 metres;
- a mosaic in EPSG:3857, reprojected to EPSG:4326 with average resampling into a zero-filled array;
- the leaves-ph pixel lattice (origin 120.9 E, 14.8 N, 1.0476e-5 degrees), extended past Metro Manila;
- the window that shade.clip_canopy_to() cuts: the building grid corners, a 0.0005 degree pad, 16 pixels more;
- uint8, nodata 255, deflate with predictor 2, 256 px tiles.
shade.py then reads pipeline/inputs/areas/<id>/canopy.tif as it does for every area.

--check compares this method with the leaves-ph raster on one Metro Manila window (default makati-cbd),
reading the remote v1 tile through /vsicurl/ so nothing large is downloaded. It still tests v1, because
leaves-ph holds v1; it proves the mosaic and resampling that build() applies to CHMv2. The same run checks that the
area window equals the grid of that area's existing canopy.tif. Results go to
pipeline/raw/regions/canopy_meta/check_<area>.json.
"""
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "shade"))
import region  # noqa: E402

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.merge import merge  # noqa: E402
from rasterio.transform import Affine, array_bounds  # noqa: E402
from rasterio.warp import Resampling, reproject, transform_bounds  # noqa: E402
from rasterio.windows import Window, from_bounds  # noqa: E402

TILE_URL = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v2/global/dinov3_global_chm_v2_ml3/chm/{}.tif"
V1_TILE_URL = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/{}.tif"
ZOOM = 9  # v1 quadkeys, for --check and the leaves-ph tile tests
V2_ZOOM = 10  # CHMv2 quadkeys
RES = 1.0476288264454186e-05  # leaves-ph canopy_height_ncr.tif
LATTICE = Affine(RES, 0.0, 120.9, 0.0, -RES, 14.800000000000008)
PAD_DEG = 0.0005  # shade.load_canopy() and clip_canopy_to()
MARGIN_PX = 16  # shade.clip_canopy_to()
SRC_MARGIN_PX = 8  # source pixels read past the window, so edge averages see every source pixel
SOURCE = "Meta and WRI High Resolution Canopy Height Maps v2 (CHMv2), CC-BY-4.0"
ATTRIBUTION = ("Meta and World Resources Institute (WRI), 2026. Version 2 High Resolution Canopy Height Maps (CHMv2), "
               "CC BY 4.0, https://registry.opendata.aws/dataforgood-fb-forestsv2. Source imagery for CHM (c) 2016 Vantor.")
NCR_RASTER = region.ROOT.parent / "leaves-ph/data/meta/canopy_height_ncr.tif"
ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="5", GDAL_HTTP_RETRY_DELAY="2",
           CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif")


def import_shade(area_id):
    """shade.py computes its area settings at import, so UCPH_AREA has to be set first."""
    os.environ["UCPH_AREA"] = area_id
    import shade

    if shade.AREA_ID != area_id or not shade._AREA.get("graph_bbox"):
        sys.exit(f"{area_id}: no staged manifest_template.json with a graph_bbox; run pipeline/districts/build.py first")
    return shade


def area_window(shade):
    """The canopy window of shade.clip_canopy_to(), on the leaves-ph lattice, with no clamp to a raster edge."""
    transform, (h, w) = shade.building_grid()
    xs = [transform.c, transform.c + w, transform.c + w, transform.c]
    ys = [transform.f, transform.f, transform.f - h, transform.f - h]
    lon, lat = shade.TO_LONLAT.transform(xs, ys)
    win = from_bounds(min(lon) - PAD_DEG, min(lat) - PAD_DEG, max(lon) + PAD_DEG, max(lat) + PAD_DEG, LATTICE)
    win = win.round_offsets().round_lengths()
    c0, r0 = int(win.col_off) - MARGIN_PX, int(win.row_off) - MARGIN_PX
    c1, r1 = int(win.col_off + win.width) + MARGIN_PX, int(win.row_off + win.height) + MARGIN_PX
    return Window(c0, r0, c1 - c0, r1 - r0)


def window_transform(win):
    return Affine(RES, 0.0, LATTICE.c + win.col_off * RES, 0.0, -RES, LATTICE.f - win.row_off * RES)


def tile_xy(lon, lat, zoom=ZOOM):
    s = math.sin(math.radians(lat))
    x = (lon + 180) / 360 * (1 << zoom)
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * (1 << zoom)
    return int(x), int(y)


def quadkey(tx, ty, zoom=ZOOM):
    return "".join(str((1 if tx & (1 << i) else 0) + (2 if ty & (1 << i) else 0)) for i in range(zoom - 1, -1, -1))


def quadkeys(bounds, zoom=ZOOM):
    """Every quadkey of one zoom that touches a lon/lat box (west, south, east, north)."""
    w, s, e, n = bounds
    x0, y0 = tile_xy(w, n, zoom)
    x1, y1 = tile_xy(e, s, zoom)
    return [quadkey(x, y, zoom) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]


def head(url):
    out = subprocess.run(["curl", "-sS", "-I", "-L", "--fail", "--max-time", "60", url],
                         capture_output=True, text=True, check=True).stdout
    h = {}
    for line in out.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            h[k.strip().lower()] = v.strip()
    return h


def remote(qk):
    """The /vsicurl/ path of one CHMv2 COG. The tile's HEAD goes to canopy_meta/v2_<quadkey>.json for provenance."""
    url = TILE_URL.format(qk)
    h = head(url)
    region.CANOPY_TILES.mkdir(parents=True, exist_ok=True)
    (region.CANOPY_TILES / f"v2_{qk}.json").write_text(json.dumps(
        {"quadkey": qk, "url": url, "bytes": int(h["content-length"]), "etag": h.get("etag"),
         "last_modified": h.get("last-modified"),
         "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, indent=1))
    return "/vsicurl/" + url


def same_res(a, b):
    """Tiles of one zoom differ in the 14th digit of their pixel size (132303332 against 132303122)."""
    return all(math.isclose(x, y, rel_tol=1e-9) for x, y in zip(a, b))


def canopy_window(paths, win):
    """Mosaic the tiles in EPSG:3857 and reproject them to the lattice window with average resampling."""
    dst_transform = window_transform(win)
    h, w = int(win.height), int(win.width)
    west, south, east, north = array_bounds(h, w, dst_transform)
    with rasterio.Env(**ENV):
        srcs = [rasterio.open(p) for p in paths]
        try:
            crs = srcs[0].crs
            for s in srcs:
                if s.crs != crs or s.dtypes != ("uint8",) or not same_res(s.res, srcs[0].res):
                    sys.exit(f"{s.name}: unexpected CRS, type or resolution")
            mx0, my0, mx1, my1 = transform_bounds("EPSG:4326", crs, west, south, east, north, densify_pts=21)
            g = SRC_MARGIN_PX * srcs[0].res[0]
            mosaic, mosaic_transform = merge(srcs, bounds=(mx0 - g, my0 - g, mx1 + g, my1 + g))
            tags = srcs[0].tags()
        finally:
            for s in srcs:
                s.close()
    dst = np.zeros((h, w), dtype="uint8")
    reproject(source=mosaic[0], destination=dst, src_transform=mosaic_transform, src_crs=crs,
              dst_transform=dst_transform, dst_crs="EPSG:4326", resampling=Resampling.average)
    return dst, dst_transform, tags


def write_canopy(out, arr, transform, qks):
    profile = dict(driver="GTiff", dtype="uint8", count=1, width=arr.shape[1], height=arr.shape[0], crs="EPSG:4326",
                   transform=transform, nodata=255, tiled=True, blockxsize=256, blockysize=256, compress="deflate",
                   predictor=2, zlevel=9)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tif.tmp")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(arr, 1)
        dst.update_tags(SOURCE=SOURCE, ATTRIBUTION=ATTRIBUTION, CLIPPED_FROM=" ".join(f"{q}.tif" for q in qks),
                        METHOD="EPSG:3857 tile mosaic, average resampling to EPSG:4326 on the leaves-ph lattice")
    os.replace(tmp, out)


def build(area_id, force=False):
    shade = import_shade(area_id)
    out = shade.INPUTS / "canopy.tif"
    if out.exists() and not force:
        print(f"{out} exists; pass --force to write it again")
        return
    t0 = time.time()
    win = area_window(shade)
    tr = window_transform(win)
    bounds = array_bounds(int(win.height), int(win.width), tr)
    qks = quadkeys(bounds, V2_ZOOM)
    paths = [remote(q) for q in qks]
    t1 = time.time()
    arr, transform, _ = canopy_window(paths, win)
    write_canopy(out, arr, transform, qks)
    log = {"area": area_id, "output": str(out.relative_to(region.ROOT)), "source": SOURCE, "quadkeys": qks,
           "window": [int(win.col_off), int(win.row_off), int(win.width), int(win.height)],
           "bounds": [round(v, 6) for v in bounds],
           "max_m": int(arr.max()), "share_ge_3m": round(float((arr >= 3).mean()), 4),
           "pixels_255": int((arr == 255).sum()), "bytes": out.stat().st_size,
           "head_s": round(t1 - t0, 1), "read_and_mosaic_s": round(time.time() - t1, 1)}
    (region.CANOPY_TILES / f"canopy_{area_id}.json").write_text(json.dumps(log, indent=1))
    print(json.dumps(log))


def check(area_id="makati-cbd"):
    """Compare the method with the leaves-ph raster on one Metro Manila window."""
    shade = import_shade(area_id)
    report = {"area": area_id}
    win = area_window(shade)
    with rasterio.open(NCR_RASTER) as ncr:
        report["lattice_matches_ncr_raster"] = ncr.transform == LATTICE and ncr.crs.to_epsg() == 4326
        existing = shade.INPUTS / "canopy.tif"
        if existing.exists():
            with rasterio.open(existing) as ex:
                report["area_grid_matches_existing_canopy_tif"] = (
                    ex.transform == window_transform(win) and (ex.width, ex.height) == (win.width, win.height))
        # A 600 x 600 pixel block at the centre of the area window, about 0.7 km on a side.
        cw = Window(int(win.col_off + win.width // 2 - 300), int(win.row_off + win.height // 2 - 300), 600, 600)
        ref = ncr.read(1, window=cw)
    bounds = array_bounds(600, 600, window_transform(cw))
    qks = quadkeys(bounds)
    t0 = time.time()
    got, _, tags = canopy_window(["/vsicurl/" + V1_TILE_URL.format(q) for q in qks], cw)
    diff = got.astype(int) - ref.astype(int)
    rng = np.random.default_rng(20261022)
    # Four random pixels and four where leaves-ph has a tree of 5 m or more.
    tall = np.argwhere(ref >= 5)
    picks = [(int(r), int(c)) for r, c in zip(rng.integers(0, 600, 4), rng.integers(0, 600, 4))]
    picks += [tuple(int(v) for v in tall[i]) for i in rng.choice(len(tall), size=min(4, len(tall)), replace=False)]
    cx, cy = window_transform(cw) * (300, 300)
    report.update({
        "block_centre_lonlat": [round(cx, 6), round(cy, 6)], "quadkeys": qks, "tile_units": tags.get("UNITS"),
        "read_s": round(time.time() - t0, 1), "pixels": int(ref.size),
        "equal_share": round(float((diff == 0).mean()), 6), "within_1m_share": round(float((abs(diff) <= 1).mean()), 6),
        "max_abs_diff_m": int(abs(diff).max()),
        "mean_m": {"aws": round(float(got.mean()), 3), "leaves_ph": round(float(ref.mean()), 3)},
        "max_m": {"aws": int(got.max()), "leaves_ph": int(ref.max())},
        "zero_share": {"aws": round(float((got == 0).mean()), 4), "leaves_ph": round(float((ref == 0).mean()), 4)},
        "pixels_255": {"aws": int((got == 255).sum()), "leaves_ph": int((ref == 255).sum())},
        "samples": [{"row": r, "col": c, "aws": int(got[r, c]), "leaves_ph": int(ref[r, c])} for r, c in picks],
    })
    region.CANOPY_TILES.mkdir(parents=True, exist_ok=True)
    (region.CANOPY_TILES / f"check_{area_id}.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    argv = sys.argv[1:]
    if argv[:1] == ["--check"]:
        check(*argv[1:2])
    elif argv and not argv[0].startswith("-"):
        build(argv[0], "--force" in argv)
    else:
        sys.exit(__doc__)
