"""Run: python3 -m pytest pipeline/shade/test_check_sun_order.py -q"""
import json
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_sun_order  # noqa: E402

REAL = Path(__file__).resolve().parents[2] / "app/public/data/areas/metro-core"


def area(tmp_path, noon, late, roofed_noon=0):
    """Two open edges and one roofed edge, with two buckets: 12:00 and 16:00."""
    d = tmp_path / f"a{noon}-{late}-{roofed_noon}"
    (d / "shade").mkdir(parents=True)
    edges = [{"len_m": 10.0, "flags": 0}, {"len_m": 30.0, "flags": 0}, {"len_m": 50.0, "flags": 1}]
    (d / "graph.json").write_text(json.dumps({"nodes": [], "edges": edges}))
    (d / "manifest.json").write_text(json.dumps({
        "dates": ["2026-10-24"], "buckets_min": [720, 960],
        "shade": {"n_buckets": 2, "n_edges": 3, "files": ["shade/2026-10-24.bin"]}}))
    building = bytes([noon, noon, roofed_noon, late, late, 0])
    tree = bytes(6)
    (d / "shade/2026-10-24.bin").write_bytes(building + tree)
    return d


def test_noon_below_late_passes(tmp_path):
    assert check_sun_order.check(area(tmp_path, 20, 60)) == []


def test_noon_at_or_above_late_fails(tmp_path):
    assert check_sun_order.check(area(tmp_path, 60, 60))
    assert check_sun_order.check(area(tmp_path, 70, 20))


def test_roofed_edges_do_not_count(tmp_path):
    assert check_sun_order.check(area(tmp_path, 20, 60, roofed_noon=100)) == []


@pytest.mark.skipif(not (REAL / "manifest.json").exists(), reason="no generated metro-core shade")
def test_real_shade_with_noon_and_16_00_swapped_fails(tmp_path):
    d = tmp_path / "metro-core"
    shutil.copytree(REAL, d, ignore=shutil.ignore_patterns("*.gz", "trees.json"))
    assert check_sun_order.check(d) == []
    m = json.loads((d / "manifest.json").read_text())
    n_b, n_e = m["shade"]["n_buckets"], m["shade"]["n_edges"]
    noon, late = m["buckets_min"].index(720), m["buckets_min"].index(960)
    f = d / m["shade"]["files"][0]
    raw = bytearray(f.read_bytes())
    for half in (0, n_b * n_e):
        a, b = half + noon * n_e, half + late * n_e
        raw[a:a + n_e], raw[b:b + n_e] = raw[b:b + n_e], raw[a:a + n_e]
    f.write_bytes(bytes(raw))
    assert check_sun_order.check(d)
