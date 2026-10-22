"""Build a simplified walking graph for NCR and two pilot boxes from a Geofabrik PBF.

Usage: venv/bin/python -I extract_walk_graph.py <pbf> <ncr_geojson_json> <out_dir>

The shared static public-through profile builds research candidates. Graph nodes are way ends plus
nodes shared by two or more walkable ways. Edges are way pieces between graph nodes.
Outputs counts (JSON) and compact edge lists (npz) for the size and speed tests.
"""

import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import osmium
from shapely.geometry import Point, box, shape
from shapely.prepared import prep

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pedestrian_access import (PEDESTRIAN, PROFILE, node_blocks_public, read_node_rules,
                               requires_access_evaluation, rule_tags, static_public_walkable)
FLAG_BITS = {
    "covered_or_tunnel": 1,
    "indoor_or_corridor": 2,
    "foot_bridge": 4,
    "time_restricted": 8,
    "steps": 16,
    "sidewalk": 32,
    "access_evaluation_needed": 64,
}
BOXES = {
    "makati_cbd": (14.548, 121.012, 14.562, 121.032),
    "sampaloc": (14.600, 120.985, 14.614, 121.005),
}


def walkable(tags):
    return static_public_walkable(tags)


def haversine(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def area_km2(geom):
    lat0 = math.radians(geom.centroid.y)
    kx, ky = 111.320 * math.cos(lat0), 110.574
    from shapely.affinity import scale

    return scale(geom, xfact=kx, yfact=ky, origin=(0, 0)).area


def classify(tags):
    """Return the shelter or time flags a router needs from OSM tags."""
    hw = tags.get("highway", "")
    flags = []
    if hw in PEDESTRIAN and (tags.get("covered") in ("yes", "arcade", "colonnade", "roof") or tags.get("tunnel") in (
        "yes",
        "building_passage",
    )):
        flags.append("covered_or_tunnel")
    if hw in PEDESTRIAN and (tags.get("indoor") in ("yes", "corridor") or hw == "corridor"):
        flags.append("indoor_or_corridor")
    if tags.get("bridge") == "yes" and hw in ("footway", "path", "pedestrian"):
        flags.append("foot_bridge")
    if "opening_hours" in tags or any(k.endswith(":conditional") for k in tags):
        flags.append("time_restricted")
    if hw == "steps":
        flags.append("steps")
    if tags.get("footway") == "sidewalk":
        flags.append("sidewalk")
    if requires_access_evaluation(tags):
        flags.append("access_evaluation_needed")
    return flags


def main(pbf, ncr_json, out_dir):
    ncr = shape(json.load(open(ncr_json))[0]["geojson"])
    ncr_p = prep(ncr)
    minx, miny, maxx, maxy = ncr.bounds
    box_geoms = {k: box(b[1], b[0], b[3], b[2]) for k, b in BOXES.items()}
    nodes = read_node_rules(pbf)
    blocked = {nid for nid, (_, _, tags) in nodes.items() if node_blocks_public(tags)}
    blocked_ways = 0

    ways = []  # (node_ids, lats, lons, flags, highway)
    bad_loc = 0
    fp = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter("highway"))
    )
    for w in fp:
        tags = dict(w.tags)
        if not walkable(tags):
            continue
        try:
            ids = [n.ref for n in w.nodes]
            lats = [n.lat for n in w.nodes]
            lons = [n.lon for n in w.nodes]
        except osmium.InvalidLocationError:
            bad_loc += 1
            continue
        if len(ids) < 2:
            continue
        if any(nid in blocked for nid in ids):
            blocked_ways += 1
            continue
        clat, clon = sum(lats) / len(lats), sum(lons) / len(lons)
        if not (miny <= clat <= maxy and minx <= clon <= maxx):
            continue
        if not ncr_p.contains(Point(clon, clat)):
            continue
        flags = classify(tags)
        if any(requires_access_evaluation(nodes[nid][2]) for nid in ids if nid in nodes):
            if "access_evaluation_needed" not in flags:
                flags.append("access_evaluation_needed")
        ways.append((ids, lats, lons, flags, tags.get("highway"), clat, clon, w.id, rule_tags(tags)))

    use = Counter()
    for ids, *_ in ways:
        use.update(set(ids))
        use[ids[0]] += 1
        use[ids[-1]] += 1

    regions = {"ncr": lambda la, lo: True}
    for k, g in box_geoms.items():
        regions[k] = lambda la, lo, g=g: g.contains(Point(lo, la))

    result = {"ways_scanned_bad_locations": bad_loc, "access_profile": PROFILE,
              "routing_ready": False, "ways_excluded_by_blocked_node": blocked_ways, "regions": {}}
    for name, inside in regions.items():
        node_index = {}
        src, dst, length, n_shape, eflags = [], [], [], [], []
        way_ids, needs_eval = [], []
        way_rules = {}
        region_node_ids = set()
        node_lat, node_lon = [], []
        flag_len = Counter()
        hw_len = Counter()
        n_ways = 0
        for ids, lats, lons, flags, hw, clat, clon, wid, rules in ways:
            if not inside(clat, clon):
                continue
            n_ways += 1
            way_rules[str(wid)] = rules
            region_node_ids.update(ids)
            bits = sum(FLAG_BITS[f] for f in flags)
            start = 0
            seg_len = 0.0
            way_len = 0.0
            for i in range(1, len(ids)):
                d = haversine(lats[i - 1], lons[i - 1], lats[i], lons[i])
                seg_len += d
                way_len += d
                if use[ids[i]] >= 2 or i == len(ids) - 1:
                    for j in (start, i):
                        if ids[j] not in node_index:
                            node_index[ids[j]] = len(node_lat)
                            node_lat.append(lats[j])
                            node_lon.append(lons[j])
                    src.append(node_index[ids[start]])
                    dst.append(node_index[ids[i]])
                    length.append(seg_len)
                    n_shape.append(i - start - 1)
                    eflags.append(bits)
                    way_ids.append(wid)
                    needs_eval.append("access_evaluation_needed" in flags)
                    start, seg_len = i, 0.0
            for f in flags:
                flag_len[f] += way_len
            hw_len[hw] += way_len
        total_len = float(sum(length))
        geom_area = area_km2(ncr) if name == "ncr" else area_km2(box_geoms[name])
        result["regions"][name] = {
            "area_km2": round(geom_area, 2),
            "ways": n_ways,
            "graph_nodes": len(node_lat),
            "undirected_edges": len(src),
            "directed_edges": 2 * len(src),
            "edges_requiring_access_evaluation": sum(needs_eval),
            "shape_points_inside_edges": int(sum(n_shape)),
            "total_length_km": round(total_len / 1000, 1),
            "mean_edge_m": round(total_len / max(1, len(src)), 1),
            "edges_per_km2": round(len(src) / geom_area, 0),
            "flag_length_km": {k: round(v / 1000, 2) for k, v in flag_len.most_common()},
            "highway_length_km_top": {k: round(v / 1000, 1) for k, v in hw_len.most_common(12)},
        }
        np.savez_compressed(
            f"{out_dir}/graph_{name}.npz",
            src=np.array(src, dtype=np.uint32),
            dst=np.array(dst, dtype=np.uint32),
            length=np.array(length, dtype=np.float32),
            lat=np.array(node_lat, dtype=np.float64),
            lon=np.array(node_lon, dtype=np.float64),
            n_shape=np.array(n_shape, dtype=np.uint32),
            flags=np.array(eflags, dtype=np.uint8),
            way_id=np.array(way_ids, dtype=np.int64),
            osm_node_id=np.array(list(node_index), dtype=np.int64),
            requires_access_evaluation=np.array(needs_eval, dtype=np.bool_),
        )
        retained_nodes = {str(nid): tags for nid, (lat, lon, tags) in nodes.items()
                          if (inside(lat, lon) and ncr_p.contains(Point(lon, lat))) or nid in region_node_ids}
        with open(f"{out_dir}/graph_{name}_rules.json", "w") as fh:
            json.dump({"access_profile": PROFILE, "routing_ready": False,
                       "note": "Static candidates. Evaluate retained rules before routing. Whole ways touching explicitly blocked nodes were omitted.",
                       "ways": way_rules, "nodes": retained_nodes}, fh, indent=1)
        print(name, json.dumps(result["regions"][name]), flush=True)
    json.dump(result, open(f"{out_dir}/graph_counts.json", "w"), indent=2)


if __name__ == "__main__":
    main(*sys.argv[1:4])
