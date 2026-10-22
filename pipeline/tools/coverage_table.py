"""Write the README coverage table from the committed area data, between the coverage markers in README.md.

Usage: python3 pipeline/tools/coverage_table.py
Counts: walkable km and routable km from each area's graph.json, places from places_index.json (each place once),
buildings from the area's manifest template, the mapped share from pipeline/regions/footprint_cover.json.
It also writes the area counts into app/index.html, whose landing line and descriptions repeat them.
Rerun after an area is added or rebuilt.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app/public/data"
START, END = "<!-- coverage:start -->", "<!-- coverage:end -->"


LSTART, LEND = "<!-- limits:start -->", "<!-- limits:end -->"


def write_limits(s, areas):
    """The cover, access and sidewalk limits, summed over every area's graph."""
    sheltered = gated = side = assumed = 0.0
    for a in areas:
        for e in json.loads((DATA / "areas" / a["id"] / "graph.json").read_text())[
            "edges"
        ]:
            km = e["len_m"] / 1000
            if e["routable"] and e["flags"] & 7:
                sheltered += km
            if not e["routable"]:
                gated += km
            if e["side"] in ("left", "right") and e["routable"]:
                side += km
                if not e["flags"] & 32:
                    assumed += km
    text = "\n".join(
        [
            f"- **Cover data.** OpenStreetMap marks few covered walkways. Across all areas the routable graph holds {sheltered:,.1f} km "
            "of sheltered path. Nobody has measured how much exists on the street.",
            f"- **Access.** Gates and entrances that need a field check remove {gated:,.0f} km of paths from routes.",
            "- **Sidewalks.** Where OpenStreetMap has no sidewalk data, the pipeline assumes one on each side of larger roads. "
            f"That covers {assumed:,.0f} km of the {side:,.0f} km of side-of-street paths. "
            'A step on an assumed sidewalk carries a "Sidewalk not mapped" badge.',
        ]
    )
    i, j = s.index(LSTART), s.index(LEND)
    return s[: i + len(LSTART)] + "\n" + text + "\n" + s[j:]


def write_index(areas):
    """The area counts in app/index.html, which shows the landing line before the app loads."""
    ncr = sum(1 for a in areas if (a.get("region") or {}).get("id", "ncr") == "ncr")
    n, other = len(areas), len(areas) - ncr
    path = ROOT / "app/index.html"
    s = path.read_text()
    for pattern, text in (
        (r">\d+ walking areas: \d+ in Metro Manila and \d+ in other cities", f">{n} walking areas: {ncr} in Metro Manila and {other} in other cities"),
        (r"in \d+ city areas across the Philippines, (?:from Laoag to General Santos, )?\d+ of them", None),
    ):
        if text is None:
            s, k = re.subn(r"in \d+ city areas across the Philippines, ((?:from \S+ to [^,]+, )?)\d+ of them",
                           lambda m: f"in {n} city areas across the Philippines, {m.group(1)}{ncr} of them", s)
            assert k == 2, f"index.html: {k} descriptions matched, expected 2"
        else:
            s, k = re.subn(pattern, text, s)
            assert k == 1, f"index.html: landing line matched {k} times"
    path.write_text(s)


def main():
    areas = json.loads((DATA / "areas.json").read_text())["areas"]
    index = json.loads((DATA / "places_index.json").read_text())
    places = {}
    for p in index:
        places[p["area"]] = places.get(p["area"], 0) + 1
    cover_file = ROOT / "pipeline/regions/footprint_cover.json"
    cover = json.loads(cover_file.read_text()) if cover_file.exists() else {}
    rows, tot = [], {"km": 0.0, "rkm": 0.0, "places": 0, "buildings": 0}
    for a in areas:
        g = json.loads((DATA / "areas" / a["id"] / "graph.json").read_text())
        km = sum(e["len_m"] for e in g["edges"]) / 1000
        rkm = sum(e["len_m"] for e in g["edges"] if e["routable"]) / 1000
        tpl = ROOT / "pipeline/inputs/areas" / a["id"] / "manifest_template.json"
        b = json.loads(tpl.read_text())["counts"]["buildings"] if tpl.exists() else 0
        n = places.get(a["id"], 0)
        share = cover.get(a["id"], {}).get("osm_share_of_google_building_area")
        mapped = f"{share:.0%}" if share is not None else "not measured"
        rows.append(
            f"| {a['name']} | {', '.join(a['cities'])} | {rkm:,.0f} | {n:,} | {b:,} | {mapped} |"
        )
        tot["km"] += km
        tot["rkm"] += rkm
        tot["places"] += n
        tot["buildings"] += b
    table = "\n".join(
        [
            "| Area | Cities | Walkable km in routes | Places | Buildings | Buildings mapped |",
            "| --- | --- | ---: | ---: | ---: | ---: |",
            *rows,
            f"| **{len(areas)} areas** | | **{tot['rkm']:,.0f}** | **{tot['places']:,}** | **{tot['buildings']:,}** | |",
        ]
    )
    readme = ROOT / "README.md"
    s = readme.read_text()
    i, j = s.index(START), s.index(END)
    s = s[: i + len(START)] + "\n" + table + "\n" + s[j:]
    s = write_limits(s, areas)
    readme.write_text(s)
    write_index(areas)
    print(json.dumps({"areas": len(areas), **{k: round(v) for k, v in tot.items()}}))


if __name__ == "__main__":
    main()
