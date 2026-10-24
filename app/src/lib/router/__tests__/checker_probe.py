"""Exercise both checker entry points without writing reports or changing input data."""
import contextlib
import importlib.util
import io
import itertools
import json
import runpy
import sys
import types
from pathlib import Path
from unittest.mock import patch

root, snapshot = map(Path, sys.argv[1:])
sys.path.insert(0, str(root / "pipeline"))
import common  # noqa: E402
from districts import route_check as district  # noqa: E402

spec = importlib.util.spec_from_file_location("legacy_checker", root / "pipeline/route_check.py")
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
assert legacy.search is district.search


def edge(i, u, v, side, **extra):
    return dict(id=i, u=u, v=v, side=side, len_m=100.0, name="Main Street", way_id=7,
                flags=32, routable=True, hours_idx=None, landmark=None, **extra)


cases = 0
for flags, mask, same, reverse in itertools.product(
        itertools.product((0, 1, 2, 4), repeat=4), (0, 1, 2, 4, 8, 16, 31), (False, True), (False, True)):
    edges = [edge(i, i, i + 1, side) for i, side in enumerate(
        ("left", "centre", "centre", "centre", "left" if same else "right"))]
    for i, e in enumerate(edges):
        if mask & (1 << i):
            e["u"], e["v"] = e["v"], e["u"]
            e["side"] = {"left": "right", "right": "left", "centre": "centre"}[e["side"]]
    graph = dict(nodes=[[i, 0] for i in range(6)], edges=edges, node_flags=[4, *flags, 4])
    route, count = legacy.search(graph, 5 if reverse else 0, 0 if reverse else 5, 0, False)
    assert (route is not None) == (same or any(flags)), (flags, mask, same, reverse)
    assert count == int(not same and 4 in flags and not any(f in (1, 2) for f in flags))
    cases += 1

uturns = 0
for entry in (True, False):
    for side in ("left", "right"):
        edges = [edge(0, 0, 1, "left"), edge(1, 0, 1, "centre") if entry else edge(1, 1, 2, "centre"), edge(2, 1, 2, side)]
        carry, _ = district.advance_side(edges, [0, 0, 0], 0, 1, 0 if entry else 1, None)
        _, move = district.advance_side(edges, [0, 0, 0], 1, 2, 1 if entry else 2, carry)
        assert move == (district.NONE if side == "left" else district.FORBIDDEN)
        uturns += 1

edges = [edge(0, 0, 1, "left"), edge(1, 1, 2, "centre"), edge(2, 2, 3, "right")]
edges[1].update(name="Different Road", way_id=99)
route, count = legacy.search(dict(nodes=[[i, 0] for i in range(4)], edges=edges, node_flags=[0] * 4), 0, 3, 0, False)
assert [e["id"] for e in route] == [0, 1, 2] and count == 0

work = root / "app/src/lib/router/.checker-memory"
assert not work.exists()
output = work / "route_check.json"
real_open = open
ctx = types.SimpleNamespace(OUT=snapshot, WORK=work, haversine=common.haversine)
runs = []
for script in ("pipeline/route_check.py", "pipeline/districts/route_check.py"):
    for args in ([], ["2"], ["2", "closed"]):
        sink = io.StringIO()

        def capture(file, mode="r", *a, **kw):
            if "w" in mode:
                assert Path(file) == output, file
                return sink
            return real_open(file, mode, *a, **kw)

        with patch.object(common, "OUT", snapshot), patch.object(common, "WORK", work), \
             patch.dict(sys.modules, {"ctx": ctx}), patch("builtins.open", capture), \
             patch.object(sys, "argv", [script, "Ayala MRT Station", "Greenbelt", *args]), \
             contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(root / script), run_name="__main__")
        result = next(iter(json.loads(sink.getvalue()).values()))
        assert result["length_m"] > 0 and result["side_switch_rule"] == "browser"
        assert result["edges"] == len(result["steps"])
        runs.append(dict(script=script, args=args, length_m=result["length_m"], edges=result["edges"], junctions=result["junction_side_switches"]))
assert not work.exists()
print(json.dumps(dict(matrix_cases=cases, uturns=uturns, reset=True, runs=runs)))
