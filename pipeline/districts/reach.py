"""Share of place pairs in an area that a walk can connect, from the staged graph.

Usage: pipeline/.venv/bin/python -I pipeline/districts/reach.py AREA_ID [AREA_ID ...]
A place routes from its node_id. Two places connect when their nodes share a piece of the routable graph.
The router's side rule removes no reach: with the side test fixed on 2026-10-22, each area's reach equals its
reach with no side rule (pipeline/NOTES.md). So the share is exact: the sum over pieces of (places in the
piece / places)^2. publish.py ships a regional area only above MIN_REACH.
"""

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

STAGE = Path(__file__).resolve().parents[1] / "stage"
MIN_REACH = 0.70


def reach(area):
    g = json.load(open(STAGE / area / "graph.json"))
    places = json.load(open(STAGE / area / "places.json"))
    n = len(g["nodes"])
    e = [x for x in g["edges"] if x["routable"]]
    m = coo_matrix(
        (np.ones(len(e)), ([x["u"] for x in e], [x["v"] for x in e])), shape=(n, n)
    )
    _, label = connected_components(m, directed=False)
    pieces = Counter(int(label[p["node_id"]]) for p in places)
    total = sum(pieces.values())
    return (
        round(sum((k / total) ** 2 for k in pieces.values()), 4) if total > 1 else 0.0
    )


if __name__ == "__main__":
    print(json.dumps({a: reach(a) for a in sys.argv[1:]}))
