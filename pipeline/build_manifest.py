"""Check the five graph-side files, write manifest.json, and write READY.graph only when every check passes.

Usage: pipeline/.venv/bin/python -I pipeline/build_manifest.py
Keeps keys, sources and limits that other builders add (sun, sunrise_sunset, shade) when manifest.json exists.
When every check passes, it also writes pipeline/inputs/manifest_template.json with only this script's keys,
sources and limits. The deploy build starts each manifest from that template (pipeline/set_dates.py).
"""
import json
import os
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (BUILDING_BBOX, BUILDINGS, GRAPH_BBOX, OSM_EXTRACT, OUT, PILOT_BBOX, ROOT, WORK,  # noqa: E402
                    write_json)
from pedestrian_access import PEDESTRIAN  # noqa: E402

MANILA = timezone(timedelta(hours=8))
SIDES = {"left", "right", "centre"}
SOURCES = {"osm", "osm_levels", "google_2023", "default", None}
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
EDGE_KEYS = ["id", "u", "v", "len_m", "geom", "flags", "routable", "side", "way_id", "name", "landmark",
             "hours_idx", "level"]
MY_SOURCES = {"OpenStreetMap", "Google Open Buildings 2.5D Temporal", "The Beat Asia, Ayala Center malls guide"}
TEMPLATE = ROOT / "pipeline/inputs/manifest_template.json"
TEMPLATE_KEYS = ["generated_at", "osm_extract", "pilot_bbox", "graph_bbox", "building_bbox", "timezone", "dates",
                 "buckets_min", "counts", "sources", "limits"]


def check(failures, ok, msg):
    if not ok:
        failures.append(msg)


def main():
    failures = []
    for path in [OUT / "graph.json", OUT / "places.json", OUT / "hours.json", BUILDINGS]:
        check(failures, path.exists(), f"missing {path.name}")
    if failures:
        sys.exit("\n".join(failures))
    graph = json.load(open(OUT / "graph.json"))
    places = json.load(open(OUT / "places.json"))
    hours = json.load(open(OUT / "hours.json"))
    bfc = json.load(open(BUILDINGS))
    glog = json.load(open(WORK / "graph_log.json"))
    plog = json.load(open(WORK / "places_log.json"))
    blog = json.load(open(WORK / "buildings_log.json"))
    hlog = json.load(open(WORK / "hours_log.json"))
    route = json.load(open(WORK / "route_check.json"))
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
    rc = route.get("Ayala MRT -> Greenbelt", {})
    check(failures, rc.get("length_m") is not None, "Ayala MRT to Greenbelt has no routable path")
    check(failures, zero_len == 0, f"{zero_len} edges with zero length")

    limits = make_limits(glog, plog, blog, hlog)
    manifest_path = OUT / "manifest.json"
    manifest = json.load(open(manifest_path)) if manifest_path.exists() else {}
    d0 = date.fromisoformat(os.environ.get("UCPH_START_DATE", "2026-10-21"))  # first of 7 shade dates
    manifest.update({
        "generated_at": datetime.now(MANILA).replace(microsecond=0).isoformat(),
        "osm_extract": OSM_EXTRACT,
        "pilot_bbox": PILOT_BBOX, "graph_bbox": GRAPH_BBOX, "building_bbox": BUILDING_BBOX,
        "timezone": "Asia/Manila",
        "dates": [(d0 + timedelta(days=i)).isoformat() for i in range(7)],
        "buckets_min": list(range(360, 1111, 30)),
        "counts": {"nodes": n, "edges": len(edges), "routable_edges": sum(e["routable"] for e in edges),
                   "buildings": len(bfc["features"]), "places": len(places)},
    })
    others = [s for s in manifest.get("sources", []) if s.get("name") not in MY_SOURCES]
    manifest["sources"] = [
        {"name": "OpenStreetMap", "licence": "ODbL 1.0, (c) OpenStreetMap contributors",
         "url": "https://www.openstreetmap.org/copyright",
         "used_for": "Walk graph, access rules, places, landmarks, building outlines and parts, OSM heights and opening hours. Geofabrik extract dated 2026-10-20."},
        {"name": "Google Open Buildings 2.5D Temporal", "licence": "CC BY 4.0 or ODbL, at the user's choice",
         "url": "https://sites.research.google/gr/open-buildings/temporal/",
         "used_for": "Modelled building heights from 2023 imagery where OSM has no height or levels. Read anonymously from the public GCS tile."},
        {"name": "The Beat Asia, Ayala Center malls guide", "licence": "Publisher copyright. Opening hours used as cited facts.",
         "url": "https://thebeat.asia/manila/nomads/explore/ayala-center-malls-guide",
         "used_for": "Mall hours for Glorietta, Greenbelt 3 to 5, One Ayala, The Landmark and SM Makati. Guide dated 2026-02-24, re-read 2026-10-22."},
    ] + others
    # Keep limits that other builders (the shade builder) appended. Only this script's own lines are replaced.
    mine_path = WORK / "graph_limits.json"
    prev_mine = set(json.load(open(mine_path))) if mine_path.exists() else set()
    kept = [x for x in manifest.get("limits", []) if x not in prev_mine and x not in limits]
    manifest["limits"] = limits + kept
    write_json(mine_path, limits, indent=1)
    write_json(manifest_path, manifest, indent=1)

    summary = {
        "nodes": n, "edges": len(edges), "routable_edges": manifest["counts"]["routable_edges"],
        "routable_km": glog["routable_km"], "largest_component_node_share": glog["largest_component_node_share"],
        "largest_component_km_share": glog["largest_component_km_share"],
        "buildings_by_source": {str(k): v for k, v in bsrc.items()},
        "places_by_category": plog["by_category"], "places_dropped_over_80m": plog["dropped_over_80m"],
        "hours_rows": len(hours), "ayala_mrt_to_greenbelt_m": rc.get("length_m"),
        "ayala_mrt_to_greenbelt_sheltered_m": rc.get("sheltered_m"),
        "ayala_mrt_to_greenbelt_k8": {k: route.get("Ayala MRT -> Greenbelt k=8", {}).get(k)
                                      for k in ("length_m", "sheltered_m", "sheltered_share", "minutes_at_1_1_m_s")},
        "sheltered_routable_km": glog["sheltered_routable_km"], "sheltered_km": glog["sheltered_km"],
    }
    print(json.dumps(summary, indent=1))
    ready = OUT / "READY.graph"
    if failures:
        if ready.exists():
            ready.unlink()
        print("CHECKS FAILED:\n" + "\n".join(failures[:50]))
        sys.exit(1)
    ready.write_text(f"{manifest['generated_at']} nodes={n} edges={len(edges)} "
                     f"routable_edges={summary['routable_edges']} buildings={len(bfc['features'])} "
                     f"places={len(places)} hours={len(hours)} node_flags=1\n")
    print("READY.graph written")
    template = {k: manifest[k] for k in TEMPLATE_KEYS}
    template["sources"] = [s for s in manifest["sources"] if s.get("name") in MY_SOURCES]
    template["limits"] = limits
    write_json(TEMPLATE, template, indent=1)
    print(f"{TEMPLATE.name} written")


def make_limits(g, p, b, h):
    km = lambda k: g["eval_only_cause_km"].get(k, 0.0)  # noqa: E731
    ed = lambda k: g["eval_only_cause_edges"].get(k, 0)  # noqa: E731
    gate_km = sum(v for k, v in g["eval_only_cause_km"].items() if "gate" in k)
    gate_ed = sum(v for k, v in g["eval_only_cause_edges"].items() if "gate" in k)
    bsrc = b["objects_by_source"]
    lv = g["class_default_lanes"]
    return [
        f"Edges with unchecked access rules are not routable by default. That removes {g['unroutable_edges']} of {g['edges']} edges, or {g['unroutable_km']:.1f} km.",
        f"The largest routable network holds {100 * g['largest_component_node_share']:.1f}% of routable nodes and {100 * g['largest_component_km_share']:.1f}% of routable length.",
        f"Kerbs do not trigger an access check. {sum(g['raised_kerb_steps_edges'].values())} edges that cross a raised kerb carry the steps flag, so step-free routes avoid them.",
        f"Gates alone remove {gate_ed} edges and {gate_km:.1f} km. Village and estate gates need a field check.",
        "Only access, foot and opening-hours rules restrict walkers. Vehicle-only conditional tags, such as Ayala Avenue's Sunday car-free rule, do not.",
        f"Indoor corridors and building passages without cited hours stay unroutable. They remove {ed('way_controlled_passage')} edges and {km('way_controlled_passage'):.1f} km.",
        f"The graph leaves out {g['ways_omitted_blocked_node']} whole ways, {g['km_omitted_blocked_node']:.1f} km, that touch an explicitly closed node.",
        f"{g['indoor_opened_by_hours_edges']} indoor edges with cited mall hours are routable. The router opens and closes them by those hours.",
        f"The routable graph has {g['sheltered_routable_km']:.2f} km of roofed, tunnel or indoor walkway in {g['sheltered_routable_edges']} edges.",
        f"OSM maps indoor corridors at One Ayala, two rail stations and two office towers. Only {sum(g['hours_idx_edges'].values())} edges carry mall hours.",
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
        "Both side edges share the road's nodes, so a route can change sides at any node, not only at a crossing.",
        "Side edge geometry starts and ends at the offset line, a few metres from its nodes.",
        "The offset ignores real kerb lines. A dual carriageway can get a side edge on its median.",
        f"Places snap to the largest routable network within 80 m when possible. {p['places_on_small_components']} places still sit on small islands.",
        f"{p['dropped_over_80m']} named places lie more than 80 m from a routable node, so the app omits them.",
        "Mall hours come from a guide dated 2026-02-24. The guide warns that hours can change.",
        "The guide says Greenbelt 1 and 2 are closed for renovation until 2028, so they get no hours.",
        "OSM gives Glorietta shorter Friday and Saturday hours than the guide. The guide hours apply to edges.",
        f"OSM opening hours that the simple parser cannot read are skipped. {len(h['osm_unparsed'])} value was skipped.",
        "Building heights come from OSM height, else OSM levels x 3.74 m, else the Google 2023 median, else a 7.5 m default.",
        f"Google fills {bsrc.get('google_2023', 0)} OSM building objects with modelled 2023 heights. Google heights stop near 100 m.",
        f"{bsrc.get('default', 0)} OSM building objects over 100 m2 use a 7.5 m default, two levels of 3.74 m. Their shade counts as low confidence.",
        "Each default replaces a Google median under 2.5 m. The default errs low, so a taller real building casts more shade than shown.",
        f"{bsrc.get('None', 0)} OSM building objects of 100 m2 or less have no usable height. Their height is null.",
        f"Each building part is its own feature. {b['outlines_dropped_parts_cover_ge_90pct']} OSM outlines that parts fully cover are left out.",
        "An outline's Google median uses only the area outside its parts, so a tower does not raise its podium.",
        f"Google medians use no presence mask. A mask would change {100 * b['presence_mask_check']['share_diff_over_5m']:.1f}% of them by more than 5 m.",
    ]


if __name__ == "__main__":
    main()
