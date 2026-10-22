"""Union of pedestrian-class ways by shelter signal. Usage: python3 -I union_stats.py SHELTER_JSON [BBOX s,w,n,e]"""
import json
import math
import sys

d = json.load(open(sys.argv[1]))
bb = [float(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else None
P = {"footway", "pedestrian", "steps", "corridor", "path"}


def hav(a, b):
    r = 6371.0088
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl, dp = math.radians(b["lon"] - a["lon"]), p2 - p1
    return 2 * r * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def inbb(e):
    if not bb:
        return True
    g = e.get("geometry") or []
    if not g:
        return False
    la = sum(p["lat"] for p in g) / len(g)
    lo = sum(p["lon"] for p in g) / len(g)
    return bb[0] <= la <= bb[2] and bb[1] <= lo <= bb[3]


K, cov, tun, br = {}, set(), set(), set()
for e in d["elements"]:
    if e["type"] != "way" or not inbb(e):
        continue
    g = e.get("geometry") or []
    K[e["id"]] = sum(hav(g[i], g[i + 1]) for i in range(len(g) - 1))
    t = e.get("tags", {})
    if t.get("highway") not in P:
        continue
    if t.get("covered") in ("yes", "arcade", "roof") or t.get("tunnel") == "building_passage" or t.get("indoor") == "corridor" or t.get("highway") == "corridor":
        cov.add(e["id"])
    if t.get("tunnel") not in (None, "no", "building_passage"):
        tun.add(e["id"])
    if t.get("bridge") not in (None, "no"):
        br.add(e["id"])


def s(x):
    return f"{len(x)} ways, {sum(K[i] for i in x):.3f} km"


print("ped with cover tag:", s(cov))
print("ped tunnel (underpass, excl building_passage):", s(tun))
print("ped bridge:", s(br))
print("bridge with cover tag:", s(br & cov))
print("bridge without cover tag:", s(br - cov))
print("union cover or tunnel:", s(cov | tun))
print("union cover or tunnel or covered bridge:", s(cov | tun | (br & cov)))
