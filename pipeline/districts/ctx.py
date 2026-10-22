"""Routing-area context for the copied build scripts in pipeline/districts/.

The driver (build.py) sets UC_AREA to an area id from pipeline/areas.json, or to a district id, which then
builds a one-district area (used for alabang-style areas and for the Makati regression test).
An area's graph area is the union of its members' graph boxes, and its building area the union of their
building boxes. GRAPH_BBOX and BUILDING_BBOX behave as [west, south, east, north] envelopes where a script
unpacks or indexes them, and in_bbox() below tests the true union of member boxes.
An area outside Metro Manila comes from pipeline/regions/areas.json or districts.json. Its region in
pipeline/regions/regions.json sets PBF, TO_UTM, TO_LL, OSM_EXTRACT and CROSSING_STREETS. A Metro Manila
area keeps the values from pipeline/common.py and never reads the region files.
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
REGION_AREAS_FILE = HERE.parent / "regions/areas.json"
# Streets whose crossing tags graph_log.json counts. Regions outside Metro Manila set their own.
CROSSING_STREETS = ["Ayala Avenue", "Paseo de Roxas", "Makati Avenue", "Senator Gil J. Puyat Avenue"]


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
        regions = {d.region for d in members}
        if len(regions) > 1:
            sys.exit(f"area {area_id} mixes regions {sorted(regions)}")
        self.region = regions.pop()
        for p in (self.stage, self.work):
            p.mkdir(parents=True, exist_ok=True)


def load_area(key):
    if AREAS_FILE.exists():
        for a in json.load(open(AREAS_FILE))["areas"]:
            if a["id"] == key:
                return Area(a["id"], a["name"], [dcommon.get(m) for m in a["districts"]])
    # A Metro Manila district id never reaches the region files.
    if not any(d.id == key for d in dcommon.load_all()) and REGION_AREAS_FILE.exists():
        for a in json.load(open(REGION_AREAS_FILE))["areas"]:
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
REGION = None  # the region row for an area outside Metro Manila
REGION_TEMPLATE = None  # its block in manifest_template.json

if AREA.region != "ncr":
    from pyproj import Transformer  # noqa: E402

    from regions import region as _region  # noqa: E402

    REGION = _region.get(AREA.region)
    _epsg = _region.utm_epsg(REGION)
    PBF = _region.pbf_path(REGION)
    OSM_EXTRACT = _region.osm_extract_text(REGION)
    TO_UTM = Transformer.from_crs("EPSG:4326", f"EPSG:{_epsg}", always_xy=True)
    TO_LL = Transformer.from_crs(f"EPSG:{_epsg}", "EPSG:4326", always_xy=True)
    CROSSING_STREETS = REGION.get("crossing_streets") or []
    REGION_TEMPLATE = _region.manifest_region(REGION)
    for _d in AREA.members:
        if not _region.inside(_d.building_bbox, REGION["osm_bbox"]):
            sys.exit(f"{_d.id}: building area {_d.building_bbox} is outside region {REGION['id']} "
                     f"box {REGION['osm_bbox']}; widen osm_bbox and cut the PBF again")
    if not PBF.exists():
        sys.exit(f"{PBF} is missing; run pipeline/regions/cut_pbf.py {REGION['id']}")
