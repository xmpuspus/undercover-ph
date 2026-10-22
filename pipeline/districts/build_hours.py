"""Write hours.json for one routing area from cited sources only, plus the footprints each row covers.

Usage: UC_AREA=<id> pipeline/.venv/bin/python -I pipeline/districts/build_hours.py
Web rows come from pipeline/districts/hours_sources.json. Each row quotes its page text, and this script
stops if the saved page lacks a quote. A web row enters an area only when its name pattern matches a
mall footprint there. OSM rows come from mall, park and highway ways with a simple opening_hours value.
Writes <stage>/hours.json, <work>/hours_match.json and <work>/hours_log.json.
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import shapely  # noqa: E402

from ctx import GRAPH_BBOX, OSM_DATE, OUT, ROOT, WORK, in_bbox, write_json  # noqa: E402

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
OSM_DAY = {"Mo": 0, "Tu": 1, "We": 2, "Th": 3, "Fr": 4, "Sa": 5, "Su": 6}
SOURCES = Path(__file__).resolve().parent / "hours_sources.json"
TIME = r"([01]\d|2[0-4]):([0-5]\d)"
SPAN = re.compile(rf"^{TIME}-{TIME}$")
DAYSPEC = re.compile(r"^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$")


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        if tag in ("p", "br", "li", "h1", "h2", "h3", "h4", "div", "tr"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def page_text(path):
    p = Text()
    p.feed(open(path, encoding="utf-8", errors="replace").read())
    lines = [re.sub(r"\s+", " ", x).strip() for x in "".join(p.parts).split("\n")]
    return "\n".join(x for x in lines if x)


def week_from_spans(spans):
    out = {d: [] for d in DAYS}
    for days, span in spans.items():
        for d in days.split(","):
            out[d] = list(span)
    return out


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
                dayset += list(range(a, b + 1))
            span = parts[1]
        else:
            return None
        if not SPAN.match(span):
            return None
        start, end = span.split("-")
        if end <= start or end > "24:00":
            return None
        for d in dayset:
            spans[d] = [start, end]  # later rules override earlier ones, as in OSM
    return spans


def osm_url(osm):
    kind = {"w": "way", "r": "relation", "n": "node"}[osm[0]]
    return f"https://www.openstreetmap.org/{kind}/{osm[1:]}"


def main():
    areas = [json.loads(line) for line in open(WORK / "features.jsonl")]
    areas = [r for r in areas if r["type"] == "area"]
    for r in areas:
        r["geom"] = shapely.from_wkt(r["wkt"])
        p = r["geom"].representative_point()
        r["in_graph"] = in_bbox(p.x, p.y, GRAPH_BBOX)

    rows, match, used, used_sources, quotes_checked = [], [], set(), [], 0
    for src in json.load(open(SOURCES))["sources"]:
        text = page_text(ROOT / src["page"])
        for req in src.get("require", []):
            if req not in text:
                sys.exit(f"{src['id']}: saved page lacks {req!r}")
        if "image" in src:
            # Hours printed in an image: the transcription sits in hours_sources.json, tied to the image bytes.
            if hashlib.md5((ROOT / src["image"]).read_bytes()).hexdigest() != src["image_md5"]:
                sys.exit(f"{src['id']}: saved image differs from the transcribed one")
        hit_any = False
        for row in src["rows"]:
            for quote in ([row["text"]] if isinstance(row["text"], str) else row["text"]):
                if quote not in text:
                    sys.exit(f"{src['id']}: saved page lacks the hours text {quote!r} for {row['name']}")
                quotes_checked += 1
            pat = re.compile(row["match"])
            fps = [r for r in areas if r["in_graph"] and pat.match(r["tags"].get("name", ""))
                   and r["tags"].get("amenity") != "bus_station" and "leisure" not in r["tags"]]
            if not fps:
                continue
            hit_any = True
            idx = len(rows)
            rows.append({"name": row["name"], "rules": week_from_spans(row["spans"]), "source_url": src["url"],
                         "checked": src["checked"]})
            match.append({"row": idx, "source": src["id"], "footprints": [
                {"osm": r["osm"], "name": r["tags"]["name"], "wkt": r["wkt"]} for r in fps]})
            used.update(r["osm"] for r in fps)
        if hit_any:
            used_sources.append({k: src[k] for k in ("id", "name", "url", "licence", "used_for", "notes")})

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
        rows.append({"name": t.get("name"), "rules": {d: list(spans.get(i, [])) for i, d in enumerate(DAYS)},
                     "source_url": osm_url(r["osm"]), "checked": OSM_DATE})
        osm_rows += 1
        # Cited web rows win for edge assignment. Only malls without one take their OSM row.
        is_mall = t.get("shop") in ("mall", "department_store")
        match.append({"row": idx, "source": "osm", "footprints": [
            {"osm": r["osm"], "name": t.get("name"), "wkt": r["wkt"]}] if is_mall and r["osm"] not in used else []})

    write_json(OUT / "hours.json", rows, indent=1)
    write_json(WORK / "hours_match.json", match)
    log = {"rows": len(rows), "web_rows": len(rows) - osm_rows, "osm_rows": osm_rows, "osm_unparsed": skipped,
           "web_quotes_checked": quotes_checked, "web_sources_used": used_sources,
           "assigned_footprints": {rows[m["row"]]["name"] + f" [{m['row']}]": [f["osm"] + " " + f["name"] for f in m["footprints"]]
                                   for m in match if m["footprints"]}}
    write_json(WORK / "hours_log.json", log, indent=1)
    print(json.dumps({k: v for k, v in log.items() if k != "web_sources_used"}, indent=1))


if __name__ == "__main__":
    main()
