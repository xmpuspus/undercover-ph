"""District copy of pipeline/build_display.py: the light building file for the 3D map of one area.

Usage: UC_AREA=<id> pipeline/.venv/bin/python -I pipeline/districts/build_display.py
Keeps features that touch any member graph box plus 150 m, keeps the two height fields and the source,
rounds coordinates to 6 decimals (about 0.1 m), and drops null heights, which the shade model leaves out.
"""
import gzip
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ctx import BUILDINGS, GRAPH_BBOX, OUT  # noqa: E402

MARGIN_DEG = 150 / 111_000


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 6), round(c[1], 6)]
    return [rnd(x) for x in c]


def touches(coords, boxes):
    flat = coords
    while not isinstance(flat[0][0], (int, float)):
        flat = [p for part in flat for p in part]
    xs, ys = [p[0] for p in flat], [p[1] for p in flat]
    return any(max(xs) >= w and min(xs) <= e and max(ys) >= s and min(ys) <= n for w, s, e, n in boxes)


def main():
    boxes = [(w - MARGIN_DEG, s - MARGIN_DEG, e + MARGIN_DEG, n + MARGIN_DEG) for w, s, e, n in GRAPH_BBOX.rects]
    src_path = BUILDINGS.with_name(BUILDINGS.name + ".gz")
    src = json.load(gzip.open(src_path))
    out, dropped_null, dropped_far = [], 0, 0
    for f in src["features"]:
        p = f["properties"]
        if p.get("height_m") is None:
            dropped_null += 1
            continue
        if not touches(f["geometry"]["coordinates"], boxes):
            dropped_far += 1
            continue
        out.append({
            "type": "Feature",
            "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])},
            "properties": {"height_m": p["height_m"], "min_height_m": p.get("min_height_m") or 0, "source": p.get("source")},
        })
    path = OUT / "buildings_display.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": out}, separators=(",", ":")))
    print(json.dumps({"kept": len(out), "dropped_null_height": dropped_null, "dropped_outside": dropped_far,
                      "bytes": path.stat().st_size, "source_gzip_bytes": src_path.stat().st_size}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
