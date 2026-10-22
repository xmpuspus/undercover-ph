"""Start manifest.json from the graph template with 7 shade dates, and write READY.graph.

Usage: python3 -I pipeline/set_dates.py [2026-11-03]   (default: UCPH_START_DATE, else today in Asia/Manila)
UCPH_DATA is the data folder (default app/public/data). UCPH_INPUTS holds manifest_template.json
(default pipeline/inputs). Only `dates` and `generated_at` change; every other template key stays.
shade.py adds sun, sunrise_sunset, shade, shadow_overlay and its limits and sources afterwards.
The template exists only when build_manifest.py's checks passed, so READY.graph follows from it.
Standard library only, so the deploy build needs no graph venv.
"""

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("UCPH_DATA") or ROOT / "app/public/data")
INPUTS = Path(os.environ.get("UCPH_INPUTS") or ROOT / "pipeline/inputs")
MANILA = timezone(timedelta(hours=8))


def main(start):
    d0 = date.fromisoformat(start)
    m = json.loads((INPUTS / "manifest_template.json").read_text())
    for name in (
        "graph.json",
        "places.json",
        "hours.json",
        "buildings_display.geojson",
    ):
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
