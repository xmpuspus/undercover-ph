#!/usr/bin/env bash
# Rebuild metro-core's jog.json with the current build_jog.py, then run the park hours and real-loop tests on it.
# jog.json is git-ignored data, so this changes no tracked file. Run from the repository root.
set -euo pipefail
pipeline/.venv/bin/python -I pipeline/districts/build_jog.py --area metro-core
pnpm -C app exec vitest run src/lib/jog/__tests__/park-hours.test.ts src/lib/jog/__tests__/real-loops.test.ts
