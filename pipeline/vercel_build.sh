#!/usr/bin/env bash
# Vercel build for app/: generate the dated data for every walking area, run the router tests on it,
# then build the app. app/vercel.json calls it as the buildCommand, from app/, after pnpm install.
#
# Generated files stay out of git: manifest.json, shade/, trees.json, weather.json, advisory.json, READY.*.
# The map tiles, the area graphs, places and hours, and the area inputs stay out of git too. They come from the
# data release.
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
# inputs in pipeline/inputs/areas/<id>/. shade.py runs in area mode: shade/<date>.bin, shade/lowconf.bin
# and trees.json, no overlays. Buildings and trees for the map ship as PMTiles from the data release.
# Environment, all optional: UCPH_PYTHON (interpreter for the venv), UCPH_START_DATE (first shade date,
# default today in Asia/Manila), UCPH_SKIP_TESTS=1 (skip pnpm test, for timing runs; default off),
# UCPH_SHADE_SOURCE (release or compute, see below), UCPH_SHADE_REPO (owner/name of the release repo),
# UCPH_SHADE_BASE (another download base, for tests).
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
# The shade engine's venv, made only when an area needs shade computed here. It is reused while the
# interpreter version and the pins stay the same.
venv() {
  local key
  key="$("$PYTHON" -I -c 'import hashlib, sys; print("%d.%d-" % sys.version_info[:2] + hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest()[:12])' pipeline/shade/requirements.txt)"
  VENV="$APP/node_modules/.cache/ucph-venv-$key"
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
  export SHADE_PY="$VENV/bin/python"
}

START="${UCPH_START_DATE:-$(TZ=Asia/Manila date +%F)}"
if [ ! -f "$DATA/areas.json" ]; then
  echo "vercel_build: $DATA/areas.json is missing" >&2
  exit 1
fi
# Weather and the advisory need only the standard library.
export PY="$PYTHON"
# The map tiles, each area's graph, places and hours, the search index and the area inputs live in the data
# release that pipeline/data-release.json names, not in git (2026-10-23). fetch skips files that already match,
# replaces files that differ and checks every download's sha256.
"$PY" -I pipeline/data_release.py fetch --tiles --app
IDS="$("$PY" -I -c 'import json, sys; print(" ".join(a["id"] for a in json.load(open(sys.argv[1]))["areas"]))' "$DATA/areas.json")"

# Where the shade comes from. On Vercel, from the newest shade release that .github/workflows/shade.yml
# publishes each morning: today's, or up to six days back if the morning runs have not finished. An area
# whose graph.json changed since that release, or that the release lacks, is shaded here, and with no
# release at all every area is. Elsewhere the default is to shade every area here. UCPH_SHADE_SOURCE=release or compute overrides the default.
SOURCE="${UCPH_SHADE_SOURCE:-$([ -n "${VERCEL:-}" ] && echo release || echo compute)}"
COMPUTE="$IDS"
if [ "$SOURCE" = "release" ]; then
  REPO="${UCPH_SHADE_REPO:-xmpuspus/undercover-ph}"
  got=""
  for back in 0 1 2 3 4 5 6; do
    day="$("$PY" -I -c 'import datetime, sys; print(datetime.date.fromisoformat(sys.argv[1]) - datetime.timedelta(days=int(sys.argv[2])))' "$START" "$back")"
    url="${UCPH_SHADE_BASE:-https://github.com/$REPO/releases/download}/shade-$day/shade-$day.tar.gz"
    if curl -fsSL --retry 3 -o "$ROOT/shade-release.tar.gz" "$url"; then got="$day"; break; fi
  done
  if [ -z "$got" ]; then
    # The deploy still works without a release: every area is shaded here, as before the workflow existed.
    # With many areas that can pass Vercel's 45-minute limit, and live-check.yml reports stale shade.
    echo "vercel_build: no shade release from $START or the six days before it, so every area is shaded here" >&2
  else
    tar -xzf "$ROOT/shade-release.tar.gz" -C "$DATA/areas"
    # A release cast from a branch can hold areas this commit does not list. They must not ship.
    for d in "$DATA/areas"/*/; do
      d="${d%/}"
      [[ " $IDS " == *" ${d##*/} "* ]] || { echo "dropping ${d##*/}: in the release, not in areas.json"; rm -rf "$d"; }
    done
    # Shade is per edge, so it must come from the same graph.json. The release stores each graph's sha256.
    COMPUTE="$("$PY" -I "$ROOT/pipeline/stale_shade.py" "$DATA/areas" $IDS)"
    echo "shade release $got; shaded here: ${COMPUTE:-none}"
  fi
  rm -f "$ROOT/shade-release.tar.gz"
fi

# One PAGASA advisory fetch, shared by every area. Weather is one call per area centre.
"$PY" -I pipeline/fetch_weather.py --advisory-to "$DATA/advisory.json"
export UCPH_ADVISORY_FROM="$DATA/advisory.json"
if [ -n "$COMPUTE" ]; then
  "$PY" -I pipeline/data_release.py fetch --inputs $COMPUTE
  venv
fi
for id in $IDS; do
  t0=$SECONDS
  export UCPH_AREA="$id" UCPH_DATA="$DATA/areas/$id" UCPH_INPUTS="$ROOT/pipeline/inputs/areas/$id"
  if [[ " $COMPUTE " == *" $id "* ]]; then
    bash pipeline/refresh_dates.sh "$START"
    echo "area $id shaded in $((SECONDS - t0)) s"
  else
    "$PY" -I pipeline/fetch_weather.py
    echo "area $id weather in $((SECONDS - t0)) s"
  fi
done
echo "data step done in $((SECONDS - t_all)) s"

cd "$APP"
if [ "${UCPH_SKIP_TESTS:-0}" = "1" ]; then
  echo "UCPH_SKIP_TESTS=1: pnpm test skipped"
else
  pnpm test
fi
pnpm run build
# Vercel compresses only listed MIME types and application/octet-stream is not one, so the shade files would
# ship raw (metro-core: 1.61 MB per date). Put a gzip copy beside each .bin in the output; the app inflates it.
# Written from the built output after the build, so it can never be older than the file it copies.
"$PY" -I - "$APP/dist/data/areas" <<'PY'
import gzip
import sys
from pathlib import Path

raw = packed = n = 0
for f in sorted(Path(sys.argv[1]).rglob("*.bin")):
    gz = f.with_name(f.name + ".gz")
    gz.write_bytes(gzip.compress(f.read_bytes(), compresslevel=9, mtime=0))
    raw, packed, n = raw + f.stat().st_size, packed + gz.stat().st_size, n + 1
    print(f"{gz}: {f.stat().st_size} -> {gz.stat().st_size} bytes")
print(f"gzip copies: {n} files, {raw} -> {packed} bytes")
PY
# trees.json is a shade.py input for the next run. The map draws trees from trees.pmtiles, so the app never
# fetches it (47 MB over 13 areas).
find "$APP/dist/data/areas" -name trees.json -delete
echo "vercel_build done in $((SECONDS - t_all)) s"
