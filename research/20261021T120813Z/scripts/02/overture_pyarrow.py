"""Pull Overture buildings for the pilot boxes with anonymous pyarrow S3 and row-group bbox statistics.

Usage: python3 -I overture_pyarrow.py RELEASE TYPE OUTDIR   (TYPE = building or building_part)
Writes {TYPE}_{box}.parquet with id, height, num_floors, sources as JSON, geometry WKB, and a scan log.
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as fs
import pyarrow.parquet as pq

rel, typ, out = sys.argv[1], sys.argv[2], sys.argv[3].rstrip("/") + "/"
M = 0.002
boxes = {"makati": (14.548, 121.012, 14.562, 121.032), "bgc": (14.545, 121.040, 14.560, 121.058),
         "ortigas": (14.578, 121.053, 14.592, 121.067)}
W = min(b[1] for b in boxes.values()) - M
E = max(b[3] for b in boxes.values()) + M
S = min(b[0] for b in boxes.values()) - M
N = max(b[2] for b in boxes.values()) + M
s3 = fs.S3FileSystem(anonymous=True, region="us-west-2", connect_timeout=10, request_timeout=60)
prefix = f"overturemaps-us-west-2/release/{rel}/theme=buildings/type={typ}/"
files = [f.path for f in s3.get_file_info(fs.FileSelector(prefix)) if f.path.endswith(".parquet")]
t0 = time.time()


def scan(path):
    md = pq.ParquetFile(path, filesystem=s3).metadata
    names = [md.schema.column(i).path for i in range(md.num_columns)]
    ix = {n: names.index(n) for n in ("bbox.xmin", "bbox.xmax", "bbox.ymin", "bbox.ymax")}
    hits = []
    for r in range(md.num_row_groups):
        rg = md.row_group(r)
        st = {k: rg.column(i).statistics for k, i in ix.items()}
        if any(v is None or not v.has_min_max for v in st.values()):
            hits.append(r)
            continue
        if st["bbox.xmin"].min <= E and st["bbox.xmax"].max >= W and st["bbox.ymin"].min <= N and st["bbox.ymax"].max >= S:
            hits.append(r)
    return path, hits


with ThreadPoolExecutor(24) as ex:
    scanned = list(ex.map(scan, files))
targets = [(p, h) for p, h in scanned if h]
print("files", len(files), "files with hits", len(targets), "row groups", sum(len(h) for _, h in targets),
      "scan s", round(time.time() - t0, 1), flush=True)
base = ["id", "bbox", "height", "num_floors", "min_height", "roof_height", "level", "names", "sources", "geometry"]
tables = []
for p, h in targets:
    f = pq.ParquetFile(p, filesystem=s3)
    cols = [c for c in base + ["class", "subtype", "has_parts", "is_underground", "building_id"] if c in f.schema_arrow.names]
    t = f.read_row_groups(h, columns=cols)
    bb = t.column("bbox")
    keep = pc.and_(pc.and_(pc.less_equal(pc.struct_field(bb, "xmin"), E), pc.greater_equal(pc.struct_field(bb, "xmax"), W)),
                   pc.and_(pc.less_equal(pc.struct_field(bb, "ymin"), N), pc.greater_equal(pc.struct_field(bb, "ymax"), S)))
    tables.append(t.filter(keep))
    print(p.split("/")[-1], h, tables[-1].num_rows, flush=True)
tab = pa.concat_tables(tables, promote_options="permissive")
log = {"release": rel, "type": typ, "files_listed": len(files), "files_hit": [p.split("/")[-1] for p, _ in targets],
       "row_groups_read": sum(len(h) for _, h in targets), "rows_in_union_bbox": tab.num_rows, "boxes": {}}
d = tab.to_pylist()
for k, (s, w, n, e) in boxes.items():
    rows = [r for r in d if r["bbox"]["xmin"] <= e + M and r["bbox"]["xmax"] >= w - M and r["bbox"]["ymin"] <= n + M and r["bbox"]["ymax"] >= s - M]
    slim = [{"id": r["id"], "height": r.get("height"), "num_floors": r.get("num_floors"), "min_height": r.get("min_height"),
             "class": r.get("class"), "subtype": r.get("subtype"), "has_parts": r.get("has_parts"),
             "building_id": r.get("building_id"), "name": (r.get("names") or {}).get("primary"),
             "sources_json": json.dumps(r.get("sources"), default=str), "geom_wkb": r["geometry"]} for r in rows]
    pq.write_table(pa.Table.from_pylist(slim), out + f"{typ}_{k}.parquet")
    log["boxes"][k] = len(slim)
log["seconds"] = round(time.time() - t0, 1)
log["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
json.dump(log, open(out + f"pull_log_{typ}.json", "w"), indent=1)
print(json.dumps(log))
