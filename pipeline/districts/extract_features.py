"""District copy of pipeline/extract_features.py. Run through pipeline/districts/build.py, which sets UC_DISTRICT.

One pass over the NCR PBF: building outlines and parts, named features, and elevator nodes.

Usage: pipeline/.venv/bin/python -I pipeline/extract_features.py
Writes pipeline/work/buildings_osm.jsonl, features.jsonl, elevators.json and kerbs.json.
Buildings and named features are kept when their outer ring bounds touch the building area.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import osmium  # noqa: E402
import shapely.wkb  # noqa: E402

from ctx import BUILDING_BBOX, GRAPH_BBOX, PBF, WORK, in_bbox  # noqa: E402

W, S, E, N = BUILDING_BBOX
BUILDING_KEYS = ("building", "building:part", "height", "min_height", "building:levels",
                 "building:min_level", "name", "layer", "roof:height")
WKB = osmium.geom.WKBFactory()


class Handler(osmium.SimpleHandler):
    def __init__(self, bfh, ffh):
        super().__init__()
        self.bfh, self.ffh = bfh, ffh
        self.elevators = {}
        self.kerbs = {}
        self.stats = {"building_rows": 0, "feature_area_rows": 0, "feature_node_rows": 0, "wkb_errors": 0}

    def area(self, a):
        t = {tg.k: tg.v for tg in a.tags}
        is_bldg = t.get("building", "no") != "no" or t.get("building:part", "no") != "no"
        if not is_bldg and "name" not in t:
            return
        lons, lats = [], []
        for ring in a.outer_rings():
            for nd in ring:
                if nd.location.valid():
                    lons.append(nd.location.lon)
                    lats.append(nd.location.lat)
        if not lons or max(lons) < W or min(lons) > E or max(lats) < S or min(lats) > N:
            return
        try:
            wkt = shapely.wkb.loads(WKB.create_multipolygon(a), hex=True).wkt
        except Exception as ex:  # broken multipolygons stay on record
            self.stats["wkb_errors"] += 1
            print("wkb error", a.orig_id(), ex, file=sys.stderr)
            return
        osm = ("w" if a.from_way() else "r") + str(a.orig_id())
        if is_bldg:
            kind = "outline" if t.get("building", "no") != "no" else "part"
            self.bfh.write(json.dumps({"osm": osm, "kind": kind,
                                       "tags": {k: t[k] for k in BUILDING_KEYS if k in t},
                                       "wkt": wkt}) + "\n")
            self.stats["building_rows"] += 1
        if "name" in t:
            self.ffh.write(json.dumps({"osm": osm, "type": "area", "tags": t, "wkt": wkt}) + "\n")
            self.stats["feature_area_rows"] += 1

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        lon, lat = n.location.lon, n.location.lat
        if not in_bbox(lon, lat, BUILDING_BBOX):
            return
        t = {tg.k: tg.v for tg in n.tags}
        if t.get("highway") == "elevator" and in_bbox(lon, lat, GRAPH_BBOX):
            self.elevators[n.id] = [lon, lat, t.get("level")]
        if t.get("barrier") == "kerb":
            self.kerbs[n.id] = t.get("kerb")
        if "name" in t:
            self.ffh.write(json.dumps({"osm": f"n{n.id}", "type": "node", "tags": t,
                                       "lon": lon, "lat": lat}) + "\n")
            self.stats["feature_node_rows"] += 1


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with open(WORK / "buildings_osm.jsonl", "w") as bfh, open(WORK / "features.jsonl", "w") as ffh:
        h = Handler(bfh, ffh)
        h.apply_file(str(PBF), locations=True, idx="flex_mem")
    with open(WORK / "elevators.json", "w") as fh:
        json.dump({str(k): v for k, v in h.elevators.items()}, fh)
    with open(WORK / "kerbs.json", "w") as fh:
        json.dump({str(k): v for k, v in h.kerbs.items()}, fh)
    h.stats.update(elevator_nodes=len(h.elevators), kerb_nodes=len(h.kerbs), seconds=round(time.time() - t0, 1),
                   building_bbox=BUILDING_BBOX)
    with open(WORK / "extract_features_log.json", "w") as fh:
        json.dump(h.stats, fh, indent=1)
    print(json.dumps(h.stats))


if __name__ == "__main__":
    main()
