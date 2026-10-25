"""Region settings for walking areas outside Metro Manila. Standard library only.

A region gives the OSM extract, the UTM zone and the PAGASA page for its districts.
Districts and areas outside Metro Manila are in pipeline/regions/districts.json and areas.json,
with the same shape as pipeline/districts.json and pipeline/areas.json plus a "region" key.
A district without a region key belongs to ncr. ncr keeps the paths and text in pipeline/common.py,
so nothing here changes a Metro Manila build.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
ROOT = PIPE.parent
REGIONS_FILE = HERE / "regions.json"
DISTRICTS_FILE = HERE / "districts.json"
AREAS_FILE = HERE / "areas.json"
RAW = PIPE / "raw/regions"
OSM_DIR = RAW / "osm"
GOB_MANIFESTS = RAW / "gob_manifests"
CANOPY_TILES = RAW / "canopy_meta"
DEFAULT = "ncr"
SOURCE_PBF = ROOT / "research/20261021T120813Z/raw/05/pbf/philippines-261020.osm.pbf"
SOURCE_MD5 = "941dd405ba4f1c028ca874cde38ea200"
PRSD_URL = "https://www.pagasa.dost.gov.ph/regional-forecast/{}"


def regions():
    return {r["id"]: r for r in json.load(open(REGIONS_FILE))["regions"]}


def get(region_id):
    rows = regions()
    if region_id not in rows:
        raise SystemExit(f"unknown region {region_id}; add it to {REGIONS_FILE}")
    return rows[region_id]


def utm_zone(lon):
    return int((lon + 180) // 6) + 1


def utm_epsg(r):
    """The region's UTM EPSG code. The box must sit in one zone: 32651 east of 120 E, 32650 west of it."""
    w, _, e, _ = r["osm_bbox"]
    zones = {utm_zone(w), utm_zone(e)}
    epsg = r.get("utm_epsg") or 32600 + utm_zone((w + e) / 2)
    if len(zones) > 1:
        raise SystemExit(f"region {r['id']} spans UTM zones {sorted(zones)}; split it at 120 E")
    if epsg != 32600 + zones.pop():
        raise SystemExit(f"region {r['id']}: utm_epsg {epsg} does not match its box")
    return epsg


def pbf_path(r):
    return OSM_DIR / f"{r['id']}.osm.pbf"


def osm_extract_text(r):
    w, s, e, n = r["osm_bbox"]
    return (f"philippines-261020.osm.pbf, md5 {SOURCE_MD5}, clipped to {pbf_path(r).name} with "
            f"osmium extract -b {w:.2f},{s:.2f},{e:.2f},{n:.2f} --strategy complete_ways")


def advisory_url(r):
    return PRSD_URL.format(r["pagasa_prsd"]) if r.get("pagasa_prsd") else None


def manifest_region(r):
    """The region block for an area's manifest template. Only areas outside ncr get one."""
    return {"id": r["id"], "name": r["name"], "advisory_url": advisory_url(r),
            "advisory_provinces": r.get("advisory_provinces") or []}


def district_rows():
    if not DISTRICTS_FILE.exists():
        return []
    return json.load(open(DISTRICTS_FILE))["districts"]


def area_rows():
    if not AREAS_FILE.exists():
        return []
    return json.load(open(AREAS_FILE))["areas"]


def inside(inner, outer):
    return outer[0] <= inner[0] and outer[1] <= inner[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


EPSG_IN_NAME = re.compile(r"_EPSG_(\d+)_")


def manifest_epsg(path):
    m = EPSG_IN_NAME.search(Path(path).name)
    if not m:
        raise SystemExit(f"no EPSG code in manifest name {path}")
    return int(m.group(1))
