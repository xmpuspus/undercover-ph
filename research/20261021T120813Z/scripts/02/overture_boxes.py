"""Pull Overture buildings and building parts for three pilot boxes (bbox intersect, 0.002 deg margin).

Usage: python3 -I overture_boxes.py RELEASE OUTDIR
Anonymous S3 read. No credentials.
"""
import json
import sys
import time

import duckdb

rel, out = sys.argv[1], sys.argv[2].rstrip("/") + "/"
M = 0.002
boxes = {
    "makati": (14.548, 121.012, 14.562, 121.032),
    "bgc": (14.545, 121.040, 14.560, 121.058),
    "ortigas": (14.578, 121.053, 14.592, 121.067),
}
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
con.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")
log = {"release": rel, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "boxes": {}}
for typ in ("building", "building_part"):
    src = f"s3://overturemaps-us-west-2/release/{rel}/theme=buildings/type={typ}/*.parquet"
    for k, (s, w, n, e) in boxes.items():
        t0 = time.time()
        where = f"bbox.xmin <= {e + M} AND bbox.xmax >= {w - M} AND bbox.ymin <= {n + M} AND bbox.ymax >= {s - M}"
        extra = "building_id," if typ == "building_part" else "class, subtype, has_parts, is_underground,"
        q = f"""COPY (SELECT id, {extra} height, num_floors, min_height, roof_height, level,
                   names.primary AS name, to_json(sources) AS sources_json,
                   ST_AsWKB(geometry) AS geom_wkb
            FROM read_parquet('{src}') WHERE {where})
            TO '{out}{typ}_{k}.parquet' (FORMAT PARQUET)"""
        con.execute(q)
        nrow = con.execute(f"SELECT count(*) FROM '{out}{typ}_{k}.parquet'").fetchone()[0]
        log["boxes"][f"{typ}_{k}"] = {"rows": nrow, "seconds": round(time.time() - t0, 1)}
        print(typ, k, nrow, round(time.time() - t0, 1), flush=True)
log["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(log, open(out + "pull_log.json", "w"), indent=1)
