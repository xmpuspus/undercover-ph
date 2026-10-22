import csv
import json
import math
import os
import subprocess
import sys
import time

OUT = sys.argv[1]
UA = "undercover-ph-research/0.1"
URL = "https://overpass-api.de/api/interpreter"
BBOX = {
    "metro_manila": (14.35, 120.90, 14.80, 121.15),
    "makati_cbd": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
    "cubao": (14.615, 121.048, 14.625, 121.060),
}
PED = 'highway~"^(footway|pedestrian|steps|corridor|path)$"'
CATS = {
    "covered_yes": 'way["covered"="yes"]',
    "covered_arcade": 'way["covered"="arcade"]',
    "covered_roof": 'way["covered"="roof"]',
    "tunnel_building_passage": 'way["tunnel"="building_passage"]',
    "indoor_corridor": 'way["indoor"="corridor"]',
    "highway_corridor": 'way["highway"="corridor"]',
    "building_part": 'way["building:part"]',
    "ped_with_layer": f"way[{PED}][\"layer\"]",
    "ped_bridge_yes": f"way[{PED}][\"bridge\"=\"yes\"]",
    "ped_tunnel_yes": f"way[{PED}][\"tunnel\"=\"yes\"]",
    "amenity_shelter": 'nwr["amenity"="shelter"]',
    "man_made_canopy": 'nwr["man_made"="canopy"]',
    "building_roof": 'way["building"="roof"]',
    "busstop_shelter_yes": 'node["highway"="bus_stop"]["shelter"="yes"]',
    "baseline_ped_all": f"way[{PED}]",
}


def hav(a, b):
    r = 6371.0088
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    dp = p2 - p1
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def length(el):
    g = el.get("geometry") or []
    return sum(hav(g[i], g[i + 1]) for i in range(len(g) - 1))


rows = []
areas = sys.argv[2:] or list(BBOX)
for area in areas:
    s, w, n, e = BBOX[area]
    for cat, sel in CATS.items():
        path = os.path.join(OUT, f"{area}__{cat}.json")
        q = f"[out:json][timeout:180][bbox:{s},{w},{n},{e}];{sel};out geom;"
        if not os.path.exists(path):
            for attempt in range(3):
                r = subprocess.run(
                    ["curl", "-sS", "-m", "200", "-A", UA, "-H", "Accept: */*",
                     "--data-urlencode", f"data={q}", "-o", path, "-w", "%{http_code}", URL],
                    capture_output=True, text=True)
                ok = r.stdout.strip() == "200"
                if ok:
                    try:
                        json.load(open(path))
                        break
                    except Exception:
                        ok = False
                if os.path.exists(path):
                    os.rename(path, path + ".bad")
                time.sleep(20)
            time.sleep(6)
        try:
            d = json.load(open(path))
        except Exception:
            rows.append((area, cat, "ERR", "", "", ""))
            continue
        els = d["elements"]
        ways = [x for x in els if x["type"] == "way"]
        km = sum(length(x) for x in ways)
        remark = d.get("remark", "")
        ts = d.get("osm3s", {}).get("timestamp_osm_base", "")
        rows.append((area, cat, len(els), len(ways), round(km, 3), ts + (" " + remark if remark else "")))
with open(os.path.join(OUT, "summary_" + "_".join(areas) + ".csv"), "w", newline="") as f:
    cw = csv.writer(f)
    cw.writerow(["area", "category", "elements", "ways", "km", "osm_base_ts_or_remark"])
    cw.writerows(rows)
for r in rows:
    print(*r, sep="\t")
