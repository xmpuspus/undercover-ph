"""Run: python3 -m pytest pipeline/tools/test_field_kit.py -q"""
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import field_kit  # noqa: E402

DATE = "2026-10-24"


def area(tmp_path, monkeypatch):
    """Eight open edges 300 m apart with noon shade 0, 30, 60 and 90, two covered edges, one too short."""
    d = tmp_path / "areas" / "a1"
    (d / "shade").mkdir(parents=True)
    edges, noon = [], []
    for i in range(11):
        lon = 121.0 + i * 0.003
        edges.append({"id": i, "len_m": 10.0 if i == 10 else 60.0, "routable": True, "flags": 1 if i in (8, 9) else 0,
                      "side": "left", "way_id": 100 + i, "name": f"Street {i}",
                      "geom": [[lon, 14.55], [lon + 0.0005, 14.55]]})
        noon.append([0, 30, 60, 90][i % 4])
    n_e, buckets = len(edges), [480, 720, 960]
    building = bytes([10] * n_e + noon + [80] * n_e)
    tree = bytes(3 * n_e)
    (d / "shade" / f"{DATE}.bin").write_bytes(building + tree)
    (d / "graph.json").write_text(json.dumps({"nodes": [], "edges": edges}))
    (d / "manifest.json").write_text(json.dumps({"dates": [DATE], "buckets_min": buckets,
                                                  "shade": {"n_buckets": 3, "n_edges": n_e, "files": [f"shade/{DATE}.bin"]}}))
    monkeypatch.setattr(field_kit, "AREAS", tmp_path / "areas")
    monkeypatch.setattr(field_kit, "OUT", tmp_path / "field")
    return tmp_path


def test_make_spreads_points_across_shade_values_and_adds_covered_ones(tmp_path, monkeypatch):
    area(tmp_path, monkeypatch)
    rows = field_kit.make("a1", DATE, n=8, n_covered=2)
    shade = [r for r in rows if r["kind"] == "shade"]
    assert len(shade) == 8
    assert {r["model_1200"] for r in shade} == {0, 30, 60, 90}
    assert [r["edge_id"] for r in rows if r["kind"] == "cover"] and all(r["model_covered"] == "yes" for r in rows if r["kind"] == "cover")
    assert 10 not in [r["edge_id"] for r in rows]
    assert (tmp_path / "field" / f"a1-{DATE}.geojson").exists()


def test_score_counts_agreement_near_misses_and_covered_walkways(tmp_path, monkeypatch):
    area(tmp_path, monkeypatch)
    field_kit.make("a1", DATE, n=8, n_covered=2)
    path = tmp_path / "field" / f"a1-{DATE}.csv"
    rows = list(csv.DictReader(open(path)))
    seen = {"0": "sun", "30": "sun", "60": "partial", "90": "shade"}
    for r in rows:
        if r["kind"] == "shade":
            r["obs_1200"] = seen[r["model_1200"]]
        else:
            r["obs_covered"] = "yes" if r["edge_id"] == "8" else "no"
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, field_kit.FIELDS)
        w.writeheader()
        w.writerows(rows)
    out = field_kit.score(path)
    s = out["slots"]["1200"]
    # Model: 0 and 30 are sun, 60 and 90 are shade. Seen: 60 as partial, a near miss.
    assert s["points"] == 8 and s["agree"] == 6 and s["agree_or_near"] == 8
    assert out["covered"]["model_and_seen"] == 1 and out["covered"]["model_not_seen"] == 1
    assert out["slots"]["0800"]["points"] == 0
