"""Write a light building file for the 3D map from pipeline/inputs/buildings.geojson.

The shade engine needs buildings out to 800 m past the walk area. The map only needs the ones a
walker can see, so this keeps features that touch the graph area plus 150 m, keeps the two height
fields and the source, rounds coordinates to 6 decimals (about 0.1 m), and drops null heights,
which the shade model also leaves out.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app" / "public" / "data"
SRC = ROOT / "pipeline" / "inputs" / "buildings.geojson"
MARGIN_DEG = 150 / 111_000


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 6), round(c[1], 6)]
    return [rnd(x) for x in c]


def touches(coords, box):
    w, s, e, n = box
    flat = coords
    while not isinstance(flat[0][0], (int, float)):
        flat = [p for part in flat for p in part]
    xs, ys = [p[0] for p in flat], [p[1] for p in flat]
    return max(xs) >= w and min(xs) <= e and max(ys) >= s and min(ys) <= n


def main():
    manifest = json.loads((DATA / "manifest.json").read_text())
    w, s, e, n = manifest["graph_bbox"]
    box = (w - MARGIN_DEG, s - MARGIN_DEG, e + MARGIN_DEG, n + MARGIN_DEG)
    src = json.loads(SRC.read_text())
    out, dropped_null, dropped_far = [], 0, 0
    for f in src["features"]:
        p = f["properties"]
        if p.get("height_m") is None:
            dropped_null += 1
            continue
        if not touches(f["geometry"]["coordinates"], box):
            dropped_far += 1
            continue
        out.append({
            "type": "Feature",
            "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])},
            "properties": {"height_m": p["height_m"], "min_height_m": p.get("min_height_m") or 0, "source": p.get("source")},
        })
    path = DATA / "buildings_display.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": out}, separators=(",", ":")))
    print(json.dumps({"kept": len(out), "dropped_null_height": dropped_null, "dropped_outside": dropped_far,
                      "bytes": path.stat().st_size, "source_bytes": SRC.stat().st_size}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
