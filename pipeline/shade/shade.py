"""Per-edge building and tree shade for the Makati CBD walk graph.

Ray march from each edge sample toward the sun over 1 m height surfaces.
Writes app/public/data/shade.bin and adds sun/shade keys to manifest.json.
"""

import argparse
import json
import math
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pvlib
import rasterio
import shapely
from numba import njit, prange
from pyproj import CRS, Transformer
from rasterio.features import rasterize
from rasterio.transform import Affine
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
# The full NCR canopy raster is a local download (Meta and WRI, CC BY 4.0). Only area clips ship in the repo.
NCR_CANOPY = Path(os.environ.get("UCPH_NCR_CANOPY") or ROOT.parent / "leaves-ph" / "data" / "meta" / "canopy_height_ncr.tif")


def _cli_area():
    # `shade.py --area <id>` has to choose the area before the settings below are computed.
    if __name__ == "__main__":
        argv = sys.argv[1:]
        for i, a in enumerate(argv):
            if a == "--area" and i + 1 < len(argv):
                return argv[i + 1]
            if a.startswith("--area="):
                return a.split("=", 1)[1]
    return os.environ.get("UCPH_AREA") or None


# A staged area (pipeline/stage/<id>/) instead of the root Makati run. Exported so that any
# second import of this module, such as clip_canopy.py's, resolves the same area.
AREA_ID = _cli_area()
if AREA_ID:
    os.environ["UCPH_AREA"] = AREA_ID
STAGE = ROOT / "pipeline/stage" / AREA_ID if AREA_ID else None
# One walking area per run. UCPH_DATA is its app data folder, UCPH_INPUTS its pipeline inputs.
DATA = Path(
    os.environ.get("UCPH_DATA") or (STAGE if AREA_ID else ROOT / "app/public/data")
)
INPUTS = Path(
    os.environ.get("UCPH_INPUTS")
    or (
        ROOT / "pipeline/inputs/areas" / AREA_ID
        if AREA_ID
        else ROOT / "pipeline/inputs"
    )
)
# The canopy input is a clip of the leaves-ph NCR raster to the building area (clip_canopy.py).
# An area uses INPUTS/canopy.tif or an existing canopy_height*.tif clip; when neither exists,
# clip_canopy_to() below cuts INPUTS/canopy.tif from the leaves-ph raster.
_CLIPS = sorted(INPUTS.glob("canopy_height*.tif"))
CANOPY = Path(
    os.environ.get("UCPH_CANOPY")
    or (
        next(
            (p for p in [INPUTS / "canopy.tif", *_CLIPS] if p.exists()),
            INPUTS / "canopy.tif",
        )
        if AREA_ID
        else next(iter(_CLIPS), INPUTS / "canopy_height_makati.tif")
    )
)


def _first(paths):
    return next((p for p in paths if p.exists()), paths[0])


# The full building set. The app loads the lighter buildings_display.geojson instead.
# An area keeps it beside its data (pipeline/stage/<id>/) or in its inputs, plain or gzipped.
BUILDINGS = Path(
    os.environ.get("UCPH_BUILDINGS")
    or (
        _first(
            [
                DATA / "buildings.geojson",
                DATA / "buildings.geojson.gz",
                INPUTS / "buildings.geojson",
                INPUTS / "buildings.geojson.gz",
            ]
        )
        if AREA_ID
        else INPUTS / "buildings.geojson"
    )
)
# Logs and state for another area get its folder name, so areas do not overwrite each other.
TAG = "" if DATA.resolve() == (ROOT / "app/public/data").resolve() else DATA.name
OWNED_LIMITS = HERE / (
    f"owned_limits.{TAG}.json" if TAG else "owned_limits.json"
)  # lines this step wrote last time
RUN_LOG = HERE / (f"run_log.{TAG}.json" if TAG else "run_log.json")
DEBUG = HERE / "debug" / TAG if TAG else HERE / "debug"

TZ = "Asia/Manila"


def _area_manifest():
    """The area's manifest, else its template, else {} (the Makati CBD defaults below)."""
    # A staged area keeps its template beside its data; app/public/data has none.
    for path in (
        DATA / "manifest.json",
        DATA / "manifest_template.json",
        INPUTS / "manifest_template.json",
    ):
        try:
            return json.loads(path.read_text())
        except (OSError, ValueError):
            pass
    return {}


def _start_date():
    """UCPH_START_DATE, else the manifest's first date, so a bare rerun matches the manifest."""
    if os.environ.get("UCPH_START_DATE"):
        return date.fromisoformat(os.environ["UCPH_START_DATE"])
    try:
        return date.fromisoformat(_area_manifest()["dates"][0])
    except (KeyError, IndexError, ValueError):
        return date(2026, 10, 21)


# Seven shade dates; pipeline/refresh_dates.sh sets UCPH_START_DATE.
DATES = [(_start_date() + timedelta(days=i)).isoformat() for i in range(7)]
# Shadow overlays cover the first UCPH_OVERLAY_DATES dates (default all 7). shade.bin always has all 7.
OVERLAY_DATES = max(
    1, min(len(DATES), int(os.environ.get("UCPH_OVERLAY_DATES") or len(DATES)))
)
BUCKETS_MIN = list(range(360, 1111, 30))
_AREA = _area_manifest()
PILOT_BBOX = tuple(_AREA.get("pilot_bbox") or (121.012, 14.548, 121.032, 14.562))
GRAPH_BBOX = tuple(_AREA.get("graph_bbox") or (121.0074, 14.5435, 121.0366, 14.5665))
# Sun positions and the local grid use the pilot box centre: (14.555, 121.022) for Makati CBD.
CENTRE = (
    round((PILOT_BBOX[1] + PILOT_BBOX[3]) / 2, 6),
    round((PILOT_BBOX[0] + PILOT_BBOX[2]) / 2, 6),
)  # lat, lon
BUILDING_MARGIN_M = 800.0
SAMPLE_STEP_M = 5.0
PED_Z = 1.5
DECK_M = 6.0
TRUNK_FRACTION = 0.25  # UMEP default trunk zone
FOOTBRIDGE = 8
SHELTERED = 7
NIGHT = 255
LAYOUT = "uint8 building[d][b][e], then uint8 tree[d][b][e], then uint8 lowconf[e]"
OVERLAY_MIN_ALT = 3.0
OVERLAY_Z = 0.5
OVERLAY_PX_M = 2
OVERLAY_BLDG = (15, 23, 42, round(0.55 * 255))
OVERLAY_TREE = (22, 101, 52, round(0.50 * 255))

# Transverse Mercator centred on the pilot: grid north equals true north at the centre.
LOCAL_CRS = CRS.from_proj4(
    f"+proj=tmerc +lat_0={CENTRE[0]} +lon_0={CENTRE[1]} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
)
TO_LOCAL = Transformer.from_crs("EPSG:4326", LOCAL_CRS, always_xy=True)
TO_LONLAT = Transformer.from_crs(LOCAL_CRS, "EPSG:4326", always_xy=True)

# Ray outcome codes per sample and bucket.
SUN, TREE, BLDG, BLDG_DEFAULT = 0, 1, 2, 3


def sun_table(dates=DATES, buckets=BUCKETS_MIN):
    """Apparent elevation and azimuth per date and bucket, plus sunrise and sunset."""
    times = pd.DatetimeIndex(
        [
            pd.Timestamp(f"{d} {m // 60:02d}:{m % 60:02d}", tz=TZ)
            for d in dates
            for m in buckets
        ]
    )
    pos = pvlib.solarposition.get_solarposition(times, CENTRE[0], CENTRE[1])
    alt = pos["apparent_elevation"].to_numpy().reshape(len(dates), len(buckets))
    az = pos["azimuth"].to_numpy().reshape(len(dates), len(buckets))
    midnight = pd.DatetimeIndex([pd.Timestamp(f"{d} 00:00", tz=TZ) for d in dates])
    rst = pvlib.solarposition.sun_rise_set_transit_spa(midnight, CENTRE[0], CENTRE[1])
    rise_set = {
        d: [
            rst["sunrise"].iloc[i].tz_convert(TZ).round("min").strftime("%H:%M"),
            rst["sunset"].iloc[i].tz_convert(TZ).round("min").strftime("%H:%M"),
        ]
        for i, d in enumerate(dates)
    }
    return alt, az, rise_set


def project_lonlat(lon, lat):
    x, y = TO_LOCAL.transform(
        np.asarray(lon, dtype=float), np.asarray(lat, dtype=float)
    )
    return np.asarray(x), np.asarray(y)


def _to_local(geoms):
    return shapely.transform(
        geoms, lambda c: np.column_stack(TO_LOCAL.transform(c[:, 0], c[:, 1]))
    )


def building_grid():
    """1 m north-up grid over the graph area plus the building margin."""
    lon0, lat0, lon1, lat1 = GRAPH_BBOX
    xs, ys = project_lonlat([lon0, lon1, lon1, lon0], [lat0, lat0, lat1, lat1])
    x0 = math.floor(xs.min() - BUILDING_MARGIN_M)
    x1 = math.ceil(xs.max() + BUILDING_MARGIN_M)
    y0 = math.floor(ys.min() - BUILDING_MARGIN_M)
    y1 = math.ceil(ys.max() + BUILDING_MARGIN_M)
    return Affine(1.0, 0.0, x0, 0.0, -1.0, y1), (y1 - y0, x1 - x0)


def burn_buildings(features, transform, shape):
    """Top, bottom and default-height flag surfaces. Overlaps keep max top and min bottom."""
    geoms, tops, bottoms, defaults = [], [], [], []
    skipped = 0
    for f in features:
        p = f.get("properties") or {}
        h = p.get("height_m")
        if h is None or not f.get("geometry"):
            skipped += 1
            continue
        mh = p.get("min_height_m") or 0.0
        if h <= mh:
            skipped += 1
            continue
        geoms.append(shapely.geometry.shape(f["geometry"]))
        tops.append(float(h))
        bottoms.append(float(mh))
        defaults.append(1 if p.get("source") == "default" else 0)
    local = _to_local(np.array(geoms, dtype=object))
    tops, bottoms, defaults = map(np.array, (tops, bottoms, defaults))
    up = np.argsort(tops, kind="stable")
    top = rasterize(
        zip(local[up], tops[up]),
        out_shape=shape,
        transform=transform,
        fill=0.0,
        dtype="float32",
    )
    deflt = rasterize(
        zip(local[up], defaults[up]),
        out_shape=shape,
        transform=transform,
        fill=0,
        dtype="uint8",
    )
    down = np.argsort(-bottoms, kind="stable")
    bottom = rasterize(
        zip(local[down], bottoms[down]),
        out_shape=shape,
        transform=transform,
        fill=np.inf,
        dtype="float32",
    )
    return top, bottom, deflt, local, skipped


def load_canopy(transform, shape, top, path=CANOPY):
    """Canopy height resampled (nearest) to the grid, nodata and building cells set to 0."""
    h, w = shape
    xs = np.array([transform.c, transform.c + w, transform.c + w, transform.c])
    ys = np.array([transform.f, transform.f, transform.f - h, transform.f - h])
    lon, lat = TO_LONLAT.transform(xs, ys)
    pad = 0.0005
    out = np.full(shape, 255, dtype="uint8")
    with rasterio.open(path) as src:
        win = (
            from_bounds(
                min(lon) - pad,
                min(lat) - pad,
                max(lon) + pad,
                max(lat) + pad,
                src.transform,
            )
            .round_offsets()
            .round_lengths()
        )
        arr = src.read(1, window=win)
        reproject(
            arr,
            out,
            src_transform=src.window_transform(win),
            src_crs=src.crs,
            src_nodata=255,
            dst_transform=transform,
            dst_crs=LOCAL_CRS,
            dst_nodata=255,
            resampling=Resampling.nearest,
        )
    canopy = out.astype("float32")
    canopy[out == 255] = 0.0
    canopy[top > 0] = 0.0
    return canopy


def edge_samples(edges, step=SAMPLE_STEP_M, ped_z=PED_Z, deck=DECK_M):
    """Samples every `step` m along each edge geom, both ends included, with spacing weights."""
    lines = _to_local(
        np.array([shapely.LineString(e["geom"]) for e in edges], dtype=object)
    )
    lengths = shapely.length(lines)
    idx, dist, wts, zs = [], [], [], []
    for i, (e, L) in enumerate(zip(edges, lengths)):
        if L < 1e-6:
            d = np.zeros(1)
            w = np.ones(1)
        else:
            d = np.arange(0.0, L, step)
            if L - d[-1] > 1e-6:
                d = np.append(d, L)
            gaps = np.diff(d)
            w = np.zeros(len(d))
            w[:-1] += gaps / 2
            w[1:] += gaps / 2
        z = ped_z
        if e.get("flags", 0) & FOOTBRIDGE:
            z = deck_height(e, deck) + ped_z
        idx.append(np.full(len(d), i))
        dist.append(d)
        wts.append(w)
        zs.append(np.full(len(d), z))
    idx = np.concatenate(idx)
    pts = shapely.line_interpolate_point(lines[idx], np.concatenate(dist))
    xy = shapely.get_coordinates(pts)
    return xy[:, 0], xy[:, 1], np.concatenate(zs), idx, np.concatenate(wts), lengths


def deck_height(edge, default=DECK_M):
    # The contract carries no height key; use one only if the graph writer adds it.
    for key in ("deck_height_m", "height_m", "height"):
        v = edge.get(key)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return default


@njit(parallel=True, cache=True)
def march(gx, gy, z0, top, bottom, canopy, deflt, sin_az, cos_az, tan_alt, zmax, out):
    """gx, gy are grid coordinates (col, row as floats, row grows south)."""
    rows, cols = top.shape
    ds = 1.0
    if tan_alt > 1.0:
        ds = (
            1.0 / tan_alt
        )  # keep each vertical rise at or below 1 m so thin crowns are hit
    dx = ds * sin_az
    dy = -ds * cos_az
    dz = ds * tan_alt
    for i in prange(gx.shape[0]):
        x = gx[i]
        y = gy[i]
        z = z0[i]
        c0 = int(math.floor(x))
        r0 = int(math.floor(y))
        code = 0
        while z <= zmax:
            c = int(math.floor(x))
            r = int(math.floor(y))
            if c < 0 or r < 0 or c >= cols or r >= rows:
                break
            # Skip the start cell for buildings: a facade-side sample can rasterise into a roof cell.
            if r != r0 or c != c0:
                t = top[r, c]
                if t > 0.0 and bottom[r, c] <= z and z <= t:
                    code = 3 if deflt[r, c] else 2
                    break
            if code == 0:
                hc = canopy[r, c]
                if hc > 0.0 and z >= 0.25 * hc and z <= hc:
                    code = 1
            x += dx
            y += dy
            z += dz
        out[i] = code


def to_grid(x, y, transform):
    return x - transform.c, transform.f - y


def run_bucket(gx, gy, z0, surf, alt_deg, az_deg):
    top, bottom, canopy, deflt, zmax = surf
    out = np.zeros(gx.shape[0], dtype=np.uint8)
    a = math.radians(az_deg)
    march(
        gx,
        gy,
        z0,
        top,
        bottom,
        canopy,
        deflt,
        math.sin(a),
        math.cos(a),
        math.tan(math.radians(alt_deg)),
        zmax,
        out,
    )
    return out


def edge_percent(codes, idx, w, n_edges):
    """Rounded building and tree percent per edge. building + tree never exceeds 100."""
    tot = np.bincount(idx, weights=w, minlength=n_edges)
    bw = np.bincount(idx, weights=w * (codes >= BLDG), minlength=n_edges)
    tw = np.bincount(idx, weights=w * (codes == TREE), minlength=n_edges)
    b = np.rint(100.0 * bw / tot)
    bt = np.rint(100.0 * (bw + tw) / tot)
    return b.astype(np.uint8), (bt - b).astype(np.uint8), bw, tw, tot


def compute(edges, features, alt, az, log=print):
    t0 = time.perf_counter()
    transform, shape = building_grid()
    top, bottom, deflt, local_bldg, skipped = burn_buildings(features, transform, shape)
    canopy = load_canopy(transform, shape, top)
    zmax = float(max(top.max(), canopy.max()))
    log(
        f"grid {shape[1]} x {shape[0]} m, tallest top {top.max():.1f} m, "
        f"tallest canopy {canopy.max():.0f} m, skipped buildings {skipped}"
    )
    x, y, z0, idx, w, lengths = edge_samples(edges)
    gx, gy = to_grid(x, y, transform)
    r0 = np.floor(gy).astype(int)
    c0 = np.floor(gx).astype(int)
    inside = (r0 >= 0) & (c0 >= 0) & (r0 < shape[0]) & (c0 < shape[1])
    # A sample counts as inside a building when a part is solid at the sample's own height.
    in_fp = np.zeros(len(x), dtype=bool)
    ri, ci, zi = r0[inside], c0[inside], z0[inside]
    in_fp[inside] = (top[ri, ci] > 0) & (bottom[ri, ci] <= zi) & (zi <= top[ri, ci])
    start_in_bldg = int(in_fp.sum())
    frac_in = np.bincount(idx, weights=w * in_fp, minlength=len(edges)) / np.bincount(
        idx, weights=w, minlength=len(edges)
    )
    open_edge = np.array([(e.get("flags", 0) & SHELTERED) == 0 for e in edges])
    mostly_in = (frac_in > 0.5) & open_edge
    log(
        f"{len(edges)} edges, {len(x)} samples, {int((~inside).sum())} samples off grid, "
        f"{start_in_bldg} samples start inside a footprint, "
        f"{int(mostly_in.sum())} unsheltered edges lie mostly inside footprints"
    )
    surf = (top, bottom, canopy, deflt, zmax)
    setup_s = time.perf_counter() - t0

    n_d, n_b, n_e = alt.shape[0], alt.shape[1], len(edges)
    building = np.full((n_d, n_b, n_e), NIGHT, dtype=np.uint8)
    tree = np.full((n_d, n_b, n_e), NIGHT, dtype=np.uint8)
    shares = {}
    bucket_s = {}
    lw_def = np.zeros(n_e)
    lw_b = np.zeros(n_e)
    for d in range(n_d):
        for b in range(n_b):
            if alt[d, b] <= 0:
                continue
            tb = time.perf_counter()
            codes = run_bucket(gx, gy, z0, surf, alt[d, b], az[d, b])
            bucket_s[(d, b)] = time.perf_counter() - tb
            bp, tp, bw, tw, tot = edge_percent(codes, idx, w, n_e)
            building[d, b] = bp
            tree[d, b] = tp
            lw_b += bw
            lw_def += np.bincount(
                idx, weights=w * (codes == BLDG_DEFAULT), minlength=n_e
            )
            shares[(d, b)] = (bw.sum() / tot.sum(), tw.sum() / tot.sum())
    lowconf = np.where(
        lw_b > 0, np.rint(100.0 * lw_def / np.maximum(lw_b, 1e-12)), 0
    ).astype(np.uint8)
    stats = dict(
        grid=shape,
        tallest_top=float(top.max()),
        tallest_canopy=float(canopy.max()),
        skipped=skipped,
        samples=len(x),
        start_in_bldg=start_in_bldg,
        mostly_in=int(mostly_in.sum()),
        mostly_in_km=float(lengths[mostly_in].sum() / 1000),
        mostly_in_flagged=int(
            sum(1 for i in np.flatnonzero(mostly_in) if edges[i].get("flags", 0) & 1024)
        ),
        n_footbridge=int(sum(1 for e in edges if e.get("flags", 0) & FOOTBRIDGE)),
        off_grid=int((~inside).sum()),
        setup_s=setup_s,
        bucket_s=bucket_s,
        shares=shares,
        lengths=lengths,
    )
    return building, tree, lowconf, stats, (transform, shape, surf, local_bldg)


def write_shade_bin(path, building, tree, lowconf):
    tmp = path.with_suffix(".bin.tmp")
    with open(tmp, "wb") as f:
        f.write(np.ascontiguousarray(building).tobytes())
        f.write(np.ascontiguousarray(tree).tobytes())
        f.write(np.ascontiguousarray(lowconf).tobytes())
    os.replace(tmp, path)


def read_shade_bin(path, n_dates, n_buckets):
    raw = np.fromfile(path, dtype=np.uint8)
    n_e = raw.size // (2 * n_dates * n_buckets + 1)
    assert raw.size == n_e * (2 * n_dates * n_buckets + 1), (
        "shade.bin size does not fit the layout"
    )
    k = n_dates * n_buckets * n_e
    return (
        raw[:k].reshape(n_dates, n_buckets, n_e),
        raw[k : 2 * k].reshape(n_dates, n_buckets, n_e),
        raw[2 * k :],
        n_e,
    )


PER_DATE_LAYOUT = (
    "shade/<date>.bin: uint8 building[b][e], then uint8 tree[b][e]; "
    "shade/lowconf.bin: uint8 lowconf[e]"
)
TREE_MIN_TOP = 3.0
TREE_MARGIN_M = 200.0  # a 27 m crown at 8 degrees of sun casts about 190 m
TREE_SPLIT_R_M = 8.0  # segments with a wider equal-area radius get split into blocks
TREE_BLOCK_M = 10
TREE_FIELDS = ["lon", "lat", "r_m", "top_m", "base_m"]


def read_geojson(path):
    import gzip

    path = Path(path)
    raw = (
        gzip.decompress(path.read_bytes())
        if path.suffix == ".gz"
        else path.read_bytes()
    )
    return json.loads(raw)


def write_shade_per_date(out_dir, building, tree, lowconf, dates):
    """One file per date (building[b][e] then tree[b][e]) plus lowconf.bin, so a phone loads one day."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = []
    for d, day in enumerate(dates):
        path = out_dir / f"{day}.bin"
        tmp = path.with_suffix(".bin.tmp")
        tmp.write_bytes(
            np.ascontiguousarray(building[d]).tobytes()
            + np.ascontiguousarray(tree[d]).tobytes()
        )
        os.replace(tmp, path)
        files.append(path)
    low = out_dir / "lowconf.bin"
    low.with_suffix(".bin.tmp").write_bytes(np.ascontiguousarray(lowconf).tobytes())
    os.replace(low.with_suffix(".bin.tmp"), low)
    for old in out_dir.glob("*.bin"):
        if old not in files and old != low:
            old.unlink()
    return files, low


def read_shade_per_date(out_dir, dates, n_buckets):
    out_dir = Path(out_dir)
    lowconf = np.fromfile(out_dir / "lowconf.bin", dtype=np.uint8)
    n_e = lowconf.size
    building = np.empty((len(dates), n_buckets, n_e), np.uint8)
    tree = np.empty_like(building)
    for d, day in enumerate(dates):
        raw = np.fromfile(out_dir / f"{day}.bin", dtype=np.uint8)
        assert raw.size == 2 * n_buckets * n_e, (
            f"{day}.bin size does not fit the layout"
        )
        building[d] = raw[: n_buckets * n_e].reshape(n_buckets, n_e)
        tree[d] = raw[n_buckets * n_e :].reshape(n_buckets, n_e)
    return building, tree, lowconf, n_e


def clip_canopy_to(out, src=NCR_CANOPY, margin_px=16):
    """Clip the NCR canopy raster to this area's building grid, the same way clip_canopy.py does."""
    transform, (h, w) = building_grid()
    xs = [transform.c, transform.c + w, transform.c + w, transform.c]
    ys = [transform.f, transform.f, transform.f - h, transform.f - h]
    lon, lat = TO_LONLAT.transform(xs, ys)
    pad = 0.0005  # same pad as load_canopy()
    with rasterio.open(src) as s:
        win = from_bounds(
            min(lon) - pad, min(lat) - pad, max(lon) + pad, max(lat) + pad, s.transform
        )
        win = win.round_offsets().round_lengths()
        c0 = max(0, int(win.col_off) - margin_px)
        r0 = max(0, int(win.row_off) - margin_px)
        c1 = min(s.width, int(win.col_off + win.width) + margin_px)
        r1 = min(s.height, int(win.row_off + win.height) + margin_px)
        clip = rasterio.windows.Window(c0, r0, c1 - c0, r1 - r0)
        arr = s.read(1, window=clip)
        profile = s.profile.copy()
        profile.update(
            width=clip.width,
            height=clip.height,
            transform=s.window_transform(clip),
            tiled=True,
            blockxsize=256,
            blockysize=256,
            compress="deflate",
            predictor=2,
            zlevel=9,
        )
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tif.tmp")
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(arr, 1)
        dst.update_tags(
            SOURCE="Meta and WRI Global Canopy Height, CC-BY-4.0",
            CLIPPED_FROM=Path(src).name,
        )
    os.replace(tmp, out)
    return clip


def crown_window(transform, shape, bbox, margin_m=TREE_MARGIN_M):
    """Grid rows and columns covering bbox plus a margin."""
    w, s, e, n = bbox
    xs, ys = project_lonlat([w, e, e, w], [s, s, n, n])
    c_lo = max(0, int(math.floor(xs.min() - margin_m - transform.c)))
    c_hi = min(shape[1], int(math.ceil(xs.max() + margin_m - transform.c)))
    r_lo = max(0, int(math.floor(transform.f - ys.max() - margin_m)))
    r_hi = min(shape[0], int(math.ceil(transform.f - ys.min() + margin_m)))
    return r_lo, r_hi, c_lo, c_hi


def crowns_from_canopy(canopy, transform, window, min_top=TREE_MIN_TOP):
    """Tree crowns from the 1 m canopy grid: marker watershed from local height maxima.

    Returns rows of (x, y, radius_m, top_m, base_m) in the local grid CRS and the labelled window.
    """
    from scipy import ndimage

    r_lo, r_hi, c_lo, c_hi = window
    chm = canopy[r_lo:r_hi, c_lo:c_hi]
    mask = chm >= min_top
    smooth = ndimage.uniform_filter(chm, size=3)  # breaks ties on whole-metre plateaus
    peak = np.where(
        smooth < 10,
        ndimage.maximum_filter(smooth, size=5),
        np.where(
            smooth < 20,
            ndimage.maximum_filter(smooth, size=7),
            ndimage.maximum_filter(smooth, size=9),
        ),
    )
    tops = mask & (smooth >= peak) & (smooth >= min_top)
    markers, n_tops = ndimage.label(tops, structure=np.ones((3, 3), bool))
    cost = np.full(chm.shape, 255, np.uint8)
    cost[mask] = (254 - np.clip(np.rint(smooth[mask]), 0, 254)).astype(np.uint8)
    labels = ndimage.watershed_ift(cost, markers.astype(np.int32))
    labels[~mask] = 0
    rr, cc = np.nonzero(labels)
    if rr.size == 0:
        empty = dict(
            markers=0,
            crowns=0,
            canopy_cells=0,
            disc_area=0.0,
            max_radius=0.0,
            over_12m=0,
        )
        return np.zeros((0, 5)), labels, empty
    lab = labels[rr, cc].astype(np.int64)
    h = chm[rr, cc]
    # Whole-metre plateaus leave a wide canopy patch with one marker. Split any segment wider than
    # TREE_SPLIT_R_M into TREE_BLOCK_M squares, so each square becomes its own crown disc.
    seg_area = np.bincount(lab)
    n_split = int((seg_area > np.pi * TREE_SPLIT_R_M**2).sum())
    big = seg_area[lab] > np.pi * TREE_SPLIT_R_M**2
    n_bc = chm.shape[1] // TREE_BLOCK_M + 1
    block = (rr // TREE_BLOCK_M) * n_bc + cc // TREE_BLOCK_M + 1
    key = lab * (n_bc * (chm.shape[0] // TREE_BLOCK_M + 1) + 1) + np.where(
        big, block, 0
    )
    lab = np.unique(key, return_inverse=True)[1].ravel() + 1
    order = np.lexsort((h, lab))
    lab, h, rr, cc = lab[order], h[order], rr[order], cc[order]
    ids, start, count = np.unique(lab, return_index=True, return_counts=True)
    top = h[start + np.floor(0.9 * (count - 1)).astype(int)]  # 90th percentile height
    sum_r = np.add.reduceat(rr.astype(np.float64), start)
    sum_c = np.add.reduceat(cc.astype(np.float64), start)
    x = transform.c + c_lo + sum_c / count + 0.5
    y = transform.f - (r_lo + sum_r / count + 0.5)
    radius = np.sqrt(count / np.pi)
    keep = top >= min_top
    rows = np.column_stack([x, y, radius, top, TRUNK_FRACTION * top])[keep]
    stats = dict(
        markers=int(n_tops),
        split_segments=n_split,
        crowns=int(keep.sum()),
        canopy_cells=int(mask.sum()),
        disc_area=float(np.pi * (radius[keep] ** 2).sum()),
        max_radius=float(radius.max()) if radius.size else 0.0,
        over_12m=int((radius > 12).sum()),
    )
    return rows, labels, stats


def write_trees(path, rows, stats):
    lon, lat = TO_LONLAT.transform(rows[:, 0], rows[:, 1])
    doc = {
        "fields": TREE_FIELDS,
        "count": int(len(rows)),
        "source": "Meta and WRI Global Canopy Height (CC-BY-4.0), crowns segmented from the 1 m canopy grid",
        "lon": [round(float(v), 6) for v in lon],
        "lat": [round(float(v), 6) for v in lat],
        "r_m": [round(float(v), 1) for v in rows[:, 2]],
        "top_m": [round(float(v), 1) for v in rows[:, 3]],
        "base_m": [round(float(v), 1) for v in rows[:, 4]],
    }
    path = Path(path)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, separators=(",", ":")))
    os.replace(tmp, path)
    return doc


def trees_check_png(path, canopy, labels, rows, transform, window, size_m=300):
    """Crown discs over the canopy mask for one window, to catch row/column or offset errors."""
    from PIL import Image, ImageDraw

    r_lo, _, c_lo, _ = window
    lab = labels
    # Pick the size_m square around the densest labelled area.
    dens = np.add.reduceat(
        np.add.reduceat(
            (lab > 0).astype(np.int32), np.arange(0, lab.shape[0], size_m), 0
        ),
        np.arange(0, lab.shape[1], size_m),
        1,
    )
    bi, bj = np.unravel_index(np.argmax(dens), dens.shape)
    wr, wc = bi * size_m, bj * size_m
    chm = canopy[r_lo + wr : r_lo + wr + size_m, c_lo + wc : c_lo + wc + size_m]
    rgb = np.full(chm.shape + (3,), 250, np.uint8)
    rgb[chm > 0] = (205, 225, 205)
    rgb[chm >= TREE_MIN_TOP] = (120, 175, 120)
    scale = 3
    img = Image.fromarray(rgb).resize(
        (chm.shape[1] * scale, chm.shape[0] * scale), Image.Resampling.NEAREST
    )
    draw = ImageDraw.Draw(img)
    x0 = transform.c + c_lo + wc
    y0 = transform.f - (r_lo + wr)
    for x, y, r, top, _ in rows:
        px, py = (x - x0) * scale, (y0 - y) * scale
        if (
            -r * scale <= px <= img.width + r * scale
            and -r * scale <= py <= img.height + r * scale
        ):
            rs = r * scale
            draw.ellipse(
                [px - rs, py - rs, px + rs, py + rs], outline=(150, 30, 30), width=1
            )
            draw.point((px, py), fill=(0, 0, 0))
    img.save(path)


def limits_text(stats, low_sun_buckets):
    cutoff = math.degrees(math.atan(stats["tallest_top"] / BUILDING_MARGIN_M))
    lines = [
        "Shade comes from rays cast toward the sun over a 1 m height grid. One sun position at the pilot centre serves each 30-minute bucket.",
        f"Edge samples sit every 5 m at 1.5 m height. The {stats['n_footbridge']} footbridge edges use a 6 m deck plus 1.5 m, because the map gives no deck heights.",
        "Tree crowns block all sunlight in the model. The UMEP default lets 3% of light through a crown.",
        "Tree heights come from the Meta and WRI canopy map, made from imagery of about 2018 to 2020. Newer or removed trees are missing.",
        "The lowest quarter of each tree's height counts as open trunk space, the UMEP default.",
        "Overlapping building parts merge into one solid block from the lowest base to the highest top.",
        f"The model leaves out {stats['skipped']} small buildings that have no usable height.",
        f"{stats['mostly_in']} unsheltered edges, {stats['mostly_in_km']:.1f} km, run mostly inside a building part at walking height. {stats['mostly_in_flagged']} of them carry flag 1024.",
        "Those edges read as building shade at most hours. That is right under a real roof and wrong where the map misplaces the path.",
        f"The model loads buildings only up to 800 m past the walk area. Below {cutoff:.1f} degrees of sun, a taller building beyond that line could shade a route unseen.",
        "The low-confidence share counts building shade cast by buildings with a default height.",
        "Nobody has checked the modelled shade against field photos yet.",
        "The shadow overlay shows ground shadow at 0.5 m. It can differ slightly from the 1.5 m walking-height values that routing uses.",
    ]
    if low_sun_buckets:
        lines.append(
            f"Buckets with the sun below {cutoff:.1f} degrees on at least one date: "
            + ", ".join(low_sun_buckets)
            + "."
        )
    return lines


def _canopy_source_name(path=CANOPY):
    """leaves-ph clips name the NCR raster. pipeline/regions/fetch_canopy.py clips name their AWS quadkey tiles."""
    try:
        with rasterio.open(path) as src:
            first = (src.tags().get("CLIPPED_FROM") or "").split(" ")[0]
    except rasterio.errors.RasterioIOError:
        first = ""
    if first.endswith(".tif") and first[:-4].isdigit():
        return "Meta and WRI Global Canopy Height (AWS Open Data tiles)"
    return "Meta and WRI Global Canopy Height (via leaves-ph)"


SOURCES = [
    {
        "name": _canopy_source_name(),
        "licence": "CC-BY-4.0",
        "url": "s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/",
        "used_for": "tree crown heights for tree shade",
    },
    {
        "name": "pvlib solar position (NREL SPA)",
        "licence": "BSD-3-Clause",
        "url": "https://pvlib-python.readthedocs.io/",
        "used_for": "sun altitude, azimuth, sunrise and sunset",
    },
]


def update_manifest(
    path, alt, az, rise_set, n_edges, limits, overlay=None, per_date=False, trees=None
):
    m = json.loads(path.read_text())
    if overlay is not None:
        m["shadow_overlay"] = overlay
    if trees is not None:
        m["trees"] = trees
    for key, want in (("dates", DATES), ("buckets_min", BUCKETS_MIN), ("timezone", TZ)):
        if key in m and m[key] != want:
            raise SystemExit(
                f"manifest {key} {m[key]} differs from the contract {want}"
            )
    m["sun"] = {
        d: [
            [round(float(alt[i, b]), 2), round(float(az[i, b]), 2)]
            for b in range(alt.shape[1])
        ]
        for i, d in enumerate(DATES)
    }
    m["sunrise_sunset"] = rise_set
    m["shade"] = {
        "n_dates": len(DATES),
        "n_buckets": len(BUCKETS_MIN),
        "n_edges": n_edges,
        "layout": LAYOUT,
    }
    if per_date:
        m["shade"].update(
            layout=PER_DATE_LAYOUT,
            per_date=True,
            files=[f"shade/{d}.bin" for d in DATES],
            lowconf="shade/lowconf.bin",
        )
    # Replace only the lines an earlier shade run added, so stale counts do not pile up.
    owned = (
        set(json.loads(OWNED_LIMITS.read_text())) if OWNED_LIMITS.exists() else set()
    )
    kept = [s for s in m.get("limits") or [] if s not in owned]
    m["limits"] = kept + [s for s in limits if s not in kept]
    names = {s.get("name") for s in m.get("sources") or []}
    m["sources"] = list(m.get("sources") or []) + [
        s for s in SOURCES if s["name"] not in names
    ]
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1))
    os.replace(tmp, path)
    OWNED_LIMITS.write_text(json.dumps(limits, ensure_ascii=False, indent=1))
    return m


def debug_png(path, ctx, alt_deg, az_deg, label, edges=None):
    """Ground (z = 0) shadow over the pilot box with building outlines."""
    from PIL import Image, ImageDraw

    transform, shape, surf, local_bldg = ctx
    top = surf[0]
    lon0, lat0, lon1, lat1 = PILOT_BBOX
    xs, ys = project_lonlat([lon0, lon1, lon1, lon0], [lat0, lat0, lat1, lat1])
    c_lo, c_hi = (
        int(math.floor(xs.min() - transform.c)),
        int(math.ceil(xs.max() - transform.c)),
    )
    r_lo, r_hi = (
        int(math.floor(transform.f - ys.max())),
        int(math.ceil(transform.f - ys.min())),
    )
    cc, rr = np.meshgrid(np.arange(c_lo, c_hi) + 0.5, np.arange(r_lo, r_hi) + 0.5)
    codes = run_bucket(cc.ravel(), rr.ravel(), np.zeros(cc.size), surf, alt_deg, az_deg)
    codes = codes.reshape(cc.shape)
    rgb = np.empty(cc.shape + (3,), dtype=np.uint8)
    rgb[:] = (247, 239, 205)
    rgb[codes == TREE] = (88, 150, 88)
    rgb[codes >= BLDG] = (70, 82, 102)
    rgb[top[r_lo:r_hi, c_lo:c_hi] > 0] = (175, 180, 188)
    img = Image.fromarray(rgb)
    scale = 1600.0 / img.width
    img = img.resize((1600, round(img.height * scale)), Image.Resampling.BOX)
    draw = ImageDraw.Draw(img)

    def px(x, y):
        return ((x - transform.c - c_lo) * scale, (transform.f - y - r_lo) * scale)

    for g in local_bldg:
        for poly in getattr(g, "geoms", [g]):
            ring = np.asarray(poly.exterior.coords)
            pts = [px(x, y) for x, y in ring]
            draw.line(pts, fill=(20, 20, 20), width=1)
    if edges is not None:
        for e in edges:
            ex, ey = project_lonlat(
                [p[0] for p in e["geom"]], [p[1] for p in e["geom"]]
            )
            draw.line([px(a, b) for a, b in zip(ex, ey)], fill=(200, 40, 40), width=1)
    # Arrow toward the sun from the top-left corner.
    a = math.radians(az_deg)
    ox, oy = 90, 110
    tx, ty = ox + 60 * math.sin(a), oy - 60 * math.cos(a)
    draw.line([(ox, oy), (tx, ty)], fill=(220, 120, 0), width=5)
    draw.ellipse([tx - 9, ty - 9, tx + 9, ty + 9], fill=(250, 170, 0))
    shadow_dir = (az_deg + 180) % 360
    draw.rectangle([0, 0, 1600, 34], fill=(255, 255, 255))
    draw.text(
        (10, 10),
        f"{label}  sun alt {alt_deg:.1f} deg, az {az_deg:.1f} deg  "
        f"(orange arrow points to the sun; shadows should point toward {shadow_dir:.0f} deg)  "
        "dark = building shadow, green = tree shadow, grey = roof, red = walk edges",
        fill=(0, 0, 0),
    )
    img.save(path)
    frac = {
        k: float((codes[top[r_lo:r_hi, c_lo:c_hi] == 0] == v).mean())
        for k, v in (("sun", SUN), ("tree", TREE))
    }
    return frac


def merc_y(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def inv_merc_y(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def overlay_frame(bbox, px_m=OVERLAY_PX_M):
    """Pixel centres for a MapLibre image source over bbox, row 0 north.

    MapLibre stretches an image linearly in Web Mercator, so rows step evenly in Mercator y.
    """
    w, s, e, n = bbox
    mid_lat, mid_lon = (s + n) / 2, (w + e) / 2
    xs, _ = project_lonlat([w, e], [mid_lat, mid_lat])
    _, ys = project_lonlat([mid_lon, mid_lon], [s, n])
    cols = int(round((xs[1] - xs[0]) / px_m))
    rows = int(round((ys[1] - ys[0]) / px_m))
    lon = w + (np.arange(cols) + 0.5) * (e - w) / cols
    lat = inv_merc_y(
        merc_y(n) - (np.arange(rows) + 0.5) * (merc_y(n) - merc_y(s)) / rows
    )
    return np.meshgrid(lon, lat), (rows, cols)


def lonlat_to_overlay_px(lon, lat, bbox, shape):
    w, s, e, n = bbox
    rows, cols = shape
    col = (np.asarray(lon) - w) / (e - w) * cols
    row = (merc_y(n) - merc_y(np.asarray(lat))) / (merc_y(n) - merc_y(s)) * rows
    return col, row


def write_overlays(out_dir, ctx, alt, az, bbox, log=print):
    """Ground (z = 0.5 m) shadow PNGs per date and bucket with the sun above 3 degrees."""
    from PIL import Image

    transform, shape, surf, _ = ctx
    top = surf[0]
    (lon, lat), frame = overlay_frame(bbox)
    x, y = project_lonlat(lon.ravel(), lat.ravel())
    gx, gy = to_grid(x, y, transform)
    roof = top[np.floor(gy).astype(int), np.floor(gx).astype(int)] > 0
    z0 = np.full(gx.size, OVERLAY_Z)
    palette = list(OVERLAY_BLDG[:3]) + list(OVERLAY_TREE[:3])
    alpha = bytes([0, OVERLAY_BLDG[3], OVERLAY_TREE[3]])
    buckets, sizes, secs = {}, {}, {}
    for d, day in enumerate(DATES[:OVERLAY_DATES]):
        day_dir = out_dir / day
        day_dir.mkdir(parents=True, exist_ok=True)
        keep = []
        for b, minute in enumerate(BUCKETS_MIN):
            if alt[d, b] <= OVERLAY_MIN_ALT:
                continue
            hhmm = f"{minute // 60:02d}{minute % 60:02d}"
            t0 = time.perf_counter()
            codes = run_bucket(gx, gy, z0, surf, alt[d, b], az[d, b])
            idx = np.zeros(gx.size, dtype=np.uint8)
            idx[codes >= BLDG] = 1
            idx[codes == TREE] = 2
            idx[roof] = 0
            img = Image.fromarray(idx.reshape(frame), mode="P")
            img.putpalette([0, 0, 0] + palette)
            path = day_dir / f"{hhmm}.png"
            img.save(path, optimize=True, transparency=alpha)
            secs[f"{day} {hhmm}"] = time.perf_counter() - t0
            sizes[f"{day} {hhmm}"] = path.stat().st_size
            keep.append(hhmm)
        for old in day_dir.glob("*.png"):
            if old.stem not in keep:
                old.unlink()
        buckets[day] = keep
    log(
        f"overlays: {sum(map(len, buckets.values()))} files, {sum(sizes.values()) / 1e6:.2f} MB, "
        f"{frame[1]} x {frame[0]} px, largest {max(sizes.values()) / 1e3:.0f} KB, "
        f"{sum(secs.values()):.1f} s"
    )
    w, s, e, n = bbox
    meta = {
        "bbox": [w, s, e, n],
        "coords": [[w, n], [e, n], [e, s], [w, s]],
        "px_m": OVERLAY_PX_M,
        "path": "shadows/{date}/{HHMM}.png",
        "buckets": buckets,
    }
    return meta, sizes, secs, frame


def overlay_check(png, features, bbox, alt_deg, az_deg, label, out):
    """Composite one overlay file from disk on building outlines to check its orientation."""
    from PIL import Image, ImageDraw

    over = Image.open(png).convert("RGBA")
    base = Image.new("RGBA", over.size, (246, 243, 234, 255))
    draw = ImageDraw.Draw(base)
    for f in features:
        if f["properties"].get("height_m") is None:
            continue
        ring = np.asarray(f["geometry"]["coordinates"][0])
        c, r = lonlat_to_overlay_px(ring[:, 0], ring[:, 1], bbox, over.size[::-1])
        draw.polygon(list(zip(c, r)), fill=(200, 203, 208, 255))
    img = Image.alpha_composite(base, over)
    draw = ImageDraw.Draw(img)
    for f in features:
        if f["properties"].get("height_m") is None:
            continue
        ring = np.asarray(f["geometry"]["coordinates"][0])
        c, r = lonlat_to_overlay_px(ring[:, 0], ring[:, 1], bbox, over.size[::-1])
        draw.line(list(zip(c, r)), fill=(20, 20, 20, 255), width=1)
    a = math.radians(az_deg)
    ox, oy = 90, 110
    tx, ty = ox + 60 * math.sin(a), oy - 60 * math.cos(a)
    draw.line([(ox, oy), (tx, ty)], fill=(220, 120, 0, 255), width=5)
    draw.ellipse([tx - 9, ty - 9, tx + 9, ty + 9], fill=(250, 170, 0, 255))
    draw.rectangle([0, 0, img.width, 30], fill=(255, 255, 255, 255))
    draw.text(
        (10, 9),
        f"{label} overlay file read back: sun alt {alt_deg:.1f}, az {az_deg:.1f} (orange arrow); "
        f"shadows should point toward {(az_deg + 180) % 360:.0f} deg",
        fill=(0, 0, 0, 255),
    )
    img.convert("RGB").save(out)


def area_limits_text(stats, low_sun_buckets, tree_stats):
    lines = [
        s
        for s in limits_text(stats, low_sun_buckets)
        if not s.startswith("The shadow overlay")
    ]
    return (
        lines
        + [
            "One sun position at the area centre serves every edge. Across 10 km the sun direction shifts by about 0.1 degrees.",
            "The shade grid covers the envelope of the area's districts. Buildings outside their building boxes are not loaded.",
            f"trees.json holds {tree_stats['crowns']} crowns of 3 m or taller within 200 m of the walk area, from the same canopy grid as routing.",
            "Each crown is a disc with the area of its canopy patch. Patches wider than 8 m in radius split into 10 m squares.",
            "A crown top is the 90th percentile height of its patch, and its base sits at a quarter of that.",
        ]
        + (
            [
                f"{stats['off_grid']} edge samples lie more than 800 m past the walk area, outside the shade grid. They count as sun."
            ]
            if stats["off_grid"]
            else []
        )
    )


def _start_area_manifest(data):
    """Start manifest.json from the stage template, as set_dates.py does for the root."""
    path = data / "manifest.json"
    if path.exists() and json.loads(path.read_text()).get("dates") == DATES:
        return path
    m = json.loads(
        _first(
            [data / "manifest_template.json", INPUTS / "manifest_template.json"]
        ).read_text()
    )
    m["generated_at"] = datetime.now(ZoneInfo(TZ)).isoformat(timespec="seconds")
    m["dates"] = DATES
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1))
    os.replace(tmp, path)
    return path


def main_area(args):
    """Shade for a staged area: per-date shade files, trees.json and the area manifest. No overlays."""
    import gzip

    data = args.data
    need = [data / "graph.json", BUILDINGS]
    if not (data / "manifest.json").exists():
        need.append(
            _first([data / "manifest_template.json", INPUTS / "manifest_template.json"])
        )
    missing = [str(p) for p in need if not p.exists()]
    if missing:
        raise SystemExit("the staged bundle is incomplete: " + ", ".join(missing))
    t_all = time.perf_counter()
    timings = {}
    if not CANOPY.exists():
        if _AREA.get("region"):  # outside Metro Manila: the NCR raster does not cover the area
            raise SystemExit(
                f"{CANOPY} is missing; run pipeline/regions/fetch_canopy.py {AREA_ID} first"
            )
        if not NCR_CANOPY.exists():
            raise SystemExit(
                f"{CANOPY} is missing and the NCR canopy raster {NCR_CANOPY} is not here to clip it"
            )
        t = time.perf_counter()
        clip = clip_canopy_to(CANOPY)
        timings["clip_s"] = round(time.perf_counter() - t, 2)
        print(
            f"clipped {CANOPY} ({clip.width} x {clip.height} px, {CANOPY.stat().st_size} bytes)"
        )
    t = time.perf_counter()
    edges = json.loads((data / "graph.json").read_text())["edges"]
    if [e["id"] for e in edges] != list(range(len(edges))):
        raise SystemExit("edge ids do not equal their position in graph.json")
    features = read_geojson(BUILDINGS)["features"]
    timings["read_s"] = round(time.perf_counter() - t, 2)
    alt, az, rise_set = sun_table()
    t = time.perf_counter()
    building, tree, lowconf, stats, ctx = compute(edges, features, alt, az)
    timings["compute_s"] = round(time.perf_counter() - t, 2)
    transform, shape, surf, _ = ctx
    t = time.perf_counter()
    window = crown_window(transform, shape, GRAPH_BBOX)
    rows, labels, tstats = crowns_from_canopy(surf[2], transform, window)
    timings["trees_s"] = round(time.perf_counter() - t, 2)

    bs = stats["bucket_s"]
    print(
        f"{AREA_ID}: setup {stats['setup_s']:.1f} s, {len(bs)} day buckets, "
        f"mean {np.mean(list(bs.values())):.2f} s, max {max(bs.values()):.2f} s"
    )
    for hhmm in ("08:00", "12:00", "16:00"):
        b = BUCKETS_MIN.index(int(hhmm[:2]) * 60 + int(hhmm[3:]))
        sb, st = stats["shares"][(1, b)]
        print(
            f"{DATES[1]} {hhmm}: building {100 * sb:.1f}%, tree {100 * st:.1f}% of edge length"
        )
    cutoff = math.degrees(math.atan(stats["tallest_top"] / BUILDING_MARGIN_M))
    low_hhmm = sorted(
        {
            f"{BUCKETS_MIN[b] // 60:02d}:{BUCKETS_MIN[b] % 60:02d}"
            for d in range(alt.shape[0])
            for b in range(alt.shape[1])
            if 0 < alt[d, b] < cutoff
        }
    )
    limits = area_limits_text(stats, low_hhmm, tstats)
    log = {
        "generated_at": datetime.now(ZoneInfo(TZ)).isoformat(timespec="seconds"),
        "area": AREA_ID,
        "dates": DATES,
        "n_edges": len(edges),
        "buildings": len(features),
        "samples": stats["samples"],
        "grid_cells": list(stats["grid"]),
        "tallest_top_m": stats["tallest_top"],
        "tallest_canopy_m": stats["tallest_canopy"],
        "skipped_buildings": stats["skipped"],
        "off_grid_samples": stats["off_grid"],
        "unsheltered_edges_mostly_in_footprint": stats["mostly_in"],
        "setup_s": round(stats["setup_s"], 2),
        "bucket_s_mean": round(float(np.mean(list(bs.values()))), 3),
        "bucket_s_max": round(float(max(bs.values())), 3),
        "bucket_s_sum": round(float(sum(bs.values())), 2),
        "margin_cutoff_deg": round(cutoff, 2),
        "trees": tstats,
        "limits_added": limits,
        "shares": {
            f"{DATES[d]} {BUCKETS_MIN[b]}": [round(s[0], 4), round(s[1], 4)]
            for (d, b), s in stats["shares"].items()
        },
        "lowconf_mean": float(lowconf.mean()),
    }
    if args.no_write:
        log["timings"] = {**timings, "total_s": round(time.perf_counter() - t_all, 2)}
        RUN_LOG.write_text(json.dumps(log, indent=1))
        return log
    files, low = write_shade_per_date(data / "shade", building, tree, lowconf, DATES)
    rb, rt, rl, n_e = read_shade_per_date(data / "shade", DATES, len(BUCKETS_MIN))
    assert (
        n_e == len(edges) and np.array_equal(rb, building) and np.array_equal(rt, tree)
    )
    assert np.array_equal(rl, lowconf)
    doc = write_trees(data / "trees.json", rows, tstats)
    trees_bytes = (data / "trees.json").stat().st_size
    trees_gz = len(gzip.compress((data / "trees.json").read_bytes(), 9))
    DEBUG.mkdir(parents=True, exist_ok=True)
    trees_check_png(DEBUG / "trees-check.png", surf[2], labels, rows, transform, window)
    mpath = _start_area_manifest(data)
    update_manifest(
        mpath,
        alt,
        az,
        rise_set,
        len(edges),
        limits,
        per_date=True,
        trees={
            "path": "trees.json",
            "count": doc["count"],
            "fields": TREE_FIELDS,
            "source": doc["source"],
        },
    )
    log["sizes"] = {
        "per_date_bytes": files[0].stat().st_size,
        "per_date_total_bytes": sum(f.stat().st_size for f in files),
        "lowconf_bytes": low.stat().st_size,
        "trees_bytes": trees_bytes,
        "trees_gzip_bytes": trees_gz,
    }
    log["timings"] = {**timings, "total_s": round(time.perf_counter() - t_all, 2)}
    RUN_LOG.write_text(json.dumps(log, indent=1))
    (data / "READY.shade").write_text(
        f"{log['generated_at']} area={AREA_ID} edges={len(edges)} per_date=1 "
        f"runtime_s={log['timings']['total_s']:.2f}\n"
    )
    print(
        f"{AREA_ID}: {len(files)} date files of {files[0].stat().st_size} bytes, "
        f"trees.json {doc['count']} crowns {trees_bytes} bytes ({trees_gz} gzip), "
        f"total {log['timings']['total_s']:.1f} s"
    )
    return log


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=DATA)
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument(
        "--area",
        help="run a staged area from pipeline/stage/<id>/ (read before the settings load)",
    )
    args = ap.parse_args(argv)
    if args.area and args.area != AREA_ID:
        raise SystemExit(
            "pass --area on the command line or set UCPH_AREA; main(argv) cannot switch areas"
        )
    if AREA_ID:
        return main_area(args)
    data = args.data
    if not (data / "READY.graph").exists():
        raise SystemExit("READY.graph is missing; the graph files are not ready")
    t_all = time.perf_counter()
    graph = json.loads((data / "graph.json").read_text())
    edges = graph["edges"]
    ids = [e["id"] for e in edges]
    if ids != list(range(len(edges))):
        raise SystemExit("edge ids do not equal their position in graph.json")
    features = json.loads(BUILDINGS.read_text())["features"]
    alt, az, rise_set = sun_table()
    building, tree, lowconf, stats, ctx = compute(edges, features, alt, az)

    run = time.perf_counter() - t_all
    bs = stats["bucket_s"]
    print(
        f"setup {stats['setup_s']:.1f} s, {len(bs)} day buckets, "
        f"mean {np.mean(list(bs.values())):.2f} s, max {max(bs.values()):.2f} s, total {run:.1f} s"
    )
    d22 = 1  # second shade date, used for the printed summary and debug images
    for hhmm in ("08:00", "12:00", "16:00"):
        b = BUCKETS_MIN.index(int(hhmm[:2]) * 60 + int(hhmm[3:]))
        sb, st = stats["shares"][(d22, b)]
        print(
            f"{DATES[d22]} {hhmm}: building {100 * sb:.1f}%, tree {100 * st:.1f}% of edge length "
            f"(sun alt {alt[d22, b]:.1f}, az {az[d22, b]:.1f})"
        )

    cutoff = math.degrees(math.atan(stats["tallest_top"] / BUILDING_MARGIN_M))
    low = [
        f"{DATES[d][5:]} {BUCKETS_MIN[b] // 60:02d}:{BUCKETS_MIN[b] % 60:02d}"
        for d in range(alt.shape[0])
        for b in range(alt.shape[1])
        if 0 < alt[d, b] < cutoff
    ]
    low_hhmm = sorted({s[6:] for s in low})
    limits = limits_text(stats, low_hhmm)

    DEBUG.mkdir(parents=True, exist_ok=True)
    pngs = {}
    for hhmm in ("08:00", "15:00"):
        b = BUCKETS_MIN.index(int(hhmm[:2]) * 60 + int(hhmm[3:]))
        out = DEBUG / f"shadow-{DATES[d22]}-{hhmm.replace(':', '')}.png"
        pngs[hhmm] = debug_png(
            out, ctx, alt[d22, b], az[d22, b], f"{DATES[d22]} {hhmm}", edges
        )
        print(
            f"wrote {out} ground sun share {pngs[hhmm]['sun']:.2f}, tree {pngs[hhmm]['tree']:.2f}"
        )

    lengths = stats["lengths"]
    lens = np.array([e["len_m"] for e in edges], dtype=float)
    print(
        f"projected length vs len_m: max abs diff {np.max(np.abs(lengths - lens)):.2f} m, "
        f"total {lengths.sum():.0f} m vs {lens.sum():.0f} m"
    )
    log = {
        "generated_at": datetime.now(ZoneInfo(TZ)).isoformat(timespec="seconds"),
        "n_edges": len(edges),
        "samples": stats["samples"],
        "grid_cells": list(stats["grid"]),
        "tallest_top_m": stats["tallest_top"],
        "tallest_canopy_m": stats["tallest_canopy"],
        "skipped_buildings": stats["skipped"],
        "start_in_footprint": stats["start_in_bldg"],
        "unsheltered_edges_mostly_in_footprint": stats["mostly_in"],
        "unsheltered_km_mostly_in_footprint": round(stats["mostly_in_km"], 2),
        "limits_added": limits,
        "off_grid_samples": stats["off_grid"],
        "setup_s": round(stats["setup_s"], 2),
        "total_s": round(run, 2),
        "margin_cutoff_deg": round(cutoff, 2),
        "low_sun_buckets": low,
        "bucket_s": {
            f"{DATES[d]} {BUCKETS_MIN[b]}": round(v, 3) for (d, b), v in bs.items()
        },
        "shares": {
            f"{DATES[d]} {BUCKETS_MIN[b]}": [round(s[0], 4), round(s[1], 4)]
            for (d, b), s in stats["shares"].items()
        },
        "png_ground_share": pngs,
        "lowconf_mean": float(lowconf.mean()),
    }
    RUN_LOG.write_text(json.dumps(log, indent=1))
    if args.no_write:
        return log
    write_shade_bin(data / "shade.bin", building, tree, lowconf)
    rb, rt, rl, n_e = read_shade_bin(data / "shade.bin", len(DATES), len(BUCKETS_MIN))
    assert (
        n_e == len(edges) and np.array_equal(rb, building) and np.array_equal(rt, tree)
    )
    assert np.array_equal(rl, lowconf)

    bbox = json.loads((data / "manifest.json").read_text()).get("graph_bbox") or list(
        GRAPH_BBOX
    )
    t_ov = time.perf_counter()
    overlay, sizes, secs, frame = write_overlays(data / "shadows", ctx, alt, az, bbox)
    dov = min(d22, OVERLAY_DATES - 1)  # a date that has overlays
    for hhmm in ("08:00", "16:00"):
        b = BUCKETS_MIN.index(int(hhmm[:2]) * 60 + int(hhmm[3:]))
        overlay_check(
            data / "shadows" / DATES[dov] / f"{hhmm.replace(':', '')}.png",
            features,
            bbox,
            alt[dov, b],
            az[dov, b],
            f"{DATES[dov]} {hhmm}",
            DEBUG / f"overlay-check-{DATES[dov]}-{hhmm.replace(':', '')}.png",
        )
    log["overlay"] = {
        "files": len(sizes),
        "total_bytes": sum(sizes.values()),
        "max_bytes": max(sizes.values()),
        "frame_rows_cols": list(frame),
        "render_s": round(sum(secs.values()), 2),
        "step_s": round(time.perf_counter() - t_ov, 2),
        "bytes": sizes,
        "secs": {k: round(v, 3) for k, v in secs.items()},
    }
    RUN_LOG.write_text(json.dumps(log, indent=1))
    update_manifest(
        data / "manifest.json", alt, az, rise_set, len(edges), limits, overlay
    )
    # The app shows overlays only once this marker exists, so it goes last.
    (data / "READY.shadows").write_text(
        f"{log['generated_at']} files={len(sizes)} bytes={sum(sizes.values())} "
        f"runtime_s={log['overlay']['step_s']:.2f}\n"
    )
    print(
        f"wrote shade.bin ({(data / 'shade.bin').stat().st_size} bytes), "
        f"{len(sizes)} overlays and manifest keys"
    )
    return log


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
