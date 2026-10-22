"""Summarise height and confidence values in a Microsoft geojsonl sample. Usage: python3 -I msft_height_check.py FILE"""
import collections
import json
import sys

h, c, n, inbox = collections.Counter(), collections.Counter(), 0, 0
lat_rng = [90, -90]
lon_rng = [180, -180]
for line in open(sys.argv[1]):
    f = json.loads(line)
    n += 1
    p = f["properties"]
    h["unknown(-1)" if p.get("height", -1) == -1 else "has_value"] += 1
    c[p.get("confidence")] += 1
    x, y = f["geometry"]["coordinates"][0][0]
    lat_rng = [min(lat_rng[0], y), max(lat_rng[1], y)]
    lon_rng = [min(lon_rng[0], x), max(lon_rng[1], x)]
    if 14.548 <= y <= 14.562 and 121.012 <= x <= 121.032:
        inbox += 1
print(json.dumps({"rows": n, "height": dict(h), "confidence_top": c.most_common(5),
                  "lat_range": lat_rng, "lon_range": lon_rng, "first_vertex_in_makati_box": inbox}, indent=1))
