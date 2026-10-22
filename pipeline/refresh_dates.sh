#!/usr/bin/env bash
# Build the dated files for one walking area: manifest dates, shade.bin, shadow overlays, weather,
# advisory and the READY markers. The walk graph and buildings stay as they are.
# Usage: pipeline/refresh_dates.sh [YYYY-MM-DD]     (default: today in Asia/Manila)
# Environment, all optional:
#   UCPH_DATA      area data folder (default app/public/data)
#   UCPH_INPUTS    area inputs with manifest_template.json, buildings.geojson, canopy (default pipeline/inputs)
#   SHADE_PY       Python with pipeline/shade/requirements.txt (default pipeline/shade/.venv/bin/python)
#   PY             Python for the standard-library scripts (default SHADE_PY)
#   UCPH_AREA      area id: shade.py writes per-date shade files and trees.json, no overlays
#   UCPH_OVERLAY_DATES, UCPH_ADVISORY_FROM: see shade.py and fetch_weather.py
# Makati CBD takes about 100 s on an M-series Mac, most of it the 154 overlays.
set -euo pipefail
cd "$(dirname "$0")/.."
export UCPH_START_DATE="${1:-$(TZ=Asia/Manila date +%F)}"
export UCPH_DATA="${UCPH_DATA:-$PWD/app/public/data}"
export UCPH_INPUTS="${UCPH_INPUTS:-$PWD/pipeline/inputs}"
SHADE_PY="${SHADE_PY:-$PWD/pipeline/shade/.venv/bin/python}"
PY="${PY:-$SHADE_PY}"

"$PY" -I pipeline/set_dates.py "$UCPH_START_DATE"
"$SHADE_PY" pipeline/shade/shade.py
if [ -z "${UCPH_AREA:-}" ]; then  # area mode writes its own READY.shade
  TZ=Asia/Manila date "+%Y-%m-%dT%H:%M:%S+08:00 edges=refresh start=${UCPH_START_DATE}" > "$UCPH_DATA/READY.shade"
fi
"$PY" -I pipeline/fetch_weather.py
# Remove overlay date folders and per-date shade files that the manifest no longer lists.
# shade.py removes stale files inside kept overlay folders.
"$PY" -I - "$UCPH_DATA" <<'PY'
import json, re, shutil, sys
from pathlib import Path
d = Path(sys.argv[1])
m = json.loads((d / "manifest.json").read_text())
buckets = (m.get("shadow_overlay") or {}).get("buckets") or {}
if (d / "shadows").is_dir():
    for day in (d / "shadows").iterdir():
        if day.is_dir() and day.name not in buckets:
            shutil.rmtree(day)
            print("removed", day.name)
if (d / "shade").is_dir():
    for f in (d / "shade").glob("*.bin"):
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.stem) and f.stem not in m["dates"]:
            f.unlink()
            print("removed", f.name)
PY
echo "dates now start ${UCPH_START_DATE} in ${UCPH_DATA}"
