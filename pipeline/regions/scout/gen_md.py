"""Writes pipeline/regions/candidates.md from candidates.json, reference_districts.json and secondary_seeds.json.
Usage: pipeline/.venv/bin/python -I pipeline/regions/scout/gen_md.py"""
import json
import statistics
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
REG = HERE.parent
rows = json.loads((REG / "candidates.json").read_text())
ref = json.loads((HERE / "reference_districts.json").read_text())
sec = json.loads((HERE / "secondary_seeds.json").read_text())
THIN_WALK, THIN_PLACES, THIN_BLD = 45.0, 80, 1500


def thin(r):
    out = []
    if r["walk_km"] < THIN_WALK:
        out.append(f"only {r['walk_km']} km walkable")
    if r["places"] < THIN_PLACES:
        out.append(f"only {r['places']} named places")
    return out


def sh(r):
    return "n/a" if r["height_tag_share"] is None else f"{r['height_tag_share'] * 100:.1f}%"


L = []
w = L.append
rw = sorted(v["walk_km"] for v in ref.values())
rp = sorted(v["places"] for v in ref.values())
w("# Walkable city centres outside Metro Manila, ranked for the build workers\n")
w(f"{len(rows)} districts in {len({r['city'] for r in rows})} cities. Every number comes from the Geofabrik philippines-261020.osm.pbf "
  "(md5 941dd405ba4f1c028ca874cde38ea200). Rerun with `pipeline/regions/scout/extract.py`, then `score.py build`, then `gen_md.py`.\n")
w("## How the numbers were made\n")
w("- Box: 0.020 deg wide by 0.016 deg high (about 2.2 km by 1.8 km), edges on a 0.002 deg grid. The 16 Metro Manila districts range from 0.014 to 0.03 deg per side. The graph area is the box plus 500 m.")
w("- walk_km: way segments that pass `static_public_walkable` (access_policy and pedestrian_access), minus ways that touch a blocked node. This is the build_graph.py test. It includes roads, so a rural road grid scores high. That is why places also count.")
w("- places: named nodes and closed ways that `build_places.category()` accepts, before the 150 m dedupe and the 80 m snap. Counts run higher than the final places.json.")
w("- buildings: closed building ways only. Building relations are not read, so counts run a little low. height_tag_share: buildings with a parseable `height` or `building:levels`.")
w("- covered_km: pedestrian-class ways with covered=yes/arcade/colonnade/roof, indoor, corridor or building passage (bits 0 and 2 of build_graph.py).")
w("- Segments, buildings and places count when their midpoint, centroid or point lies inside the box.")
w("- Window score = walk_km + places / 6. A district needs at least 25 km walkable, 60 places, and at most 25% overlap with another district. Rank = half walk_km and half places, each divided by the best value in the list.")
w("- utm_epsg: 32650 west of 120 E (Palawan), 32651 for 120 E to 126 E. Every other city is 32651. s2_l4_cell: the level-4 S2 cell token for the box centre. Google Open Buildings v3 ships one file per level-4 cell. The research notes in research/20261021T120813Z/ do not name an S2 cell, so the tokens were computed (`s2cell.py`, checked against s2sphere on 5,000 random points). Confirm each token against the Open Buildings file list before download.")
w(f"- Scale check, the same code run on the existing districts: walk_km {rw[0]} to {rw[-1]} (median {statistics.median(rw):.0f}), places {rp[0]} to {rp[-1]} (median {statistics.median(rp):.0f}). Candidate boxes sit in the same range. See `scout/reference_districts.json`.\n")

w("## All districts, best first\n")
w("| Rank | District | City | Walk km | Places | Buildings | Height tags | Covered km | UTM | S2 L4 |")
w("| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |")
for r in rows:
    flag = " (thin)" if thin(r) else ""
    w(f"| {r['rank']} | {r['district_id']}{flag} | {r['city']} | {r['walk_km']} | {r['places']} | {r['buildings']} | {sh(r)} | {r['covered_km']} | {r['utm_epsg']} | {r['s2_l4_cell']} |")

w("\n## What to build first, city by city\n")
by = defaultdict(list)
for r in rows:
    by[r["city"]].append(r)
for city, rs in sorted(by.items(), key=lambda kv: min(x["rank"] for x in kv[1])):
    rs.sort(key=lambda x: x["rank"])
    first = [x for x in rs if not thin(x)]
    skip = [x for x in rs if thin(x)]
    line = f"**{city}** ({rs[0]['province']}, {rs[0]['region']}). "
    if first:
        line += "Build first: " + ", ".join(f"{x['district_id']} (rank {x['rank']}, {x['walk_km']} km, {x['places']} places)" for x in first) + ". "
    else:
        line += "Build nothing yet. "
    if skip:
        line += "Skip for now: " + "; ".join(f"{x['district_id']} ({', '.join(thin(x))})" for x in skip) + ". "
    notes = []
    low_b = [x for x in rs if x["buildings"] < THIN_BLD and x not in skip]
    if low_b:
        notes.append("few mapped footprints in " + ", ".join(x["district_id"] for x in low_b) + f" ({min(x['buildings'] for x in low_b)}{'' if len({x['buildings'] for x in low_b}) == 1 else ' to ' + str(max(x['buildings'] for x in low_b))} buildings), so shade will lean on Google Open Buildings and the default height")
    if all(x["covered_km"] < 0.3 for x in rs):
        notes.append("no mapped covered walkways, so only building shade helps walkers")
    if max(x["covered_km"] for x in rs) >= 2:
        notes.append("has real covered walkways (" + max(rs, key=lambda x: x["covered_km"])["district_id"] + f", {max(x['covered_km'] for x in rs)} km)")
    if max((x["height_tag_share"] or 0) for x in rs) >= 0.1:
        notes.append("some height tags in " + max(rs, key=lambda x: x["height_tag_share"] or 0)["district_id"])
    if notes:
        line += "Note: " + "; ".join(notes) + "."
    w("- " + line)

w("\n## Joint entries and name checks\n")
w(f"- Clark: its own best box scores {sec['clark']['walk_km']} km and {sec['clark']['places']} places, bbox {sec['clark']['bbox']}. It overlaps angeles-mall-transit-hub (SM City Clark), so Clark got no separate district. Build that district to cover Clark.")
w(f"- Subic: its own best box scores {sec['subic']['walk_km']} km and {sec['subic']['places']} places, bbox {sec['subic']['bbox']}. It sits on olongapo-downtown (Subic Bay side), so no separate district was made.")
w(f"- Nuvali: its own best box scores {sec['nuvali']['walk_km']} km and {sec['nuvali']['places']} places, bbox {sec['nuvali']['bbox']}. Roads are mapped but few named places. Skip it.")
w("- santa-rosa-downtown lies on the Santa Rosa and Biñan border (Biñan malls and colleges). Check the name before it goes on the app.")
w("- Mandaue and Lapu-Lapu share the Cebu metro. Their boxes were chosen after Cebu City, so none overlaps a Cebu district by more than 25%.")
w("- Talisay (Negros Occidental), Dasmarinas, Tarlac City, Los Banos, San Pablo, Lucena, Pagadian, Digos, Baliwag, Kalibo, Tagum, Balanga, Calapan and Dipolog were not on the request list. The national scan found them with 100+ places in a box. Each has the same numbers as the listed cities. Dasmarinas ranks 6th.\n")

w("## Cities dropped\n")
dropped = json.loads((HERE / "dropped.json").read_text())
if dropped:
    for d in dropped:
        w(f"- {d['city']}: best box {d['walk_km']} km, {d['places']} places.")
else:
    w("- None dropped whole. Every city on the list has at least one box with 25 km walkable and 60 places.")
w("- Districts skipped as thin (under 45 km walkable or under 80 places) are marked in the table.")
(REG / "candidates.md").write_text("\n".join(L) + "\n")
