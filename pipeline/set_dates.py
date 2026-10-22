"""Start manifest.json from the graph template with 7 shade dates, and write READY.graph.

Usage: python3 -I pipeline/set_dates.py [2026-11-03]   (default: UCPH_START_DATE, else today in Asia/Manila)
UCPH_DATA is the area's data folder, app/public/data/areas/<id>. UCPH_INPUTS holds its manifest_template.json,
pipeline/inputs/areas/<id>. Only `dates` and `generated_at` change; every other template key stays.
shade.py adds sun, sunrise_sunset, shade, shadow_overlay and its limits and sources afterwards.
The template exists only when build_manifest.py's checks passed, so READY.graph follows from it.
Standard library only, so the deploy build needs no graph venv.
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if not os.environ.get("UCPH_DATA") or not os.environ.get("UCPH_INPUTS"):
    sys.exit("set UCPH_DATA and UCPH_INPUTS to one area's data and inputs folders")
DATA = Path(os.environ["UCPH_DATA"])
INPUTS = Path(os.environ["UCPH_INPUTS"])
MANILA = timezone(timedelta(hours=8))


def main(start):
    d0 = date.fromisoformat(start)
    m = json.loads((INPUTS / "manifest_template.json").read_text())
    # Buildings and trees ship once for every area, in app/public/data/*.pmtiles.
    for name in ("graph.json", "places.json", "hours.json"):
        if not (DATA / name).exists():
            sys.exit(f"{DATA / name} is missing")
    m["generated_at"] = datetime.now(MANILA).replace(microsecond=0).isoformat()
    m["dates"] = [(d0 + timedelta(days=i)).isoformat() for i in range(7)]
    tmp = DATA / "manifest.json.tmp"
    tmp.write_text(json.dumps(m, ensure_ascii=False, indent=1))
    tmp.replace(DATA / "manifest.json")
    c = m["counts"]
    hours = len(json.loads((DATA / "hours.json").read_text()))
    (DATA / "READY.graph").write_text(
        f"{m['generated_at']} nodes={c['nodes']} edges={c['edges']} routable_edges={c['routable_edges']} "
        f"buildings={c['buildings']} places={c['places']} hours={hours} node_flags=1\n"
    )
    print(f"{DATA / 'manifest.json'}: dates {m['dates'][0]} to {m['dates'][-1]}")


if __name__ == "__main__":
    today = datetime.now(MANILA).date().isoformat()
    main(
        sys.argv[1] if len(sys.argv) > 1 else os.environ.get("UCPH_START_DATE") or today
    )
