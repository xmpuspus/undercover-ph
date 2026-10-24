"""Acceptance for PLAN.md items 34 to 39 (2026-10-23): the coverage gaps in tmp/improve-plan-20261023/coverage.md.

Run: python3 -I pipeline/tools/check_coverage_targets.py
Exits 0 when every target point lies inside a graph box of a registered area whose build passed its checks, and
every thin area named below has at least 210 places. The points are OpenStreetMap features from the Geofabrik
extract philippines-261020 (the build's own source), read on 2026-10-23: the mall polygon or node where OSM
has one, else the place node. Standard library only.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPE = ROOT / "pipeline"
MIN_PLACES = 210

TARGETS = {
    "34 Kamuning, Timog and Tomas Morato": [
        ("Robinsons Magnolia", 121.0386, 14.6137),
        ("St. Paul University stop", 121.0367, 14.6149),
        ("Kamuning", 121.0391, 14.6275),
        ("Tomas Morato Plaza", 121.0341, 14.6287),
    ],
    "35 Novaliches, Tandang Sora and Balintawak": [
        ("SM City Novaliches", 121.0363, 14.7088),
        ("Ayala Malls Cloverleaf", 120.9998, 14.6557),
        ("Tandang Sora", 121.0321, 14.6818),
        ("Balintawak", 121.0069, 14.6573),
    ],
    "36 Bacoor, Imus and General Trias": [
        ("SM City Bacoor", 120.9519, 14.4433),
        ("SM Center Imus", 120.9227, 14.4089),
        ("Ayala Malls Vermosa", 120.9600, 14.3848),
        ("General Trias", 120.8803, 14.3861),
    ],
    "37 San Jose del Monte": [
        ("SM City San Jose del Monte", 121.0748, 14.7876),
    ],
    "38 Caloocan north, Bicutan and Sucat, Southmall, east Pasig and Cainta, Santa Mesa": [
        ("SM City Caloocan", 121.0194, 14.7521),
        ("SM City Bicutan", 121.0417, 14.4861),
        ("SM City Sucat", 120.9936, 14.4840),
        ("SM Southmall", 121.0116, 14.4341),
        ("Tiendesitas", 121.0771, 14.5856),
        ("SM City East Ortigas", 121.1053, 14.5868),
        ("Robinsons Cainta", 121.1126, 14.5849),
        ("SM City Santa Mesa", 121.0176, 14.6044),
        ("Polytechnic University of the Philippines", 121.0119, 14.5991),
    ],
}
# Item 39: areas under 210 places in the README coverage table on 2026-10-23, matched by area name or city.
THIN = ["Tagaytay", "Surigao", "Roxas City", "Ormoc", "Talisay", "Tacloban", "Laoag", "Calapan"]


def areas():
    out = []
    for f in (PIPE / "areas.json", PIPE / "regions/areas.json"):
        out += json.loads(f.read_text())["areas"]
    return out


def passed(area_id):
    s = PIPE / "work/districts" / area_id / "summary.json"
    return s.exists() and json.loads(s.read_text()).get("checks_passed") is True


def inside(rect, lon, lat):
    return rect[0] <= lon <= rect[2] and rect[1] <= lat <= rect[3]


def main():
    reg = areas()
    fails = []
    for item, points in TARGETS.items():
        for name, lon, lat in points:
            hit = [a["id"] for a in reg if any(inside(r, lon, lat) for r in a.get("graph_rects", []))]
            ok = [a for a in hit if passed(a)]
            if not hit:
                fails.append(f"{item}: {name} ({lon}, {lat}) is in no area's graph box")
            elif not ok:
                fails.append(f"{item}: {name} is in {', '.join(hit)}, but no build there passed its checks")
    for town in THIN:
        match = [a for a in reg if town.lower() in a["name"].lower() or any(town.lower() in c.lower() for c in a.get("cities", []))]
        if town == "Talisay":
            match = [a for a in match if "negros" in a["id"] or a.get("region") == "bacolod"]
        if town == "Tacloban":
            match = [a for a in match if "university" in a["id"] or "university" in a["name"].lower()] or match
        if not match:
            fails.append(f"39 thin areas: no area for {town}")
            continue
        for a in match:
            places = PIPE / "stage" / a["id"] / "places.json"
            n = len(json.loads(places.read_text())) if places.exists() else 0
            if n < MIN_PLACES:
                fails.append(f"39 thin areas: {a['id']} has {n} places, under {MIN_PLACES}")
    if fails:
        print("\n".join(fails))
        sys.exit(1)
    print(f"every coverage target is in a built area, and the {len(THIN)} thin towns have {MIN_PLACES}+ places")


if __name__ == "__main__":
    main()
