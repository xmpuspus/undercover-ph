"""Acceptance for route_check.py's side-switch rule through centre edges (plan item 8, 2026-10-23).

Run: pipeline/shade/.venv/bin/python -m pytest pipeline/districts/test_route_check_sides.py -q
Same graph as app/src/lib/router/__tests__/centre-switch.test.ts: the north sidewalk A to B, a centre edge of the
same road B to C, the south sidewalk C to D, and an optional footway around through X. route_check.py must apply
the browser's rule, so its QA file counts these moves.
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("UC_AREA", "metro-core")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import route_check  # noqa: E402


def edge(i, u, v, side, length, name="Ayala Avenue", way=7):
    return {"id": i, "u": u, "v": v, "side": side, "len_m": length, "flags": 32, "routable": True,
            "hours_idx": None, "name": name, "way_id": way}


def graph(flags, around, last="right"):
    edges = [edge(0, 0, 1, "left", 200.0), edge(1, 1, 2, "centre", 100.0), edge(2, 2, 3, last, 200.0)]
    nodes = [[0, 0], [1, 0], [2, 0], [3, 0]]
    node_flags = list(flags)
    if around:
        nodes.append([1.5, 1])
        node_flags.append(0)
        edges += [edge(3, 0, 4, "centre", around, name="Footway", way=9), edge(4, 4, 3, "centre", around, name="Footway", way=9)]
    return {"nodes": nodes, "edges": edges, "node_flags": node_flags}


def ids(route):
    return [e["id"] for e in route]


def test_no_crossing_on_the_centre_run_refuses_the_change():
    route, _ = route_check.search(graph([4, 0, 0, 4], None), 0, 3, 0, False)
    assert route is None
    route, junctions = route_check.search(graph([4, 0, 0, 4], 300.0), 0, 3, 0, False)
    assert ids(route) == [3, 4]
    assert junctions == 0


def test_a_crossing_or_signals_anywhere_on_the_run_makes_it_free():
    for flags in ([4, 1, 0, 4], [4, 0, 1, 4], [4, 0, 2, 4]):
        route, junctions = route_check.search(graph(flags, None), 0, 3, 0, False)
        assert ids(route) == [0, 1, 2]
        assert junctions == 0


def test_an_unmarked_junction_on_the_run_counts_and_costs_60_m():
    route, junctions = route_check.search(graph([4, 0, 4, 4], None), 0, 3, 0, False)
    assert ids(route) == [0, 1, 2]
    assert junctions == 1
    # 500 m plus 60 m loses to a 2 x 270 m way around.
    route, junctions = route_check.search(graph([4, 0, 4, 4], 270.0), 0, 3, 0, False)
    assert ids(route) == [3, 4]


def test_the_same_sidewalk_through_a_centre_edge_stays_free():
    route, junctions = route_check.search(graph([4, 0, 0, 4], None, last="left"), 0, 3, 0, False)
    assert ids(route) == [0, 1, 2]
    assert junctions == 0
