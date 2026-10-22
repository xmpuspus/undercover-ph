"""Count elements and km per OSM category from v2 raw files.
Usage: python3 -I analyze_overpass.py RAW_DIR OUT_CSV"""
import csv
import json
import math
import os
import sys

RAW, OUT = sys.argv[1], sys.argv[2]
AREAS = ["makati_cbd", "bgc", "ortigas", "cubao", "metro_manila"]
PEDSET = {"footway", "pedestrian", "steps", "corridor", "path"}


def hav(a, b):
    r = 6371.0088
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl, dp = math.radians(b["lon"] - a["lon"]), p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def km(el):
    g = el.get("geometry") or []
    return sum(hav(g[i], g[i + 1]) for i in range(len(g) - 1))


def cats(el):
    t = el.get("tags", {})
    out = []
    ped = t.get("highway") in PEDSET
    if t.get("covered") == "yes":
        out.append("covered=yes")
    if t.get("covered") == "arcade":
        out.append("covered=arcade")
    if t.get("covered") == "roof":
        out.append("covered=roof")
    if t.get("tunnel") == "building_passage":
        out.append("tunnel=building_passage")
    if t.get("indoor") == "corridor":
        out.append("indoor=corridor")
    if t.get("highway") == "corridor":
        out.append("highway=corridor")
    if ped and "layer" in t:
        out.append("ped+layer")
    if ped and t.get("bridge") not in (None, "no"):
        out.append("ped+bridge")
    if ped and t.get("tunnel") not in (None, "no"):
        out.append("ped+tunnel")
    if t.get("amenity") == "shelter":
        out.append("amenity=shelter")
    if t.get("man_made") == "canopy":
        out.append("man_made=canopy")
    if t.get("building") == "roof":
        out.append("building=roof")
    if t.get("highway") == "bus_stop" and t.get("shelter") == "yes":
        out.append("bus_stop+shelter=yes")
    return out, ped


rows = []
for area in AREAS:
    p = os.path.join(RAW, f"v2__{area}__shelter.json")
    if not os.path.exists(p):
        rows.append((area, "MISSING", "", "", "", "", ""))
        continue
    d = json.load(open(p))
    ts = d["osm3s"]["timestamp_osm_base"]
    stats = {}
    union_ped = {}
    for el in d["elements"]:
        cs, ped = cats(el)
        for c in cs:
            s = stats.setdefault(c, {"n": 0, "km": 0.0, "ped_n": 0, "ped_km": 0.0})
            s["n"] += 1
            L = km(el) if el["type"] == "way" else 0.0
            s["km"] += L
            if ped:
                s["ped_n"] += 1
                s["ped_km"] += L
        sheltered_tags = {"covered=yes", "covered=arcade", "covered=roof", "tunnel=building_passage", "indoor=corridor", "highway=corridor"}
        if ped and sheltered_tags & set(cs):
            union_ped[el["id"]] = km(el)
    for c, s in sorted(stats.items()):
        rows.append((area, c, s["n"], round(s["km"], 3), s["ped_n"], round(s["ped_km"], 3), ts))
    rows.append((area, "UNION pedestrian-class ways with any explicit cover tag", len(union_ped), round(sum(union_ped.values()), 3), len(union_ped), round(sum(union_ped.values()), 3), ts))
    pb = os.path.join(RAW, f"v2__{area}__baseline.json")
    if os.path.exists(pb):
        b = json.load(open(pb))
        ways = [e for e in b["elements"] if e["type"] == "way"]
        rows.append((area, "BASELINE footway/pedestrian/steps/corridor/path", len(ways), round(sum(km(e) for e in ways), 3), len(ways), round(sum(km(e) for e in ways), 3), b["osm3s"]["timestamp_osm_base"]))
    pc = os.path.join(RAW, f"v2__{area}__bpart.json")
    if os.path.exists(pc):
        c = json.load(open(pc))
        tot = [e for e in c["elements"] if e["type"] == "count"]
        rows.append((area, "building:part ways (count)", tot[0]["tags"]["ways"] if tot else "", "", "", "", c["osm3s"]["timestamp_osm_base"]))
with open(OUT, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["area", "category", "elements", "km_all_ways", "ped_class_ways", "km_ped_class", "osm_base_ts"])
    w.writerows(rows)
for r in rows:
    print(*r, sep="\t")
