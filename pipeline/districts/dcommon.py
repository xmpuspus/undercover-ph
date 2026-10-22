"""District configuration and paths for the multi-district build.

Each district in pipeline/districts.json has a core bbox. The graph area adds 500 m on each side,
rounded to the nearest 4 decimals (this reproduces the Makati contract box exactly). The building
area adds 800 m more, rounded outward.
"""
import json
import math
import sys
from pathlib import Path

PIPE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPE))
from common import ROOT, grow_bbox  # noqa: E402

DISTRICTS_FILE = PIPE / "districts.json"
RAW = PIPE / "raw/districts"
STAGE = PIPE / "stage"
WORK = PIPE / "work/districts"
GRAPH_MARGIN_M = 500.0
BUILDING_MARGIN_M = 800.0


def grow_nearest(bbox, metres):
    w, s, e, n = bbox
    lat0 = math.radians((s + n) / 2)
    dlat = metres / 110574.0
    dlon = metres / (111320.0 * math.cos(lat0))
    return [round(w - dlon, 4), round(s - dlat, 4), round(e + dlon, 4), round(n + dlat, 4)]


class District:
    def __init__(self, row):
        self.id = row["id"]
        self.name = row["name"]
        self.cities = row["cities"]
        self.wave = row["wave"]
        self.bbox = row["bbox"]
        # Districts outside Metro Manila name a region in pipeline/regions/districts.json.
        self.region = row.get("region", "ncr")
        self.graph_bbox = grow_nearest(self.bbox, GRAPH_MARGIN_M)
        self.building_bbox = grow_bbox(self.graph_bbox, BUILDING_MARGIN_M)
        self.raw = RAW / self.id
        self.stage = STAGE / self.id
        self.work = WORK / self.id

    def center(self):
        w, s, e, n = self.bbox
        return [round((w + e) / 2, 5), round((s + n) / 2, 5)]

    def dirs(self):
        for d in (self.stage, self.work):
            d.mkdir(parents=True, exist_ok=True)
        return self


def load_all():
    rows = json.load(open(DISTRICTS_FILE))["districts"]
    return [District(r) for r in sorted(rows, key=lambda r: r["wave"])]


def load_region_districts():
    """Districts outside Metro Manila, from pipeline/regions/districts.json. load_all() leaves them out."""
    path = PIPE / "regions/districts.json"
    if not path.exists():
        return []
    rows = json.load(open(path))["districts"]
    return [District(r) for r in sorted(rows, key=lambda r: r["wave"])]


def get(district_id):
    for d in load_all():
        if d.id == district_id:
            return d
    for d in load_region_districts():
        if d.id == district_id:
            return d
    sys.exit(f"unknown district {district_id}")


__all__ = ["ROOT", "District", "load_all", "get", "RAW", "STAGE", "WORK"]
