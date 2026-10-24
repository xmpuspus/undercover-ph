"""Build one or more routing areas into pipeline/stage/<area>/.

Usage: pipeline/.venv/bin/python -I pipeline/districts/build.py [--checks] AREA_ID [AREA_ID ...]
An AREA_ID is an id from pipeline/areas.json or pipeline/regions/areas.json, or a district id for a
one-district area. Any other id stops the build before it touches a path.
Each step runs as its own process with UC_AREA set, so the copied scripts read that area's context.
Every member district needs its Google window first (fetch_gob.py).
Steps: extract OSM features, hours, buildings, graph, jog attributes, places, route checks, manifest checks, display file.
"""
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PY = str(ROOT / "pipeline/.venv/bin/python")
STEPS = ["extract_features.py", "build_hours.py", "build_buildings.py", "build_graph.py", "build_jog.py", "build_places.py"]
SHADE_OUTPUTS = ["manifest.json", "READY.shade", "trees.json"]


def known_ids():
    """Area and district ids from pipeline/areas.json, districts.json and the region files beside them."""
    ids = set()
    for name, key in (("areas.json", "areas"), ("districts.json", "districts"), ("regions/areas.json", "areas"),
                      ("regions/districts.json", "districts")):
        path = HERE.parent / name
        if path.exists():
            ids |= {x["id"] for x in json.load(open(path))[key]}
    return ids


def run(area, script, *args):
    env = dict(os.environ, UC_AREA=area)
    t0 = time.time()
    r = subprocess.run([PY, "-I", str(HERE / script), *args], env=env, cwd=ROOT, capture_output=True, text=True)
    log = HERE.parents[0] / "work/districts" / area / "build_log.txt"
    log.parent.mkdir(parents=True, exist_ok=True)
    with open(log, "a") as fh:
        fh.write(f"## {script} {' '.join(args)} exit={r.returncode} {time.time() - t0:.1f}s\n{r.stdout}\n{r.stderr}\n")
    if r.returncode:
        sys.exit(f"{area}: {script} failed, see {log}\n{r.stderr[-2000:]}")
    return time.time() - t0


def build(area, checks_only=False):
    work = HERE.parents[0] / "work/districts" / area
    work.mkdir(parents=True, exist_ok=True)
    (work / "build_log.txt").write_text("")
    if not checks_only:
        # shade.py writes these from the old graph, and it reads manifest.json before the new template.
        stage = HERE.parents[0] / "stage" / area
        for name in SHADE_OUTPUTS:
            (stage / name).unlink(missing_ok=True)
        shutil.rmtree(stage / "shade", ignore_errors=True)
    times = {} if checks_only else {s: round(run(area, s), 1) for s in STEPS}
    (work / "route_check.json").unlink(missing_ok=True)
    pairs = json.load(open(HERE / "routes.json")).get(area, [])
    for a, b in pairs:
        run(area, "route_check.py", a, b)
        run(area, "route_check.py", a, b, "8")
        run(area, "route_check.py", a, b, "8", "closed")
    # The display file reads the staged buildings, so it runs before the manifest measures sizes.
    times["build_display.py"] = round(run(area, "build_display.py"), 1)
    times["build_manifest.py"] = round(run(area, "build_manifest.py"), 1)
    print(json.dumps({"area": area, "seconds": times}), flush=True)


if __name__ == "__main__":
    # --checks reruns only the route checks, the display file and the manifest checks.
    checks = "--checks" in sys.argv
    ids = [x for x in sys.argv[1:] if x != "--checks"]
    # An id becomes a folder name, so only listed ids may reach a path.
    unknown = [x for x in ids if x not in known_ids()]
    if unknown:
        sys.exit(f"unknown area or district id: {', '.join(map(repr, unknown))}")
    for a in ids:
        build(a, checks)
