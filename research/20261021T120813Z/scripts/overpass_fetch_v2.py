"""Fetch one combined Overpass query per area and per query group. Politer than 15 queries per area.
Usage: python3 -I overpass_fetch_v2.py OUT_DIR AREA [AREA ...]
Saves raw JSON as OUT_DIR/v2__AREA__GROUP.json. Skips files that already parse."""
import json
import os
import subprocess
import sys
import time

OUT = sys.argv[1]
UA = "undercover-ph-research/0.1"
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
BBOX = {
    "metro_manila": (14.35, 120.90, 14.80, 121.15),
    "makati_cbd": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
    "cubao": (14.615, 121.048, 14.625, 121.060),
}
PED = 'highway~"^(footway|pedestrian|steps|corridor|path)$"'
SHELTER = [
    'way["covered"~"^(yes|arcade|roof)$"]',
    'way["tunnel"="building_passage"]',
    'way["indoor"="corridor"]',
    'way["highway"="corridor"]',
    f'way[{PED}]["layer"]',
    f'way[{PED}]["bridge"]',
    f'way[{PED}]["tunnel"]',
    'nwr["amenity"="shelter"]',
    'nwr["man_made"="canopy"]',
    'way["building"="roof"]',
    'node["highway"="bus_stop"]["shelter"="yes"]',
]
GROUPS = {
    "shelter": "(" + ";".join(SHELTER) + ";);out tags geom;",
    "baseline": f"(way[{PED}];);out tags geom;",
    "bpart": '(way["building:part"];);out count;',
}


def fetch(q, path):
    for attempt in range(6):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        r = subprocess.run(
            ["curl", "-sS", "-m", "230", "-A", UA, "-H", "Accept: */*",
             "--data-urlencode", f"data={q}", "-o", path, "-w", "%{http_code}", ep],
            capture_output=True, text=True)
        if r.stdout.strip() == "200":
            try:
                json.load(open(path))
                with open(path + ".endpoint", "w") as f:
                    f.write(ep + " " + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + "\n")
                return True
            except Exception:
                pass
        if os.path.exists(path):
            os.replace(path, path + f".bad{attempt}")
        time.sleep(30 * (attempt + 1))
    return False


for area in sys.argv[2:]:
    s, w, n, e = BBOX[area]
    for g, body in GROUPS.items():
        if g in ("baseline", "bpart") and area == "metro_manila" and g == "baseline":
            continue  # too heavy for the public endpoint, pilots only
        path = os.path.join(OUT, f"v2__{area}__{g}.json")
        if os.path.exists(path):
            continue
        q = f"[out:json][timeout:200][bbox:{s},{w},{n},{e}];{body}"
        ok = fetch(q, path)
        print(area, g, "ok" if ok else "FAILED", flush=True)
        time.sleep(10)
