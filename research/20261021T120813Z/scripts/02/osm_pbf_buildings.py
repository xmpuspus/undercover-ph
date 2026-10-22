"""Extract OSM building and building:part areas for the pilot boxes from a local PBF.

Usage: python3 -I osm_pbf_buildings.py PBF OUTDIR
Writes one GeoJSON-lines file per box with osm type/id, tags, and WKT geometry.
Box test: any outer-ring node inside the box plus a 0.002 deg margin. Centroid filter happens later.
"""
import json
import sys
import time

import osmium
import shapely.wkb

pbf, out = sys.argv[1], sys.argv[2].rstrip("/") + "/"
M = 0.002
boxes = {
    "makati": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
}
W, E = min(b[1] for b in boxes.values()) - M, max(b[3] for b in boxes.values()) + M
S, N = min(b[0] for b in boxes.values()) - M, max(b[2] for b in boxes.values()) + M
fac = osmium.geom.WKBFactory()
files = {k: open(out + f"osm_{k}.jsonl", "w") for k in boxes}
stats = {k: 0 for k in boxes}
seen = {"areas_with_building_tag": 0, "wkb_errors": 0}


class H(osmium.SimpleHandler):
    def area(self, a):
        t = a.tags
        if "building" not in t and "building:part" not in t:
            return
        seen["areas_with_building_tag"] += 1
        lons, lats = [], []
        for ring in a.outer_rings():
            for nd in ring:
                if nd.location.valid():
                    lons.append(nd.location.lon)
                    lats.append(nd.location.lat)
            break
        if not lons or max(lons) < W or min(lons) > E or max(lats) < S or min(lats) > N:
            return
        hit = [k for k, (s, w, n, e) in boxes.items()
               if max(lons) >= w - M and min(lons) <= e + M and max(lats) >= s - M and min(lats) <= n + M]
        if not hit:
            return
        try:
            g = shapely.wkb.loads(fac.create_multipolygon(a), hex=True)
        except Exception as ex:  # broken multipolygons stay on record
            seen["wkb_errors"] += 1
            print("wkb error", a.orig_id(), a.from_way(), ex, file=sys.stderr)
            return
        rec = {"osm_type": "way" if a.from_way() else "relation", "osm_id": a.orig_id(),
               "tags": {tg.k: tg.v for tg in t}, "wkt": g.wkt}
        line = json.dumps(rec)
        for k in hit:
            files[k].write(line + "\n")
            stats[k] += 1


t0 = time.time()
H().apply_file(pbf, locations=True, idx="flex_mem")
for f in files.values():
    f.close()
log = {"pbf": pbf, "seconds": round(time.time() - t0, 1), "rows_per_box": stats, **seen,
       "finished": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
json.dump(log, open(out + "extract_log.json", "w"), indent=1)
print(json.dumps(log))
