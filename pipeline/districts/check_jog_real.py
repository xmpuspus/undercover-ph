"""Real-area check for build_jog.py on qc-north (tmp/jog-loops-20261024/SPEC.md, J-D1 to J-D8).

Usage: pipeline/shade/.venv/bin/python pipeline/districts/check_jog_real.py
Runs `build_jog.py --area qc-north --out <temp file>` on the published graph and the NCR extract, then checks
the file against facts the lead measured on 2026-10-24 (tmp/jog-loops-20261024/research/05-osm-tags and
08-anchors). It fails when the area data is missing, so it never passes on nothing.
"""
import hashlib
import json
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
AREA = ROOT / "app/public/data/areas/qc-north"
PY = ROOT / "pipeline/.venv/bin/python"
# OSM way 29252652, landuse=recreation_ground "Academic Oval", from the 2026-10-20 extract. Its 130-point outer
# ring simplified at 0.00005 degrees to 15 points, which keeps 99.8% of its area.
OVAL = [(121.06444, 14.654754), (121.064812, 14.653921), (121.064931, 14.653852), (121.072631, 14.653977),
        (121.072819, 14.654078), (121.073049, 14.654572), (121.073057, 14.655647), (121.073029, 14.655767),
        (121.072715, 14.656082), (121.065007, 14.656045), (121.064849, 14.655946), (121.064443, 14.65511),
        (121.064992, 14.655074), (121.064989, 14.65477), (121.06444, 14.654754)]


def fail(msg):
    sys.exit(f"FAIL: {msg}")


def main():
    graph_file = AREA / "graph.json"
    if not graph_file.exists():
        fail(f"{graph_file} is missing. Run pipeline/tools/worktree_data.sh or data_release.py fetch first.")
    before = graph_file.read_bytes()
    graph = json.loads(before)
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "jog.json"
        r = subprocess.run([str(PY), "-I", str(HERE / "build_jog.py"), "--area", "qc-north", "--out", str(out)],
                           cwd=ROOT, capture_output=True, text=True, timeout=1200)
        if r.returncode:
            fail(f"build_jog.py exited {r.returncode}: {r.stderr[-2000:]}")
        jog = json.loads(out.read_text())
    if graph_file.read_bytes() != before:
        fail("graph.json changed")
    edges = graph["edges"]
    n = len(edges)
    if jog["graph_sha256"] != hashlib.sha256(before).hexdigest():
        fail("graph_sha256 does not match graph.json")
    for key in ("road", "lit", "surface", "park", "water", "sight"):
        if len(jog["edges"][key]) != n:
            fail(f"edges.{key} has {len(jog['edges'][key])} rows, graph has {n} edges")
    road = Counter(jog["edges"]["road"])
    if len([c for c in range(7) if road[c] > 0]) < 5:
        fail(f"road classes too few: {dict(road)}")
    lens = [e["len_m"] for e in edges]
    total = sum(lens)
    lit_yes = sum(m for m, x in zip(lens, jog["edges"]["lit"]) if x == 1) / total
    # The lead's own count on 2026-10-24, joining each graph edge to its OSM way in the NCR extract: 294,364 of
    # 525,148 graph metres carry a lit tag (0.5605), all of them lit=yes. Sidewalk edges repeat their road's tag,
    # so this share is higher than the 34.7% of OSM way length in the box.
    if abs(jog["counts"]["lit_share"] - 0.5605) > 0.01 or abs(lit_yes - 0.5605) > 0.01:
        fail(f"lit_share {jog['counts']['lit_share']:.3f}, lit=yes share {lit_yes:.3f}")
    oval = Polygon(OVAL)
    inside = [i for i, e in enumerate(edges) if oval.contains(LineString(e["geom"]).interpolate(0.5, normalized=True))]
    in_park = sum(1 for i in inside if jog["edges"]["park"][i] == 1)
    if len(inside) < 20 or in_park < 0.8 * len(inside):
        fail(f"Academic Oval: {in_park} of {len(inside)} inner edges carry park=1")
    names = [s["name"] for s in jog["sights"]]
    wd = sum(1 for s in jog["sights"] if s["src"].startswith("wikidata:"))
    if len(names) < 50 or "Quezon Memorial Circle" not in names or wd < 15:
        fail(f"sights: {len(names)} total, {wd} from Wikidata, Quezon Memorial Circle present: "
             f"{'Quezon Memorial Circle' in names}")
    for s in jog["sights"]:
        if s["name"] in ("", None) or not (121.0 < s["lon"] < 121.1 and 14.6 < s["lat"] < 14.7):
            fail(f"bad sight {s}")
    with_sight = [i for i, x in enumerate(jog["edges"]["sight"]) if x >= 0]
    for i in with_sight[:500]:
        s = jog["sights"][jog["edges"]["sight"][i]]
        mid = LineString(edges[i]["geom"]).interpolate(0.5, normalized=True)
        if mid.distance(Point(s["lon"], s["lat"])) * 111320 > 45:
            fail(f"edge {i} points at sight {s['name']} more than 40 m away")
    print(json.dumps({"edges": n, "road": dict(road), "lit_share": round(jog["counts"]["lit_share"], 3),
                      "lit_yes_share": round(lit_yes, 3), "oval_inner_edges": len(inside), "oval_park": in_park,
                      "sights": len(names), "wikidata_sights": wd, "edges_with_sight": len(with_sight)}))
    print("PASS")


if __name__ == "__main__":
    main()
