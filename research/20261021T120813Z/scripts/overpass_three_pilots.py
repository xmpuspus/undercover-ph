"""One combined Overpass query for BGC, Ortigas and Cubao shelter tags. Two attempts at most.
Usage: python3 -I overpass_three_pilots.py OUT_DIR"""
import json
import subprocess
import sys
import time
import os

OUT = sys.argv[1]
UA = "undercover-ph-research/0.1"
EP = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
BB = {
    "bgc": "14.545,121.040,14.560,121.058",
    "ortigas": "14.578,121.053,14.592,121.067",
    "cubao": "14.615,121.048,14.625,121.060",
}
PED = 'highway~"^(footway|pedestrian|steps|corridor|path)$"'
SEL = [
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
stmts = ";".join(f"{s}({b})" for b in BB.values() for s in SEL)
q = f"[out:json][timeout:200];({stmts};);out tags geom;"
path = os.path.join(OUT, "v3__three_pilots__shelter.json")
for i, ep in enumerate(EP):
    r = subprocess.run(["curl", "-sS", "-m", "230", "-A", UA, "-H", "Accept: */*",
                        "--data-urlencode", f"data={q}", "-o", path, "-w", "%{http_code}", ep],
                       capture_output=True, text=True)
    try:
        if r.stdout.strip() == "200":
            json.load(open(path))
            open(path + ".endpoint", "w").write(ep + " " + time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + "\n")
            print("ok", ep)
            break
    except Exception:
        pass
    if os.path.exists(path):
        os.replace(path, path + f".bad{i}")
    print("fail", i, r.stdout, r.stderr[:100])
    time.sleep(30)
