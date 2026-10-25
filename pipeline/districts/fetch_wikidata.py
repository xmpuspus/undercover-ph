"""Fetch the Wikidata heritage snapshot that build_jog.py reads (CC0).

Usage: python3 -I pipeline/districts/fetch_wikidata.py
Writes pipeline/districts/wikidata_heritage.json: NHCP historical markers (P31 Q21562164) and Philippine items
with a heritage designation (P1435), each with coordinates and an English or Tagalog label. Items without a label
stay out, because a loop card names each sight. build_jog.py never reads the network, so refresh the snapshot
with this script and commit it.
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

OUT = Path(__file__).resolve().parent / "wikidata_heritage.json"
ENDPOINT = "https://query.wikidata.org/sparql"
AGENT = "undercover.ph pipeline (https://undercover.ph; github.com/xmpuspus/undercover-ph)"
QUERIES = {
    "nhcp_marker": """SELECT ?item ?c ?en ?tl WHERE {
  ?item wdt:P31 wd:Q21562164; wdt:P625 ?c.
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?tl FILTER(LANG(?tl) = "tl") }
}""",
    "heritage": """SELECT ?item ?c ?en ?tl WHERE {
  ?item wdt:P17 wd:Q928; wdt:P1435 ?h; wdt:P625 ?c.
  OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }
  OPTIONAL { ?item rdfs:label ?tl FILTER(LANG(?tl) = "tl") }
}""",
}
POINT = re.compile(r"Point\(([-\d.]+) ([-\d.]+)\)")


def sparql(query):
    # curl instead of urllib, because Python's TLS store fails on some macOS installs.
    r = subprocess.run(["curl", "-sS", "--fail", "--max-time", "120", "-G", ENDPOINT, "--data-urlencode", f"query={query}",
                        "--data-urlencode", "format=json", "-H", f"User-Agent: {AGENT}",
                        "-H", "Accept: application/sparql-results+json"], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"Wikidata query failed: {r.stderr.strip()}")
    return json.loads(r.stdout)["results"]["bindings"]


def main():
    items = {}
    for kind, query in QUERIES.items():
        for row in sparql(query):
            qid = row["item"]["value"].rsplit("/", 1)[-1]
            m = POINT.match(row["c"]["value"])
            name = (row.get("en") or row.get("tl") or {}).get("value")
            if not m or not name:
                continue
            # A marker with a heritage designation keeps the marker kind, the narrower one.
            if qid in items and items[qid]["kind"] == "nhcp_marker":
                continue
            items[qid] = {"qid": qid, "name": name, "kind": kind,
                          "lon": round(float(m.group(1)), 6), "lat": round(float(m.group(2)), 6)}
    out = {"source": "Wikidata, https://www.wikidata.org", "licence": "CC0 1.0",
           "fetched": date.today().isoformat(), "query": QUERIES,
           "items": sorted(items.values(), key=lambda x: x["qid"])}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n")
    print(f"{len(out['items'])} items -> {OUT}")


if __name__ == "__main__":
    main()
