"""Write real OSM edge flags next to the binary graph, after checking edge order.

Usage: venv/bin/python -I dump_flags.py <derived_dir> <flags_dir> <region>

The binary graph in <derived_dir>/<region>/ came from the full Philippines extract.
The flags come from the NCR clip run. The script refuses to write if the edge lists differ.
Bits: 1 covered_or_tunnel, 2 indoor_or_corridor, 4 foot_bridge, 8 time_restricted,
16 steps, 32 sidewalk.
"""

import json
import os
import sys

import numpy as np

BITS = {1: "covered_or_tunnel", 2: "indoor_or_corridor", 4: "foot_bridge",
        8: "time_restricted", 16: "steps", 32: "sidewalk"}


def main(derived, flags_dir, region):
    a = np.load(os.path.join(derived, f"graph_{region}.npz"))
    b = np.load(os.path.join(flags_dir, f"graph_{region}.npz"))
    same = all(np.array_equal(a[k], b[k]) for k in ("src", "dst", "length"))
    if not same:
        sys.exit(f"{region}: edge lists differ, flags not written")
    flags = b["flags"]
    flags.astype(np.uint8).tofile(os.path.join(derived, region, "edge_osm_flags.u8"))
    length = a["length"]
    out = {"region": region, "edges": int(len(flags)), "total_km": round(float(length.sum()) / 1000, 2)}
    for bit, name in BITS.items():
        m = (flags & bit) > 0
        out[name] = {"edges": int(m.sum()), "km": round(float(length[m].sum()) / 1000, 2)}
    shelter = (flags & 3) > 0
    out["rain_shelter_bits_1_or_2"] = {"edges": int(shelter.sum()), "km": round(float(length[shelter].sum()) / 1000, 2),
                                       "share_of_length": round(float(length[shelter].sum() / length.sum()), 4)}
    print(json.dumps(out))


if __name__ == "__main__":
    main(*sys.argv[1:4])
