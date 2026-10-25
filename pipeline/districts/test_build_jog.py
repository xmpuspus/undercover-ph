"""Acceptance for build_jog.py, the per-area jog file (app/src/lib/jog/SPEC.md, J-D1 to J-D11).

Run: pipeline/shade/.venv/bin/python -m pytest pipeline/districts/test_build_jog.py -q
The script runs under pipeline/.venv, which has osmium. The test writes a small graph, an OSM XML file and a
Wikidata snapshot to a temp folder, runs the script on them, and checks every edge array by hand.

The fixture, in Makati coordinates:
- way 101, residential, lit=yes, surface=asphalt, sidewalk=both: edges 0 (left) and 1 (right), n1 to n3.
- way 102, primary, lit=no, surface=concrete: edge 2, n3 to n4.
- way 103, footway, surface=gravel, inside the park "Test Park": edge 3, n4 to n6 through n5.
- way 104, service, no other tags: edge 4, n6 to n1.
- a river 30 to 40 m south of way 101, a named memorial 22 m north of way 101, a hotel and a historic=no node
  beside way 102, and one Wikidata marker 11 m from the middle of way 102.
"""
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PY = ROOT / "pipeline/.venv/bin/python"
SCRIPT = HERE / "build_jog.py"

N = {1: (121.0200, 14.5500), 2: (121.0210, 14.5500), 3: (121.0220, 14.5500), 4: (121.0220, 14.5510),
     5: (121.0210, 14.5510), 6: (121.0200, 14.5510),
     11: (121.0195, 14.5506), 12: (121.0215, 14.5506), 13: (121.0215, 14.5516), 14: (121.0195, 14.5516),
     21: (121.0195, 14.5497), 22: (121.0225, 14.5497),
     901: (121.02100, 14.55020), 902: (121.02205, 14.55050), 903: (121.02195, 14.55040)}
NODE_TAGS = {901: {"historic": "memorial", "name": "Test Memorial"},
             902: {"tourism": "hotel", "name": "Test Hotel"},
             903: {"historic": "no", "name": "Not History"}}
WAYS = {101: ([1, 2, 3], {"highway": "residential", "lit": "yes", "surface": "asphalt", "sidewalk": "both",
                          "name": "Test Street"}),
        102: ([3, 4], {"highway": "primary", "lit": "no", "surface": "concrete", "name": "Big Avenue"}),
        103: ([4, 5, 6], {"highway": "footway", "surface": "gravel"}),
        104: ([6, 1], {"highway": "service"}),
        201: ([11, 12, 13, 14, 11], {"leisure": "park", "name": "Test Park"}),
        301: ([21, 22], {"waterway": "river", "name": "Test River"})}
OFF = 0.000045  # about 5 m of latitude, the sidewalk offset of way 101
MARKER = {"qid": "Q999999", "name": "Test Marker", "kind": "nhcp_marker", "lon": 121.02210, "lat": 14.55050}


def osm_xml():
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="test">']
    for i, (lon, lat) in sorted(N.items()):
        tags = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in NODE_TAGS.get(i, {}).items())
        out.append(f'<node id="{i}" version="1" lat="{lat}" lon="{lon}">{tags}</node>')
    for wid, (refs, tags) in sorted(WAYS.items()):
        nds = "".join(f'<nd ref="{r}"/>' for r in refs)
        tg = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())
        out.append(f'<way id="{wid}" version="1">{nds}{tg}</way>')
    out.append("</osm>")
    return "\n".join(out)


def length(geom):
    m = 0.0
    for (x1, y1), (x2, y2) in zip(geom, geom[1:]):
        p1, p2 = math.radians(y1), math.radians(y2)
        a = (math.sin((p2 - p1) / 2) ** 2
             + math.cos(p1) * math.cos(p2) * math.sin(math.radians(x2 - x1) / 2) ** 2)
        m += 2 * 6371008.8 * math.asin(math.sqrt(a))
    return round(m, 2)


def edge(i, u, v, geom, side, way, name):
    return {"id": i, "u": u, "v": v, "len_m": length(geom), "geom": [list(p) for p in geom], "flags": 32,
            "routable": True, "side": side, "way_id": way, "name": name, "landmark": None, "hours_idx": None,
            "level": None}


def graph():
    a, b, c, d = N[1], N[3], N[4], N[6]
    mid = N[2]
    edges = [
        edge(0, 0, 1, [(a[0], a[1] + OFF), (mid[0], mid[1] + OFF), (b[0], b[1] + OFF)], "left", 101, "Test Street"),
        edge(1, 0, 1, [(a[0], a[1] - OFF), (mid[0], mid[1] - OFF), (b[0], b[1] - OFF)], "right", 101, "Test Street"),
        edge(2, 1, 2, [b, c], "centre", 102, "Big Avenue"),
        edge(3, 2, 3, [c, N[5], d], "centre", 103, None),
        edge(4, 3, 0, [d, a], "centre", 104, None),
    ]
    return {"nodes": [list(a), list(b), list(c), list(d)], "edges": edges, "node_flags": [4, 4, 4, 4]}


def run(tmp_path):
    g = tmp_path / "graph.json"
    g.write_text(json.dumps(graph()))
    pbf = tmp_path / "area.osm"
    pbf.write_text(osm_xml())
    wd = tmp_path / "wikidata.json"
    wd.write_text(json.dumps({"query": "test", "fetched": "2026-10-24", "items": [MARKER]}))
    out = tmp_path / "jog.json"
    before = g.read_bytes()
    r = subprocess.run([str(PY), "-I", str(SCRIPT), "--graph", str(g), "--pbf", str(pbf), "--wikidata", str(wd),
                        "--out", str(out)], capture_output=True, text=True, cwd=ROOT, timeout=300)
    assert r.returncode == 0, r.stderr[-3000:]
    return json.loads(out.read_text()), before, g


def test_graph_untouched(tmp_path):
    _, before, g = run(tmp_path)
    assert g.read_bytes() == before


def test_shape(tmp_path):
    jog, before, _ = run(tmp_path)
    assert jog["version"] == 1
    assert jog["graph_sha256"] == hashlib.sha256(before).hexdigest()
    n = len(graph()["edges"])
    for key in ("road", "lit", "surface", "park", "water", "sight"):
        assert len(jog["edges"][key]) == n, key
        assert all(isinstance(x, int) for x in jog["edges"][key]), key
    assert jog["counts"]["edges"] == n
    assert isinstance(jog["sources"], list) and jog["sources"]


def test_tag_counts(tmp_path):
    jog, _, _ = run(tmp_path)
    e = jog["edges"]
    assert e["road"] == [2, 2, 5, 0, 1]
    assert e["lit"] == [1, 1, 2, 0, 0]
    assert e["surface"] == [1, 1, 1, 2, 0]
    assert e["park"] == [0, 0, 0, 1, 0]
    assert e["water"] == [1, 1, 0, 0, 0]
    names = [s["name"] for s in jog["sights"]]
    assert "Test Memorial" in names and "Test Park" in names and "Test Marker" in names
    assert "Test Hotel" not in names and "Not History" not in names
    assert names.count("Test Memorial") == 1
    memorial, marker = names.index("Test Memorial"), names.index("Test Marker")
    assert e["sight"][0] == memorial and e["sight"][1] == memorial
    assert e["sight"][2] == marker
    assert e["sight"][4] == -1
    for s in jog["sights"]:
        assert set(s) >= {"name", "kind", "lon", "lat", "src"}
    assert jog["sights"][marker]["src"] == "wikidata:Q999999"
    lens = [x["len_m"] for x in graph()["edges"]]
    assert abs(jog["counts"]["lit_share"] - sum(lens[:3]) / sum(lens)) < 0.005


def test_offline():
    src = SCRIPT.read_text()
    for pattern in (r"\burllib\b", r"\brequests\b", r"\bhttp\.client\b", r"\bsocket\b", r"\bcurl\b", r"https?://query"):
        assert not re.search(pattern, src), pattern
    snap = json.loads((HERE / "wikidata_heritage.json").read_text())
    assert snap["fetched"] and snap["query"] and len(snap["items"]) > 1000
    for item in snap["items"][:50]:
        assert set(item) >= {"qid", "name", "kind", "lon", "lat"}


def test_pipeline_wiring():
    build = (HERE / "build.py").read_text()
    steps = re.search(r"STEPS = \[(.*?)\]", build, re.S).group(1)
    order = re.findall(r'"([a-z_]+\.py)"', steps)
    assert "build_jog.py" in order and order.index("build_jog.py") > order.index("build_graph.py")
    assert "jog.json" in (HERE / "publish.py").read_text()
    release = (ROOT / "pipeline/data_release.py").read_text()
    files = re.search(r"APP_FILES = \((.*?)\)", release).group(1)
    assert '"jog.json"' in files
