"""Acceptance for park opening hours in jog.json (app/src/lib/jog/SPEC.md, J-D13).

Run: pipeline/shade/.venv/bin/python -m pytest pipeline/districts/test_build_jog_hours.py -q
hours.json already holds a row for each park whose OSM opening_hours the pipeline can read, with the park's OSM
URL as its source_url, but only malls give those hours to graph edges. build_jog.py must write edges.hours: the
index of the hours.json row of the park that holds the edge midpoint, or -1. graph.json stays the same.

Uses the fixture of test_build_jog.py: way 103 (edge 3) runs inside "Test Park" (way 201).
"""
import json
import subprocess
from pathlib import Path

import test_build_jog as fx

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def hours_row(name, way, rules):
    return {"name": name, "rules": rules, "source_url": f"https://www.openstreetmap.org/way/{way}", "checked": "2026-10-20"}


def run(tmp_path, hours, osm=None, hours_file=True):
    g = tmp_path / "graph.json"
    g.write_text(json.dumps(fx.graph()))
    if hours_file:
        (tmp_path / "hours.json").write_text(json.dumps(hours))
    pbf = tmp_path / "area.osm"
    pbf.write_text(osm or fx.osm_xml())
    wd = tmp_path / "wikidata.json"
    wd.write_text(json.dumps({"query": "test", "fetched": "2026-10-24", "items": [fx.MARKER]}))
    out = tmp_path / "jog.json"
    before = g.read_bytes()
    r = subprocess.run([str(fx.PY), "-I", str(fx.SCRIPT), "--graph", str(g), "--pbf", str(pbf), "--wikidata", str(wd),
                        "--out", str(out)], capture_output=True, text=True, cwd=ROOT, timeout=300)
    assert r.returncode == 0, r.stderr[-3000:]
    assert g.read_bytes() == before
    return json.loads(out.read_text())


DAILY = {d: ["06:00", "22:00"] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


def test_park_edges_take_the_park_hours_row(tmp_path):
    hours = [hours_row("A Mall", 999, DAILY), hours_row("Test Park", 201, DAILY)]
    jog = run(tmp_path, hours)
    assert jog["edges"]["hours"] == [-1, -1, -1, 1, -1]
    assert jog["counts"]["park_hours_edges"] == 1


def test_no_hours_row_means_no_hours(tmp_path):
    jog = run(tmp_path, [hours_row("A Mall", 999, DAILY)])
    assert jog["edges"]["hours"] == [-1, -1, -1, -1, -1]
    assert jog["counts"]["park_hours_edges"] == 0


def test_a_missing_hours_file_leaves_every_edge_without_hours(tmp_path):
    jog = run(tmp_path, [], hours_file=False)
    assert jog["edges"]["hours"] == [-1] * 5


def test_a_relation_park_matches_its_relation_url(tmp_path):
    osm = fx.osm_xml().replace('<way id="201" version="1">', '<way id="202" version="1">').replace(
        "</osm>",
        '<relation id="77" version="1"><member type="way" ref="202" role="outer"/>'
        '<tag k="type" v="multipolygon"/><tag k="leisure" v="park"/><tag k="name" v="Relation Park"/></relation></osm>')
    # The way loses its park tags, so only the relation is a park.
    osm = osm.replace('<tag k="leisure" v="park"/><tag k="name" v="Test Park"/></way>', "</way>")
    hours = [{"name": "Relation Park", "rules": DAILY, "source_url": "https://www.openstreetmap.org/relation/77",
              "checked": "2026-10-20"}]
    jog = run(tmp_path, hours, osm=osm)
    assert jog["edges"]["hours"] == [-1, -1, -1, 0, -1]
