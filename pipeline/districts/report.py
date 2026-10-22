"""Collect the staged area summaries and the Makati regression diff into one report.

Usage: pipeline/.venv/bin/python -I pipeline/districts/report.py
Reads pipeline/work/districts/<area>/summary.json for every area in pipeline/areas.json, and compares
pipeline/stage/makati-cbd/ with the root app data when both exist. Writes pipeline/work/districts/report.json.
"""
import gzip
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent
ROOT = PIPE.parent


def makati_diff():
    stage, app = PIPE / "stage/makati-cbd", ROOT / "app/public/data"
    # The root Makati files left git on 2026-10-22, when metro-core replaced them. The diff runs only on a
    # checkout that still has them and a staged makati-cbd build.
    if not (app / "graph.json").exists() or not (stage / "graph.json").exists():
        return {"skipped": "no root Makati files or no staged makati-cbd build"}
    out = {}
    for f in ("graph.json", "hours.json", "buildings_display.geojson", "places.json"):
        a, s = (app / f).read_bytes(), (stage / f).read_bytes()
        row = {"bytes_identical": a == s}
        if a != s and f == "places.json":
            ka = {json.dumps(x, sort_keys=True) for x in json.loads(a)}
            ks = {json.dumps(x, sort_keys=True) for x in json.loads(s)}
            row["only_app"] = sorted(json.loads(x)["name"] for x in ka - ks)
            row["only_stage"] = sorted(json.loads(x)["name"] for x in ks - ka)
        elif a != s:
            row["json_equal"] = json.loads(a) == json.loads(s)
        out[f] = row
    inp = PIPE / "inputs/buildings.geojson"
    if inp.exists():
        out["buildings.geojson (pipeline/inputs vs stage .gz)"] = {
            "content_identical": inp.read_bytes() == gzip.open(stage / "buildings.geojson.gz").read()}
    tpl = PIPE / "inputs/manifest_template.json"
    if tpl.exists():
        ta, ts = json.load(open(tpl)), json.load(open(stage / "manifest_template.json"))
        out["manifest_template.json"] = {
            "keys_differing": [k for k in ta if k != "generated_at" and ta[k] != ts.get(k)],
            "limits_only_root": [x for x in ta["limits"] if x not in ts["limits"]],
            "limits_only_stage": [x for x in ts["limits"] if x not in ta["limits"]]}
    return out


def main():
    areas = json.load(open(PIPE / "areas.json"))["areas"]
    rows = []
    for a in areas:
        p = PIPE / "work/districts" / a["id"] / "summary.json"
        if not p.exists():
            sys.exit(f"no summary for {a['id']}")
        rows.append(json.load(open(p)))
    total = {}
    for r in rows:
        for name, s in r["sizes"].items():
            t = total.setdefault(name, {"raw": 0, "gzip": 0})
            t["raw"] += s.get("raw", 0)
            t["gzip"] += s.get("gzip", 0)
    report = {"areas": rows, "total_sizes_bytes": total, "makati_regression": makati_diff()}
    json.dump(report, open(PIPE / "work/districts/report.json", "w"), indent=1)
    for r in rows:
        g = r["sizes"]["graph.json"]
        print(f"{r['area']:15s} km2={r['graph_area_km2']:6.2f} edges={r['edges']:6d} routable_km={r['routable_km']:8.1f} "
              f"lcc={r['largest_component_node_share']:.3f}/{r['largest_component_km_share']:.3f} "
              f"sheltered_km={r['sheltered_routable_km']:.2f} graph={g['raw'] / 1e6:.2f}MB/{g['gzip'] / 1e6:.2f}MB gz "
              f"ok={r['checks_passed']}")
    print(json.dumps(total))
    print(json.dumps(report["makati_regression"], indent=1))


if __name__ == "__main__":
    main()
