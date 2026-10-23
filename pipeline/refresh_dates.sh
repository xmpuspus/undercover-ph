#!/usr/bin/env bash
# Build the dated files for one routing area: manifest dates, per-date shade files, weather, advisory
# and the READY markers. The walk graph, places and hours stay as they are.
# Usage: UCPH_AREA=<id> UCPH_DATA=<data folder> UCPH_INPUTS=<inputs folder> pipeline/refresh_dates.sh [YYYY-MM-DD]
#   (default date: today in Asia/Manila). pipeline/vercel_build.sh sets all three for each area in
#   app/public/data/areas.json:
#   UCPH_AREA      area id. shade.py runs in area mode: shade/<date>.bin, shade/lowconf.bin and trees.json
#   UCPH_DATA      app/public/data/areas/<id>, with graph.json, places.json and hours.json
#   UCPH_INPUTS    pipeline/inputs/areas/<id>, with manifest_template.json, buildings.geojson.gz and canopy.tif
# Optional:
#   SHADE_PY       Python with pipeline/shade/requirements.txt (default pipeline/shade/.venv/bin/python)
#   PY             Python for the standard-library scripts (default SHADE_PY)
#   UCPH_ADVISORY_FROM: see fetch_weather.py
set -euo pipefail
cd "$(dirname "$0")/.."
for v in UCPH_AREA UCPH_DATA UCPH_INPUTS; do
  if [ -z "${!v:-}" ]; then
    echo "refresh_dates: set $v (see the header of this script)" >&2
    exit 1
  fi
done
export UCPH_START_DATE="${1:-$(TZ=Asia/Manila date +%F)}"
export UCPH_AREA UCPH_DATA UCPH_INPUTS
SHADE_PY="${SHADE_PY:-$PWD/pipeline/shade/.venv/bin/python}"
PY="${PY:-$SHADE_PY}"

"$PY" -I pipeline/set_dates.py "$UCPH_START_DATE"
"$SHADE_PY" pipeline/shade/shade.py  # area mode writes READY.shade last
"$PY" -I pipeline/shade/check_sun_order.py "$UCPH_DATA"  # noon shade must stay below 16:00 shade
"$PY" -I pipeline/fetch_weather.py
# Remove per-date shade files that the manifest no longer lists.
"$PY" -I - "$UCPH_DATA" <<'PY'
import json, re, sys
from pathlib import Path
d = Path(sys.argv[1])
m = json.loads((d / "manifest.json").read_text())
if (d / "shade").is_dir():
    for f in (d / "shade").glob("*.bin"):
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", f.stem) and f.stem not in m["dates"]:
            f.unlink()
            print("removed", f.name)
PY
echo "dates now start ${UCPH_START_DATE} in ${UCPH_DATA}"
