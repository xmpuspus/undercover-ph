"""Acceptance for PLAN.md items 6, 29 and 33 (2026-10-23). Plain asserts, no pytest.

Run: pipeline/.venv/bin/python -I pipeline/districts/check_walk_data.py [--stage AREA]
Exits 0 when every rule holds. With --stage AREA it adds a check of that area's built graph in pipeline/stage/AREA/.
The build must call these functions, so the graph follows the same rules:
- build_graph.passage_tags(tags): the tags the access rules read. A road that runs through a building
  (tunnel=building_passage) and has a tagged sidewalk is a street, not a vehicle tunnel, so its sidewalks stay
  walkable. Item 6: OSM way 861229229, 15 m of East Street under a building link, split Ayala Center from its
  own signalled crossing, and the Ayala MRT to Greenbelt route went round the mall.
- build_graph.deck(tags): (base_m, top_m, width_m) for a road flyover, a bridge or an elevated railway, else
  None. Walkways are not decks. A deck casts shade, and a ground walk edge with 80% or more of its length under
  one gets bit 0 (covered) and bit 4096 (under a deck). Item 29.
- build_graph.side_offset_m(tags, class_lanes): how far an assumed sidewalk sits from the road's centre line.
  With no width or lanes tag, the class minimum lanes apply (trunk 6, primary 4, secondary 4, tertiary 2), so
  a wide road's sidewalk no longer sits inside the carriageway. Item 33.
- build_graph.assumed_side_fits(d_used, width_m): an assumed side (no sidewalk tag) whose line had to move
  closer than 0.5 m outside the carriageway, because buildings stand there, is dropped. Item 33.
"""
import gzip
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("UC_AREA", "metro-core")
HERE = Path(__file__).resolve().parent
# pipeline/ has its own older build_graph.py, so districts/ goes first: it must win the import.
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import build_graph  # noqa: E402
from pedestrian_access import requires_access_evaluation, static_public_walkable  # noqa: E402

UNDER_DECK = 4096
FAILS = []


def check(got, want, label):
    if got != want:
        FAILS.append(f"{label}: got {got!r}, want {want!r}")


def passages():
    p = build_graph.passage_tags
    street = {"highway": "unclassified", "tunnel": "building_passage", "sidewalk": "both", "name": "East Street"}
    check(static_public_walkable(p(street)), True, "a street through a building with sidewalks is walkable")
    check(requires_access_evaluation(p(street)), False, "and needs no opening hours")
    for tags in ({"highway": "primary", "tunnel": "yes", "sidewalk": "both"},
                 {"highway": "service", "tunnel": "building_passage"},
                 {"highway": "unclassified", "tunnel": "building_passage", "sidewalk": "no"}):
        check(static_public_walkable(p(tags)), False, f"still closed {tags}")
    corridor = {"highway": "footway", "tunnel": "building_passage"}
    check(requires_access_evaluation(p(corridor)), True, "a footway through a building still needs hours")


def decks():
    d = build_graph.deck
    for tags in ({"railway": "light_rail", "bridge": "viaduct", "layer": "1"},
                 {"railway": "subway", "bridge": "yes", "layer": "2"},
                 {"highway": "primary", "bridge": "yes", "layer": "1"},
                 {"highway": "trunk", "bridge": "viaduct"}):
        got = d(tags)
        if not (isinstance(got, tuple) and len(got) == 3):
            FAILS.append(f"deck {tags}: got {got!r}, want (base, top, width)")
            continue
        base, top, width = got
        if not (4 <= base < top <= base + 3 and 5 <= width <= 40):
            FAILS.append(f"deck {tags}: base {base}, top {top}, width {width} out of range")
    for tags in ({"highway": "footway", "bridge": "yes"}, {"highway": "primary"}, {"railway": "rail"},
                 {"highway": "primary", "bridge": "no"}, {"railway": "light_rail", "tunnel": "yes", "layer": "-1"}):
        check(d(tags), None, f"no deck {tags}")
    wide = d({"highway": "trunk", "bridge": "yes", "lanes": "6"})
    narrow = d({"highway": "trunk", "bridge": "yes", "lanes": "2"})
    if wide and narrow and not wide[2] > narrow[2]:
        FAILS.append(f"deck width should follow lanes: 6 lanes {wide[2]}, 2 lanes {narrow[2]}")


def offsets():
    o = build_graph.side_offset_m
    lane, extra = build_graph.LANE_M, build_graph.SIDE_EXTRA_M
    for hw, n in (("trunk", 6), ("primary", 4), ("secondary", 4), ("tertiary", 2)):
        got = o({"highway": hw}, {hw: 1.0})
        if got < n * lane / 2 + extra - 1e-6:
            FAILS.append(f"{hw} with no lanes tag: offset {got} m, want at least {n * lane / 2 + extra}")
    check(round(o({"highway": "trunk", "lanes": "2"}, {}), 2), round(2 * lane / 2 + extra, 2), "a lanes tag wins")
    check(round(o({"highway": "primary", "width": "20"}, {}), 2), round(10 + extra, 2), "a width tag wins")
    f = build_graph.assumed_side_fits
    check(f(7.0, 12.8), True, "sidewalk 0.6 m outside a 12.8 m road")
    check(f(6.9, 12.8), False, "sidewalk 0.5 m outside is too close")
    check(f(3.0, 12.8), False, "sidewalk inside the carriageway")


def stage(area):
    d = HERE.parent / "stage" / area
    g = json.loads((d / "graph.json").read_text())
    under = [e for e in g["edges"] if e["flags"] & UNDER_DECK]
    if not under:
        FAILS.append(f"{area}: no edge has bit {UNDER_DECK}")
    for e in under:
        if not e["flags"] & 1:
            FAILS.append(f"{area}: edge {e['id']} is under a deck but not covered")
    feats = json.loads(gzip.decompress((d / "buildings.geojson.gz").read_bytes()))["features"]
    decks_n = sum(1 for f in feats if f["properties"].get("kind") == "deck")
    if not decks_n:
        FAILS.append(f"{area}: buildings.geojson.gz holds no feature with kind deck")
    print(f"{area}: {len(under)} edges under a deck, {decks_n} deck features")
    if area == "metro-core":
        # Item 6: 1,229.6 m before the fix. With East Street joined, about 1,207 m (item6/run-notes.md).
        import importlib.util
        spec = importlib.util.spec_from_file_location("districts_route_check", HERE / "route_check.py")
        route_check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(route_check)
        places = json.loads((d / "places.json").read_text())
        src, _ = route_check.find_place(places, "Ayala MRT Station")
        dst, _ = route_check.find_place(places, "Greenbelt")
        path, _ = route_check.search(g, src["node_id"], dst["node_id"], 0.0, False)
        length = sum(e["len_m"] for e in path) if path else None
        print(f"Ayala MRT Station to Greenbelt: {length} m")
        if length is None or length > 1215:
            FAILS.append(f"Ayala MRT Station to Greenbelt is {length} m, want 1,215 m or less")


for part in (passages, decks, offsets):
    try:
        part()
    except Exception as e:  # a missing function counts as a failure, with its name
        FAILS.append(f"{part.__name__}: {type(e).__name__}: {e}")
if "--stage" in sys.argv:
    try:
        stage(sys.argv[sys.argv.index("--stage") + 1])
    except Exception as e:
        FAILS.append(f"stage: {type(e).__name__}: {e}")

if FAILS:
    print("\n".join(FAILS))
    sys.exit(1)
print("all walk data rules hold")
