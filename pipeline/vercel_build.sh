#!/usr/bin/env bash
# Vercel build for app/: generate the dated data for every walking area, run the router tests on it,
# then build the app. app/vercel.json calls it as the buildCommand, from app/, after pnpm install.
#
# Generated files stay out of git: manifest.json, shade.bin, shadows/, weather.json, advisory.json, READY.*.
# A shade failure fails the build, so the last good deployment stays live.
# A failed weather or advisory fetch writes {"status": "unavailable"} and the build goes on.
#
# Platform facts this relies on (read 2026-10-22):
# - The build image is Amazon Linux 2023 with Python 3.12, 3.13 and 3.14. https://vercel.com/docs/builds/build-image
# - Files outside the root directory are in the build while the project setting "Include source files outside
#   of the Root Directory in the Build Step" is on, the default since 2020-08-27.
#   https://vercel.com/docs/monorepos/monorepo-faq
# - The build cache keeps node_modules/** (1.5 GB cap on Standard machines), so the venv lives there.
#   https://vercel.com/docs/deployments/troubleshoot-a-build#what-is-cached
# - A build may run 45 minutes on 4 CPUs and 8 GB. https://vercel.com/docs/limits
#
# Areas: every routing area in app/public/data/areas.json, each in app/public/data/areas/<id>/ with
# inputs in pipeline/inputs/areas/<id>/. Without areas.json, the single area in app/public/data/.
# Listed areas use shade.py's area mode (per-date shade files and trees.json, no overlays) unless
# UCPH_AREA_OVERLAYS=1, which gives them shade.bin and overlays like the root area.
# Environment, all optional: UCPH_PYTHON (interpreter for the venv), UCPH_OVERLAY_DATES (overlay dates per
# area, default 7), UCPH_START_DATE (first shade date, default today in Asia/Manila), UCPH_AREA_OVERLAYS.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
DATA="$APP/public/data"
cd "$ROOT"
t_all=$SECONDS

# The pins need Python 3.12 or newer. Plain Amazon Linux 2023 has only python3 3.9, so fall back to dnf.
pyok() { "$1" -c 'import sys; sys.exit(sys.version_info < (3, 12))' >/dev/null 2>&1; }
PYTHON="${UCPH_PYTHON:-}"
if [ -z "$PYTHON" ]; then
  for p in python3.13 python3.12 python3; do
    if command -v "$p" >/dev/null 2>&1 && pyok "$p"; then PYTHON="$(command -v "$p")"; break; fi
  done
fi
if [ -z "$PYTHON" ] && command -v dnf >/dev/null 2>&1; then
  dnf install -y -q python3.13 >/dev/null && PYTHON="$(command -v python3.13)"
fi
if [ -z "$PYTHON" ]; then
  echo "vercel_build: no Python 3.12 or newer found" >&2
  exit 1
fi
# The venv is reused while the interpreter version and the pins stay the same.
KEY="$("$PYTHON" -I -c 'import hashlib, sys; print("%d.%d-" % sys.version_info[:2] + hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest()[:12])' pipeline/shade/requirements.txt)"
VENV="$APP/node_modules/.cache/ucph-venv-$KEY"
if [ ! -f "$VENV/.ucph-ready" ] || ! "$VENV/bin/python" -V >/dev/null 2>&1; then
  echo "creating $VENV with $("$PYTHON" --version)"
  rm -rf "$APP"/node_modules/.cache/ucph-venv-*
  mkdir -p "$APP/node_modules/.cache"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --disable-pip-version-check --no-input -q -r pipeline/shade/requirements.txt
  "$VENV/bin/python" -c "import numba, pvlib, rasterio, PIL" && touch "$VENV/.ucph-ready"
else
  echo "reusing $VENV"
fi
export SHADE_PY="$VENV/bin/python" PY="$VENV/bin/python"
echo "python ready in $((SECONDS - t_all)) s"

START="${UCPH_START_DATE:-$(TZ=Asia/Manila date +%F)}"
if [ -f "$DATA/areas.json" ]; then
  IDS="$("$PY" -I -c 'import json, sys; print(" ".join(a["id"] for a in json.load(open(sys.argv[1]))["areas"]))' "$DATA/areas.json")"
  # One PAGASA advisory fetch, shared by every area. Weather is one call per area centre.
  "$PY" -I pipeline/fetch_weather.py --advisory-to "$DATA/advisory.json"
  export UCPH_ADVISORY_FROM="$DATA/advisory.json"
  for id in $IDS; do
    t0=$SECONDS
    area="$id"
    if [ "${UCPH_AREA_OVERLAYS:-0}" = "1" ]; then area=""; fi
    UCPH_AREA="$area" UCPH_DATA="$DATA/areas/$id" UCPH_INPUTS="$ROOT/pipeline/inputs/areas/$id" \
      bash pipeline/refresh_dates.sh "$START"
    echo "area $id built in $((SECONDS - t0)) s"
  done
else
  t0=$SECONDS
  bash pipeline/refresh_dates.sh "$START"
  echo "area app/public/data built in $((SECONDS - t0)) s"
fi

cd "$APP"
pnpm test
pnpm run build
# Vercel compresses only listed MIME types and application/octet-stream is not one, so shade.bin would ship
# raw (2.29 MB, 0.54 MB as gzip). Put a gzip copy beside each shade.bin in the output; the app inflates it.
# Written from the built output after the build, so it can never be older than the shade.bin it copies.
"$PY" -I - "$APP/dist/data" <<'PY'
import gzip
import sys
from pathlib import Path

for f in sorted(Path(sys.argv[1]).rglob("shade.bin")):
    gz = f.with_name("shade.bin.gz")
    gz.write_bytes(gzip.compress(f.read_bytes(), compresslevel=9, mtime=0))
    print(f"{gz}: {f.stat().st_size} -> {gz.stat().st_size} bytes")
PY
echo "vercel_build done in $((SECONDS - t_all)) s"
