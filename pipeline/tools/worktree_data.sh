#!/usr/bin/env bash
# Copy the generated app data that git ignores (manifest.json, shade/, weather.json, the tile files) from the
# main checkout into the current git worktree, so the Playwright flow can run there. Files the worktree already
# has stay as they are. Run from the worktree root. The main checkout is the first entry of `git worktree list`.
set -euo pipefail
MAIN="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
if [ "$(pwd -P)" = "$(cd "$MAIN" && pwd -P)" ]; then
  echo "this is the main checkout; nothing to copy"
  exit 0
fi
n=0
while IFS= read -r f; do
  [ -e "$f" ] && continue
  mkdir -p "$(dirname "$f")"
  cp -p "$MAIN/$f" "$f"
  n=$((n + 1))
done < <(git -C "$MAIN" ls-files --others --ignored --exclude-standard app/public/data)
echo "copied $n generated data files from $MAIN"
test -f app/public/data/areas/metro-core/manifest.json
