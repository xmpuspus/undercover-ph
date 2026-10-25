"""Build offline jogging attributes without rewriting the walk graph.

Usage: pipeline/.venv/bin/python -I pipeline/districts/build_jog.py --area qc-north
Or pass --graph, --pbf, --wikidata, --hours and --out explicitly. With only UC_AREA set,
read graph.json and write jog.json in pipeline/stage/<area>/, as build.py does.
OSM area assembly uses two passes over the extract, including multipolygon holes.
"""
import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

import osmium
import shapely
from pyproj import Transformer
from shapely.ops import transform
from shapely.strtree import STRtree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ROAD = {"path": 0, "footway": 0, "pedestrian": 0, "steps": 0, "cycleway": 0,
        "service": 1, "living_street": 1, "residential": 2, "unclassified": 2,
        "tertiary": 3, "secondary": 4, "primary": 5, "trunk": 6}
PAVED = {"paved", "asphalt", "concrete", "concrete:lanes", "concrete:plates", "paving_stones",
         "sett", "cobblestone", "unhewn_cobblestone", "metal", "wood", "rubber", "bricks"}
UNPAVED = {"unpaved", "compacted", "fine_gravel", "gravel", "pebblestone", "ground", "dirt", "earth",
           "grass", "grass_paver", "sand", "mud", "clay", "rock", "stone", "woodchips", "snow", "ice", "salt"}
TOURISM = {"artwork", "museum", "attraction", "viewpoint", "gallery", "zoo", "aquarium", "theme_park"}
SOURCES = [{"name": "OpenStreetMap", "licence": "ODbL", "url": "https://www.openstreetmap.org/copyright"},
           {"name": "Wikidata", "licence": "CC0", "url": "https://www.wikidata.org/wiki/Wikidata:Licensing"}]


def park(tags):
    return (tags.get("leisure") in {"park", "garden", "nature_reserve"}
            or tags.get("landuse") == "recreation_ground")


def water(tags):
    return (tags.get("natural") in {"water", "coastline"}
            or tags.get("waterway") in {"river", "canal", "stream"})


def sight_kind(tags):
    if not tags.get("name", "").strip():
        return None
    historic = tags.get("historic")
    if historic and historic not in {"no", "tomb", "boundary_stone"}:
        return historic
    if tags.get("tourism") in TOURISM:
        return tags["tourism"]
    if park(tags):
        return tags["leisure"] if tags.get("leisure") in {"park", "garden", "nature_reserve"} else "recreation_ground"
    return None


def tag_codes(tags):
    road = ROAD.get(tags.get("highway", "").removesuffix("_link"), 0)
    lit = 1 if tags.get("lit") in {"yes", "24/7", "automatic", "sunset-sunrise"} else 2 if tags.get("lit") == "no" else 0
    surface = 1 if tags.get("surface") in PAVED else 2 if tags.get("surface") in UNPAVED else 0
    return road, lit, surface


def coordinate(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    lon, lat = value[:2]
    if (any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in (lon, lat))
            or not -180 <= lon <= 180 or not -90 <= lat <= 90):
        return None
    return lon, lat


def edge_coords(edge):
    geom = edge.get("geom")
    if not isinstance(geom, list):
        return []
    coords = [coordinate(p) for p in geom]
    return coords if len(coords) >= 2 and all(p is not None for p in coords) else []


def graph_bbox(graph):
    points = [p for e in graph["edges"] for p in edge_coords(e)]
    points.extend(p for n in graph.get("nodes", []) if (p := coordinate(n)) is not None)
    if not points:
        return None
    west, south = min(p[0] for p in points), min(p[1] for p in points)
    east, north = max(p[0] for p in points), max(p[1] for p in points)
    # Graphs have no stored box. Include nearby points just outside the node envelope.
    dlat = 50 / 110574
    dlon = 50 / (111320 * max(0.01, math.cos(math.radians((south + north) / 2))))
    return max(-180, west - dlon), max(-90, south - dlat), min(180, east + dlon), min(90, north + dlat)


def rectangles(bbox):
    return getattr(bbox, "rects", [bbox]) if bbox else []


class Features(osmium.SimpleHandler):
    def __init__(self, way_ids, bbox):
        super().__init__()
        self.way_ids, self.bbox = way_ids, bbox
        self.tags, self.parks, self.waters, self.sights = {}, [], [], {}
        self.park_urls = []
        self.sight_qids = {}
        self.wkb = osmium.geom.WKBFactory()
        lon, lat = ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2) if bbox else (121, 14)
        zone = max(1, min(60, math.floor((lon + 180) / 6) + 1))
        crs = (32600 if lat >= 0 else 32700) + zone
        self.to_m = Transformer.from_crs(4326, crs, always_xy=True).transform
        self.box = shapely.union_all([shapely.box(*rect) for rect in rectangles(bbox)])
        self.near_box = transform(self.to_m, self.box).buffer(51)

    def add_sight(self, src, tags, geom):
        kind = sight_kind(tags)
        if not kind or geom.is_empty:
            return
        linear = geom.geom_type in {"LineString", "MultiLineString"}
        point = geom.interpolate(0.5, normalized=True) if linear else geom.representative_point()
        if not self.box.covers(point) and geom.intersects(self.box):
            clipped = geom.intersection(self.box)
            point = (clipped.interpolate(0.5, normalized=True)
                     if clipped.geom_type in {"LineString", "MultiLineString"} else clipped.representative_point())
        if self.box.covers(point):
            self.sights[src] = {"name": tags["name"].strip(), "kind": kind,
                                "lon": point.x, "lat": point.y, "src": src}
            self.sight_qids[src] = {q.strip() for q in tags.get("wikidata", "").split(";")
                                    if q.strip().startswith("Q") and q.strip()[1:].isascii() and q.strip()[1:].isdigit()}

    def node(self, node):
        if not node.location.valid() or not sight_kind(node.tags):
            return
        self.add_sight(f"osm:n{node.id}", node.tags, shapely.Point(node.lon, node.lat))

    def way(self, way):
        if way.id in self.way_ids:
            self.tags[way.id] = tag_codes(way.tags)
        is_water, kind = water(way.tags), sight_kind(way.tags)
        if not (is_water or kind):
            return
        try:
            geom = shapely.from_wkb(self.wkb.create_linestring(way))
        except (RuntimeError, ValueError, shapely.errors.GEOSException):
            return
        metric = transform(self.to_m, geom)
        if not metric.intersects(self.near_box):
            return
        if is_water and (way.tags.get("natural") == "coastline" or way.tags.get("waterway") in {"river", "canal", "stream"}):
            self.waters.append(metric)
        # Keep a line point even for area=no or failed area assembly. A valid area
        # replaces this same source id with its interior point in area().
        if kind:
            self.add_sight(f"osm:w{way.id}", way.tags, geom)

    def area(self, area):
        is_park, is_water = park(area.tags), water(area.tags)
        if not (is_park or is_water or sight_kind(area.tags)):
            return
        try:
            geom = shapely.from_wkb(self.wkb.create_multipolygon(area))
            if not geom.is_valid:
                geom = shapely.make_valid(geom)
            if geom.is_empty:
                return
            metric = transform(self.to_m, geom)
            if not metric.intersects(self.near_box):
                return
            if is_park:
                self.parks.append(metric)
                self.park_urls.append(f"https://www.openstreetmap.org/{'way' if area.from_way() else 'relation'}/{area.orig_id()}")
            if is_water:
                self.waters.append(metric.boundary if area.tags.get("natural") == "coastline" else metric)
            src = f"osm:{'w' if area.from_way() else 'r'}{area.orig_id()}"
            self.add_sight(src, area.tags, geom)
        except (RuntimeError, ValueError, shapely.errors.GEOSException):
            return


def named_text(value):
    if not isinstance(value, str) or not value.strip():
        return False
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def read_wikidata(path, bbox):
    """Skip unavailable snapshots and invalid rows, with a diagnostic on stderr."""
    try:
        snapshot = json.loads(path.read_text())
        if not isinstance(snapshot, dict) or not isinstance(snapshot.get("items"), list):
            raise ValueError("expected an object with an items list")
    except (OSError, ValueError) as ex:
        print(f"Wikidata snapshot unavailable: {ex}", file=sys.stderr)
        return []
    sights, invalid = {}, 0
    for item in snapshot["items"]:
        if not isinstance(item, dict):
            invalid += 1
            continue
        qid, name, kind = (item.get(k) for k in ("qid", "name", "kind"))
        point = coordinate([item.get("lon"), item.get("lat")])
        if (not isinstance(qid, str) or not qid.startswith("Q") or not qid[1:].isascii() or not qid[1:].isdigit()
                or not named_text(name) or not named_text(kind) or point is None):
            invalid += 1
            continue
        lon, lat = point
        if any(w <= lon <= e and s <= lat <= n for w, s, e, n in rectangles(bbox)):
            src = f"wikidata:{qid}"
            sights.setdefault(src, {"name": name.strip(), "kind": kind.strip(), "lon": lon, "lat": lat, "src": src})
    if invalid:
        print(f"Wikidata snapshot: skipped {invalid} invalid items", file=sys.stderr)
    return list(sights.values())


def read_hours(path):
    """Keep original row indexes; the first row for an exact source URL wins."""
    try:
        if not path.exists():
            return {}
        rows = json.loads(path.read_text())
        if not isinstance(rows, list):
            raise ValueError("expected a list of hours rows")
    except FileNotFoundError:
        return {}
    except (OSError, ValueError, RecursionError) as ex:
        print(f"Park hours unavailable: {ex}", file=sys.stderr)
        return {}
    by_url = {}
    for i, row in enumerate(rows):
        url = row.get("source_url") if isinstance(row, dict) else None
        if isinstance(url, str):
            by_url.setdefault(url, i)
    return by_url


def attributes(graph, graph_bytes, features, wikidata, hours=None):
    sights, seen_sources, seen_qids = [], set(), set()
    # OSM sorts first and supplies the mapped point when both sources identify the same place.
    for sight in sorted([*features.sights.values(), *wikidata], key=lambda s: s["src"]):
        src = sight["src"]
        qids = {src.removeprefix("wikidata:")} if src.startswith("wikidata:") else features.sight_qids.get(src, set())
        if src in seen_sources or qids & seen_qids:
            continue
        sights.append(sight)
        seen_sources.add(src)
        seen_qids.update(qids)
    points = [transform(features.to_m, shapely.Point(s["lon"], s["lat"])) for s in sights]
    park_tree, water_tree, sight_tree = STRtree(features.parks), STRtree(features.waters), STRtree(points)
    park_hours = [(hours or {}).get(url, -1) for url in features.park_urls]
    rows = {k: [] for k in ("road", "lit", "surface", "park", "water", "sight", "hours")}
    walk_m = lit_tagged_m = 0.0
    for edge in graph["edges"]:
        road, lit, surface = features.tags.get(edge.get("way_id"), (0, 0, 0))
        in_park = near_water = 0
        sight = hours_idx = -1
        coords = edge_coords(edge)
        if coords:
            mid = transform(features.to_m, shapely.LineString(coords)).interpolate(0.5, normalized=True)
            parks = park_tree.query(mid, predicate="covered_by")
            in_park = int(len(parks) > 0)
            # Overlapping parks use the lowest matching hours row, independent of tree order.
            hours_idx = min((park_hours[p] for p in parks if park_hours[p] >= 0), default=-1)
            near_water = int(len(water_tree.query(mid, predicate="dwithin", distance=50)) > 0)
            candidates = sight_tree.query(mid, predicate="dwithin", distance=40)
            if len(candidates):
                sight = int(min(candidates, key=lambda k: (mid.distance(points[k]), int(k))))
        for key, value in zip(rows, (road, lit, surface, in_park, near_water, sight, hours_idx)):
            rows[key].append(value)
        length = edge.get("len_m", 0)
        if not isinstance(length, (int, float)) or isinstance(length, bool):
            continue
        try:
            length = float(length)
        except OverflowError:
            continue
        if math.isfinite(length) and length >= 0:
            walk_m += length
            if lit:
                lit_tagged_m += length
    return {"version": 1, "graph_sha256": hashlib.sha256(graph_bytes).hexdigest(), "edges": rows, "sights": sights,
            "counts": {"edges": len(graph["edges"]), "walk_m": walk_m, "lit_tagged_m": lit_tagged_m,
                       "lit_share": lit_tagged_m / walk_m if walk_m else 0.0, "sights": len(sights),
                       "park_hours_edges": sum(h >= 0 for h in rows["hours"])}, "sources": SOURCES}


def paths(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("area_id", nargs="?", help="area id (alias for --area)")
    parser.add_argument("--area")
    for key in ("graph", "pbf", "wikidata", "hours", "out"):
        parser.add_argument(f"--{key}", type=Path)
    args = parser.parse_args(argv)
    if args.area and args.area_id and args.area != args.area_id:
        parser.error("area id and --area disagree")
    area = args.area or args.area_id
    staged = area is None
    area = area or os.environ.get("UC_AREA")
    bbox = None
    # Explicit paths need no area context and have no stage/work directory side effects.
    if args.area or args.area_id or not (args.graph and args.pbf and args.out):
        if not area:
            parser.error("pass --area, set UC_AREA, or supply --graph, --pbf and --out")
        os.environ["UC_AREA"] = area
        sys.path.insert(0, str(HERE))
        import ctx

        base = ctx.OUT if staged else ROOT / "app/public/data/areas" / ctx.AREA.id
        args.graph = args.graph or base / "graph.json"
        args.pbf = args.pbf or ctx.PBF
        args.out = args.out or base / "jog.json"
        bbox = ctx.GRAPH_BBOX
    args.wikidata = args.wikidata or HERE / "wikidata_heritage.json"
    args.hours = args.hours or args.graph.with_name("hours.json")
    inputs = (args.graph, args.pbf, args.wikidata, args.hours)
    if args.out.resolve() in {p.resolve() for p in inputs}:
        parser.error("--out must differ from every input path")
    if args.out.exists() and any(args.out.samefile(p) for p in inputs if p.exists()):
        parser.error("--out must not be a hard link to an input")
    return args, bbox


def main(argv=None):
    args, bbox = paths(argv)
    graph_bytes = args.graph.read_bytes()
    graph = json.loads(graph_bytes)
    bbox = bbox or graph_bbox(graph)
    features = Features({e.get("way_id") for e in graph["edges"]}, bbox)
    features.apply_file(str(args.pbf), locations=True, idx="flex_mem")
    jog = attributes(graph, graph_bytes, features, read_wikidata(args.wikidata, bbox), read_hours(args.hours))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(jog, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    print(json.dumps(jog["counts"]))


if __name__ == "__main__":
    main()
