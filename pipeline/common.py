"""Shared constants and helpers for the undercover-ph graph pipeline."""
import json
import math
import re
import sys
from pathlib import Path

from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research/20261021T120813Z"
SCRIPTS = RESEARCH / "scripts"
PBF = RESEARCH / "raw/shared/ncr.osm.pbf"
OUT = ROOT / "app/public/data"
WORK = ROOT / "pipeline/work"
RAW = ROOT / "pipeline/raw"
# Full building set: a pipeline input for the graph and shade steps. The app does not serve it.
BUILDINGS = ROOT / "pipeline/inputs/buildings.geojson"

# The research access policy and the corrected classifier are imported, never copied.
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS / "05"))

OSM_EXTRACT = ("philippines-261020.osm.pbf, md5 941dd405ba4f1c028ca874cde38ea200, "
               "clipped to ncr.osm.pbf with osmium extract -b 120.90,14.35,121.20,14.80")
OSM_DATE = "2026-10-20"
LEVEL_M = 3.74  # report 02: median height / building:levels on 278 Makati outlines

# [west, south, east, north]
PILOT_BBOX = [121.012, 14.548, 121.032, 14.562]
GRAPH_BBOX = [121.0074, 14.5435, 121.0366, 14.5665]
BUILDING_MARGIN_M = 800.0

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32651", always_xy=True)
TO_LL = Transformer.from_crs("EPSG:32651", "EPSG:4326", always_xy=True)


def grow_bbox(bbox, metres):
    w, s, e, n = bbox
    lat0 = math.radians((s + n) / 2)
    dlat = metres / 110574.0
    dlon = metres / (111320.0 * math.cos(lat0))
    # Round outward to 4 decimals so the box still covers the full margin.
    return [math.floor((w - dlon) * 1e4) / 1e4, math.floor((s - dlat) * 1e4) / 1e4,
            math.ceil((e + dlon) * 1e4) / 1e4, math.ceil((n + dlat) * 1e4) / 1e4]


BUILDING_BBOX = grow_bbox(GRAPH_BBOX, BUILDING_MARGIN_M)


def in_bbox(lon, lat, bbox):
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def haversine(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


NUM = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*(m|meters|metres|ft|')?\s*$", re.I)


def parse_height(v):
    """Metres from an OSM height-like value, else None (same rule as report 02)."""
    m = NUM.match(v or "")
    if not m:
        return None
    x = float(m.group(1).replace(",", "."))
    if (m.group(2) or "").lower() in ("ft", "'"):
        x *= 0.3048
    return x if 0 < x <= 400 else None


def parse_levels(v, upper=120):
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*$", v or "")
    x = float(m.group(1)) if m else None
    return x if x is not None and 0 <= x <= upper else None


def write_json(path, obj, indent=None):
    path = Path(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as fh:
        json.dump(obj, fh, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":"))
    tmp.replace(path)
