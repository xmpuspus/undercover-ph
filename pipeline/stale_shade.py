"""Print the ids of areas whose shade from the release does not match their graph.json.

Usage: python3 -I pipeline/stale_shade.py DATA_AREAS_DIR AREA_ID [AREA_ID ...]
Shade is stored per edge, so it is valid only for the graph it was cast on. The shade workflow writes
<area>/graph.sha256 beside the shade. An area with no READY.shade or a different graph hash is stale.
"""

import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
stale = []
for area in sys.argv[2:]:
    d = root / area
    want = (
        (d / "graph.sha256").read_text().strip()
        if (d / "graph.sha256").exists()
        else ""
    )
    have = hashlib.sha256((d / "graph.json").read_bytes()).hexdigest()
    if not (d / "READY.shade").exists() or want != have:
        stale.append(area)
print(" ".join(stale))
