"""Routing-area context for the copied build scripts in pipeline/districts/.

The driver (build.py) sets UC_AREA to an area id from pipeline/areas.json, or to a district id, which then
builds a one-district area (used for alabang-style areas and for the Makati regression test).
An area's graph area is the union of its members' graph boxes, and its building area the union of their
building boxes. GRAPH_BBOX and BUILDING_BBOX behave as [west, south, east, north] envelopes where a script
unpacks or indexes them, and in_bbox() below tests the true union of member boxes.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import dcommon  # noqa: E402
from common import (LEVEL_M, OSM_DATE, OSM_EXTRACT, PBF, RESEARCH, ROOT, SCRIPTS, TO_LL, TO_UTM,  # noqa: E402,F401
                    grow_bbox, haversine, parse_height, parse_levels, write_json)
from common import in_bbox as _in_rect  # noqa: E402

AREAS_FILE = HERE.parent / "areas.json"


class Rects(list):
    """A union of [w, s, e, n] boxes. As a list it holds the envelope, so old box code keeps working."""

    def __init__(self, rects):
        self.rects = [list(r) for r in rects]
        super().__init__([min(r[0] for r in rects), min(r[1] for r in rects),
                          max(r[2] for r in rects), max(r[3] for r in rects)])

    def contains(self, lon, lat):
        return any(_in_rect(lon, lat, r) for r in self.rects)


def in_bbox(lon, lat, bbox):
    if isinstance(bbox, Rects):
        return bbox.contains(lon, lat)
    return _in_rect(lon, lat, bbox)


class Area:
    def __init__(self, area_id, name, members):
        self.id, self.name = area_id, name
        self.members = members
        self.pilot = Rects([d.bbox for d in members])
        self.graph = Rects([d.graph_bbox for d in members])
        self.building = Rects([d.building_bbox for d in members])
        self.stage = dcommon.STAGE / area_id
        self.work = dcommon.WORK / area_id
        self.rasters = [d.raw / "gob_2023/building_area_height_presence.tif" for d in members]
        for p in (self.stage, self.work):
            p.mkdir(parents=True, exist_ok=True)


def load_area(key):
    if AREAS_FILE.exists():
        for a in json.load(open(AREAS_FILE))["areas"]:
            if a["id"] == key:
                return Area(a["id"], a["name"], [dcommon.get(m) for m in a["districts"]])
    d = dcommon.get(key)
    return Area(d.id, d.name, [d])


if "UC_AREA" not in os.environ:
    sys.exit("set UC_AREA to an area id from pipeline/areas.json or a district id")
AREA = load_area(os.environ["UC_AREA"])
PILOT_BBOX = AREA.pilot
GRAPH_BBOX = AREA.graph
BUILDING_BBOX = AREA.building
OUT = AREA.stage                        # served files: graph, places, hours, buildings_display
WORK = AREA.work                        # logs and sidecars
RASTERS = AREA.rasters                  # member Google windows on one shared 0.5 m grid
BUILDINGS = AREA.stage / "buildings.geojson"   # full building set for shade, not served
TEMPLATE = AREA.stage / "manifest_template.json"
