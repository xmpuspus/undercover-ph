"""Read the Geofabrik PH extract once and cache walkable ways and tagged nodes for the NCR box.

Usage: scripts/05/venv/bin/python -I extract_ped.py <pbf> <out_pickle>
The shared static public-through profile produces research candidates, not verified routes.
"""

import pickle
import sys
import time
from pathlib import Path

import osmium

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pedestrian_access import PROFILE, node_blocks_public, read_node_rules, rule_tags, static_public_walkable

NCR = (14.35, 120.90, 14.80, 121.20)  # south, west, north, east
NODE_KEYS = ["highway", "wheelchair", "ramp", "ramp:wheelchair", "incline", "kerb", "tactile_paving"]
WAY_KEEP = [
    "highway", "footway", "sidewalk", "sidewalk:left", "sidewalk:right", "sidewalk:both",
    "bridge", "tunnel", "covered", "layer", "wheelchair", "ramp", "ramp:wheelchair", "incline",
    "kerb", "tactile_paving", "foot", "service", "area", "oneway", "indoor", "level",
]


def walkable(tags):
    return static_public_walkable(tags)


def main(pbf, out):
    t0 = time.time()
    ways = []
    nodes = []
    bad = 0
    seen_ways = 0
    rules = read_node_rules(pbf)
    blocked = {nid for nid, (_, _, tags) in rules.items() if node_blocks_public(tags)}
    blocked_ways = 0
    fp = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.KeyFilter(*NODE_KEYS))
    )
    for o in fp:
        if o.is_node():
            if not o.location.valid():
                continue
            lat, lon = o.location.lat, o.location.lon
            if not (NCR[0] <= lat <= NCR[2] and NCR[1] <= lon <= NCR[3]):
                continue
            tg = {k: v for k, v in o.tags if k in NODE_KEYS or k.startswith("ramp")}
            nodes.append((o.id, lat, lon, tg))
        else:
            tg = dict(o.tags)
            if "highway" not in tg:
                continue
            seen_ways += 1
            if not walkable(tg):
                continue
            try:
                pts = [(n.ref, n.lat, n.lon) for n in o.nodes]
            except osmium.InvalidLocationError:
                bad += 1
                continue
            if len(pts) < 2:
                continue
            if any(p[0] in blocked for p in pts):
                blocked_ways += 1
                continue
            lats = [p[1] for p in pts]
            lons = [p[2] for p in pts]
            if max(lats) < NCR[0] or min(lats) > NCR[2] or max(lons) < NCR[1] or min(lons) > NCR[3]:
                continue
            keep = {k: v for k, v in tg.items() if k in WAY_KEEP or k.startswith("ramp")}
            keep.update(rule_tags(tg))
            ways.append((o.id, o.timestamp.timestamp(), keep, pts))
    by_id = {row[0]: row for row in nodes}
    for nid, (lat, lon, tags) in rules.items():
        if NCR[0] <= lat <= NCR[2] and NCR[1] <= lon <= NCR[3]:
            merged = {**(by_id[nid][3] if nid in by_id else {}), **tags}
            by_id[nid] = (nid, lat, lon, merged)
    nodes = list(by_id.values())
    pickle.dump({"ways": ways, "nodes": nodes, "bad_loc": bad, "highway_ways_seen": seen_ways,
                 "access_profile": PROFILE, "routing_ready": False,
                 "ways_excluded_by_blocked_node": blocked_ways}, open(out, "wb"))
    print("ways", len(ways), "nodes", len(nodes), "bad_loc", bad, "highway_ways_seen", seen_ways, "sec", round(time.time() - t0))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
