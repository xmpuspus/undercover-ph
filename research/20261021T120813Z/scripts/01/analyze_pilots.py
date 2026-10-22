"""Compute per-pilot walk-network metrics from the cached NCR walkable ways.

Usage: scripts/05/venv/bin/python -I analyze_pilots.py <pickle> <ncr_nominatim_json> <out_json>
Method: a segment (two consecutive way nodes) belongs to a region when its midpoint is inside it.
"""

import datetime
import json
import math
import pickle
import statistics
import sys
from collections import Counter, defaultdict

import igraph
import numpy as np
import shapely
from shapely.geometry import shape
from shapely.prepared import prep

PILOTS = {
    "makati": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
    "updiliman": (14.647, 121.055, 14.664, 121.075),
    "manila": (14.575, 120.970, 14.595, 120.990),
    "cubao": (14.615, 121.048, 14.625, 121.060),
}
NCR_BOX = (14.35, 120.90, 14.80, 121.20)
SINCE = datetime.datetime(2024, 1, 1, tzinfo=datetime.timezone.utc).timestamp()
TERT_UP = {"trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"}
ROAD = TERT_UP | {"unclassified", "residential", "living_street", "service"}
PEDSET = {"footway", "pedestrian", "path", "steps", "corridor"}
ACC = ["wheelchair", "ramp", "incline", "kerb", "tactile_paving"]


def hav(la1, lo1, la2, lo2):
    r = 6371008.8
    p1, p2 = math.radians(la1), math.radians(la2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def box_area(b):
    s, w, n, e = b
    return hav(s, w, n, w) * hav(s, w, s, e) / 1e6


def klass(tags):
    h = tags["highway"]
    if h in TERT_UP:
        return "tertiary_up"
    if h in ("footway", "pedestrian", "path", "steps", "corridor", "living_street", "residential", "service", "unclassified"):
        return h
    return "other"  # track, bridleway, road, etc.


def acc_key(k):
    return "ramp" if k.startswith("ramp") else k


def run_region(name, inside, bbox, ways, nodes, walknodes, interior_margin_m=25):
    """inside(lat_array, lon_array) -> bool array. bbox is a coarse prefilter (s,w,n,e)."""
    km = Counter()
    wcount = Counter()
    tot_km = 0.0
    sidew_sep_km = 0.0
    road_km = 0.0
    road_sw_any = 0.0
    road_sw_yes = 0.0
    road_nsvc_km = 0.0
    road_nsvc_sw_any = 0.0
    fb_n = fb_km = 0.0
    cov_n = 0
    cov_km = 0.0
    tun_n = 0
    tun_km = 0.0
    bp_n = 0
    elev_ped_n = 0
    elev_ped_km = 0.0
    steps_n = 0
    cross_way_n = 0
    acc_way = Counter()
    ts = []
    ts_ped = []
    runs = []  # list of node-id lists (maximal inside runs)
    seg_edges = []  # (u,v,len)
    ped_edges = []
    for wid, t, tg, pts in ways:
        la = np.array([p[1] for p in pts])
        lo = np.array([p[2] for p in pts])
        if la.max() < bbox[0] or la.min() > bbox[2] or lo.max() < bbox[1] or lo.min() > bbox[3]:
            continue
        mla = (la[:-1] + la[1:]) / 2
        mlo = (lo[:-1] + lo[1:]) / 2
        ins = inside(mla, mlo)
        if not ins.any():
            continue
        k = klass(tg)
        h = tg["highway"]
        seglen = [hav(la[i], lo[i], la[i + 1], lo[i + 1]) / 1000 for i in range(len(pts) - 1)]
        L = sum(s for s, f in zip(seglen, ins) if f)
        km[k] += L
        wcount[k] += 1
        tot_km += L
        ts.append(t)
        if h in PEDSET:
            ts_ped.append(t)
        if tg.get("footway") == "sidewalk":
            sidew_sep_km += L
        if tg.get("footway") == "crossing":
            cross_way_n += 1
        if h in ("footway", "path") and tg.get("bridge") == "yes":
            fb_n += 1
            fb_km += L
        if h == "steps":
            steps_n += 1
        if h in PEDSET:
            if tg.get("covered") in ("yes", "arcade", "colonnade"):
                cov_n += 1
                cov_km += L
            if tg.get("tunnel") == "yes":
                tun_n += 1
                tun_km += L
            if tg.get("tunnel") == "building_passage":
                bp_n += 1
            try:
                lay = int(tg.get("layer", "0"))
            except ValueError:
                lay = 0
            if lay >= 1 or tg.get("bridge") == "yes":
                elev_ped_n += 1
                elev_ped_km += L
        if h in ROAD:
            sw = [v for kk, v in tg.items() if kk in ("sidewalk", "sidewalk:left", "sidewalk:right", "sidewalk:both")]
            road_km += L
            if sw:
                road_sw_any += L
                if any(v not in ("no", "none") for v in sw):
                    road_sw_yes += L
            if h != "service":
                road_nsvc_km += L
                if sw:
                    road_nsvc_sw_any += L
        for kk in tg:
            if kk in ("wheelchair", "incline", "kerb", "tactile_paving") or kk.startswith("ramp"):
                acc_way[acc_key(kk)] += 1
        # runs and edges
        cur = []
        for i, f in enumerate(ins):
            if f:
                if not cur:
                    cur = [pts[i][0]]
                cur.append(pts[i + 1][0])
                seg_edges.append((pts[i][0], pts[i + 1][0], seglen[i] * 1000, la[i], lo[i], la[i + 1], lo[i + 1]))
                if h in PEDSET:
                    ped_edges.append((pts[i][0], pts[i + 1][0], seglen[i] * 1000))
            else:
                if cur:
                    runs.append(cur)
                cur = []
        if cur:
            runs.append(cur)
    # simplified edge count (osmnx-style): breakpoints = run ends and nodes used by 2+ run positions
    appear = Counter()
    for r in runs:
        appear.update(r)
    simp = 0
    for r in runs:
        inner = sum(1 for n in r[1:-1] if appear[n] >= 2)
        simp += 1 + inner
    res = {
        "walk_km": round(tot_km, 3),
        "walk_ways": sum(wcount.values()),
        "km_by_class": {k: round(v, 3) for k, v in sorted(km.items(), key=lambda x: -x[1])},
        "ways_by_class": dict(wcount),
        "raw_segments": len(seg_edges),
        "simplified_edges_undirected": simp,
        "simplified_edges_directed_osmnx_walk": simp * 2,
        "sidewalk_footway_km": round(sidew_sep_km, 3),
        "road_km": round(road_km, 3),
        "road_km_with_sidewalk_key": round(road_sw_any, 3),
        "road_share_sidewalk_key": round(road_sw_any / road_km, 3) if road_km else None,
        "road_share_sidewalk_value_not_no": round(road_sw_yes / road_km, 3) if road_km else None,
        "road_km_excl_service": round(road_nsvc_km, 3),
        "road_share_sidewalk_key_excl_service": round(road_nsvc_sw_any / road_nsvc_km, 3) if road_nsvc_km else None,
        "footbridge_ways_footway_path_bridge_yes": int(fb_n),
        "footbridge_km": round(fb_km, 3),
        "steps_ways": steps_n,
        "ped_covered_yes_ways": cov_n,
        "ped_covered_yes_km": round(cov_km, 3),
        "ped_tunnel_yes_ways": tun_n,
        "ped_tunnel_yes_km": round(tun_km, 3),
        "ped_building_passage_ways": bp_n,
        "ped_elevated_ways_layer_ge1_or_bridge": elev_ped_n,
        "ped_elevated_km": round(elev_ped_km, 3),
        "crossing_ways_footway_crossing": cross_way_n,
        "acc_tags_on_ways": dict(acc_way),
    }
    # nodes
    nb = bbox
    cn = en = 0
    acc_node_net = Counter()
    acc_node_off = Counter()
    for nid, lat, lon, tg in nodes:
        if not (nb[0] <= lat <= nb[2] and nb[1] <= lon <= nb[3]):
            continue
        if not inside(np.array([lat]), np.array([lon]))[0]:
            continue
        if tg.get("highway") == "crossing":
            cn += 1
        if tg.get("highway") == "elevator":
            en += 1
        for kk in tg:
            if kk in ("wheelchair", "incline", "kerb", "tactile_paving") or kk.startswith("ramp"):
                (acc_node_net if nid in walknodes else acc_node_off)[acc_key(kk)] += 1
    res["crossing_nodes"] = cn
    res["elevator_nodes"] = en
    res["acc_tags_on_walk_nodes"] = dict(acc_node_net)
    res["acc_tags_on_other_nodes_poi"] = dict(acc_node_off)
    # edit recency
    if ts:
        res["way_median_ts"] = datetime.datetime.fromtimestamp(statistics.median(ts), datetime.timezone.utc).date().isoformat()
        res["share_ways_edited_since_2024"] = round(sum(1 for t in ts if t >= SINCE) / len(ts), 3)
    if ts_ped:
        res["ped_way_median_ts"] = datetime.datetime.fromtimestamp(statistics.median(ts_ped), datetime.timezone.utc).date().isoformat()
        res["ped_ways_n"] = len(ts_ped)
        res["share_ped_ways_edited_since_2024"] = round(sum(1 for t in ts_ped if t >= SINCE) / len(ts_ped), 3)
    # graph: components and dead-ends
    ids = {}
    ex = []
    ew = []
    coord = {}
    for u, v, l, a1, o1, a2, o2 in seg_edges:
        for n, (la_, lo_) in ((u, (a1, o1)), (v, (a2, o2))):
            if n not in ids:
                ids[n] = len(ids)
                coord[n] = (la_, lo_)
        if u != v:
            ex.append((ids[u], ids[v]))
            ew.append(l)
    if ids:
        g = igraph.Graph(n=len(ids), edges=ex)
        cc = g.connected_components()
        mem = np.array(cc.membership)
        sizes = np.bincount(mem)
        big = int(sizes.argmax())
        kmc = np.zeros(len(sizes))
        for (a, b), l in zip(ex, ew):
            kmc[mem[a]] += l / 1000
        deg = np.array(g.degree())
        # dedupe parallel edges for dead-end test
        sg = g.copy()
        sg.simplify()
        sdeg = np.array(sg.degree())
        inv = {i: n for n, i in ids.items()}
        s_, w_, n_, e_ = bbox
        dead = 0
        dead_int = 0
        # interior margin measured against the region bbox; for polygon region use a generic test below
        for i in np.where(sdeg == 1)[0]:
            dead += 1
            la_, lo_ = coord[inv[int(i)]]
            d = min(hav(la_, lo_, s_, lo_), hav(la_, lo_, n_, lo_), hav(la_, lo_, la_, w_), hav(la_, lo_, la_, e_))
            if d > interior_margin_m:
                dead_int += 1
        res["graph_nodes"] = len(ids)
        res["graph_components"] = len(sizes)
        res["lcc_nodes"] = int(sizes[big])
        res["lcc_node_share"] = round(float(sizes[big] / len(ids)), 4)
        res["lcc_km"] = round(float(kmc[big]), 3)
        res["lcc_km_share"] = round(float(kmc[big] / kmc.sum()), 4)
        res["second_component_nodes"] = int(np.sort(sizes)[-2]) if len(sizes) > 1 else 0
        res["dead_ends_all"] = dead
        res["dead_ends_interior_gt25m_from_box_edge"] = dead_int
        # pedestrian-only graph
        pid = {}
        pe = []
        for u, v, l in ped_edges:
            if u == v:
                continue
            for n in (u, v):
                if n not in pid:
                    pid[n] = len(pid)
            pe.append((pid[u], pid[v]))
        if pe:
            pg = igraph.Graph(n=len(pid), edges=pe)
            pc = pg.connected_components()
            ps = np.bincount(np.array(pc.membership))
            res["ped_only_nodes"] = len(pid)
            res["ped_only_components"] = len(ps)
            res["ped_only_lcc_node_share"] = round(float(ps.max() / len(pid)), 4)
    return res


def sidewalk_proxy(ways, b, dist=20.0, step=10.0):
    lat0 = (b[0] + b[2]) / 2
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    pad = 0.0006
    lines_sw, lines_any, roads = [], [], []
    for wid, t, tg, pts in ways:
        la = [p[1] for p in pts]
        lo = [p[2] for p in pts]
        if max(la) < b[0] - pad or min(la) > b[2] + pad or max(lo) < b[1] - pad or min(lo) > b[3] + pad:
            continue
        xy = [((o - b[1]) * kx, (a - b[0]) * ky) for a, o in zip(la, lo)]
        h = tg["highway"]
        if h == "footway" and tg.get("footway") == "sidewalk":
            lines_sw.append(shapely.LineString(xy))
            lines_any.append(shapely.LineString(xy))
        elif (h in ("footway", "path", "pedestrian")) and tg.get("footway") != "crossing" and tg.get("bridge") is None and tg.get("tunnel") is None:
            lines_any.append(shapely.LineString(xy))
        elif h in ROAD and h != "service" and h not in ("trunk_link", "primary_link", "secondary_link", "tertiary_link"):
            sw = [v for kk, v in tg.items() if kk in ("sidewalk", "sidewalk:left", "sidewalk:right", "sidewalk:both")]
            roads.append((shapely.LineString(xy), bool(sw) and any(v not in ("no", "none") for v in sw), (b[2] - b[0]) * ky, (b[3] - b[1]) * kx))
    W = (b[3] - b[1]) * kx
    H = (b[2] - b[0]) * ky
    pts_all, tagged = [], []
    for ln, tg_ok, _, _ in roads:
        n = max(1, int(ln.length // step))
        for i in range(n):
            pt = ln.interpolate((i + 0.5) * ln.length / n)
            if 0 <= pt.x <= W and 0 <= pt.y <= H:
                pts_all.append(pt)
                tagged.append(tg_ok)
    tagged = np.array(tagged)
    out = {"sample_points": len(pts_all), "road_excl_service_step_m": step, "dist_m": dist}
    if not pts_all:
        return out
    pa = np.array(pts_all, dtype=object)
    def near(lines):
        if not lines:
            return np.zeros(len(pts_all), bool)
        tree = shapely.STRtree(lines)
        idx = tree.query(pa, predicate="dwithin", distance=dist)
        m = np.zeros(len(pts_all), bool)
        m[np.unique(idx[0])] = True
        return m
    n_sw = near(lines_sw)
    n_any = near(lines_any)
    out["share_road_pts_with_tag"] = round(float(tagged.mean()), 3)
    out["share_road_pts_near_footway_sidewalk"] = round(float(n_sw.mean()), 3)
    out["share_road_pts_near_any_footway"] = round(float(n_any.mean()), 3)
    out["share_road_pts_tag_or_near_sidewalk_way"] = round(float((tagged | n_sw).mean()), 3)
    out["share_road_pts_tag_or_near_any_footway"] = round(float((tagged | n_any).mean()), 3)
    return out


def main(pkl, ncr_json, out):
    d = pickle.load(open(pkl, "rb"))
    ways, nodes = d["ways"], d["nodes"]
    walknodes = set()
    for w in ways:
        for p in w[3]:
            walknodes.add(p[0])
    result = {"meta": {"ways_cached": len(ways), "tagged_nodes_cached": len(nodes), "bad_loc": d["bad_loc"], "highway_ways_seen": d["highway_ways_seen"],
                       "access_profile": d.get("access_profile", "historical-access-blind"),
                       "routing_ready": False,
                       "note": "Structural candidate metrics. Schedules, directional access, crossings and field continuity still need validation.",
                       "ways_excluded_by_blocked_node": d.get("ways_excluded_by_blocked_node")}}
    for k, b in PILOTS.items():
        def inside(la, lo, b=b):
            return (la >= b[0]) & (la <= b[2]) & (lo >= b[1]) & (lo <= b[3])
        r = run_region(k, inside, b, ways, nodes, walknodes)
        r["area_km2"] = round(box_area(b), 3)
        r["sidewalk_proxy"] = sidewalk_proxy(ways, b)
        r["crossing_nodes_per_km2"] = round(r["crossing_nodes"] / r["area_km2"], 1)
        r["walk_km_per_km2"] = round(r["walk_km"] / r["area_km2"], 1)
        result[k] = r
        print(k, r["walk_km"], r.get("lcc_node_share"), flush=True)

    def in_box(la, lo):
        return (la >= NCR_BOX[0]) & (la <= NCR_BOX[2]) & (lo >= NCR_BOX[1]) & (lo <= NCR_BOX[3])
    r = run_region("ncr_box", in_box, NCR_BOX, ways, nodes, walknodes)
    r["area_km2"] = round(box_area(NCR_BOX), 1)
    result["ncr_box"] = r
    print("ncr_box", r["walk_km"], r["simplified_edges_undirected"], flush=True)

    poly = shape(json.load(open(ncr_json))[0]["geojson"])
    pp = prep(poly)
    shapely.prepare(poly)

    def in_poly(la, lo):
        return shapely.contains_xy(poly, lo, la)
    pb = poly.bounds  # minx, miny, maxx, maxy
    r = run_region("ncr_polygon", in_poly, (pb[1], pb[0], pb[3], pb[2]), ways, nodes, walknodes)
    r["note"] = "Nominatim relation polygon for Metro Manila; dead_end interior test uses the polygon bbox, so ignore dead-end fields"
    result["ncr_polygon"] = r
    print("ncr_polygon", r["walk_km"], r["simplified_edges_undirected"], flush=True)
    json.dump(result, open(out, "w"), indent=1)


main(*sys.argv[1:4])
