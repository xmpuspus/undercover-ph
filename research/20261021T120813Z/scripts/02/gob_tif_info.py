"""Print header info of a remote GeoTIFF via HTTP range reads. Usage: python3 -I gob_tif_info.py URL"""
import json
import sys

import rasterio

with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="3"):
    with rasterio.open("/vsicurl/" + sys.argv[1]) as r:
        print(json.dumps({"crs": str(r.crs), "width": r.width, "height": r.height, "count": r.count,
                          "dtypes": r.dtypes, "nodata": r.nodata, "descriptions": r.descriptions,
                          "block_shapes": r.block_shapes, "overviews_b1": r.overviews(1),
                          "transform": list(r.transform)[:6], "tags": r.tags(),
                          "band_tags": [r.tags(i) for i in range(1, r.count + 1)],
                          "scales": r.scales, "offsets": r.offsets,
                          "compression": str(r.compression), "interleave": str(r.interleaving)}, indent=1, default=str))
