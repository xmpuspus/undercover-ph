"""Second pass: road-crossing footbridges, wide Makati box, covered reach with pedestrian-class cover only.
Usage: python3 -I analyze2.py RAW03_DIR"""
import heapq
import json
import math
import sys
from collections import defaultdict

D = sys.argv[1]
R = 6371008.8
PED = {"footway", "pedestrian", "steps", "corridor", "path"}
COV = {"yes", "arcade", "roof"}


def hav(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


ways = [json.loads(l) for l in open(D + "/ncr_ways.jsonl")]
nodes = [json.loads(l) for l in open(D + "/ncr_nodes.jsonl")]
for w in ways:
    w["t"] = w["tags"]
    w["len"] = sum(hav(w["pts"][i][1:], w["pts"][i + 1][1:]) for i in range(len(w["pts"]) - 1))
isped = lambda t: t.get("highway") in PED
bridge = lambda t: t.get("bridge") not in (None, "no")
under = lambda t: t.get("tunnel") not in (None, "no", "building_passage")
covtag = lambda t: t.get("covered") in COV or t.get("tunnel") == "building_passage" or t.get("indoor") == "corridor" or t.get("highway") == "corridor"


def inb(w, b):
    return any(b[0] <= p[1] <= b[2] and b[1] <= p[2] <= b[3] for p in w["pts"])


# 1. wide Makati box
wb = (14.535, 121.000, 14.575, 121.045)
ws = [w for w in ways if inb(w, wb) and isped(w["t"])]
s = lambda sel: (len(sel), round(sum(w["len"] for w in sel) / 1000, 3))
print("MAKATI_WIDE cover-tagged ped", s([w for w in ws if covtag(w["t"])]), "underpass", s([w for w in ws if under(w["t"])]),
      "ped bridge", s([w for w in ws if bridge(w["t"])]), "bridge+cover", s([w for w in ws if bridge(w["t"]) and covtag(w["t"])]),
      "cover or underpass or any bridge", s([w for w in ws if covtag(w["t"]) or under(w["t"]) or bridge(w["t"])]))

# 2. footbridges that cross a trunk/primary/secondary road (within 20 m of its vertices)
grid = defaultdict(list)
for w in ways:
    if w["t"].get("highway") in ("trunk", "primary", "secondary", "trunk_link", "primary_link") and not bridge(w["t"]):
        for p in w["pts"]:
            grid[(int(p[1] * 2000), int(p[2] * 2000))].append((p[1], p[2]))
fb = [w for w in ways if isped(w["t"]) and bridge(w["t"])]
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
cross = []
for g in cl.values():
    L = sum(w["len"] for w in g)
    hit = False
    for w in g:
        for p in w["pts"]:
            k = (int(p[1] * 2000), int(p[2] * 2000))
            for dk in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                for q in grid.get((k[0] + dk[0], k[1] + dk[1]), ()):
                    if hav(p[1:], q) < 20:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                break
        if hit:
            break
    if hit and L >= 20:
        cross.append((L, any(covtag(w["t"]) or w["t"].get("bridge") == "covered" for w in g)))
print("ROAD_CROSSING_FOOTBRIDGES (>=20 m, within 20 m of trunk/primary/secondary)", len(cross), "with cover tag", sum(1 for c in cross if c[1]),
      "bridge=covered values among all ped bridge ways", sum(1 for w in fb if w["t"].get("bridge") == "covered"))

# 3. covered reach, ped-class cover only
def cov_edge(t, lenient):
    if not isped(t):
        return False
    if t.get("covered") in COV or t.get("tunnel") in ("yes", "building_passage") or t.get("indoor") in ("yes", "corridor") or t.get("highway") == "corridor":
        return True
    return lenient and bridge(t)


adj = defaultdict(list)
coord = {}
E = []
for w in ways:
    if not w["walk"]:
        continue
    for i, p in enumerate(w["pts"]):
        coord[p[0]] = (p[1], p[2])
    for i in range(len(w["pts"]) - 1):
        a, b = w["pts"][i], w["pts"][i + 1]
        L = hav(a[1:], b[1:])
        E.append((a[0], b[0], L, w["t"]))
        adj[a[0]].append((b[0], L, w["t"]))
        adj[b[0]].append((a[0], L, w["t"]))
stops = [(14.5487554, 121.0275404), (14.549488, 121.0284393)]
mkb = (14.548, 121.012, 14.562, 121.032)
for lenient in (False, True):
    # start set: covered-edge nodes within 60 m of either Ayala stop position
    starts = {n for a, b, L, t in E if cov_edge(t, lenient) for n in (a, b) if any(hav(coord[n], s_) <= 60 for s_ in stops)}
    nearest = min((min(hav(coord[n], s_) for s_ in stops) for a, b, L, t in E if cov_edge(t, lenient) for n in (a, b)))
    print("LENIENT" if lenient else "STRICT", "start nodes within 60 m of Ayala stops:", len(starts), "nearest covered node m:", round(nearest, 1))
    cost = {n: 0.0 for n in starts}
    pq = [(0.0, n) for n in starts]
    heapq.heapify(pq)
    while pq:
        c, u = heapq.heappop(pq)
        if c > cost.get(u, 1e18) or c > 800:
            continue
        for v, L, t in adj[u]:
            nc = c + (0 if cov_edge(t, lenient) else L)
            if nc < cost.get(v, 1e18) and nc <= 800:
                cost[v] = nc
                heapq.heappush(pq, (nc, v))
    for X in (0, 50, 100, 200, 400, 800):
        km = sum(L for a, b, L, t in E if cov_edge(t, lenient) and cost.get(a, 1e18) <= X and cost.get(b, 1e18) <= X) / 1000
        print("  gap budget m", X, "covered km reachable", round(km, 3))
    # component sizes in Makati box
    seen = {}
    comps = []
    cn = defaultdict(list)
    for a, b, L, t in E:
        if cov_edge(t, lenient):
            cn[a].append((b, L))
            cn[b].append((a, L))
    for sN in cn:
        if sN in seen:
            continue
        st, tot, inbx = [sN], 0.0, False
        seen[sN] = 1
        mem = []
        while st:
            u = st.pop()
            mem.append(u)
            for v, L in cn[u]:
                tot += L
                if v not in seen:
                    seen[v] = 1
                    st.append(v)
        tot /= 2
        if any(mkb[0] <= coord[n][0] <= mkb[2] and mkb[1] <= coord[n][1] <= mkb[3] for n in mem):
            comps.append(round(tot / 1000, 3))
    comps.sort(reverse=True)
    print("  Makati-box components", len(comps), "sum km", round(sum(comps), 3), "top5", comps[:5], "<100 m:", sum(1 for c in comps if c < 0.1),
          "largest share", round(comps[0] / sum(comps), 2))

