"""Write hours.json from cited sources only, plus the mall footprints that receive each row.

Usage: pipeline/.venv/bin/python -I pipeline/build_hours.py
Reads pipeline/work/features.jsonl and pipeline/work/beat_asia_extract.txt.
Writes app/public/data/hours.json and pipeline/work/hours_match.json.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shapely  # noqa: E402

from common import GRAPH_BBOX, OSM_DATE, OUT, WORK, in_bbox, write_json  # noqa: E402

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
OSM_DAY = {"Mo": 0, "Tu": 1, "We": 2, "Th": 3, "Fr": 4, "Sa": 5, "Su": 6}
BEAT_URL = "https://thebeat.asia/manila/nomads/explore/ayala-center-malls-guide"
BEAT_DATE = "2026-02-24"  # "Published: February 24, 2026" on the page


def week(spans):
    """spans: {day_index: [open, close]}; missing days are closed."""
    return {d: list(spans.get(i, [])) for i, d in enumerate(DAYS)}


def days(a, b):
    return list(range(a, b + 1))


# Each row repeats the page's own words, which the extract check below confirms.
BEAT_ROWS = [
    {"name": "Glorietta", "text": "Sunday to Thursday, from 10 AM to 9 PM; Friday to Saturday, from 10 AM to 10 PM",
     "spans": {**{d: ["10:00", "21:00"] for d in [6, 0, 1, 2, 3]}, **{d: ["10:00", "22:00"] for d in [4, 5]}},
     "match": r"^Glorietta( [1-5])?$"},
    {"name": "Greenbelt", "text": "Daily, from 11 AM to 10 PM",
     "spans": {d: ["11:00", "22:00"] for d in range(7)},
     # The guide says Greenbelt 1 and 2 are closed for renovation until 2028.
     "match": r"^Greenbelt [3-5]$"},
    {"name": "One Ayala", "text": "Monday to Thursday, from 10 AM to 9 PM; Friday to Sunday, from 10 AM to 10 PM",
     "spans": {**{d: ["10:00", "21:00"] for d in days(0, 3)}, **{d: ["10:00", "22:00"] for d in days(4, 6)}},
     "match": r"^One Ayala$"},
    {"name": "The Landmark", "text": "Department Store: Monday to Thursday, from 10 AM to 9 PM; Friday to Sunday, from 10 AM to 9:30 PM",
     "spans": {**{d: ["10:00", "21:00"] for d in days(0, 3)}, **{d: ["10:00", "21:30"] for d in days(4, 6)}},
     "match": r"^The Landmark$"},
    {"name": "SM Makati", "text": "SM Store: Sunday to Thursday, from 10 AM to 9 PM; Friday to Saturday, from 10 AM to 10 PM",
     "spans": {**{d: ["10:00", "21:00"] for d in [6, 0, 1, 2, 3]}, **{d: ["10:00", "22:00"] for d in [4, 5]}},
     "match": r"^SM Makati$"},
]

TIME = r"([01]\d|2[0-4]):([0-5]\d)"
SPAN = re.compile(rf"^{TIME}-{TIME}$")
DAYSPEC = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$")


def parse_osm_hours(value):
    """Simple OSM opening_hours only: 24/7, one time span, or day ranges with one span each."""
    v = value.strip()
    if v == "24/7":
        return {i: ["00:00", "24:00"] for i in range(7)}
    spans = {}
    for rule in [r.strip() for r in v.split(";") if r.strip()]:
        parts = rule.split()
        if len(parts) == 1:
            dayset, span = list(range(7)), parts[0]
        elif len(parts) == 2:
            dayset = []
            for piece in parts[0].split(","):
                m = DAYSPEC.match(piece)
                if not m:
                    return None
                a = OSM_DAY[m.group(1)]
                b = OSM_DAY[m.group(3)] if m.group(3) else a
                if b < a:
                    return None
                dayset += days(a, b)
            span = parts[1]
        else:
            return None
        m = SPAN.match(span)
        if not m:
            return None
        start, end = span.split("-")
        if end <= start or end > "24:00":
            return None
        for d in dayset:
            spans[d] = [start, end]  # later rules override earlier ones, as in OSM
    return spans


def osm_url(osm):
    return f"https://www.openstreetmap.org/{'way' if osm[0] == 'w' else 'relation' if osm[0] == 'r' else 'node'}/{osm[1:]}"


def main():
    extract = (WORK / "beat_asia_extract.txt").read_text()
    if "Published: February 24, 2026" not in extract:
        sys.exit("Beat Asia extract lacks the guide date")
    for row in BEAT_ROWS:
        if row["text"] not in extract:
            sys.exit(f"Beat Asia extract lacks the hours text for {row['name']}")

    areas = [json.loads(line) for line in open(WORK / "features.jsonl")]
    areas = [r for r in areas if r["type"] == "area"]
    for r in areas:
        r["geom"] = shapely.from_wkt(r["wkt"])
        p = r["geom"].representative_point()
        r["in_graph"] = in_bbox(p.x, p.y, GRAPH_BBOX)

    rows, match, used = [], [], set()
    for row in BEAT_ROWS:
        pat = re.compile(row["match"])
        fps = [r for r in areas if r["in_graph"] and pat.match(r["tags"].get("name", ""))
               and r["tags"].get("amenity") != "bus_station" and "leisure" not in r["tags"]]
        idx = len(rows)
        rows.append({"name": row["name"], "rules": week(row["spans"]), "source_url": BEAT_URL,
                     "checked": BEAT_DATE})
        match.append({"row": idx, "source": "beat_asia", "footprints": [
            {"osm": r["osm"], "name": r["tags"]["name"], "wkt": r["wkt"]} for r in fps]})
        used.update(r["osm"] for r in fps)

    skipped, osm_rows = [], 0
    for r in areas:
        t = r["tags"]
        if not r["in_graph"] or "opening_hours" not in t:
            continue
        if not (t.get("shop") in ("mall", "department_store") or t.get("leisure") in ("park", "garden")
                or t.get("place") == "square" or "highway" in t):
            continue
        spans = parse_osm_hours(t["opening_hours"])
        if spans is None:
            skipped.append({"osm": r["osm"], "name": t.get("name"), "opening_hours": t["opening_hours"]})
            continue
        idx = len(rows)
        rows.append({"name": t.get("name"), "rules": week(spans), "source_url": osm_url(r["osm"]),
                     "checked": OSM_DATE})
        osm_rows += 1
        # Cited web rows win for edge assignment. Only malls without one take their OSM row.
        is_mall = t.get("shop") in ("mall", "department_store")
        match.append({"row": idx, "source": "osm", "footprints": [
            {"osm": r["osm"], "name": t.get("name"), "wkt": r["wkt"]}] if is_mall and r["osm"] not in used else []})

    write_json(OUT / "hours.json", rows, indent=1)
    write_json(WORK / "hours_match.json", match)
    log = {"rows": len(rows), "beat_rows": len(BEAT_ROWS), "osm_rows": osm_rows, "osm_unparsed": skipped,
           "assigned_footprints": {rows[m["row"]]["name"] + f" [{m['row']}]": [f["osm"] + " " + f["name"] for f in m["footprints"]]
                                   for m in match if m["footprints"]}}
    write_json(WORK / "hours_log.json", log, indent=1)
    print(json.dumps(log, indent=1))


if __name__ == "__main__":
    main()
