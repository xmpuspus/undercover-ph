"""Check one staged area bundle and write its manifest_template.json and summary.json.

Usage: UC_AREA=<id> pipeline/.venv/bin/python -I pipeline/districts/build_manifest.py
Same checks as pipeline/build_manifest.py. The template holds this pipeline's keys, sources and limits
only, in the shape the deploy build expects; the deploy build adds dates, shade and shadow keys.
Exits non-zero when a check fails.
"""
import gzip
import json
import math
import os
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shapely  # noqa: E402

from ctx import (AREA, BUILDING_BBOX, BUILDINGS, GRAPH_BBOX, OSM_EXTRACT, OUT, PILOT_BBOX, REGION_TEMPLATE,  # noqa: E402
                 TEMPLATE, WORK, write_json)
from pedestrian_access import PEDESTRIAN  # noqa: E402

MANILA = timezone(timedelta(hours=8))
SIDES = {"left", "right", "centre"}
SOURCES = {"osm", "osm_levels", "google_2023", "default", None}
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
EDGE_KEYS = ["id", "u", "v", "len_m", "geom", "flags", "routable", "side", "way_id", "name", "landmark",
             "hours_idx", "level"]
ROUTES = Path(__file__).resolve().parent / "routes.json"


def check(failures, ok, msg):
    if not ok:
        failures.append(msg)


def size(path):
    raw = path.read_bytes()
    return {"raw": len(raw), "gzip": len(gzip.compress(raw, 9, mtime=0))}


def neighbourhood_km(edges):
    """Walkable km by member district: an edge counts in the first district whose core box holds its midpoint."""
    out = Counter()
    for e in edges:
        line = shapely.LineString(e["geom"])
        p = line.interpolate(0.5, normalized=True)
        name = next((d.id for d in AREA.members
                     if d.bbox[0] <= p.x <= d.bbox[2] and d.bbox[1] <= p.y <= d.bbox[3]), "margin")
        out[name] += e["len_m"] / 1000
    return {k: round(v, 1) for k, v in out.items()}


def main():
    failures = []
    gz_buildings = BUILDINGS.with_name(BUILDINGS.name + ".gz")
    for path in [OUT / "graph.json", OUT / "places.json", OUT / "hours.json", gz_buildings]:
        check(failures, path.exists(), f"missing {path.name}")
    if failures:
        sys.exit("\n".join(failures))
    graph = json.load(open(OUT / "graph.json"))
    places = json.load(open(OUT / "places.json"))
    hours = json.load(open(OUT / "hours.json"))
    bfc = json.load(gzip.open(gz_buildings))
    glog = json.load(open(WORK / "graph_log.json"))
    plog = json.load(open(WORK / "places_log.json"))
    blog = json.load(open(WORK / "buildings_log.json"))
    hlog = json.load(open(WORK / "hours_log.json"))
    route = json.load(open(WORK / "route_check.json")) if (WORK / "route_check.json").exists() else {}
    highway = json.load(open(WORK / "edge_highway.json"))

    nodes, edges = graph["nodes"], graph["edges"]
    n = len(nodes)
    check(failures, len(highway) == len(edges), "edge_highway.json length differs from edges")
    zero_len = 0
    for i, e in enumerate(edges):
        if list(e) != EDGE_KEYS:
            failures.append(f"edge {i} keys {list(e)}")
            break
        check(failures, e["id"] == i, f"edge {i} id {e['id']}")
        check(failures, 0 <= e["u"] < n and 0 <= e["v"] < n, f"edge {i} u/v outside nodes")
        check(failures, len(e["geom"]) >= 2, f"edge {i} geometry under 2 points")
        check(failures, e["side"] in SIDES, f"edge {i} side {e['side']}")
        check(failures, isinstance(e["routable"], bool), f"edge {i} routable not bool")
        check(failures, e["hours_idx"] is None or 0 <= e["hours_idx"] < len(hours), f"edge {i} hours_idx")
        if e["flags"] & 7:
            check(failures, highway[i] in PEDESTRIAN, f"edge {i} way {e['way_id']} highway={highway[i]} has shelter bits")
        if e["flags"] & 64:
            check(failures, not e["routable"], f"edge {i} needs access evaluation but is routable")
        if e["flags"] & 1024:
            check(failures, not e["flags"] & 7, f"edge {i} has bit 10 and a shelter bit")
        if e["flags"] & 128 and e["hours_idx"] is None:
            check(failures, not e["routable"], f"edge {i} time-restricted without hours but routable")
        zero_len += e["len_m"] <= 0
    nf = graph.get("node_flags")
    check(failures, isinstance(nf, list) and len(nf) == n, "node_flags missing or not one per node")
    check(failures, all(isinstance(x, int) and 0 <= x < 16 for x in nf or []), "node_flags values outside bits 0 to 3")
    routable_nodes = {e[k] for e in edges if e["routable"] for k in ("u", "v")}
    for p in places:
        check(failures, p["node_id"] in routable_nodes, f"place {p['name']} node {p['node_id']} not on a routable edge")
        check(failures, bool(p["name"]) and bool(p["category"]), f"place without name or category {p}")
    for i, h in enumerate(hours):
        check(failures, h.get("source_url", "").startswith("https://") and h.get("checked"), f"hours row {i} uncited")
        check(failures, list(h["rules"]) == DAYS, f"hours row {i} day keys")
        for d, span in h["rules"].items():
            check(failures, span == [] or (len(span) == 2 and span[0] < span[1]), f"hours row {i} {d} {span}")
    bsrc = Counter()
    for f in bfc["features"]:
        p = f["properties"]
        check(failures, f["geometry"]["type"] == "Polygon", "building feature is not a Polygon")
        check(failures, list(p) == ["height_m", "min_height_m", "source", "name"], f"building props {list(p)}")
        check(failures, p["source"] in SOURCES, f"building source {p['source']}")
        check(failures, (p["height_m"] is None) == (p["source"] is None), "null height and null source disagree")
        check(failures, p["height_m"] is None or p["height_m"] > p["min_height_m"] >= 0, f"building heights {p}")
        bsrc[p["source"]] += 1
    pairs = json.load(open(ROUTES)).get(AREA.id, [])
    route_rows = {}
    for a, b in pairs:
        for suffix in ("", " k=8", " k=8 closed"):
            r = route.get(f"{a} -> {b}{suffix}", {})
            route_rows[f"{a} -> {b}{suffix}"] = {k: r.get(k) for k in (
                "from", "to", "length_m", "straight_m", "detour_ratio", "sheltered_m", "sheltered_share",
                "minutes_at_1_1_m_s", "edges")}
        check(failures, route.get(f"{a} -> {b}", {}).get("length_m") is not None, f"{a} to {b} has no routable path")
    check(failures, zero_len == 0, f"{zero_len} edges with zero length")

    limits = make_limits(glog, plog, blog, hlog)
    d0 = date.fromisoformat(os.environ.get("UCPH_START_DATE", "2026-10-21"))
    sources = [
        {"name": "OpenStreetMap", "licence": "ODbL 1.0, (c) OpenStreetMap contributors",
         "url": "https://www.openstreetmap.org/copyright",
         "used_for": "Walk graph, access rules, places, landmarks, building outlines and parts, OSM heights and opening hours. Geofabrik extract dated 2026-10-20."},
        {"name": "Google Open Buildings 2.5D Temporal", "licence": "CC BY 4.0 or ODbL, at the user's choice",
         "url": "https://sites.research.google/gr/open-buildings/temporal/",
         "used_for": "Modelled building heights from 2023 imagery where OSM has no height or levels. Read anonymously from the public GCS tile."},
    ] + [{"name": s["name"], "licence": s["licence"], "url": s["url"], "used_for": s["used_for"]}
         for s in hlog["web_sources_used"]]
    template = {
        "generated_at": datetime.now(MANILA).replace(microsecond=0).isoformat(),
        "osm_extract": OSM_EXTRACT,
        "pilot_bbox": list(PILOT_BBOX), "graph_bbox": list(GRAPH_BBOX), "building_bbox": list(BUILDING_BBOX),
        "timezone": "Asia/Manila",
        "dates": [(d0 + timedelta(days=i)).isoformat() for i in range(7)],
        "buckets_min": list(range(360, 1111, 30)),
        "counts": {"nodes": n, "edges": len(edges), "routable_edges": sum(e["routable"] for e in edges),
                   "buildings": len(bfc["features"]), "places": len(places)},
        "sources": sources,
        "limits": limits,
        "area": {"id": AREA.id, "name": AREA.name,
                 "neighbourhoods": [{"id": d.id, "name": d.name, "cities": d.cities, "bbox": d.bbox,
                                     "graph_bbox": d.graph_bbox} for d in AREA.members]},
        "graph_rects": GRAPH_BBOX.rects,
    }
    if REGION_TEMPLATE:  # areas outside Metro Manila only: fetch_weather.py picks the PAGASA page from it
        template["region"] = REGION_TEMPLATE
    write_json(TEMPLATE, template, indent=1)

    union = shapely.union_all([shapely.box(*r) for r in GRAPH_BBOX.rects])
    area_km2 = union.area * 111.320 * math.cos(math.radians(union.centroid.y)) * 110.574
    summary = {
        "area": AREA.id, "districts": [d.id for d in AREA.members], "checks_passed": not failures,
        "graph_area_km2": round(area_km2, 2),
        "nodes": n, "edges": len(edges), "km": glog["km"], "routable_edges": template["counts"]["routable_edges"],
        "routable_km": glog["routable_km"], "routable_components": glog["routable_components"],
        "largest_component_node_share": glog["largest_component_node_share"],
        "largest_component_km_share": glog["largest_component_km_share"],
        "sheltered_km": glog["sheltered_km"], "sheltered_routable_km": glog["sheltered_routable_km"],
        "inside_footprint_edges": glog["inside_footprint_edges"], "inside_footprint_km": glog["inside_footprint_km"],
        "indoor_opened_by_hours_edges": glog["indoor_opened_by_hours_edges"],
        "buildings_features": len(bfc["features"]), "buildings_by_source": {str(k): v for k, v in bsrc.items()},
        "places": len(places), "places_by_category": plog["by_category"],
        "places_dropped_over_80m": plog["dropped_over_80m"], "hours_rows": len(hours),
        "hours_web_rows": hlog["web_rows"], "walkable_km_by_neighbourhood": neighbourhood_km(edges),
        "routes": route_rows, "route_pairs_configured": len(pairs),
        "node_flag_counts": glog["node_flag_counts"],
        "sizes": {p.name: size(p) for p in [OUT / "graph.json", OUT / "places.json", OUT / "hours.json",
                                           OUT / "buildings_display.geojson", TEMPLATE] if p.exists()}
                 | {gz_buildings.name: {"gzip": gz_buildings.stat().st_size}},
        "failures": failures[:50],
    }
    write_json(WORK / "summary.json", summary, indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k not in ("routes", "places_by_category")}, indent=1))
    if failures:
        print("CHECKS FAILED:\n" + "\n".join(failures[:50]))
        sys.exit(1)


def make_limits(g, p, b, h):
    km = lambda k: g["eval_only_cause_km"].get(k, 0.0)  # noqa: E731
    ed = lambda k: g["eval_only_cause_edges"].get(k, 0)  # noqa: E731
    gate_km = sum(v for k, v in g["eval_only_cause_km"].items() if "gate" in k)
    gate_ed = sum(v for k, v in g["eval_only_cause_edges"].items() if "gate" in k)
    bsrc = b["objects_by_source"]
    lv = g["class_default_lanes"]
    indoor = g["flag_edges"]["indoor"]
    n_unparsed = len(h["osm_unparsed"])
    notes = [n for s in h["web_sources_used"] for n in s["notes"]]
    return [
        f"Edges with unchecked access rules are not routable by default. That removes {g['unroutable_edges']} of {g['edges']} edges, or {g['unroutable_km']:.1f} km.",
        f"The largest routable network holds {100 * g['largest_component_node_share']:.1f}% of routable nodes and {100 * g['largest_component_km_share']:.1f}% of routable length.",
        f"Kerbs do not trigger an access check. {sum(g['raised_kerb_steps_edges'].values())} edges that cross a raised kerb carry the steps flag, so step-free routes avoid them.",
        f"Gates alone remove {gate_ed} edges and {gate_km:.1f} km. Village and estate gates need a field check.",
        "Only access, foot and opening-hours rules restrict walkers. Vehicle-only conditional tags, such as a Sunday car-free rule, do not.",
        f"Indoor corridors and building passages without cited hours stay unroutable. They remove {ed('way_controlled_passage')} edges and {km('way_controlled_passage'):.1f} km.",
        f"The graph leaves out {g['ways_omitted_blocked_node']} whole ways, {g['km_omitted_blocked_node']:.1f} km, that touch an explicitly closed node.",
        f"{g['indoor_opened_by_hours_edges']} indoor edges with cited mall hours are routable. The router opens and closes them by those hours.",
        f"The routable graph has {g['sheltered_routable_km']:.2f} km of roofed, tunnel or indoor walkway in {g['sheltered_routable_edges']} edges.",
        f"OSM maps {indoor} indoor, corridor or passage edges here. {sum(g['hours_idx_edges'].values())} of them carry mall hours.",
        "Some plain footways run through mall footprints without indoor tags. They stay routable at all hours.",
        f"{g['inside_footprint_edges']} unsheltered edges, {g['inside_footprint_km']:.1f} km, run mostly inside a building footprint with no cover tag.",
        "Those edges carry flag 1024, inside a footprint with cover unverified. They get no shelter flag, and their shade counts as low confidence.",
        "The graph keeps each whole way that has a node in the graph area. "
        f"Some edges reach {g['max_node_distance_outside_graph_bbox_m']:.0f} m past it.",
        "A road side edge starts half the carriageway width plus 1 m from the road centreline.",
        "The offset shrinks in 0.5 m steps, down to 1.5 m, until no 1 m sample sits inside a ground-level footprint.",
        f"{g['side_edges_moved_closer']} side edges moved closer to the road. {sum(g['side_fallback_sides'].values())} sides still inside a footprint at 1.5 m became {g['side_fallback_centre_edges']} centre edges.",
        "Carriageway width comes from the width tag, else lanes x 3.2 m, else the median lane count for that road class.",
        f"The class medians are {lv.get('primary', 2.0):g} lanes for primary, {lv.get('secondary', 2.0):g} for secondary and {lv.get('tertiary', 2.0):g} for tertiary roads.",
        f"Side offsets run from {g['side_offset_m']['min']:.1f} m to {g['side_offset_m']['max']:.1f} m, with a median of {g['side_offset_m']['median']:.1f} m.",
        "A road tagged with a sidewalk on one side gets one side edge. Roads tagged sidewalk=no or separate keep a centre edge.",
        "Tertiary and larger roads with no sidewalk tag get two side edges without the sidewalk flag.",
        "Both side edges share the road's nodes. Node flags mark crossings, signals, junctions and grade-separated links.",
        "Side edge geometry starts and ends at the offset line, a few metres from its nodes.",
        "The offset ignores real kerb lines. A dual carriageway can get a side edge on its median.",
        f"Places snap to the largest routable network within 80 m when possible. {p['places_on_small_components']} places still sit on small islands.",
        f"{p['dropped_over_80m']} named places lie more than 80 m from a routable node, so the app omits them.",
    ] + notes + [
        (f"OSM opening hours that the simple parser cannot read are skipped. {n_unparsed} value was skipped." if n_unparsed == 1
         else f"OSM opening hours that the simple parser cannot read are skipped. {n_unparsed} values were skipped."),
        "Building heights come from OSM height, else OSM levels x 3.74 m, else the Google 2023 median, else a 7.5 m default.",
        f"Google fills {bsrc.get('google_2023', 0)} OSM building objects with modelled 2023 heights. Google heights stop near 100 m.",
        f"{bsrc.get('default', 0)} OSM building objects over 100 m2 use a 7.5 m default, two levels of 3.74 m. Their shade counts as low confidence.",
        "Each default replaces a Google median under 2.5 m. The default errs low, so a taller real building casts more shade than shown.",
        (f"{b['null_height_objects']} OSM building objects of 100 m2 or less have no usable height. Their height is null."
         if not b["min_height_ge_height"] else
         f"{b['null_height_objects']} OSM building objects of 100 m2 or less, and {b['min_height_ge_height']} with a roof at or below their base, have null heights."),
        f"Each building part is its own feature. {b['outlines_dropped_parts_cover_ge_90pct']} OSM outlines that parts fully cover are left out.",
        "An outline's Google median uses only the area outside its parts, so a tower does not raise its podium.",
        f"Google medians use no presence mask. A mask would change {100 * b['presence_mask_check']['share_diff_over_5m']:.1f}% of them by more than 5 m.",
    ]


if __name__ == "__main__":
    main()
