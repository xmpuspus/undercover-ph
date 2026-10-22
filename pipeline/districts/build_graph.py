"""District copy of pipeline/build_graph.py. Run through pipeline/districts/build.py, which sets UC_DISTRICT.

Build graph.json for the graph area from the NCR PBF with the corrected pedestrian access policy.

Usage: pipeline/.venv/bin/python -I pipeline/build_graph.py
Reads the PBF, pipeline/work/{features.jsonl,elevators.json,kerbs.json,hours_match.json},
app/public/data/hours.json and pipeline/inputs/buildings.geojson (so build_buildings.py runs first).
Access follows pipeline/access_policy.py: the research policy plus the project decisions of 2026-10-22.
Writes app/public/data/graph.json and pipeline/work/{graph_log.json,edge_causes.json}.

Graph method (reused from research scripts/05/extract_walk_graph.py): static public-through ways only,
graph nodes at way ends and at nodes shared by two or more kept ways, one edge per way piece between
graph nodes. Two changes from the research extractor (2026-10-22):

- A node rule acts on the way pieces that hold the node, not on the whole way. A piece through an
  explicitly blocked node is left out, and a piece through a node that needs an access check is unroutable.
  The rest of the way stays, so a public road keeps its open length up to a gate.
- A walkable way with no node inside the graph rects is kept when it lies on a run of at most CONNECT_M
  outside the rects that joins two separate routable pieces of the kept ways. The rects cut through roads
  where member districts meet, such as the Tinajeros Bridge between Malabon and Valenzuela.
"""
import heapq
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np  # noqa: E402
import osmium  # noqa: E402
import shapely  # noqa: E402
from scipy.sparse import coo_matrix  # noqa: E402
from scipy.sparse.csgraph import connected_components  # noqa: E402
from shapely.strtree import STRtree  # noqa: E402

from ctx import (BUILDING_BBOX, BUILDINGS, GRAPH_BBOX, OUT, PBF, TO_LL, TO_UTM, WORK, haversine, in_bbox,  # noqa: E402
                    write_json)
from extract_walk_graph import classify  # noqa: E402  research corrected classifier, imported unchanged
from pedestrian_access import (PEDESTRIAN, node_blocks_public, read_node_rules,  # noqa: E402
                               static_public_walkable)
from access_policy import (LOCAL_PROFILE, ignored_conditionals, node_requires_evaluation,  # noqa: E402
                           node_walker_tags, walker_tags, way_requires_evaluation)

BIT = {"covered": 1, "tunnel": 2, "indoor": 4, "footbridge": 8, "steps": 16, "sidewalk": 32,
       "access_eval": 64, "time": 128, "crossing": 256, "elevator": 512, "inside_footprint": 1024}
# Decision 6: shrink a side offset in 0.5 m steps until no 1 m sample sits inside a ground-level
# footprint, down to 1.5 m. A side that still falls inside becomes a centre edge.
OFFSET_STEP_M = 0.5
OFFSET_MIN_M = 1.5
SAMPLE_STEP_M = 1.0
FOOTPRINT_MARGIN_M = 0.05
# Decision 7: an unsheltered edge with over half its length inside a footprint gets bit 10.
INSIDE_SHARE = 0.5
# Safety item: node_flags tell the router where a walker can cross between side edges.
NODE_BIT = {"crossing": 1, "signals": 2, "junction": 4, "grade_separated": 8}
CROSSING_STREETS = ["Ayala Avenue", "Paseo de Roxas", "Makati Avenue", "Senator Gil J. Puyat Avenue"]
# Longest run outside the graph rects that a connector way may add between two routable pieces.
CONNECT_M = 300.0


def crossing_node_tags():
    """OSM node ids that mark a crossing (bit 1) or traffic signals (bit 2) in the building area."""
    crossing, signals, crossing_no = set(), set(), set()
    for n in osmium.FileProcessor(str(PBF), osmium.osm.NODE).with_filter(
            osmium.filter.KeyFilter("highway", "crossing", "railway")):
        if not n.location.valid() or not in_bbox(n.location.lon, n.location.lat, BUILDING_BBOX):
            continue
        hw, cr, rw = n.tags.get("highway"), n.tags.get("crossing"), n.tags.get("railway")
        if cr == "no":
            crossing_no.add(n.id)  # OSM says no crossing here, so the node gets neither bit
            continue
        if hw == "crossing" or cr is not None or rw == "crossing":
            crossing.add(n.id)
        if hw == "traffic_signals" or cr == "traffic_signals":
            signals.add(n.id)
    return crossing, signals, crossing_no
SIDE_CLASSES = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
                "tertiary", "tertiary_link"}
LANE_M = 3.2
SIDE_EXTRA_M = 1.0
LANDMARK_M = 25.0
SIDEWALK_VALUE = {"both": ("yes", "yes"), "yes": ("yes", "yes"), "left": ("yes", "no"),
                  "right": ("no", "yes"), "no": ("no", "no"), "none": ("no", "no"),
                  "separate": ("separate", "separate")}
LANDMARK_AMENITY_SKIP = {"parking", "parking_entrance", "parking_space", "bicycle_parking",
                         "motorcycle_parking", "bench", "waste_basket", "vending_machine", "recycling",
                         "taxi", "loading_dock", "drinking_water", "shelter", "toilets", "atm"}


def side_status(value):
    v = (value or "").strip().lower()
    return {"yes": "yes", "designated": "yes", "no": "no", "none": "no", "separate": "separate"}.get(v)


def sidewalk_sides(tags):
    left, right = SIDEWALK_VALUE.get(tags.get("sidewalk", "").strip().lower(), (None, None))
    if "sidewalk:both" in tags:
        left = right = side_status(tags["sidewalk:both"])
    if "sidewalk:left" in tags:
        left = side_status(tags["sidewalk:left"])
    if "sidewalk:right" in tags:
        right = side_status(tags["sidewalk:right"])
    return left, right


def contract_flags(tags):
    """Contract bitmask from way tags. Bits 0 to 2 use the same pedestrian-class guard as classify()."""
    # Vehicle-only :conditional keys never restrict walkers (decision 2026-10-22).
    names = set(classify(walker_tags(tags)))
    hw = tags.get("highway", "")
    f = 0
    if hw in PEDESTRIAN:
        if tags.get("covered") in ("yes", "arcade", "colonnade", "roof"):
            f |= BIT["covered"]
        if tags.get("tunnel") == "yes":
            f |= BIT["tunnel"]
        if tags.get("indoor") in ("yes", "corridor") or hw == "corridor" or tags.get("tunnel") == "building_passage":
            f |= BIT["indoor"]
        if tags.get("bridge") not in (None, "no"):
            f |= BIT["footbridge"]
    if "steps" in names:
        f |= BIT["steps"]
    if "sidewalk" in names:
        f |= BIT["sidewalk"]
    if "access_evaluation_needed" in names:
        f |= BIT["access_eval"]
    if "time_restricted" in names:
        f |= BIT["time"]
    if tags.get("footway") == "crossing" or (hw in PEDESTRIAN and "crossing" in tags):
        f |= BIT["crossing"]
    if hw == "elevator":
        f |= BIT["elevator"]
    sheltered = bool(names & {"covered_or_tunnel", "indoor_or_corridor"})
    if bool(f & 7) != sheltered:
        raise AssertionError(f"shelter bits disagree with classify() for {tags}")
    if "foot_bridge" in names and not f & BIT["footbridge"]:
        raise AssertionError(f"footbridge bit missing for {tags}")
    return f


def way_eval_causes(tags):
    if not way_requires_evaluation(tags):
        return []
    tags = walker_tags(tags)
    causes = []
    if tags.get("indoor") in ("yes", "corridor") or tags.get("highway") == "corridor" or tags.get("tunnel") == "building_passage":
        causes.append("way_controlled_passage")
    if any(k == "opening_hours" or k.startswith("opening_hours:") for k in tags):
        causes.append("way_opening_hours")
    conds = [k for k in tags if k.endswith(":conditional")]
    if conds:
        foot = any(k.startswith(("foot", "access")) for k in conds)
        causes.append("way_foot_or_access_conditional" if foot else "way_other_conditional")
    if any(k in tags for k in ("barrier", "entrance", "locked", "oneway:foot", "foot:forward", "foot:backward")):
        causes.append("way_other_rule")
    return causes or ["way_other_rule"]


def node_cause(tags):
    if "barrier" in tags:
        return "node_barrier_" + tags["barrier"]
    if "entrance" in tags:
        return "node_entrance"
    return "node_" + "_".join(sorted(k for k in tags if k not in ("level", "layer", "wheelchair")))


def node_time_rule(tags):
    return any(k == "opening_hours" or k.startswith("opening_hours:") or k.endswith(":conditional") for k in tags)


def parse_width(v):
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(m)?\s*$", v or "")
    x = float(m.group(1)) if m else None
    return x if x is not None and 2.0 <= x <= 40.0 else None


def parse_lanes(v):
    m = re.match(r"^\s*(\d+)\s*$", v or "")
    x = int(m.group(1)) if m else None
    return x if x is not None and 1 <= x <= 12 else None


def offset_line(xy, d):
    """Offset a projected polyline by d metres (positive = left of travel), mitre joins capped at 2d."""
    pts = [xy[0]]
    for p in xy[1:]:
        if math.dist(p, pts[-1]) > 1e-6:
            pts.append(p)
    if len(pts) < 2:
        return None
    normals = []
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        normals.append((-(y1 - y0) / L, (x1 - x0) / L))
    out = []
    for i, (x, y) in enumerate(pts):
        if i == 0:
            nx, ny, scale = *normals[0], 1.0
        elif i == len(pts) - 1:
            nx, ny, scale = *normals[-1], 1.0
        else:
            ax, ay = normals[i - 1]
            bx, by = normals[i]
            sx, sy = ax + bx, ay + by
            sl = math.hypot(sx, sy)
            if sl < 1e-9:  # a full reversal; keep the incoming normal
                nx, ny, scale = ax, ay, 1.0
            else:
                nx, ny = sx / sl, sy / sl
                scale = min(2.0, 1.0 / max(1e-9, nx * ax + ny * ay))
        out.append((x + nx * d * scale, y + ny * d * scale))
    return out


def footprint_trees():
    """Ground-level footprints (min_height 0) for the offset test, and all footprints for bit 10."""
    import gzip
    fc = json.load(gzip.open(BUILDINGS.with_name(BUILDINGS.name + ".gz")))
    ground, every = [], []
    for f in fc["features"]:
        g = shapely.transform(shapely.geometry.shape(f["geometry"]),
                              lambda a: np.column_stack(TO_UTM.transform(a[:, 0], a[:, 1])))
        every.append(g)
        if f["properties"]["min_height_m"] == 0:
            ground.append(g)
    # A 5 cm margin keeps samples outside after geometry is rounded to 7 decimals (about 1 cm).
    ground = shapely.buffer(np.array(ground), FOOTPRINT_MARGIN_M, join_style="mitre")
    return STRtree(ground), STRtree(every), every


def samples_inside(xy, tree):
    line = shapely.LineString(xy)
    dist = np.append(np.arange(0.0, line.length, SAMPLE_STEP_M), line.length)
    pts = shapely.line_interpolate_point(line, dist)
    return tree.query(pts, predicate="within").size > 0


def fit_offset(xy, d0, sign, tree):
    """Largest offset from d0 down to 1.5 m whose samples all sit outside footprints, else None."""
    tries = list(np.arange(d0, OFFSET_MIN_M, -OFFSET_STEP_M))
    if not tries or tries[-1] > OFFSET_MIN_M:
        tries.append(OFFSET_MIN_M)
    for d in tries:
        off = offset_line(xy, sign * d)
        if off is None:
            return None, None
        if not samples_inside(off, tree):
            return off, float(d)
    return None, None


def line_len_ll(coords):
    return sum(haversine(a[1], a[0], b[1], b[0]) for a, b in zip(coords[:-1], coords[1:]))


def landmark_index():
    feats = []
    for line in open(WORK / "features.jsonl"):
        r = json.loads(line)
        t = r["tags"]
        if t.get("public_transport") in ("platform", "stop_position") or t.get("highway") == "bus_stop":
            continue
        ok = (t.get("building", "no") != "no" or t.get("shop") in ("mall", "department_store", "supermarket")
              or t.get("railway") == "station" or t.get("public_transport") == "station"
              or ("amenity" in t and t["amenity"] not in LANDMARK_AMENITY_SKIP)
              or t.get("tourism") in ("hotel", "attraction", "museum", "apartment", "hostel", "guest_house")
              or t.get("leisure") in ("park", "garden"))
        if not ok:
            continue
        if r["type"] == "area":
            g = shapely.from_wkt(r["wkt"])
            g = shapely.transform(g, lambda a: np.column_stack(TO_UTM.transform(a[:, 0], a[:, 1])))
        else:
            g = shapely.Point(*TO_UTM.transform(r["lon"], r["lat"]))
        feats.append((t["name"], g, g.area))
    return feats, STRtree([f[1] for f in feats])


def node_checked(nid, node_rules, blocked):
    """True when the node blocks the public or needs an access check, so a piece through it is not routable."""
    return nid in blocked or (nid in node_rules and (node_requires_evaluation(node_rules[nid][2]) or
                                                     node_time_rule(node_walker_tags(node_rules[nid][2]))))


def connector_ways(ways, outside, node_rules, blocked):
    """Outside ways on a run of at most CONNECT_M that joins two separate routable pieces of the kept ways.

    The pieces come from the kept ways split at shared nodes, without the ways or pieces that need a check.
    From each kept node that an outside way touches, a search along outside ways stops at the first kept
    node it reaches. When that node lies in another piece, every way on the run becomes a connector.
    """
    root = {}

    def find(x):
        root.setdefault(x, x)
        while root[x] != x:
            root[x] = root[root[x]]
            x = root[x]
        return x

    use = Counter()
    for wy in ways:
        use.update(set(wy["ids"]))
        use[wy["ids"][0]] += 1
        use[wy["ids"][-1]] += 1
    for wy in ways:
        ids = wy["ids"]
        for nid in ids:
            find(nid)
        if way_requires_evaluation(wy["tags"]):
            continue
        start = 0
        for i in range(1, len(ids)):
            if use[ids[i]] < 2 and i != len(ids) - 1:
                continue
            piece = ids[start:i + 1]
            if not any(node_checked(n, node_rules, blocked) for n in piece):
                for n in piece[1:]:
                    root[find(n)] = find(piece[0])
            start = i
    adj = defaultdict(list)
    for k, wy in enumerate(outside):
        ids, lons, lats = wy["ids"], wy["lons"], wy["lats"]
        for i in range(1, len(ids)):
            d = haversine(lats[i - 1], lons[i - 1], lats[i], lons[i])
            adj[ids[i - 1]].append((ids[i], d, k))
            adj[ids[i]].append((ids[i - 1], d, k))
    chosen = set()
    for s in sorted(n for n in adj if n in root):
        rs = find(s)
        dist, prev, heap = {s: 0.0}, {}, [(0.0, s)]
        while heap:
            d, x = heapq.heappop(heap)
            if d > dist[x]:
                continue
            if x != s and x in root:
                if find(x) != rs:
                    while x in prev:
                        x, k = prev[x]
                        chosen.add(k)
                continue
            for y, c, k in adj[x]:
                if d + c <= CONNECT_M and d + c < dist.get(y, math.inf):
                    dist[y] = d + c
                    prev[y] = (x, k)
                    heapq.heappush(heap, (d + c, y))
    return [outside[k] for k in sorted(chosen)]


def main():
    t0 = time.time()
    node_rules = read_node_rules(str(PBF))
    blocked = {nid for nid, (_, _, tags) in node_rules.items() if node_blocks_public(tags)}
    elevators = {int(k) for k in json.load(open(WORK / "elevators.json"))}
    raised = {int(k) for k, v in json.load(open(WORK / "kerbs.json")).items() if v == "raised"}
    ground_tree, every_tree, every_fp = footprint_trees()
    offset_moved, offset_fallback, fallback_edges = 0, Counter(), 0
    cross_nodes, signal_nodes, crossing_no_nodes = crossing_node_tags()
    ways_at_node, street_nodes = defaultdict(set), defaultdict(set)

    ways, outside, lanes_by_class = [], [], defaultdict(list)
    blocked_ways, blocked_pieces, blocked_len, bad_loc, not_walkable = 0, 0, 0.0, 0, 0
    fp = (osmium.FileProcessor(str(PBF), osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
          .with_filter(osmium.filter.KeyFilter("highway")))
    for w in fp:
        try:
            ids = [n.ref for n in w.nodes]
            lons = [n.lon for n in w.nodes]
            lats = [n.lat for n in w.nodes]
        except osmium.InvalidLocationError:
            bad_loc += 1
            continue
        near = any(in_bbox(lo, la, BUILDING_BBOX) for lo, la in zip(lons, lats))
        # Junction counts use every highway way near the graph, walkable or not, each way once.
        if near:
            for nid in set(ids):
                ways_at_node[nid].add(w.id)
            if w.tags.get("name") in CROSSING_STREETS:
                street_nodes[w.tags.get("name")].update(ids)
        if len(ids) < 2:
            continue
        if not any(in_bbox(lo, la, GRAPH_BBOX) for lo, la in zip(lons, lats)):
            # A connector candidate: walkable, with no rule on the way or its nodes.
            tags = dict(w.tags)
            if (near and static_public_walkable(tags) and not way_requires_evaluation(tags)
                    and not any(node_checked(n, node_rules, blocked) for n in ids)):
                outside.append({"id": w.id, "ids": ids, "lons": lons, "lats": lats, "tags": tags})
            continue
        tags = dict(w.tags)
        lane_n = parse_lanes(tags.get("lanes"))
        if lane_n:
            lanes_by_class[tags["highway"]].append(lane_n)
        if not static_public_walkable(tags):
            not_walkable += 1
            continue
        blocked_ways += any(nid in blocked for nid in ids)
        ways.append({"id": w.id, "ids": ids, "lons": lons, "lats": lats, "tags": tags})
    connectors = connector_ways(ways, outside, node_rules, blocked)
    ways += connectors

    class_lanes = {k: float(median(v)) for k, v in lanes_by_class.items() if len(v) >= 5}

    use = Counter()
    for wy in ways:
        use.update(set(wy["ids"]))
        use[wy["ids"][0]] += 1
        use[wy["ids"][-1]] += 1

    node_index, nodes = {}, []

    def nid_of(osm_id, lon, lat):
        if osm_id not in node_index:
            node_index[osm_id] = len(nodes)
            nodes.append([round(lon, 7), round(lat, 7)])
        return node_index[osm_id]

    edges, causes_of = [], []
    ignored_ways, ignored_keys, kerb_ignored = 0, Counter(), set()
    side_stats = Counter()
    offsets_used = Counter()
    max_out_m = 0.0
    for wy in ways:
        ids, lons, lats, tags = wy["ids"], wy["lons"], wy["lats"], wy["tags"]
        base = contract_flags(tags)
        way_causes = way_eval_causes(tags)
        ign = ignored_conditionals(tags)
        if ign:
            ignored_ways += 1
            ignored_keys.update(ign)
        # Node rules by position in the way. Each applies to the pieces that hold its node.
        node_causes, node_time = {}, set()
        for j, nid in enumerate(ids):
            if nid in node_rules:
                ntags = node_rules[nid][2]
                if node_requires_evaluation(ntags):
                    node_causes[j] = node_cause(node_walker_tags(ntags))
                elif ntags.get("barrier") == "kerb":
                    kerb_ignored.add(nid)
                if node_time_rule(node_walker_tags(ntags)):
                    node_time.add(j)
        for lo, la in zip(lons, lats):
            if not in_bbox(lo, la, GRAPH_BBOX):
                dx = max(GRAPH_BBOX[0] - lo, 0, lo - GRAPH_BBOX[2]) * 111320 * math.cos(math.radians(la))
                dy = max(GRAPH_BBOX[1] - la, 0, la - GRAPH_BBOX[3]) * 110574
                max_out_m = max(max_out_m, math.hypot(dx, dy))

        hw = tags.get("highway", "")
        left, right = sidewalk_sides(tags) if hw not in PEDESTRIAN else (None, None)
        sides = [s for s, st in (("left", left), ("right", right)) if st == "yes"]
        tagged = bool(sides)
        if not sides and left is None and right is None and hw in SIDE_CLASSES:
            sides = ["left", "right"]
        width, width_src = parse_width(tags.get("width")), "width"
        if width is None and parse_lanes(tags.get("lanes")):
            width, width_src = parse_lanes(tags.get("lanes")) * LANE_M, "lanes"
        if width is None:
            width, width_src = class_lanes.get(hw, 2.0) * LANE_M, "class_default"
        offset_m = width / 2 + SIDE_EXTRA_M
        if sides:
            side_stats["tagged" if tagged else "class_default"] += 1
            side_stats[f"ways_{len(sides)}_sides"] += 1
            offsets_used[width_src] += 1
        else:
            side_stats["centre"] += 1

        start = 0
        for i in range(1, len(ids)):
            if use[ids[i]] < 2 and i != len(ids) - 1:
                continue
            seg = range(start, i + 1)
            if any(ids[j] in blocked for j in seg):
                # The piece passes an explicitly blocked node, so it stays out. The way's other pieces stay in.
                blocked_pieces += 1
                blocked_len += sum(haversine(lats[j - 1], lons[j - 1], lats[j], lons[j]) for j in seg[1:])
                start = i
                continue
            u = nid_of(ids[start], lons[start], lats[start])
            v = nid_of(ids[i], lons[i], lats[i])
            centre = [[round(lons[j], 7), round(lats[j], 7)] for j in seg]
            causes = sorted(set(way_causes + [node_causes[j] for j in seg if j in node_causes]))
            flags = base | (BIT["access_eval"] if causes else 0) | (BIT["time"] if any(j in node_time for j in seg) else 0)
            if any(ids[j] in elevators for j in seg):
                flags |= BIT["elevator"]
            common = {"u": u, "v": v, "way_id": wy["id"], "name": tags.get("name"), "level": tags.get("level"),
                      "landmark": None, "hours_idx": None, "highway": hw,
                      "raised": {ids[j] for j in seg if ids[j] in raised},
                      "tag_cover": any(tags.get(k, "no") != "no" for k in ("covered", "indoor")),
                      "footway_crossing": tags.get("footway") == "crossing" and tags.get("crossing") != "no"}
            if sides:
                xy = list(zip(*TO_UTM.transform([lons[j] for j in seg], [lats[j] for j in seg])))
                fallen_sidewalk = None
                for s in sides:
                    has_sidewalk = (left if s == "left" else right) == "yes"
                    off, d_used = fit_offset(xy, offset_m, 1 if s == "left" else -1, ground_tree)
                    if off is None:
                        offset_fallback[s] += 1
                        fallen_sidewalk = bool(fallen_sidewalk) or has_sidewalk
                        continue
                    offset_moved += d_used < offset_m - 1e-9
                    lo2, la2 = TO_LL.transform([p[0] for p in off], [p[1] for p in off])
                    geom = [[round(a, 7), round(b, 7)] for a, b in zip(lo2, la2)]
                    side_flags = flags | (BIT["sidewalk"] if has_sidewalk else 0)
                    edges.append({**common, "geom": geom, "flags": side_flags, "side": s,
                                  "len_m": line_len_ll(geom), "offset_m": round(d_used, 2)})
                    causes_of.append(causes)
                if fallen_sidewalk is not None:
                    # One centre edge stands in for every side that still sits inside a footprint at 1.5 m.
                    fallback_edges += 1
                    edges.append({**common, "geom": centre, "side": "centre", "len_m": line_len_ll(centre),
                                  "flags": flags | (BIT["sidewalk"] if fallen_sidewalk else 0), "offset_m": 0.0})
                    causes_of.append(causes)
            else:
                edges.append({**common, "geom": centre, "flags": flags, "side": "centre",
                              "len_m": line_len_ll(centre), "offset_m": 0.0})
                causes_of.append(causes)
            start = i

    # Mall hours: indoor, corridor and building-passage edges inside or touching a matched footprint.
    hours = json.load(open(OUT / "hours.json"))
    hours_match = json.load(open(WORK / "hours_match.json"))
    fps = [(m["row"], f["name"], shapely.from_wkt(f["wkt"])) for m in hours_match for f in m["footprints"]]
    fp_tree = STRtree([f[2] for f in fps])
    url_row = {h["source_url"]: i for i, h in enumerate(hours)}
    hours_hits = Counter()
    for e in edges:
        own = url_row.get(f"https://www.openstreetmap.org/way/{e['way_id']}")
        if own is not None:
            e["hours_idx"] = own
        elif e["flags"] & BIT["indoor"]:
            line = shapely.LineString(e["geom"])
            best = None
            for k in fp_tree.query(line, predicate="intersects"):
                row, name, poly = fps[k]
                inside = shapely.intersection(line, poly).length
                if best is None or inside > best[0]:
                    best = (inside, row, name)
            if best:
                e["hours_idx"] = best[1]
        if e["hours_idx"] is not None:
            e["flags"] |= BIT["time"]
            hours_hits[hours[e["hours_idx"]]["name"]] += 1

    # Decision 3: a controlled passage with a cited hours row is routable while open.
    opened = []
    for i, e in enumerate(edges):
        if e["hours_idx"] is not None and "way_controlled_passage" in causes_of[i]:
            causes_of[i] = [c for c in causes_of[i] if c != "way_controlled_passage"]  # new list; pieces share one
            if not causes_of[i]:
                e["flags"] &= ~BIT["access_eval"]
                opened.append(e)

    # Decision 1: a raised kerb is a step. Mark the crossings that touch it, else every edge through it.
    by_kerb = defaultdict(list)
    for e in edges:
        for nid in e.pop("raised"):
            by_kerb[nid].append(e)
    kerb_steps = Counter()
    for nid, es in by_kerb.items():
        crossings = [e for e in es if e["flags"] & BIT["crossing"]]
        for e in crossings or es:
            if not e["flags"] & BIT["steps"]:
                e["flags"] |= BIT["steps"]
                kerb_steps["crossing" if crossings else "other"] += 1

    # Decision 7: unsheltered edges mostly inside a footprint, with no cover or indoor tag.
    inside_edges = []
    for e in edges:
        tag_cover = e.pop("tag_cover")
        if e["flags"] & 7 or tag_cover:
            continue
        xy = np.column_stack(TO_UTM.transform([p[0] for p in e["geom"]], [p[1] for p in e["geom"]]))
        line = shapely.LineString(xy)
        if line.length == 0:
            continue
        hits = every_tree.query(line, predicate="intersects")
        if not len(hits):
            continue
        inside = shapely.union_all([every_fp[k] for k in hits]).intersection(line).length
        if inside / line.length > INSIDE_SHARE:
            e["flags"] |= BIT["inside_footprint"]
            inside_edges.append(e)

    # Landmarks: nearest named building, mall, station, amenity or park within 25 m of the edge midpoint.
    feats, tree = landmark_index()
    for e in edges:
        xy = list(zip(*TO_UTM.transform([p[0] for p in e["geom"]], [p[1] for p in e["geom"]])))
        line = shapely.LineString(xy)
        mid = line.interpolate(0.5, normalized=True)
        best = None
        for k in tree.query(mid.buffer(LANDMARK_M)):
            name, g, area = feats[k]
            d = g.distance(mid)
            if d <= LANDMARK_M and (best is None or (round(d, 1), area) < best[0]):
                best = ((round(d, 1), area), name)
        e["landmark"] = best[1] if best else None

    for i, e in enumerate(edges):
        e["id"] = i
        e["len_m"] = round(e["len_m"], 2)
        e["routable"] = not (e["flags"] & BIT["access_eval"]) and not (
            e["flags"] & BIT["time"] and e["hours_idx"] is None)
    osm_of = [0] * len(nodes)
    for osm_id, idx in node_index.items():
        osm_of[idx] = osm_id
    node_flags = [0] * len(nodes)
    for idx, osm_id in enumerate(osm_of):
        if osm_id in cross_nodes:
            node_flags[idx] |= NODE_BIT["crossing"]
        if osm_id in signal_nodes:
            node_flags[idx] |= NODE_BIT["signals"]
        if len(ways_at_node[osm_id]) >= 3:
            node_flags[idx] |= NODE_BIT["junction"]
    for e in edges:
        ends = (e["u"], e["v"])
        if e.pop("footway_crossing"):
            for k in ends:
                node_flags[k] |= NODE_BIT["crossing"]
        if e["highway"] == "steps" or e["flags"] & (BIT["footbridge"] | BIT["tunnel"]):
            for k in ends:
                node_flags[k] |= NODE_BIT["grade_separated"]

    offsets = [e.pop("offset_m") for e in edges]
    write_json(WORK / "edge_highway.json", [e.pop("highway") for e in edges])
    write_json(WORK / "node_osm_ids.json", osm_of)
    keys = ["id", "u", "v", "len_m", "geom", "flags", "routable", "side", "way_id", "name", "landmark",
            "hours_idx", "level"]
    out_edges = [{k: e[k] for k in keys} for e in edges]
    write_json(OUT / "graph.json", {"nodes": nodes, "edges": out_edges, "node_flags": node_flags})

    # Summary numbers for NOTES.md and the manifest.
    n = len(nodes)
    rout = [e for e in edges if e["routable"]]
    r_u = np.array([e["u"] for e in rout])
    r_v = np.array([e["v"] for e in rout])
    adj = coo_matrix((np.ones(len(rout)), (r_u, r_v)), shape=(n, n))
    ncomp, lab = connected_components(adj, directed=False)
    touched = np.zeros(n, bool)
    touched[r_u] = True
    touched[r_v] = True
    comp_nodes = Counter(lab[touched])
    big, big_nodes = comp_nodes.most_common(1)[0]
    km = lambda es: round(sum(e["len_m"] for e in es) / 1000, 3)  # noqa: E731
    big_km = km([e for e in rout if lab[e["u"]] == big])
    cause_edges, cause_km, only_edges, only_km = Counter(), Counter(), Counter(), Counter()
    for e, cs in zip(edges, causes_of):
        for c in cs:
            cause_edges[c] += 1
            cause_km[c] += e["len_m"] / 1000
        if len(cs) == 1:
            only_edges[cs[0]] += 1
            only_km[cs[0]] += e["len_m"] / 1000
    unroutable = [e for e in edges if not e["routable"]]
    time_only = [e for e in unroutable if not e["flags"] & BIT["access_eval"]]
    flag_counts = {name: sum(1 for e in edges if e["flags"] & b) for name, b in BIT.items()}
    flag_km = {name: km([e for e in edges if e["flags"] & b]) for name, b in BIT.items()}
    side_offsets = [o for o in offsets if o > 0]
    log = {
        "access_profile": LOCAL_PROFILE, "seconds": round(time.time() - t0, 1),
        "ways_kept": len(ways), "ways_not_walkable": not_walkable,
        "ways_with_blocked_node": blocked_ways, "pieces_omitted_blocked_node": blocked_pieces,
        "km_omitted_blocked_node": round(blocked_len / 1000, 3),
        "connector_ways": len(connectors),
        "connector_km": round(sum(sum(haversine(c["lats"][i - 1], c["lons"][i - 1], c["lats"][i], c["lons"][i])
                                      for i in range(1, len(c["ids"]))) for c in connectors) / 1000, 3),
        "connector_way_ids": [c["id"] for c in connectors],
        "ways_bad_location": bad_loc, "max_node_distance_outside_graph_bbox_m": round(max_out_m, 1),
        "nodes": n, "edges": len(edges), "km": km(edges),
        "routable_edges": len(rout), "routable_km": km(rout),
        "unroutable_edges": len(unroutable), "unroutable_km": km(unroutable),
        "unroutable_time_only_edges": len(time_only), "unroutable_time_only_km": km(time_only),
        "routable_components": int(len(comp_nodes)), "largest_component_nodes": int(big_nodes),
        "routable_nodes": int(touched.sum()),
        "largest_component_node_share": round(big_nodes / max(1, touched.sum()), 4),
        "largest_component_km": big_km,
        "largest_component_km_share": round(big_km / max(1e-9, km(rout)), 4),
        "side_ways": dict(side_stats), "side_width_source_ways": dict(offsets_used),
        "class_default_lanes": class_lanes, "lane_m": LANE_M, "side_extra_m": SIDE_EXTRA_M,
        "side_offset_m": {"min": round(min(side_offsets), 2), "median": round(median(side_offsets), 2),
                          "max": round(max(side_offsets), 2)} if side_offsets else None,
        "edges_by_side": dict(Counter(e["side"] for e in edges)),
        "flag_edges": flag_counts, "flag_km": flag_km,
        "eval_cause_edges": dict(cause_edges.most_common()),
        "eval_cause_km": {k: round(v, 3) for k, v in cause_km.most_common()},
        "eval_only_cause_edges": dict(only_edges.most_common()),
        "eval_only_cause_km": {k: round(v, 3) for k, v in only_km.most_common()},
        "hours_idx_edges": dict(hours_hits),
        "indoor_opened_by_hours_edges": len(opened), "indoor_opened_by_hours_km": km(opened),
        "ways_with_ignored_vehicle_conditionals": ignored_ways,
        "ignored_conditional_keys": dict(ignored_keys.most_common()),
        "kerb_nodes_no_longer_checked": len(kerb_ignored),
        "raised_kerb_nodes_on_graph": len(by_kerb), "raised_kerb_steps_edges": dict(kerb_steps),
        "sheltered_km": km([e for e in edges if e["flags"] & 7]),
        "side_edges_moved_closer": int(offset_moved), "side_fallback_sides": dict(offset_fallback),
        "side_fallback_centre_edges": fallback_edges,
        "node_flag_counts": {k: sum(1 for f in node_flags if f & b) for k, b in NODE_BIT.items()},
        "nodes_with_any_node_flag": sum(1 for f in node_flags if f),
        "nodes_crossing_or_signals": sum(1 for f in node_flags if f & 3),
        "crossing_no_graph_nodes": sum(1 for o in osm_of if o in crossing_no_nodes),
        "street_crossing_nodes": {
            name: {"graph_nodes": len(on), "bit1": sum(1 for i in on if node_flags[i] & 1),
                   "bit2": sum(1 for i in on if node_flags[i] & 2),
                   "bit1_or_2": sum(1 for i in on if node_flags[i] & 3)}
            for name in CROSSING_STREETS
            for on in [[node_index[o] for o in street_nodes[name] if o in node_index]]},
        "inside_footprint_edges": len(inside_edges), "inside_footprint_km": km(inside_edges),
        "inside_footprint_by_side": dict(Counter(e["side"] for e in inside_edges)),
        "inside_footprint_routable_edges": sum(1 for e in inside_edges if e["routable"]),
        "sheltered_routable_km": km([e for e in rout if e["flags"] & 7]),
        "sheltered_routable_edges": sum(1 for e in rout if e["flags"] & 7), "landmark_edges": sum(1 for e in edges if e["landmark"]),
    }
    write_json(WORK / "graph_log.json", log, indent=1)
    write_json(WORK / "edge_causes.json", causes_of)
    print(json.dumps(log, indent=1))


if __name__ == "__main__":
    main()
