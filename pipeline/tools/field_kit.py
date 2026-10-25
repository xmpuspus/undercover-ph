"""Field check kit: points to visit on foot, and a score of what walkers saw against the shade model.

PLAN.md item 32 (2026-10-23). Nobody has checked the shade on the street yet, and imagery settles only 1 of 16
covered-walkway checks. This kit picks walkway points from an area's graph, spread across the model's shade
values, and scores the sun or shade that a walker records at each point at 08:00, 12:00 and 16:00.

Usage, from the repository root (standard library only):
  python3 -I pipeline/tools/field_kit.py make AREA DATE [--hood ID] [--n 40] [--covered 10] [--seed 1]
      --hood keeps the points inside one neighbourhood box from areas.json (for example makati-cbd), so one
      walker can reach them all. Writes field/AREA-DATE.csv (one row per point, blank obs_ columns to fill in) and field/AREA-DATE.geojson
      (the same points, for a phone map app). DATE must be in the area's manifest.json.
  python3 -I pipeline/tools/field_kit.py score field/AREA-DATE.csv
      prints agreement per time slot and for covered walkways, and writes field/AREA-DATE.score.json.

Observed values: obs_0800, obs_1200, obs_1600 take sun, shade or partial, read at the point on that side of the
street. obs_covered takes yes or no: a roof or deck over the walkway. Leave a cell blank when not seen.
The model class is shade at 60% or more of the edge in shadow, sun at 40% or less, and partial between.
"""
import csv
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AREAS = ROOT / "app/public/data/areas"
OUT = ROOT / "field"
SLOTS = (("0800", 480), ("1200", 720), ("1600", 960))
SPACING_M = 120
NIGHT = 255
FIELDS = ["id", "kind", "lat", "lon", "street", "side", "edge_id", "way_id",
          *(f"model_{s}" for s, _ in SLOTS), "model_covered",
          *(f"obs_{s}" for s, _ in SLOTS), "obs_covered", "photo", "note"]


def metres(a, b):
    """Haversine distance in metres between two [lon, lat] points."""
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def midpoint(geom):
    """The point halfway along a polyline of [lon, lat] points."""
    steps = [metres(geom[i], geom[i + 1]) for i in range(len(geom) - 1)]
    half, run = sum(steps) / 2, 0.0
    for i, s in enumerate(steps):
        if run + s >= half and s > 0:
            t = (half - run) / s
            return [geom[i][0] + t * (geom[i + 1][0] - geom[i][0]), geom[i][1] + t * (geom[i + 1][1] - geom[i][1])]
        run += s
    return geom[0]


def model_class(pct):
    return "shade" if pct >= 60 else "sun" if pct <= 40 else "partial"


def make(area, date, n=40, n_covered=10, seed=1, hood=None):
    d = AREAS / area
    box = None
    if hood:
        info = next((a for a in json.loads((AREAS.parent / "areas.json").read_text())["areas"] if a["id"] == area), {})
        box = next((h["bbox"] for h in info.get("neighbourhoods", []) if h["id"] == hood), None)
        if box is None:
            sys.exit(f"{hood} is not a neighbourhood of {area}")
    m = json.loads((d / "manifest.json").read_text())
    if date not in m["dates"]:
        sys.exit(f"{date} is not in {area}'s manifest dates {m['dates']}")
    graph = json.loads((d / "graph.json").read_text())
    s, buckets = m["shade"], m["buckets_min"]
    n_b, n_e = s["n_buckets"], s["n_edges"]
    raw = (d / s["files"][m["dates"].index(date)]).read_bytes()
    plane = n_b * n_e

    def pct(b, e):
        v = raw[b * n_e + e]
        return None if v == NIGHT else min(100, v + raw[plane + b * n_e + e])

    idx = [buckets.index(minute) for _, minute in SLOTS]
    rng = random.Random(seed)
    shade_pool, cover_pool = [], []
    for i, e in enumerate(graph["edges"]):
        if not e.get("routable") or e["len_m"] < 15 or not e.get("geom"):
            continue
        if box:
            lon, lat = midpoint(e["geom"])
            if not (box[0] <= lon <= box[2] and box[1] <= lat <= box[3]):
                continue
        (cover_pool if e.get("flags", 0) & 7 else shade_pool).append(i)
    # Spread the shade points across the model's noon values, so sun and shade both get checked.
    bins = [[], [], [], []]
    for i in shade_pool:
        v = pct(idx[1], i)
        if v is not None:
            bins[min(3, v // 25)].append(i)
    for b in bins:
        rng.shuffle(b)
    rng.shuffle(cover_pool)
    picked, points = [], []

    def take(i, kind):
        e = graph["edges"][i]
        p = midpoint(e["geom"])
        if any(metres(p, q) < SPACING_M for q in points):
            return False
        points.append(p)
        picked.append((kind, i, p))
        return True

    while sum(1 for k, _, _ in picked if k == "shade") < n and any(bins):
        for b in bins:
            while b and not take(b.pop(), "shade"):
                pass
            if sum(1 for k, _, _ in picked if k == "shade") >= n:
                break
    for i in cover_pool:
        if sum(1 for k, _, _ in picked if k == "cover") >= n_covered:
            break
        take(i, "cover")

    OUT.mkdir(exist_ok=True)
    rows, feats = [], []
    for k, (kind, i, p) in enumerate(picked, 1):
        e = graph["edges"][i]
        row = {"id": f"{area}-{k:03d}", "kind": kind, "lat": f"{p[1]:.6f}", "lon": f"{p[0]:.6f}",
               "street": e.get("name") or "", "side": e.get("side") or "", "edge_id": e["id"], "way_id": e.get("way_id") or "",
               "model_covered": "yes" if e.get("flags", 0) & 7 else "no"}
        for (slot, _), b in zip(SLOTS, idx):
            v = pct(b, i)
            row[f"model_{slot}"] = "" if v is None else v
        rows.append(row)
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p[0], 6), round(p[1], 6)]},
                      "properties": {k2: row[k2] for k2 in ("id", "kind", "street", "side")}})
    stem = OUT / "-".join(x for x in (area, hood, date) if x)
    with open(f"{stem}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, FIELDS)
        w.writeheader()
        w.writerows(rows)
    Path(f"{stem}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}) + "\n")
    print(json.dumps({"csv": f"{stem}.csv", "shade_points": sum(r["kind"] == "shade" for r in rows),
                      "covered_points": sum(r["kind"] == "cover" for r in rows)}))
    return rows


def score(path):
    rows = list(csv.DictReader(open(path)))
    out = {"file": str(path), "slots": {}, "covered": {}}
    for slot, _ in SLOTS:
        n = agree = near = 0
        confusion, misses = {}, []
        for r in rows:
            obs, mod = r.get(f"obs_{slot}", "").strip().lower(), r.get(f"model_{slot}", "")
            if r["kind"] != "shade" or obs not in ("sun", "shade", "partial") or mod == "":
                continue
            want = model_class(int(mod))
            n += 1
            agree += obs == want
            # Partial on one side and a full call on the other is a near miss.
            near += obs == want or "partial" in (obs, want)
            confusion[f"model {want} / seen {obs}"] = confusion.get(f"model {want} / seen {obs}", 0) + 1
            if obs != want:
                misses.append(r["id"])
        out["slots"][slot] = {"points": n, "agree": agree, "agree_pct": round(100 * agree / n, 1) if n else None,
                              "agree_or_near": near, "confusion": confusion, "misses": misses}
    seen = [r for r in rows if r.get("obs_covered", "").strip().lower() in ("yes", "no")]
    tp = sum(r["model_covered"] == "yes" and r["obs_covered"].strip().lower() == "yes" for r in seen)
    fp = sum(r["model_covered"] == "yes" and r["obs_covered"].strip().lower() == "no" for r in seen)
    fn = sum(r["model_covered"] == "no" and r["obs_covered"].strip().lower() == "yes" for r in seen)
    out["covered"] = {"points": len(seen), "model_and_seen": tp, "model_not_seen": fp, "seen_not_model": fn,
                      "precision_pct": round(100 * tp / (tp + fp), 1) if tp + fp else None,
                      "recall_pct": round(100 * tp / (tp + fn), 1) if tp + fn else None}
    Path(str(path).removesuffix(".csv") + ".score.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1))
    return out


def opt(args, name, default, kind=int):
    return kind(args[args.index(name) + 1]) if name in args else default


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["make"] and len(a) >= 3:
        make(a[1], a[2], opt(a, "--n", 40), opt(a, "--covered", 10), opt(a, "--seed", 1), opt(a, "--hood", None, str))
    elif a[:1] == ["score"] and len(a) == 2:
        score(Path(a[1]))
    else:
        sys.exit(__doc__)
