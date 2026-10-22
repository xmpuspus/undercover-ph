"""Add entries to the shared registries under one file lock, so parallel builders never lose an edit.

Usage: pipeline/.venv/bin/python -I pipeline/regions/registry_add.py KIND ENTRY_JSON_FILE
KIND is regions, districts or areas (lists keyed by "id" in pipeline/regions/<kind>.json), or routes
(pipeline/districts/routes.json, an object of area id to place pairs). An entry with an existing id replaces it.
"""

import fcntl
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILES = {
    "regions": (ROOT / "pipeline/regions/regions.json", "regions"),
    "districts": (ROOT / "pipeline/regions/districts.json", "districts"),
    "areas": (ROOT / "pipeline/regions/areas.json", "areas"),
    "routes": (ROOT / "pipeline/districts/routes.json", None),
}
LOCK = ROOT / "pipeline/regions/.registry.lock"


def main():
    kind, entry_file = sys.argv[1], Path(sys.argv[2])
    path, key = FILES[kind]
    new = json.loads(entry_file.read_text())
    with open(LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = json.loads(path.read_text())
        if key is None:
            data.update(new)
        else:
            items = {x["id"]: x for x in data[key]}
            for x in new if isinstance(new, list) else [new]:
                items[x["id"]] = x
            data[key] = list(items.values())
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        os.replace(tmp, path)
    print(f"{kind}: {path.name} updated")


if __name__ == "__main__":
    main()
