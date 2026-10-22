"""Pass 2 of the city scout: pick districts per city and write candidates.json and candidates.md.

Usage: pipeline/.venv/bin/python -I pipeline/regions/scout/score.py [discover|build]
  discover  list dense walking areas far from every listed city (feeds EXTRAS in cities.py)
  build     write pipeline/regions/candidates.json, candidates.md, scout/reference_districts.json
Needs scout/cache/national.npz from extract.py.

Box size: 0.020 deg wide by 0.016 deg high (about 2.2 km by 1.8 km), inside the range of the 16 existing
districts. Boxes sit on a 0.002 deg grid, so the box edges are multiples of 0.002.
Window score S = walk_km + places / 6. A district must reach MIN_WALK_KM of walkable ways and MIN_PLACES named places,
and may not overlap a district already chosen for another city by more than 25%.
Metrics count a segment, building or place when its midpoint, centroid or point lies inside the box.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from cities import CITIES, EXTRAS  # noqa: E402
from s2cell import token_level4  # noqa: E402

BW, BH = 0.020, 0.016
STEP = 0.002
WC, HC = round(BW / STEP), round(BH / STEP)
MIN_WALK_KM = 25.0
MIN_PLACES = 60
PLACE_DIV = 6
MAX_OVERLAP = 0.25
NCR = (120.90, 14.35, 121.20, 14.80)


def load():
    z = np.load(HERE / "cache" / "national.npz", allow_pickle=True)
    return {k: z[k] for k in z.files}


def inbox(arr, b):
    return (arr[:, 0] >= b[0]) & (arr[:, 0] < b[2]) & (arr[:, 1] >= b[1]) & (arr[:, 1] < b[3])


def metrics(D, b):
    ms = D["seg"][inbox(D["seg"], b)]
    mb = D["bld"][inbox(D["bld"], b)]
    mp = inbox(D["plc"], b)
    p = D["plc"][mp]
    return {
        "walk_km": round(ms[:, 2].sum() / 1000, 2),
        "covered_km": round(ms[ms[:, 3] == 1][:, 2].sum() / 1000, 3),
        "places": int(len(p)),
        "buildings": int(len(mb)),
        "height_tag_share": round(float(mb[:, 2].mean()), 3) if len(mb) else None,
        "n_univ": int((p[:, 2] == 1).sum()), "n_mall": int((p[:, 2] == 2).sum()), "n_transit": int((p[:, 2] == 3).sum()),
    }


def names_in(D, b, kind, n=3):
    m = inbox(D["plc"], b) & (D["plc"][:, 2] == kind)
    out = []
    for nm in D["plc_names"][m]:
        if nm not in out:
            out.append(nm)
    return out[:n]


def grid(D, x0, y0, nx, ny, step):
    """Per-cell sums over an nx by ny grid whose lower-left corner is (x0, y0)."""
    rng = [[x0, x0 + nx * step], [y0, y0 + ny * step]]

    def h(arr, w=None):
        return np.histogram2d(arr[:, 0], arr[:, 1], bins=[nx, ny], range=rng, weights=w)[0]
    s, b, p = D["seg"], D["bld"], D["plc"]
    return {"walk": h(s, s[:, 2] / 1000), "cov": h(s[s[:, 3] == 1], s[s[:, 3] == 1][:, 2] / 1000),
            "plc": h(p), "univ": h(p[p[:, 2] == 1]), "mall": h(p[p[:, 2] == 2]), "tr": h(p[p[:, 2] == 3])}


def window_sums(g, wc, hc):
    out = {}
    for k, a in g.items():
        c = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
        out[k] = c[wc:, hc:] - c[:-wc, hc:] - c[wc:, :-hc] + c[:-wc, :-hc]
    return out


def km_to_deg(km, lat):
    return km / 110.574, km / (111.32 * math.cos(math.radians(lat)))


def overlap(a, b):
    w = min(a[2], b[2]) - max(a[0], b[0])
    h = min(a[3], b[3]) - max(a[1], b[1])
    return max(w, 0) * max(h, 0) / ((a[2] - a[0]) * (a[3] - a[1]))


def candidates_for(D, seeds, radius_km):
    """All box positions whose centre is within radius_km of a seed, best score first."""
    boxes = {}
    for label, lon, lat in seeds:
        dlat, dlon = km_to_deg(radius_km, lat)
        x0 = math.floor((lon - dlon - BW) / STEP) * STEP
        y0 = math.floor((lat - dlat - BH) / STEP) * STEP
        nx = int((2 * dlon + 2 * BW) / STEP) + 2
        ny = int((2 * dlat + 2 * BH) / STEP) + 2
        g = grid(D, x0, y0, nx, ny, STEP)
        ws = window_sums(g, WC, HC)
        for ix in range(ws["walk"].shape[0]):
            for iy in range(ws["walk"].shape[1]):
                b = (round(x0 + ix * STEP, 4), round(y0 + iy * STEP, 4))
                cx, cy = b[0] + BW / 2, b[1] + BH / 2
                d = math.hypot((cx - lon) * 111.32 * math.cos(math.radians(lat)), (cy - lat) * 110.574)
                if d > radius_km:
                    continue
                w = ws["walk"][ix, iy]
                boxes[b] = (label, d, w + ws["plc"][ix, iy] / PLACE_DIV, (ws["univ"][ix, iy], ws["mall"][ix, iy], ws["tr"][ix, iy]))
    out = [([b[0], b[1], round(b[0] + BW, 4), round(b[1] + BH, 4)], *v) for b, v in boxes.items()]
    out.sort(key=lambda r: -r[3])
    return out


def slug(s):
    return "".join(c if c.isalnum() else "-" for c in s.lower()).strip("-").replace("--", "-")


TAKEN = []


def pick_districts(D, city, seeds, radius):
    cands = candidates_for(D, seeds, radius)
    picked = []

    def free(b):
        return all(overlap(b, p["bbox"]) <= MAX_OVERLAP for p in picked + TAKEN)

    def take(role, ok):
        for b, label, d, s, (nu, nm, nt) in cands:
            if not free(b) or not ok(nu, nm, nt):
                continue
            m = metrics(D, b)
            if m["places"] < MIN_PLACES:
                continue
            if m["walk_km"] < MIN_WALK_KM:
                return None
            if picked and m["walk_km"] < 0.3 * picked[0]["walk_km"]:
                return None
            r = {"bbox": b, "seed": label, "role": role, **m}
            picked.append(r)
            return r
        return None

    take("downtown", lambda nu, nm, nt: True)
    if not picked:
        best = max(cands, key=lambda c: metrics(D, c[0])["places"] >= 0 and c[3])
        return [], metrics(D, best[0]), best[0], best[1]
    take("university belt", lambda nu, nm, nt: nu >= 2)
    take("mall and transit hub", lambda nu, nm, nt: nm >= 1 or nt >= 1)
    TAKEN.extend(picked)
    return picked, None, None, None


def utm_epsg(lon):
    return 32650 if lon < 120 else 32651 if lon < 126 else 32652


def discover(D):
    step = 0.004
    x0, y0, nx, ny = 116.0, 4.5, int(11.5 / step), int(16.5 / step)
    g = grid(D, x0, y0, nx, ny, step)
    ws = window_sums(g, round(BW / step), round(BH / step))
    seeds = [s for c in CITIES + EXTRAS for s in c[3]]
    flat = np.argsort(-(ws["walk"] + ws["plc"] / 25), axis=None)
    chosen = []
    for f in flat:
        ix, iy = np.unravel_index(f, ws["walk"].shape)
        lon, lat = x0 + (ix + 2.5) * step, y0 + (iy + 2) * step
        if NCR[0] <= lon <= NCR[2] and NCR[1] <= lat <= NCR[3]:
            continue
        if any(math.hypot((lon - s[1]) * 111.32 * math.cos(math.radians(lat)), (lat - s[2]) * 110.574) < 7 for s in seeds):
            continue
        if any(math.hypot((lon - c[0]) * 111.32 * math.cos(math.radians(lat)), (lat - c[1]) * 110.574) < 6 for c in chosen):
            continue
        if ws["plc"][ix, iy] < 60:
            continue
        chosen.append((lon, lat, float(ws["walk"][ix, iy]), float(ws["plc"][ix, iy])))
        if len(chosen) >= 30:
            break
    tw = D["twn"]
    for lon, lat, w, p in chosen:
        d = np.hypot((tw[:, 0] - lon) * 111.32 * math.cos(math.radians(lat)), (tw[:, 1] - lat) * 110.574)
        order = np.argsort(d)[:60]
        order = [i for i in order if tw[i, 2] <= 1][:1] or list(np.argsort(d)[:1])
        nm = D["twn_names"][order[0]]
        print(f"{lon:.3f},{lat:.3f} walk_km={w:.1f} places={p:.0f} nearest_town={nm} ({d[order[0]]:.1f} km)")


def build(D):
    ref = json.loads((ROOT / "pipeline/districts.json").read_text())["districts"]
    ref_out = {}
    for v in ref:
        ref_out[v["id"]] = {"bbox": v["bbox"], **metrics(D, v["bbox"])}
    (HERE / "reference_districts.json").write_text(json.dumps(ref_out, indent=1))
    rows, dropped = [], []
    for city, prov, reg, seeds, radius in CITIES + EXTRAS:
        picked, thin, thin_box, thin_seed = pick_districts(D, city, seeds, radius)
        if not picked:
            dropped.append({"city": city, "best_bbox": thin_box, "seed": thin_seed, **thin})
            continue
        ids = set()
        for p in picked:
            base = slug(p["seed"]) + "-" + slug(p["role"].replace(" and ", " "))
            did = base if base not in ids else base + "-2"
            ids.add(did)
            b = p["bbox"]
            cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
            anchors = []
            for kind, lab in ((1, "universities"), (2, "malls"), (3, "stations")):
                nms = names_in(D, b, kind)
                if nms:
                    anchors.append(f"{lab}: {', '.join(nms)}")
            name = {"downtown": f"{p['seed'].replace('-', ' ').title()} downtown",
                    "university belt": f"{p['seed'].replace('-', ' ').title()} university belt",
                    "mall and transit hub": f"{p['seed'].replace('-', ' ').title()} mall and transit hub"}[p["role"]]
            why = (f"{p['walk_km']} km walkable, {p['places']} places, {p['buildings']} buildings. "
                   + (("Anchors - " + "; ".join(anchors) + ". ") if anchors else "No mapped university, mall or station in the box. ")
                   + ("Roads only, thin sidewalk mapping likely." if p["covered_km"] == 0 and p["walk_km"] < 15 else ""))
            rows.append({"city": city, "province": prov, "region": reg, "district_id": did, "name": name,
                         "bbox": b, "walk_km": p["walk_km"], "places": p["places"], "buildings": p["buildings"],
                         "height_tag_share": p["height_tag_share"], "covered_km": p["covered_km"],
                         "utm_epsg": utm_epsg(cx), "s2_l4_cell": token_level4(cx, cy), "role": p["role"],
                         "rank": 0, "why": why.strip()})
    mw = max(r["walk_km"] for r in rows)
    mp = max(r["places"] for r in rows)
    for r in rows:
        r["_s"] = 0.5 * r["walk_km"] / mw + 0.5 * r["places"] / mp
    rows.sort(key=lambda r: -r["_s"])
    for i, r in enumerate(rows, 1):
        r["rank"] = i
        del r["_s"]
    (ROOT / "pipeline/regions/candidates.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    (HERE / "dropped.json").write_text(json.dumps(dropped, indent=1))
    print(len(rows), "districts,", len(dropped), "cities dropped")


def seeds(D):
    """Best box for each secondary seed of a joint entry (Clark, Subic, Nuvali), so the notes can cite it."""
    out = {}
    for city, prov, reg, sd, radius in CITIES:
        if len(sd) < 2:
            continue
        for one in sd:
            best = None
            for b, label, d, sc, k in candidates_for(D, [one], radius):
                m = metrics(D, b)
                if m["places"] >= MIN_PLACES:
                    best = {"bbox": b, **m}
                    break
            out[one[0]] = best
    (HERE / "secondary_seeds.json").write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    D = load()
    {"discover": discover, "build": build, "seeds": seeds}[sys.argv[1] if len(sys.argv) > 1 else "build"](D)
