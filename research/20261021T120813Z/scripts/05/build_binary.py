"""Pack an extracted walk graph into typed-array files and measure their size.

Usage: venv/bin/python -I build_binary.py <derived_dir> <region> [<region> ...]

Reads graph_<region>.npz from extract_walk_graph.py. Writes <region>/ with:
  node_lat.f32, node_lon.f32  node coordinates
  offsets.u32, adj.u32, adj_edge.u32  CSR adjacency, both directions
  edge_len.f32  edge length in metres
  edge_flags.u8  bit 0 covered (from a model, see below)
  shade_<B>.u8  B shade buckets per edge, 0..15 (4-bit values stored in a byte)

Shade values are MODELLED, not measured. Each edge gets a street-canyon ratio and
tree cover from fixed random draws, and the real edge bearing. Shade per bucket comes
from the sun position at Makati. Use the shade files for speed tests and for compression
ratios of plausibly structured data only.
"""

import gzip
import json
import math
import os
import sys

import brotli
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sun_drift import sun_position  # noqa: E402

from datetime import datetime, timedelta, timezone  # noqa: E402

TZ = timezone(timedelta(hours=8))
BUCKET_SETS = {
    "13h_1season": [(m, h) for m in [3] for h in range(6, 19)],
    "24hh_1season": [(m, h + 0.5 * k) for m in [3] for h in range(6, 18) for k in (0, 1)],
    "13h_4season": [(m, h) for m in [3, 6, 9, 12] for h in range(6, 19)],
    "24hh_4season": [(m, h + 0.5 * k) for m in [3, 6, 9, 12] for h in range(6, 18) for k in (0, 1)],
}


def sizes(buf):
    return {
        "raw": len(buf),
        "gzip9": len(gzip.compress(buf, 9)),
        "brotli11": len(brotli.compress(buf, quality=11)),
    }


def modelled_shade(bearing_deg, canyon, trees, buckets):
    out = np.zeros((len(bearing_deg), len(buckets)), dtype=np.uint8)
    for j, (month, hour) in enumerate(buckets):
        dt = datetime(2026, month, 21, int(hour), int(round((hour % 1) * 60)), tzinfo=TZ)
        elev, az = sun_position(dt)
        if elev <= 0:
            out[:, j] = 15
            continue
        # Fraction of the street width in building shadow for a canyon H/W ratio.
        across = np.abs(np.sin(np.radians(az - bearing_deg)))
        building = np.clip(canyon * across / math.tan(math.radians(max(elev, 1))), 0, 1)
        shade = 1 - (1 - building) * (1 - trees)
        out[:, j] = np.round(shade * 15).astype(np.uint8)
    return out


def main(derived, regions):
    report = {}
    rng = np.random.default_rng(20261021)
    for region in regions:
        g = np.load(os.path.join(derived, f"graph_{region}.npz"))
        src, dst, length = g["src"], g["dst"], g["length"]
        lat, lon = g["lat"], g["lon"]
        n, m = len(lat), len(src)
        out = os.path.join(derived, region)
        os.makedirs(out, exist_ok=True)

        # CSR over directed edges (each undirected edge in both directions).
        tail = np.concatenate([src, dst])
        head = np.concatenate([dst, src])
        eid = np.concatenate([np.arange(m), np.arange(m)]).astype(np.uint32)
        order = np.argsort(tail, kind="stable")
        tail, head, eid = tail[order], head[order], eid[order]
        offsets = np.zeros(n + 1, dtype=np.uint32)
        np.add.at(offsets, tail + 1, 1)
        offsets = np.cumsum(offsets, dtype=np.uint32)

        y = np.radians(lat[dst] - lat[src])
        x = np.radians(lon[dst] - lon[src]) * np.cos(np.radians(lat[src]))
        bearing = (np.degrees(np.arctan2(x, y)) + 360) % 360
        canyon = rng.lognormal(mean=-0.3, sigma=0.7, size=m)
        trees = np.clip(rng.beta(0.6, 2.0, size=m), 0, 0.9)
        covered = rng.random(m) < 0.03

        files = {
            "node_lat.f32": lat.astype(np.float32).tobytes(),
            "node_lon.f32": lon.astype(np.float32).tobytes(),
            "offsets.u32": offsets.tobytes(),
            "adj.u32": head.astype(np.uint32).tobytes(),
            "adj_edge.u32": eid.tobytes(),
            "edge_len.f32": length.astype(np.float32).tobytes(),
            "edge_flags.u8": covered.astype(np.uint8).tobytes(),
        }
        for name, buckets in BUCKET_SETS.items():
            sh = modelled_shade(bearing, canyon, trees, buckets)
            sh[covered] = 15
            files[f"shade_{name}.u8"] = sh.tobytes()
            packed = (sh[:, 0::2] << 4) | (sh[:, 1::2] if sh.shape[1] % 2 == 0 else np.pad(sh[:, 1::2], ((0, 0), (0, 1))))
            files[f"shade_{name}_4bit.packed"] = packed.astype(np.uint8).tobytes()
        for fname, buf in files.items():
            with open(os.path.join(out, fname), "wb") as fh:
                fh.write(buf)

        # Compact on-the-wire layout for the size estimate: quantised fields.
        wire = {
            "coords_i32_fixed": (np.round(np.stack([lat, lon], 1) * 1e6).astype(np.int32)).tobytes(),
            "csr_offsets_u32": offsets.tobytes(),
            "csr_adj_u32": head.astype(np.uint32).tobytes(),
            "csr_adj_edge_u32": eid.tobytes(),
            "edge_len_u16_dm": np.clip(np.round(length * 10), 0, 65535).astype(np.uint16).tobytes(),
            "edge_flags_u8": covered.astype(np.uint8).tobytes(),
            "edge_schedule_u8": np.zeros(m, dtype=np.uint8).tobytes(),
        }
        r = {"nodes": int(n), "undirected_edges": int(m), "shape_points": int(g["n_shape"].sum())}
        r["wire"] = {k: sizes(v) for k, v in wire.items()}
        base = b"".join(wire.values())
        r["wire_total_without_shade"] = sizes(base)
        for name in BUCKET_SETS:
            r[f"shade_{name}_4bit"] = sizes(files[f"shade_{name}_4bit.packed"])
        # Route drawing geometry: 2 x int16 deltas per shape point (upper bound, no compression).
        r["geometry_shape_points_raw_bytes"] = int(g["n_shape"].sum()) * 4
        report[region] = r
        print(region, json.dumps(r), flush=True)
    with open(os.path.join(derived, "binary_sizes.json"), "w") as fh:
        json.dump(report, fh, indent=2)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
