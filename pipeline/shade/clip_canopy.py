"""Clip the NCR canopy height raster to the shade engine's building area.

Usage: .venv/bin/python clip_canopy.py /path/to/canopy_height_ncr.tif [OUT.tif]
Writes OUT.tif, default pipeline/inputs/canopy_height_makati.tif. The area comes from shade.py's
settings (UCPH_DATA and UCPH_INPUTS), so one run per routing area clips that area's building area.
The clip keeps source pixels as they are: it reads
the same window that load_canopy() reads, grown by MARGIN_PX pixels, so the shade output does not change.
Source: Meta and WRI Global Canopy Height, CC-BY-4.0, NCR mosaic from leaves-ph.
"""

import sys
from pathlib import Path

import rasterio
from rasterio.windows import Window, from_bounds

import shade

MARGIN_PX = 16


def main(src_path, out=shade.ROOT / "pipeline/inputs/canopy_height_makati.tif"):
    out = Path(out)
    transform, (h, w) = shade.building_grid()
    xs = [transform.c, transform.c + w, transform.c + w, transform.c]
    ys = [transform.f, transform.f, transform.f - h, transform.f - h]
    lon, lat = shade.TO_LONLAT.transform(xs, ys)
    pad = 0.0005  # same pad as load_canopy()
    with rasterio.open(src_path) as src:
        win = from_bounds(
            min(lon) - pad,
            min(lat) - pad,
            max(lon) + pad,
            max(lat) + pad,
            src.transform,
        )
        win = win.round_offsets().round_lengths()
        c0 = max(0, int(win.col_off) - MARGIN_PX)
        r0 = max(0, int(win.row_off) - MARGIN_PX)
        c1 = min(src.width, int(win.col_off + win.width) + MARGIN_PX)
        r1 = min(src.height, int(win.row_off + win.height) + MARGIN_PX)
        clip = Window(c0, r0, c1 - c0, r1 - r0)
        arr = src.read(1, window=clip)
        profile = src.profile.copy()
        profile.update(
            width=clip.width,
            height=clip.height,
            transform=src.window_transform(clip),
            tiled=True,
            blockxsize=256,
            blockysize=256,
            compress="deflate",
            predictor=2,
            zlevel=9,
        )
        out.parent.mkdir(parents=True, exist_ok=True)
        with rasterio.open(out, "w", **profile) as dst:
            dst.write(arr, 1)
            dst.update_tags(
                SOURCE="Meta and WRI Global Canopy Height, CC-BY-4.0",
                CLIPPED_FROM=Path(src_path).name,
            )
    print(f"{out.name}: window {clip}, {out.stat().st_size} bytes")


if __name__ == "__main__":
    main(*sys.argv[1:3])
