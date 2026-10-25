"""Write places.json: named OSM features in the graph area, snapped to the nearest routable node.

Usage: pipeline/.venv/bin/python -I pipeline/build_places.py
Reads pipeline/work/features.jsonl and app/public/data/graph.json.
Writes app/public/data/places.json and pipeline/work/places_log.json.
A place is dropped when no routable node lies within 80 m of its point or polygon. Within 80 m, a node in
the largest routable component wins over a closer node on a small island, so the place stays reachable.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import shapely  # noqa: E402
from scipy.sparse import coo_matrix  # noqa: E402
from scipy.sparse.csgraph import connected_components  # noqa: E402
from shapely.strtree import STRtree  # noqa: E402

from common import GRAPH_BBOX, OUT, TO_UTM, WORK, in_bbox, write_json  # noqa: E402

SNAP_MAX_M = 80.0
DEDUPE_M = 150.0
PRIORITY = ["station", "bus_station", "mall", "store", "hotel", "hospital", "school", "place_of_worship", "museum",
            "park", "plaza", "landmark", "embassy", "office", "residential", "shopping_area", "building",
            "neighbourhood"]
ALIAS_KEYS = ("alt_name", "short_name", "official_name", "old_name", "loc_name", "name:en", "alt_name:en")


# Plain part names such as "Tower 1" mean nothing to a walker. Only the named towers are searchable.
GENERIC_PART = re.compile(r"^(the )?(tower|block|wing|building)( [0-9a-z]+)?$", re.I)
PART_KINDS = ("yes", "apartments", "office", "commercial", "residential", "hotel")
COMMERCIAL_MIN_M2 = 1000.0
OFFICE_AREA_MIN_M2 = 500.0
CONTAINER_CATS = ("mall", "shopping_area", "office", "hotel", "hospital", "school", "landmark", "residential",
                  "building")


def category(t, is_area=False):
    rail = (t.get("railway") in ("station", "halt") or t.get("building") == "train_station"
            or t.get("station") in ("light_rail", "subway", "train"))
    rail = rail and not t.get("disused:railway")
    if rail and t.get("public_transport") not in ("platform", "stop_position"):
        return "station"
    if t.get("amenity") == "bus_station" or (t.get("public_transport") == "station" and "railway" not in t):
        return "bus_station"
    if t.get("shop") == "mall" or (t.get("shop") == "department_store" and t.get("building", "no") != "no"):
        return "mall"
    if t.get("shop") == "department_store":
        return "store"
    if t.get("tourism") == "hotel" or t.get("building") == "hotel":
        return "hotel"
    if t.get("amenity") == "hospital":
        return "hospital"
    if t.get("amenity") in ("school", "college", "university", "kindergarten"):
        return "school"
    if t.get("amenity") == "place_of_worship":
        return "place_of_worship"
    if t.get("tourism") == "museum":
        return "museum"
    if t.get("leisure") in ("park", "garden"):
        return "park"
    if t.get("place") == "square" or t.get("leisure") == "plaza" or (
            t.get("highway") == "pedestrian" and t.get("area") == "yes"):
        return "plaza"
    if "historic" in t or t.get("tourism") in ("attraction", "artwork") or t.get("amenity") == "townhall":
        return "landmark"
    if t.get("office") == "diplomatic":
        return "embassy"
    b = t.get("building", "no")
    if b in ("office", "commercial") or ("office" in t and b != "no"):
        return "office"
    if b in ("residential", "apartments", "condominium", "dormitory"):
        return "residential"
    if t.get("landuse") == "retail":
        return "shopping_area"
    # A named commercial site is a destination, unless it is one business's lot or a garden.
    if t.get("landuse") == "commercial" and is_area and b == "no" and not t.get("shop") and t.get("office") != "company" \
            and not re.search(r"garden|park", t.get("name", ""), re.I):
        return "mall" if "mall" in t.get("operator", "").lower() else "office"
    if is_area and t.get("building:part") in PART_KINDS and not GENERIC_PART.match(t.get("name", "").strip()):
        return "residential" if t["building:part"] == "apartments" else "building"
    # An office area with no building tag is a tenant of a tower. Company offices are skipped as noise.
    if is_area and "office" in t and t["office"] != "company" and b == "no":
        return "office"
    if b != "no":
        return "building"
    if t.get("place") in ("neighbourhood", "quarter", "suburb", "city_block"):
        return "neighbourhood"
    return None


def rail_network(t):
    text = " ".join(t.get(k, "") for k in ("network", "operator", "alt_name")).lower()
    if "mrt" in text or "mass rail" in text:
        return "MRT"
    if "philippine national railways" in text or "pnr" in text:
        return "PNR"
    if "subway" in text:
        return "Subway"
    return None


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def make_place(r):
    t = r["tags"]
    cat = category(t, r["type"] == "area")
    if not cat or t.get("highway") == "bus_stop" or t.get("public_transport") in ("platform", "stop_position"):
        return None
    if r["type"] == "area":
        g = shapely.from_wkt(r["wkt"])
        p = g.representative_point()
    else:
        g = p = shapely.Point(r["lon"], r["lat"])
    if not in_bbox(p.x, p.y, GRAPH_BBOX):
        return None
    utm = shapely.transform(g, lambda a: np.column_stack(TO_UTM.transform(a[:, 0], a[:, 1])))
    # Small commercial lots and tiny office areas are single tenants, so they are left out.
    if t.get("landuse") == "commercial" and "building" not in t and not t.get("wikidata") \
            and utm.area < COMMERCIAL_MIN_M2:
        return None
    if cat == "office" and r["type"] == "area" and "building" not in t and "landuse" not in t \
            and utm.area < OFFICE_AREA_MIN_M2:
        return None
    name = t["name"].strip()
    aliases = []
    for k in ALIAS_KEYS:
        aliases += [a.strip() for a in t.get(k, "").split(";") if a.strip()]
    if cat == "station":
        net = rail_network(t)
        aliases.append(name)
        aliases.append(f"{name} Station")
        if net:
            aliases += [f"{name} {net}", f"{net} {name}"]
            name = f"{name} {net} Station"
    if name.startswith("The "):
        aliases.append(name[4:])
    seen, out = {norm(name)}, []
    for a in aliases:
        if norm(a) not in seen:
            seen.add(norm(a))
            out.append(a)
    return {"name": name, "category": cat, "lon": round(p.x, 7), "lat": round(p.y, 7), "aliases": out,
            "osm": r["osm"], "tags": t, "utm": utm, "rep": shapely.Point(*TO_UTM.transform(p.x, p.y)),
            "area": utm.area}


def street_index(graph):
    """STRtree over named edges, for the nearest named street to a place."""
    lines, names = [], []
    for e in graph["edges"]:
        if e.get("name") and len(e["geom"]) > 1:
            xs, ys = TO_UTM.transform([c[0] for c in e["geom"]], [c[1] for c in e["geom"]])
            lines.append(shapely.LineString(np.column_stack([xs, ys])))
            names.append(e["name"])
    return STRtree(lines), lines, names


def add_details(places, kept, graph):
    """Set `detail` on every place whose name repeats, from OSM only, unique within its group where possible.

    Options in order: the named building or mall that contains the place, the address house name,
    the address street, the nearest named street.
    """
    groups = {}
    for pl in places:
        groups.setdefault(pl["name"], []).append(pl)
    tree, lines, snames = street_index(graph)
    areas = [k for k in kept if k["utm"].area > 0 and k["category"] in CONTAINER_CATS]
    by_osm = {k["osm"]: k for k in kept}
    unresolved = 0
    for name, grp in groups.items():
        if len(grp) < 2:
            continue
        opts = []
        for pl in grp:
            src = by_osm[pl["_osm"]]
            pt = src["rep"]
            o = []
            inside = [a for a in areas if a["osm"] != src["osm"] and norm(a["name"]) != norm(name)
                      and a["area"] > src["area"] and a["utm"].buffer(1).contains(pt)]
            if inside:
                o.append("in " + min(inside, key=lambda a: a["area"])["name"])
            tg = src["tags"]
            if tg.get("addr:housename") and norm(tg["addr:housename"]) != norm(name):
                o.append("in " + tg["addr:housename"].strip())
            if tg.get("addr:street"):
                o.append(tg["addr:street"].strip())
                if tg.get("addr:housenumber"):
                    o.append(f"{tg['addr:housenumber'].strip()} {tg['addr:street'].strip()}")
            near = tree.query_nearest(pt, max_distance=60, all_matches=False)
            if len(near):
                o.append(snames[int(near[0])])
            opts.append(o)
        for i, pl in enumerate(grp):
            rest = {x for j in range(len(grp)) if j != i for x in opts[j]}
            pick = next((x for x in opts[i] if x not in rest), None)
            if pick is None and opts[i]:
                pick = opts[i][0]
                unresolved += 1
            if pick:
                pl["detail"] = pick
    return unresolved


def main():
    graph = json.load(open(OUT / "graph.json"))
    rout = [e for e in graph["edges"] if e["routable"]]
    routable_nodes = sorted({e[k] for e in rout for k in ("u", "v")})
    pts = [shapely.Point(*TO_UTM.transform(*graph["nodes"][i])) for i in routable_nodes]
    tree = STRtree(pts)
    n = len(graph["nodes"])
    adj = coo_matrix((np.ones(len(rout)), ([e["u"] for e in rout], [e["v"] for e in rout])), shape=(n, n))
    _, lab = connected_components(adj, directed=False)
    main_comp = Counter(int(lab[i]) for i in routable_nodes).most_common(1)[0][0]

    cands = []
    for line in open(WORK / "features.jsonl"):
        p = make_place(json.loads(line))
        if p:
            cands.append(p)

    # Merge the same name within 150 m. Keep the higher-priority category, then polygons, then larger area.
    cands.sort(key=lambda p: (PRIORITY.index(p["category"]), p["area"] == 0, -p["area"]))
    kept, merged = [], 0
    for p in cands:
        dup = next((k for k in kept if norm(k["name"]) == norm(p["name"])
                    and k["rep"].distance(p["rep"]) <= DEDUPE_M), None)
        if dup:
            merged += 1
            # A bus stop inside a named complex must not name the complex: the complex takes the label.
            if dup["category"] == "bus_station" and p["category"] != "bus_station":
                for k in ("category", "lon", "lat", "tags", "utm", "rep", "area", "osm"):
                    dup[k] = p[k]
            for a in p["aliases"]:
                if norm(a) != norm(dup["name"]) and norm(a) not in {norm(x) for x in dup["aliases"]}:
                    dup["aliases"].append(a)
            continue
        kept.append(p)

    places, dropped, snap_m, moved, island = [], Counter(), [], 0, 0
    for p in kept:
        best = nearest = None
        for k in tree.query(p["utm"].buffer(SNAP_MAX_M)):
            d = p["utm"].distance(pts[k])
            if d > SNAP_MAX_M:
                continue
            on_main = lab[routable_nodes[k]] == main_comp
            # A node inside the largest routable component wins over a closer node on a small island.
            key = (not on_main, round(d, 1), p["rep"].distance(pts[k]))
            if best is None or key < best[0]:
                best = (key, routable_nodes[k], d)
            if nearest is None or key[1:] < nearest[0]:
                nearest = (key[1:], routable_nodes[k])
        if best is None:
            dropped[p["category"]] += 1
            continue
        moved += best[1] != nearest[1]
        island += best[0][0]
        snap_m.append(best[2])
        places.append({"name": p["name"], "category": p["category"], "lon": p["lon"], "lat": p["lat"],
                       "node_id": int(best[1]), "aliases": p["aliases"], "_osm": p["osm"]})
    unresolved = add_details(places, kept, graph)
    for pl in places:
        del pl["_osm"]
    places.sort(key=lambda p: (PRIORITY.index(p["category"]), p["name"]))
    write_json(OUT / "places.json", places)  # compact: the app downloads it on first search
    log = {"candidates": len(cands), "merged_same_name": merged, "kept_before_snap": len(kept),
           "places": len(places), "repeated_names_with_detail": sum(1 for p in places if "detail" in p),
           "repeated_names_without_unique_detail": unresolved, "dropped_over_80m": sum(dropped.values()),
           "dropped_by_category": dict(dropped), "by_category": dict(Counter(p["category"] for p in places)),
           "snapped_to_main_component_over_a_closer_island_node": int(moved),
           "places_on_small_components": int(island),
           "snap_m_median": round(float(np.median(snap_m)), 1) if snap_m else None,
           "snap_m_max": round(float(max(snap_m)), 1) if snap_m else None,
           "dropped_names": sorted(p["name"] for p in kept
                                   if not any(q["name"] == p["name"] and q["lon"] == p["lon"] for q in places))}
    write_json(WORK / "places_log.json", log, indent=1)
    print(json.dumps({k: v for k, v in log.items() if k != "dropped_names"}, indent=1))


if __name__ == "__main__":
    main()
