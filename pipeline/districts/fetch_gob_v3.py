"""Cut Google Open Buildings v3 outlines into each district's building box.

Usage: pipeline/.venv/bin/python -I pipeline/districts/fetch_gob_v3.py [DISTRICT_ID ...]   (default: every district)
Source: https://sites.research.google/open-buildings/ (CC BY 4.0 and ODbL), one gzipped CSV per level-6 S2 cell at
https://storage.googleapis.com/open-buildings-data/v3/polygons_s2_level_6_gzip_no_header/<token>_buildings.csv.gz
Columns: latitude, longitude, area_in_meters, confidence, geometry (WKT), full_plus_code.
Downloads land in pipeline/raw/gob_v3/ and are reused. Each district gets pipeline/raw/districts/<id>/gob_v3/outlines.jsonl.gz,
one row per outline whose centre lies in its building box, with the confidence that gives 80% precision in that
outline's level-4 cell (Google's score_thresholds_s2_level_4.csv). build_buildings.py decides which outlines to keep.
"""
import csv
import gzip
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "regions/scout"))
import dcommon  # noqa: E402
import s2cell  # noqa: E402

BASE = "https://storage.googleapis.com/open-buildings-data/v3"
CACHE = dcommon.RAW.parent / "gob_v3"
GRID_DEG = 0.01  # sample spacing for the cells a box touches; a level-6 cell is over 100 km wide
csv.field_size_limit(1 << 26)


def token(lon, lat, level):
    lsb = 1 << (2 * (30 - level))
    return format((s2cell.cell_id(lon, lat) & ~(lsb - 1)) | lsb, "016x").rstrip("0")


def parent4(tok6):
    cid = int(tok6.ljust(16, "0"), 16)
    lsb = 1 << (2 * (30 - 4))
    return format((cid & ~(lsb - 1)) | lsb, "016x").rstrip("0")


def cells(bbox):
    w, s, e, n = bbox
    out = set()
    nx, ny = int((e - w) / GRID_DEG) + 1, int((n - s) / GRID_DEG) + 1
    for i in range(nx + 1):
        for j in range(ny + 1):
            out.add(token(min(w + i * GRID_DEG, e), min(s + j * GRID_DEG, n), 6))
    return out


def download(url, path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix(path.suffix + ".part")
        subprocess.run(["curl", "-sS", "--fail", "--retry", "3", "-o", str(part), url], check=True)
        part.replace(path)
    return path


def thresholds():
    path = download(f"{BASE}/score_thresholds_s2_level_4.csv", CACHE / "score_thresholds_s2_level_4.csv")
    return {r["s2_token"]: float(r["confidence_threshold_80%_precision"]) for r in csv.DictReader(open(path))}


def main():
    known = {d.id: d for d in dcommon.load_all()}
    sys.path.insert(0, str(HERE.parent / "regions"))
    import region

    for row in region.district_rows():
        d = dcommon.District(row)
        known[d.id] = d
    ids = sys.argv[1:] or sorted(known)
    unknown = [i for i in ids if i not in known]
    if unknown:
        sys.exit(f"unknown district ids: {unknown}")
    todo = [known[i] for i in ids if not (known[i].raw / "gob_v3/outlines.jsonl.gz").exists()]
    if not todo:
        print("every district already has its outlines")
        return
    thr = thresholds()
    by_cell = {}
    for d in todo:
        for t in cells(d.building_bbox):
            by_cell.setdefault(t, []).append(d)
    rows = {d.id: [] for d in todo}
    for t, ds in sorted(by_cell.items()):
        p4 = parent4(t)
        if p4 not in thr:
            print(f"cell {t}: no score threshold for level-4 cell {p4}, so no outlines there")
            continue
        path = download(f"{BASE}/polygons_s2_level_6_gzip_no_header/{t}_buildings.csv.gz", CACHE / f"{t}_buildings.csv.gz")
        boxes = [(d, d.building_bbox) for d in ds]
        n = 0
        with gzip.open(path, "rt", newline="") as fh:
            for lat, lon, area, conf, wkt, plus in csv.reader(fh):
                x, y = float(lon), float(lat)
                for d, (w, s, e, nn) in boxes:
                    if w <= x <= e and s <= y <= nn:
                        rows[d.id].append({"plus": plus, "conf": float(conf), "thr": thr[p4], "area_m2": float(area), "wkt": wkt})
                        n += 1
        print(f"cell {t} ({path.stat().st_size // 1_000_000} MB): {n} outlines for {len(ds)} districts", flush=True)
    for d in todo:
        out = d.raw / "gob_v3/outlines.jsonl.gz"
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_name(out.name + ".tmp")
        with gzip.open(tmp, "wt", compresslevel=6) as fh:
            for r in rows[d.id]:
                fh.write(json.dumps(r, separators=(",", ":")) + "\n")
        tmp.replace(out)
        print(json.dumps({"district": d.id, "outlines": len(rows[d.id])}))


if __name__ == "__main__":
    main()
