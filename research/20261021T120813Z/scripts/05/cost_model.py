"""Monthly cost and bandwidth for the static and server deploy options.

Usage: python3 -I cost_model.py <derived_dir> <bundle_sizes_json>

Rates come from the saved pricing pages (raw/05/cloudrun_pricing.html, raw/05/docs/fly_pricing).
Assumptions are named constants. Every query is a new session with an empty cache (worst case).
"""

import json
import os
import sys

# Cloud Run, request-based billing, default region on the saved page (us-central1, Tier 1).
CR_CPU_S, CR_GIB_S, CR_REQ_M = 0.000024, 0.0000025, 0.40
CR_FREE_CPU_S, CR_FREE_GIB_S, CR_FREE_REQ = 180_000, 360_000, 2_000_000
CR_VCPU, CR_GIB = 1, 0.5
WARM_BILLED_S = 0.1  # measured NCR three routes p95 58 ms, billing rounds up to 100 ms
COLD_BILLED_S = 2.0  # ASSUMPTION: container start is not measured; in-process start measured 0.4 s

# Fly.io shared-cpu-1x 512 MB, always on, Ashburn price; Singapore 1 GB is 8.50 vs 6.70 in Ashburn.
FLY_512_IAD = 3.69
FLY_SIN_FACTOR = 8.50 / 6.70

GH_PAGES_SOFT_GB = 100


def cloud_run(queries, cold_share):
    billed = queries * (cold_share * COLD_BILLED_S + (1 - cold_share) * WARM_BILLED_S)
    cpu = max(0, billed * CR_VCPU - CR_FREE_CPU_S) * CR_CPU_S
    mem = max(0, billed * CR_GIB - CR_FREE_GIB_S) * CR_GIB_S
    req = max(0, queries - CR_FREE_REQ) / 1e6 * CR_REQ_M
    return {"billed_vcpu_s": round(billed), "usd_compute": round(cpu + mem + req, 2)}


def main(derived, bundle_json):
    sizes = json.load(open(os.path.join(derived, "binary_sizes.json")))
    bundle = json.load(open(bundle_json))
    app = sum(bundle["gzip9"].values())
    mk, ncr = sizes["makati_cbd"], sizes["ncr"]
    graph = {
        "makati_graph_plus_shade_1season": mk["wire_total_without_shade"]["brotli11"] + mk["shade_24hh_1season_4bit"]["brotli11"],
        "ncr_graph_plus_shade_1season": ncr["wire_total_without_shade"]["brotli11"] + ncr["shade_24hh_1season_4bit"]["brotli11"],
    }
    per_edge = graph["ncr_graph_plus_shade_1season"] / ncr["undirected_edges"]
    tile_p95_edges = bundle["ncr_tile_edges_p95"]
    graph["ncr_tiled_query_p95"] = round(per_edge * tile_p95_edges)
    overlay = bundle["overlay_makati_pmtiles"]
    out = {"app_bundle_gzip_bytes": app, "graph_bytes": graph, "overlay_makati_bytes": overlay, "plans": {}}
    for name, g in (("makati_full", graph["makati_graph_plus_shade_1season"]),
                    ("ncr_full", graph["ncr_graph_plus_shade_1season"]),
                    ("ncr_tiled", graph["ncr_tiled_query_p95"])):
        per_session = app + g + overlay
        for q in (1_000, 50_000):
            gb = per_session * q / 1e9
            out["plans"][f"static_{name}_{q}"] = {
                "bytes_per_session": per_session, "gb_per_month": round(gb, 2),
                "within_gh_pages_soft_limit": gb <= GH_PAGES_SOFT_GB, "usd": 0.0,
            }
    for q in (1_000, 50_000):
        out["plans"][f"cloud_run_{q}_all_cold"] = cloud_run(q, 1.0)
        out["plans"][f"cloud_run_{q}_all_warm"] = cloud_run(q, 0.0)
    out["plans"]["fly_512mb_always_on_iad"] = {"usd": FLY_512_IAD}
    out["plans"]["fly_512mb_always_on_sin_est"] = {"usd": round(FLY_512_IAD * FLY_SIN_FACTOR, 2)}
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
