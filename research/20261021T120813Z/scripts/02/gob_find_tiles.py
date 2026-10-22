"""Find Google Open Buildings temporal tiles that cover the pilot boxes. Usage: python3 -I gob_find_tiles.py MANIFEST [MANIFEST ...]"""
import json
import sys

from pyproj import Transformer

boxes = {"makati": (14.548, 121.012, 14.562, 121.032), "bgc": (14.545, 121.040, 14.560, 121.058),
         "ortigas": (14.578, 121.053, 14.592, 121.067)}
tr = Transformer.from_crs("EPSG:4326", "EPSG:32651", always_xy=True)
utm = {}
for k, (s, w, n, e) in boxes.items():
    xs, ys = zip(*[tr.transform(x, y) for x, y in ((w, s), (e, s), (w, n), (e, n))])
    utm[k] = (min(xs), min(ys), max(xs), max(ys))
out = {"box_utm51n": utm, "hits": []}
for mf in sys.argv[1:]:
    m = json.load(open(mf))
    for ts in m["tilesets"]:
        for src in ts["sources"]:
            a, d = src["affineTransform"], src["dimensions"]
            x0, y1 = a["translateX"], a["translateY"]
            x1, y0 = x0 + a["scaleX"] * d["width"], y1 + a["scaleY"] * d["height"]
            for k, (bx0, by0, bx1, by1) in utm.items():
                if bx0 < x1 and bx1 > x0 and by0 < y1 and by1 > y0:
                    full = bx0 >= x0 and bx1 <= x1 and by0 >= y0 and by1 <= y1
                    out["hits"].append({"manifest": mf.split("/")[-1], "box": k, "uri": m["uriPrefix"] + src["uris"][0],
                                        "tile_extent": [x0, y0, x1, y1], "box_fully_inside": full,
                                        "props": m["properties"]})
print(json.dumps(out, indent=1))
