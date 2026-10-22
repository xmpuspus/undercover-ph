#!/bin/zsh
# Rebuild the graph-side data files in order. The Google window and the Beat Asia page are fetched
# separately (fetch_gob_window.py and the curl line in NOTES.md), because they read the network.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=pipeline/.venv/bin/python
$PY -I pipeline/extract_features.py
$PY -I pipeline/html_text.py pipeline/raw/beat_asia/page.html \
  'Published|Operation Hours|^Supermarket|^Department Store|^SM Store|Location:|renovation|Greenbelt 1 and 2' \
  > pipeline/work/beat_asia_extract.txt
$PY -I pipeline/build_hours.py
$PY -I pipeline/build_buildings.py
$PY -I pipeline/build_graph.py
$PY -I pipeline/build_places.py
rm -f pipeline/work/route_check.json
$PY -I pipeline/route_check.py "Ayala MRT" "Greenbelt"
$PY -I pipeline/route_check.py "Ayala MRT" "Greenbelt" 8
$PY -I pipeline/route_check.py "Ayala MRT" "Greenbelt" 8 closed
$PY -I pipeline/build_manifest.py
$PY -I pipeline/build_display.py
