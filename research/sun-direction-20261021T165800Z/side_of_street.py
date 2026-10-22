"""How the sun's direction decides which sidewalk is shaded in the Makati graph.

Reads the shipped app data (graph.json, shade.bin, manifest.json). With --dates it also
runs the shade engine for extra dates (no app files written) to show the seasonal flip.
Writes results.json and prints a summary.
"""

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app" / "public" / "data"
OUT = Path(__file__).resolve().parent
M_PER_DEG_LAT = 110_574.0


def to_xy(lon, lat, lat0):
    return np.array([(lon) * 111_320.0 * math.cos(math.radians(lat0)), lat * M_PER_DEG_LAT])


def bearing(v):
    """Compass bearing of a 2D east-north vector, 0 = north, 90 = east."""
    return (math.degrees(math.atan2(v[0], v[1])) + 360.0) % 360.0


def compass8(b):
    return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][int((b + 22.5) // 45) % 8]


def load():
    m = json.loads((DATA / "manifest.json").read_text())
    g = json.loads((DATA / "graph.json").read_text())
    s = m["shade"]
    nd, nb, ne = s["n_dates"], s["n_buckets"], s["n_edges"]
    raw = np.fromfile(DATA / "shade.bin", dtype=np.uint8)
    building = raw[: nd * nb * ne].reshape(nd, nb, ne)
    return m, g, building


def side_pairs(g, lat0):
    """Pair left and right side edges of the same road segment. Return per-edge geometry facts."""
    nodes = g["nodes"]
    facts = {}
    by_seg = defaultdict(dict)
    for e in g["edges"]:
        if e["side"] not in ("left", "right") or e["flags"] & 7:
            continue
        a = to_xy(*nodes[e["u"]], lat0)
        b = to_xy(*nodes[e["v"]], lat0)
        chord = b - a
        if np.hypot(*chord) < 20:
            continue
        geom = np.array([to_xy(lon, lat, lat0) for lon, lat in e["geom"]])
        off = geom.mean(axis=0) - (a + b) / 2.0  # vector from road centre to the sidewalk
        if np.hypot(*off) < 0.5:
            continue
        axis = bearing(chord) % 180.0
        facts[e["id"]] = {"axis": axis, "side_bearing": bearing(off), "len": e["len_m"], "name": e.get("name")}
        by_seg[(min(e["u"], e["v"]), max(e["u"], e["v"]), e.get("way_id"))][e["side"]] = e["id"]
    pairs = [(d["left"], d["right"]) for d in by_seg.values() if "left" in d and "right" in d]
    return facts, pairs


def analyse(label, sun, building, facts, pairs, buckets_min, date_idx):
    """For one date: which side is shadier, and how street direction changes building shade."""
    rows = []
    for b, (alt, az) in enumerate(sun):
        if alt <= 3:
            continue
        sun_vec = np.array([math.sin(math.radians(az)), math.cos(math.radians(az))])
        wins = loses = ties = 0
        diff_sum = w_sum = 0.0
        for l, r in pairs:
            fl, fr = facts[l], facts[r]
            # The sun-side sidewalk is the one whose offset points toward the sun.
            dl = np.dot([math.sin(math.radians(fl["side_bearing"])), math.cos(math.radians(fl["side_bearing"]))], sun_vec)
            near, far = (l, r) if dl > 0 else (r, l)
            perp = abs(math.sin(math.radians(az - fl["axis"])))
            if perp < 0.26:  # sun within 15 deg of the street axis: no sun side to speak of
                continue
            sn, sf = int(building[date_idx, b, near]), int(building[date_idx, b, far])
            w = facts[near]["len"]
            diff_sum += (sn - sf) * w
            w_sum += w
            if sn > sf + 5:
                wins += 1
            elif sf > sn + 5:
                loses += 1
            else:
                ties += 1
        # Shade by angle between sun and street axis, for all side edges
        bins = defaultdict(lambda: [0.0, 0.0])
        for eid, f in facts.items():
            ang = abs((az - f["axis"] + 90.0) % 180.0 - 90.0)  # 0 = sun along the street, 90 = across
            k = "along (0-30)" if ang < 30 else ("oblique (30-60)" if ang < 60 else "across (60-90)")
            bins[k][0] += int(building[date_idx, b, eid]) * f["len"]
            bins[k][1] += f["len"]
        hh, mm = divmod(buckets_min[b], 60)
        rows.append({
            "date": label, "time": f"{hh:02d}:{mm:02d}", "sun_alt": round(alt, 1), "sun_az": round(az, 1),
            "sun_compass": compass8(az), "pairs_compared": wins + loses + ties,
            "sun_side_shadier": wins, "far_side_shadier": loses, "within_5_points": ties,
            "sun_side_minus_far_side_pts": round(diff_sum / w_sum, 1) if w_sum else None,
            "building_shade_pct_by_street_angle": {k: round(v[0] / v[1], 1) for k, v in sorted(bins.items()) if v[1]},
        })
    return rows


def street_table(g, facts, building, sun, buckets_min, date_idx, names, times):
    out = []
    for name in names:
        ids = [eid for eid, f in facts.items() if f["name"] == name]
        if not ids:
            continue
        axis = float(np.median([facts[i]["axis"] for i in ids]))
        for t in times:
            b = buckets_min.index(t)
            alt, az = sun[b]
            by_side = defaultdict(lambda: [0.0, 0.0])
            for i in ids:
                c = compass8(facts[i]["side_bearing"])
                by_side[c][0] += int(building[date_idx, b, i]) * facts[i]["len"]
                by_side[c][1] += facts[i]["len"]
            sides = {k: round(v[0] / v[1], 1) for k, v in by_side.items() if v[1] > 100}
            out.append({"street": name, "axis_deg": round(axis), "time": f"{t // 60:02d}:{t % 60:02d}",
                        "sun_az": round(az), "sun_alt": round(alt), "building_shade_pct_by_side": sides})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dates", nargs="*", default=[], help="extra dates for the seasonal run, YYYY-MM-DD")
    args = ap.parse_args()
    m, g, building = load()
    lat0 = (m["graph_bbox"][1] + m["graph_bbox"][3]) / 2.0
    facts, pairs = side_pairs(g, lat0)
    buckets = m["buckets_min"]
    names = ["Ayala Avenue", "Paseo de Roxas", "Makati Avenue", "Senator Gil J. Puyat Avenue", "Dela Rosa Street", "Legazpi Street", "Valero Street", "Rufino Street"]
    times = [480, 720, 960]

    d = m["dates"].index("2026-10-22")
    result = {
        "side_edges": len(facts), "side_pairs": len(pairs),
        "axis_hist_15deg_km": {},
        "oct22": analyse("2026-10-22", m["sun"]["2026-10-22"], building, facts, pairs, buckets, d),
        "streets_oct22": street_table(g, facts, building, m["sun"]["2026-10-22"], buckets, d, names, times),
        "seasonal": {},
    }
    hist = defaultdict(float)
    for f in facts.values():
        hist[int(f["axis"] // 15) * 15] += f["len"] / 1000.0
    result["axis_hist_15deg_km"] = {f"{k:03d}-{k + 15:03d}": round(v, 1) for k, v in sorted(hist.items())}

    if args.dates:
        sys.path.insert(0, str(ROOT / "pipeline" / "shade"))
        import shade  # the shipped engine, used read-only

        feats = json.loads((DATA / "buildings.geojson").read_text())["features"]
        alt, az, _ = shade.sun_table(dates=args.dates, buckets=buckets)
        b2, _, _, _, _ = shade.compute(g["edges"], feats, alt, az, log=lambda *a, **k: None)
        for i, day in enumerate(args.dates):
            sun = [[float(alt[i, j]), float(az[i, j])] for j in range(len(buckets))]
            result["seasonal"][day] = {
                "rows": analyse(day, sun, b2, facts, pairs, buckets, i),
                "streets": street_table(g, facts, b2, sun, buckets, i, names, times),
            }

    (OUT / "results.json").write_text(json.dumps(result, indent=1))
    print(json.dumps({"side_edges": result["side_edges"], "side_pairs": result["side_pairs"],
                      "axis_hist_15deg_km": result["axis_hist_15deg_km"]}))
    for r in result["oct22"]:
        if r["time"] in ("07:00", "08:00", "10:00", "12:00", "14:00", "16:00", "17:00"):
            print(r)
    for day, v in result["seasonal"].items():
        for r in v["rows"]:
            if r["time"] in ("08:00", "12:00", "16:00"):
                print(r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
