"""Pick 3 route-check pairs per area from well-known places, without looking at the graph.

Usage: pipeline/.venv/bin/python -I pipeline/regions/pick_routes.py OUT_JSON AREA_ID [AREA_ID ...]
Then add OUT_JSON with pipeline/regions/registry_add.py routes OUT_JSON, and run build.py --checks.
A pair joins two places with unique names, 300 m to 3 km apart, ranked by category
(malls, hospitals, terminals, city halls, universities, cathedrals). No place is in two pairs.
The graph is not read on purpose, so a pair can fail the route check.
UCPH_PICK_EXCLUDE (names joined by "|") drops places that a run note says sit behind a closed gate.
"""

import json
import math
import os
import sys
from collections import Counter
from pathlib import Path

STAGE = Path(__file__).resolve().parents[2] / "pipeline/stage"
RANK = {"mall": 6, "hospital": 5, "bus_station": 5, "townhall": 5, "university": 4, "college": 4,
        "place_of_worship": 3, "marketplace": 3, "landmark": 3, "park": 2, "school": 1}
NAME_RANK = [("city hall", 6), ("capitol", 6), ("cathedral", 5), ("university", 4), ("college", 3),
             ("terminal", 4), ("market", 3), ("plaza", 3), ("church", 2), ("parish", 2)]


def rank(p):
    n = p["name"].lower()
    return max([RANK.get(p["category"], 0)] + [r for k, r in NAME_RANK if k in n])


def key(name):
    return "".join(c for c in name.lower() if c.isalnum())


def same(a, b):
    # Two spellings of one place ("City Mall", "CityMall") or a place and its compound make a weak check.
    x, y = key(a), key(b)
    n = 0
    while n < min(len(x), len(y)) and x[n] == y[n]:
        n += 1
    return n >= 8 or x in y or y in x


def metres(a, b):
    k = math.cos(math.radians((a["lat"] + b["lat"]) / 2))
    return 111_320 * math.hypot((a["lon"] - b["lon"]) * k, a["lat"] - b["lat"])


def pick(area):
    places = json.load(open(STAGE / area / "places.json"))
    count = Counter(key(p["name"]) for p in places)
    skip = set(filter(None, os.environ.get("UCPH_PICK_EXCLUDE", "").split("|")))
    good = [p for p in places if p["name"] not in skip and count[key(p["name"])] == 1 and rank(p) >= 2 and len(p["name"]) >= 6
            and p["name"] != p["name"].lower()]
    good.sort(key=lambda p: (-rank(p), p["name"]))
    good = good[:16]
    pairs = []
    for i, a in enumerate(good):
        for b in good[i + 1:]:
            d = metres(a, b)
            if 300 <= d <= 3000 and not same(a["name"], b["name"]):
                pairs.append((-(rank(a) + rank(b)), -d, a["name"], b["name"]))
    pairs.sort()
    used, out = set(), []
    for _, _, a, b in pairs:
        if a in used or b in used or any(same(a, u) or same(b, u) for u in used):
            continue
        out.append([a, b])
        used |= {a, b}
        if len(out) == 3:
            break
    return out


if __name__ == "__main__":
    out = {a: pick(a) for a in sys.argv[2:] if (STAGE / a / "places.json").exists()}
    Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    for a, p in out.items():
        print(a, len(p), p)
