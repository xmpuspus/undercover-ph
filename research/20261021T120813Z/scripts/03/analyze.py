"""Shelter tables, footbridges, opening hours, underpass match and covered reach from ncr_ways.jsonl.
Usage: python3 -I analyze.py RAW03_DIR
Category rules copy overpass_fetch_v2.py and union_stats.py. Way rule: any node in the box, full way length."""
import csv
import heapq
import json
import math
import re
import sys
import unicodedata
from collections import defaultdict

D = sys.argv[1]
BOX = {
    "makati_cbd": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
    "up_diliman": (14.647, 121.055, 14.664, 121.075),
    "u_belt": (14.575, 120.970, 14.595, 120.990),
    "cubao": (14.615, 121.048, 14.625, 121.060),
    "metro_manila": (14.35, 120.90, 14.80, 121.20),
}
PED = {"footway", "pedestrian", "steps", "corridor", "path"}
COV = {"yes", "arcade", "roof"}
R = 6371008.8


def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def wlen(pts):
    return sum(hav(pts[i][1:], pts[i + 1][1:]) for i in range(len(pts) - 1))


ways = [json.loads(l) for l in open(D + "/ncr_ways.jsonl")]
nodes = [json.loads(l) for l in open(D + "/ncr_nodes.jsonl")]
for w in ways:
    w["len"] = wlen(w["pts"])
    w["t"] = w["tags"]


def inbox(pts, b):
    return any(b[0] <= p[1] <= b[2] and b[1] <= p[2] <= b[3] for p in pts)


def isped(t):
    return t.get("highway") in PED


def cover_tag(t):
    return t.get("covered") in COV or t.get("tunnel") == "building_passage" or t.get("indoor") == "corridor" or t.get("highway") == "corridor"


def under(t):
    return t.get("tunnel") not in (None, "no", "building_passage")


def bridge(t):
    return t.get("bridge") not in (None, "no")


out = {}
rows = []
for area, b in BOX.items():
    ws = [w for w in ways if inbox(w["pts"], b)]
    ns = [n for n in nodes if b[0] <= n["lat"] <= b[2] and b[1] <= n["lon"] <= b[3]]

    def row(cat, sel, extra_nodes=()):
        sel = list(sel)
        km = sum(w["len"] for w in sel) / 1000
        pk = sum(w["len"] for w in sel if isped(w["t"])) / 1000
        pc = sum(1 for w in sel if isped(w["t"]))
        rows.append((area, cat, len(sel) + len(list(extra_nodes)), round(km, 3), pc, round(pk, 3)))

    row("amenity=shelter", [w for w in ws if w["t"].get("amenity") == "shelter"], [n for n in ns if n["tags"].get("amenity") == "shelter"])
    row("building=roof", [w for w in ws if w["t"].get("building") == "roof"])
    row("bus_stop+shelter=yes", [], [n for n in ns if n["tags"].get("highway") == "bus_stop" and n["tags"].get("shelter") == "yes"])
    row("covered=yes", [w for w in ws if w["t"].get("covered") == "yes"])
    row("covered=arcade|roof|colonnade", [w for w in ws if w["t"].get("covered") in ("arcade", "roof", "colonnade")])
    row("highway=corridor", [w for w in ws if w["t"].get("highway") == "corridor"])
    row("indoor=corridor", [w for w in ws if w["t"].get("indoor") == "corridor"])
    row("ped+bridge(key set, v2 rule)", [w for w in ws if isped(w["t"]) and "bridge" in w["t"]])
    row("ped+bridge(not no)", [w for w in ws if isped(w["t"]) and bridge(w["t"])])
    row("ped+bridge+cover tag", [w for w in ws if isped(w["t"]) and bridge(w["t"]) and cover_tag(w["t"])])
    row("ped+layer", [w for w in ws if isped(w["t"]) and "layer" in w["t"]])
    row("ped+tunnel(key set, v2 rule)", [w for w in ws if isped(w["t"]) and "tunnel" in w["t"]])
    row("ped underpass(excl building_passage,no)", [w for w in ws if isped(w["t"]) and under(w["t"])])
    row("tunnel=building_passage", [w for w in ws if w["t"].get("tunnel") == "building_passage"])
    row("UNION ped ways with cover tag", [w for w in ws if isped(w["t"]) and cover_tag(w["t"])])
    row("UNION cover or underpass", [w for w in ws if isped(w["t"]) and (cover_tag(w["t"]) or under(w["t"]))])
    row("UNION cover or underpass or any ped bridge", [w for w in ws if isped(w["t"]) and (cover_tag(w["t"]) or under(w["t"]) or bridge(w["t"]))])
    # opening hours
    oh = [w for w in ws if "opening_hours" in w["t"]]
    ind = [w for w in ws if w["t"].get("tunnel") == "building_passage" or w["t"].get("indoor") in ("corridor", "yes") or w["t"].get("highway") == "corridor"]
    mall = [w for w in ws if re.search(r"mall|link|walkway|skywalk|passage|greenbelt|glorietta|trinoma|megamall|podium|ayala|robinsons|SM ", w["t"].get("name", ""), re.I)
            and (cover_tag(w["t"]) or bridge(w["t"]) or under(w["t"]) or w["t"].get("indoor"))]
    out[area] = {
        "ways_in_box": len(ws),
        "indoor_or_passage_ways": len(ind),
        "indoor_or_passage_with_oh": sum(1 for w in ind if "opening_hours" in w["t"]),
        "mall_link_named_ways": len(mall),
        "mall_link_with_oh": sum(1 for w in mall if "opening_hours" in w["t"]),
        "all_ways_with_oh": len(oh),
        "ped_ways_with_oh": sum(1 for w in oh if isped(w["t"])),
        "entrance_nodes_with_oh": sum(1 for n in ns if "entrance" in n["tags"] and "opening_hours" in n["tags"]),
    }
with open(D + "/summary_v3_all_pilots.csv", "w", newline="") as f:
    cw = csv.writer(f)
    cw.writerow(["area", "category", "elements", "km_all_ways", "ped_class_ways", "km_ped_class"])
    cw.writerows(rows)
json.dump(out, open(D + "/opening_hours_counts.json", "w"), indent=1)

# footbridges in Metro Manila: cluster by shared nodes
mm = BOX["metro_manila"]
fb = [w for w in ways if isped(w["t"]) and bridge(w["t"]) and inbox(w["pts"], mm)]
par = {}


def find(x):
    while par.setdefault(x, x) != x:
        par[x] = par[par[x]]
        x = par[x]
    return x


for w in fb:
    ids = [p[0] for p in w["pts"]]
    for i in ids[1:]:
        par[find(i)] = find(ids[0])
cl = defaultdict(list)
for w in fb:
    cl[find(w["pts"][0][0])].append(w)
st = []
for k, g in cl.items():
    L = sum(w["len"] for w in g)
    cov = any(cover_tag(w["t"]) for w in g)
    names = sorted({w["t"].get("name") for w in g if w["t"].get("name")})
    lat = sum(p[1] for w in g for p in w["pts"]) / sum(len(w["pts"]) for w in g)
    lon = sum(p[2] for w in g for p in w["pts"]) / sum(len(w["pts"]) for w in g)
    st.append({"ways": len(g), "len": round(L, 1), "cov": cov, "names": names, "lat": round(lat, 5), "lon": round(lon, 5),
               "bridge_vals": sorted({w["t"].get("bridge") for w in g}), "hw": sorted({w["t"].get("highway") for w in g})})
json.dump(st, open(D + "/footbridge_structures.json", "w"), indent=0)
fbs = {
    "ways": len(fb), "km": round(sum(w["len"] for w in fb) / 1000, 2), "ways_with_cover": sum(1 for w in fb if cover_tag(w["t"])),
    "structures": len(st), "structures_with_cover": sum(1 for s in st if s["cov"]),
    "structures_ge30m": sum(1 for s in st if s["len"] >= 30), "structures_ge30m_cover": sum(1 for s in st if s["len"] >= 30 and s["cov"]),
    "structures_ge50m": sum(1 for s in st if s["len"] >= 50), "structures_named": sum(1 for s in st if s["names"]),
    "bridge_values": sorted({w["t"].get("bridge") for w in fb}),
}
json.dump(fbs, open(D + "/footbridge_summary.json", "w"), indent=1)
print("FOOTBRIDGES", json.dumps(fbs))
print("OPENING_HOURS", json.dumps(out, indent=1))

# underpass match in the Makati area (wider box 14.54-14.57, 121.00-121.04)
def norm(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


mk = (14.540, 121.000, 14.575, 121.040)
named = [w for w in ways if w["t"].get("name") and w["walk"] and not isped(w["t"]) and inbox(w["pts"], mk)]
roadpts = [(p[1], p[2], norm(w["t"]["name"])) for w in named for p in w["pts"]]
tun = [w for w in ways if isped(w["t"]) and under(w["t"]) and inbox(w["pts"], mk)]
par.clear()
for w in tun:
    ids = [p[0] for p in w["pts"]]
    for i in ids[1:]:
        par[find(i)] = find(ids[0])
tc = defaultdict(list)
for w in tun:
    tc[find(w["pts"][0][0])].append(w)
tl = []
for k, g in tc.items():
    pts = [(p[1], p[2]) for w in g for p in w["pts"]]
    near = defaultdict(float)
    for la, lo in pts:
        for rl, ro, rn in roadpts:
            if abs(rl - la) < 0.0004 and abs(ro - lo) < 0.0004 and hav((la, lo), (rl, ro)) < 35:
                near[rn] += 1
    tl.append({"len_m": round(sum(w["len"] for w in g)), "ways": len(g), "way_ids": [w["id"] for w in g],
               "names": sorted({w["t"].get("name", "") for w in g}), "tunnel_vals": sorted({w["t"].get("tunnel") for w in g}),
               "lat": round(sum(p[0] for p in pts) / len(pts), 5), "lon": round(sum(p[1] for p in pts) / len(pts), 5),
               "nearby_roads": sorted(near, key=lambda k: -near[k])[:6]})
tl.sort(key=lambda x: -x["len_m"])
json.dump(tl, open(D + "/makati_underpass_structures.json", "w"), indent=1)
print("UNDERPASS STRUCTURES", len(tl), "total m", sum(x["len_m"] for x in tl))
for x in tl:
    print(x)
# name search across Metro Manila for every tunnel-tagged or named underpass way
for w in ways:
    n = norm(w["t"].get("name", ""))
    if ("underpass" in n or "subway" in n) and inbox(w["pts"], mm):
        print("NAMED", w["id"], w["t"].get("name"), w["t"].get("tunnel"), w["t"].get("highway"), round(w["len"]), w["pts"][0][1:])

# covered reach
def covered_edge(t, lenient):
    if not t or not (t.get("highway") or True):
        return False
    c = t.get("covered") in COV or t.get("tunnel") in ("yes", "building_passage", "culvert") and t.get("tunnel") != "culvert" or t.get("indoor") in ("yes", "corridor") or t.get("highway") == "corridor"
    if lenient and isped(t) and bridge(t):
        c = True
    return bool(c)


adj = {}
coord = {}
for w in ways:
    if not w["walk"]:
        continue
    for p in w["pts"]:
        coord[p[0]] = (p[1], p[2])
EDGES = []
for w in ways:
    if not w["walk"]:
        continue
    pts = w["pts"]
    for i in range(len(pts) - 1):
        a, bb = pts[i], pts[i + 1]
        L = hav(a[1:], bb[1:])
        EDGES.append((a[0], bb[0], L, w["id"], w["t"]))
for a, bb, L, wid, t in EDGES:
    adj.setdefault(a, []).append((bb, L, wid, t))
    adj.setdefault(bb, []).append((a, L, wid, t))
stn = [n for n in nodes if "ayala" in norm(n["tags"].get("name", "")) and (n["tags"].get("railway") in ("station", "stop", "subway_entrance") or n["tags"].get("public_transport") == "station")]
print("AYALA STATION NODES", [(n["id"], n["tags"].get("name"), n["tags"].get("railway"), n["tags"].get("station"), n["lat"], n["lon"]) for n in stn])
json.dump(stn, open(D + "/ayala_station_nodes.json", "w"), indent=1)
res = {}
mkb = BOX["makati_cbd"]
for lenient in (False, True):
    ce = [(a, bb, L, wid) for a, bb, L, wid, t in EDGES if covered_edge(t, lenient)]
    cn = defaultdict(list)
    for a, bb, L, wid in ce:
        cn[a].append((bb, L, wid))
        cn[bb].append((a, L, wid))
    # components of covered edges inside / touching Makati box
    seen = {}
    comps = []
    for s in cn:
        if s in seen:
            continue
        stack, members = [s], []
        seen[s] = len(comps)
        while stack:
            u = stack.pop()
            members.append(u)
            for v, L, wid in cn[u]:
                if v not in seen:
                    seen[v] = len(comps)
                    stack.append(v)
        comps.append(members)
    ekm = defaultdict(float)
    for a, bb, L, wid in ce:
        ekm[seen[a]] += L / 1000
    mk_comps = sorted([(round(ekm[i], 3), len(m)) for i, m in enumerate(comps) if any(mkb[0] <= coord[n][0] <= mkb[2] and mkb[1] <= coord[n][1] <= mkb[3] for n in m)], reverse=True)
    key = "lenient_all_ped_bridges" if lenient else "strict_cover_tags"
    res[key] = {"covered_edge_km_total_ncr": round(sum(L for _, _, L, _ in ce) / 1000, 2),
                "components_touching_makati_box": len(mk_comps), "top10_component_km": [c[0] for c in mk_comps[:10]],
                "makati_covered_km_sum_all_components": round(sum(c[0] for c in mk_comps), 3),
                "singleton_or_tiny_lt100m": sum(1 for c in mk_comps if c[0] < 0.1)}
    # reach from each station node via cost = metres of uncovered walking used
    for sn in stn:
        # snap to nearest graph node (any walkable way)
        best = min(coord, key=lambda n: abs(coord[n][0] - sn["lat"]) + abs(coord[n][1] - sn["lon"]))
        snap = hav((sn["lat"], sn["lon"]), coord[best])
        cost = {best: 0.0}
        pq = [(0.0, best)]
        covset = defaultdict(set)
        while pq:
            c, u = heapq.heappop(pq)
            if c > cost.get(u, 1e18) or c > 200:
                continue
            for v, L, wid, t in adj.get(u, ()):
                nc = c + (0 if covered_edge(t, lenient) else L)
                if nc < cost.get(v, 1e18) and nc <= 200:
                    cost[v] = nc
                    heapq.heappush(pq, (nc, v))
        for X in (0, 25, 50, 100, 200):
            tot = inm = 0.0
            seenw = set()
            for a, bb, L, wid, t in EDGES:
                if covered_edge(t, lenient) and cost.get(a, 1e18) <= X and cost.get(bb, 1e18) <= X:
                    tot += L
                    ca, cb = coord[a], coord[bb]
                    if mkb[0] <= ca[0] <= mkb[2] and mkb[1] <= ca[1] <= mkb[3]:
                        inm += L
            res[key].setdefault("reach", []).append({"station_node": sn["id"], "name": sn["tags"].get("name"), "snap_m": round(snap, 1),
                                                     "gap_budget_m": X, "covered_km": round(tot / 1000, 3), "covered_km_in_makati_box": round(inm / 1000, 3)})
json.dump(res, open(D + "/covered_reach.json", "w"), indent=1)
print("REACH", json.dumps(res, indent=1))
