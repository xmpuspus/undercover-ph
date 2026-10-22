"""Cut a region's OSM extract from the Geofabrik Philippines file with osmium.

Usage: pipeline/.venv/bin/python -I pipeline/regions/cut_pbf.py REGION_ID [--force]
The box is the region's osm_bbox in pipeline/regions/regions.json. The command is the one that made
the Metro Manila extract: osmium extract -b W,S,E,N --strategy complete_ways.
The script checks the source MD5 first, so every region comes from the same 2026-10-20 extract.
Writes pipeline/raw/regions/osm/<region>.osm.pbf and <region>.osm.pbf.json (command, MD5s, sizes, time).
"""
import hashlib
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import region  # noqa: E402


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def main(args):
    force = "--force" in args
    ids = [a for a in args if a != "--force"]
    if len(ids) != 1:
        sys.exit(__doc__)
    r = region.get(ids[0])
    if r["id"] == region.DEFAULT:
        sys.exit("ncr uses research/20261021T120813Z/raw/shared/ncr.osm.pbf; it is not cut here")
    region.utm_epsg(r)  # stops on a box that spans two UTM zones
    out = region.pbf_path(r)
    log_path = out.with_name(out.name + ".json")
    if out.exists() and log_path.exists() and not force:
        print(f"{out} exists; pass --force to cut it again")
        return
    osmium = shutil.which("osmium")
    if not osmium:
        sys.exit("osmium is not on PATH (brew install osmium-tool)")
    src_md5 = md5(region.SOURCE_PBF)
    if src_md5 != region.SOURCE_MD5:
        sys.exit(f"{region.SOURCE_PBF} has md5 {src_md5}, expected {region.SOURCE_MD5}")
    out.parent.mkdir(parents=True, exist_ok=True)
    w, s, e, n = r["osm_bbox"]
    cmd = [osmium, "extract", "-b", f"{w},{s},{e},{n}", "--strategy", "complete_ways", "-O", "-o", str(out),
           str(region.SOURCE_PBF)]
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        sys.exit(f"osmium failed: {p.stderr[-2000:]}")
    info = subprocess.run([osmium, "fileinfo", "-e", "-j", str(out)], capture_output=True, text=True)
    counts = {}
    if info.returncode == 0:
        data = json.loads(info.stdout).get("data", {})
        counts = {k: data.get("count", {}).get(k) for k in ("nodes", "ways", "relations")}
    rel = {osmium: "osmium", str(out): str(out.relative_to(region.ROOT)),
           str(region.SOURCE_PBF): str(region.SOURCE_PBF.relative_to(region.ROOT))}
    log = {"region": r["id"], "bbox": r["osm_bbox"], "command": " ".join(rel.get(c, c) for c in cmd),
           "source": region.SOURCE_PBF.name, "source_md5": src_md5, "output": out.name, "output_md5": md5(out),
           "output_bytes": out.stat().st_size, "counts": counts, "seconds": round(time.time() - t0, 1),
           "cut_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    log_path.write_text(json.dumps(log, indent=1))
    print(json.dumps(log))


if __name__ == "__main__":
    main(sys.argv[1:])
