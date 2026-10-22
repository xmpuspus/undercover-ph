"""Repeat the 14:00 sun-side count on the pairs where OpenStreetMap maps both sidewalks (flag 32).

Reads the shipped app data through side_of_street.py and prints one JSON line per set.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import side_of_street as s  # noqa: E402

m, g, building = s.load()
lat0 = (m["graph_bbox"][1] + m["graph_bbox"][3]) / 2
facts, pairs = s.side_pairs(g, lat0)
flags = {e["id"]: e["flags"] for e in g["edges"]}
mapped = [
    (left, right) for left, right in pairs if flags[left] & 32 and flags[right] & 32
]
d = m["dates"].index("2026-10-22")
keys = (
    "pairs_compared",
    "sun_side_shadier",
    "far_side_shadier",
    "within_5_points",
    "sun_side_minus_far_side_pts",
)
for label, ps in (("all pairs", pairs), ("both sides mapped", mapped)):
    rows = s.analyse(
        "2026-10-22", m["sun"]["2026-10-22"], building, facts, ps, m["buckets_min"], d
    )
    r = next(x for x in rows if x["time"] == "14:00")
    print(json.dumps({"set": label, "pairs": len(ps), **{k: r[k] for k in keys}}))
