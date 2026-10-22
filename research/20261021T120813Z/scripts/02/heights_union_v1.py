"""Per-footprint height coverage for one pilot box: OSM tags, OSM parts, Google 2.5D raster, Overture.

Usage: python3 -I heights_union.py BOX OSM_JSONL GOOGLE_TIF OUTDIR [OVERTURE_BUILDING_PARQUET]
Denominator: OSM building outlines (building!=no) whose centroid falls in the box.
"""
import json
import re
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import shapely
from rasterio.features import rasterize

BOXES = {"makati": (14.548, 121.012, 14.562, 121.032), "bgc": (14.545, 121.040, 14.560, 121.058),
         "ortigas": (14.578, 121.053, 14.592, 121.067)}
box, osm_path, tif, out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].rstrip("/") + "/"
ovt_path = sys.argv[5] if len(sys.argv) > 5 else None
S, W, N, E = BOXES[box]
NUM = re.compile(r"^\s*(\d+(?:[.,]\d+)?)\s*(m|meters|metres|ft|')?\s*$", re.I)


def parse_h(v):
    m = NUM.match(v or "")
    if not m:
        return np.nan
    x = float(m.group(1).replace(",", "."))
    if (m.group(2) or "").lower() in ("ft", "'"):
        x *= 0.3048
    return x if 0 < x <= 400 else np.nan


def parse_lv(v):
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*$", v or "")
    x = float(m.group(1)) if m else np.nan
    return x if 0 < x <= 120 else np.nan


rows = [json.loads(line) for line in open(osm_path)]
g = gpd.GeoDataFrame(
    [{"osm": f"{r['osm_type'][0]}{r['osm_id']}", "building": r["tags"].get("building"),
      "part": r["tags"].get("building:part"), "name": r["tags"].get("name"),
      "h_tag": parse_h(r["tags"].get("height")), "lv_tag": parse_lv(r["tags"].get("building:levels")),
      "h_raw": r["tags"].get("height"), "lv_raw": r["tags"].get("building:levels")} for r in rows],
    geometry=shapely.from_wkt([r["wkt"] for r in rows]), crs="EPSG:4326")
unparsed = {"height": int(g.h_raw.notna().sum() - g.h_tag.notna().sum()),
            "levels": int(g.lv_raw.notna().sum() - g.lv_tag.notna().sum())}
cen = g.geometry.centroid if False else gpd.GeoSeries(shapely.centroid(g.geometry.values), crs=4326)
g["in_box"] = (cen.y >= S) & (cen.y <= N) & (cen.x >= W) & (cen.x <= E)
g = g.to_crs(32651)
outl = g[g.building.notna() & (g.building != "no")].copy()
parts = g[g.building.isna() & g.part.notna() & (g.part != "no")].copy()
fp = outl[outl.in_box].copy()
fp["area_m2"] = fp.area

# OSM building:part heights: max over parts whose representative point lies in the outline.
pp = parts.copy()
pp["geometry"] = pp.representative_point()
j = gpd.sjoin(pp[["h_tag", "lv_tag", "geometry"]], fp[["geometry"]], predicate="within")
agg = j.groupby("index_right").agg(h_part=("h_tag", "max"), lv_part=("lv_tag", "max"), n_part=("h_tag", "size"))
fp = fp.join(agg)

# Metres per level, measured on outlines with both tags and a plausible ratio.
both = outl[outl.h_tag.notna() & outl.lv_tag.notna()]
ratio = both.h_tag / both.lv_tag
ok = ratio.between(2.0, 6.0)
fac = float(ratio[ok].median()) if ok.sum() else 3.0
fp["h_osm_tag"] = fp.h_tag
fp["h_osm_part"] = fp.h_part
fp["h_osm_lv"] = fp.lv_tag.fillna(fp.lv_part) * fac
fp["h_osm"] = fp.h_osm_tag.combine_first(fp.h_osm_part).combine_first(fp.h_osm_lv)
fp["osm_src"] = np.select([fp.h_osm_tag.notna(), fp.h_osm_part.notna(), fp.h_osm_lv.notna()],
                          ["height", "part", "levels"], "none")

# Google 2.5D raster: zonal stats inside each footprint at 0.5 m.
with rasterio.open(tif) as r:
    hgt, pres = r.read(1), r.read(2)
    ids = np.arange(1, len(fp) + 1, dtype="int32")
    lab = rasterize(zip(fp.geometry.values, ids), out_shape=hgt.shape, transform=r.transform, fill=0,
                    dtype="int32", all_touched=False)
    valid = (hgt != r.nodata) & (lab > 0)
    # buildings pixels outside every OSM footprint (footprint completeness check, box only)
    from pyproj import Transformer
    tr = Transformer.from_crs(4326, 32651, always_xy=True)
    xs, ys = zip(*[tr.transform(x, y) for x, y in ((W, S), (E, S), (W, N), (E, N))])
    bx = rasterize([(shapely.box(min(xs), min(ys), max(xs), max(ys)), 1)], out_shape=hgt.shape,
                   transform=r.transform, fill=0, dtype="uint8").astype(bool)
    bldg_px = bx & (hgt != r.nodata) & (pres >= 0.5) & (hgt >= 2.5)
    all_lab = rasterize([(geom, 1) for geom in outl.geometry.values], out_shape=hgt.shape, transform=r.transform,
                        fill=0, dtype="uint8").astype(bool)
    completeness = {"google_building_px_in_box": int(bldg_px.sum()),
                    "share_outside_osm_outlines": round(float((bldg_px & ~all_lab).sum() / max(bldg_px.sum(), 1)), 4)}
df = pd.DataFrame({"lab": lab[valid], "h": hgt[valid], "p": pres[valid]})
z = df.groupby("lab").agg(g_npx=("h", "size"), g_p50=("h", "median"), g_p90=("h", lambda s: s.quantile(0.9)),
                          g_max=("h", "max"), g_pres=("p", "mean"))
z.index = fp.index[z.index.values - 1]
fp = fp.join(z)
fp["g_ok"] = (fp.g_npx >= 8) & (fp.g_p90 >= 2.5)
fp["h_google"] = np.where(fp.g_ok, fp.g_p90, np.nan)
fp["g_capped"] = fp.g_ok & (fp.g_max >= 99.9)

# Overture: match by OSM id in sources, then height/num_floors from any source.
fp["h_ovt"] = np.nan
fp["ovt_ds_height"] = None
ovt_summary = None
if ovt_path:
    import pyarrow.parquet as pq
    ov = pq.read_table(ovt_path).to_pandas()
    ov["geometry"] = shapely.from_wkb(ov.pop("geom_wkb"))
    ov = gpd.GeoDataFrame(ov, geometry="geometry", crs=4326)
    c2 = gpd.GeoSeries(shapely.centroid(ov.geometry.values), crs=4326)
    ov = ov[(c2.y >= S) & (c2.y <= N) & (c2.x >= W) & (c2.x <= E)].copy().to_crs(32651)
    src = ov.sources_json.map(json.loads)
    ov["ds"] = src.map(lambda s: s[0]["dataset"] if s else None)
    ov["ds_height"] = src.map(lambda s: ",".join(sorted({x["dataset"] for x in s if (x.get("property") or "").startswith("/properties/height") or x.get("property") == ""})) if s else None)
    ov["osm_rec"] = src.map(lambda s: next((x["record_id"].split("@")[0] for x in s if x["dataset"] == "OpenStreetMap"), None))
    ov["h_any"] = ov.height.combine_first(ov.num_floors * fac)
    ovt_summary = {"n_in_box": int(len(ov)), "by_dataset": ov.ds.value_counts().to_dict(),
                   "height": int(ov.height.notna().sum()), "num_floors": int(ov.num_floors.notna().sum()),
                   "either": int(ov.h_any.notna().sum()),
                   "height_by_dataset": ov[ov.height.notna()].ds.value_counts().to_dict(),
                   "area_m2_total": float(ov.area.sum()),
                   "non_osm_area_m2": float(ov[ov.ds != "OpenStreetMap"].area.sum()),
                   "non_osm_with_height": int(ov[(ov.ds != "OpenStreetMap") & ov.height.notna()].shape[0])}
    m = ov.dropna(subset=["osm_rec"]).set_index("osm_rec")
    m = m[~m.index.duplicated()]
    fp["h_ovt"] = fp.osm.map(m.h_any)
    fp["ovt_ds"] = fp.osm.map(m.ds)
    ov[["id", "ds", "height", "num_floors", "class", "osm_rec"]].assign(area_m2=ov.area).to_csv(out + f"{box}_overture_in_box.csv", index=False)

# Union and summaries
fp["h_union"] = fp.h_osm.combine_first(fp.h_ovt).combine_first(fp.h_google)
big = fp.area_m2 > 500


def share(mask, sub=None):
    s = fp if sub is None else fp[sub]
    mk = mask if sub is None else mask[sub]
    return {"count": int(mk.sum()), "of": int(len(s)), "pct_count": round(100 * mk.sum() / len(s), 1),
            "pct_area": round(100 * s.area_m2[mk].sum() / s.area_m2.sum(), 1)}


masks = {"osm_height_tag": fp.h_osm_tag.notna(), "osm_part_height": fp.h_osm_part.notna(),
         "osm_levels": fp.h_osm_lv.notna(), "osm_any": fp.h_osm.notna(), "overture_any": fp.h_ovt.notna(),
         "google_2p5d": fp.g_ok.fillna(False).astype(bool), "google_capped_at_100": fp.g_capped.fillna(False).astype(bool),
         "union_all": fp.h_union.notna(), "union_osm_overture": fp.h_osm.notna() | fp.h_ovt.notna()}
res = {"box": box, "levels_factor_m": round(fac, 2), "levels_factor_n": int(ok.sum()), "levels_ratio_pairs": int(len(both)),
       "unparsed_tags_in_extract": unparsed, "n_footprints": int(len(fp)), "n_footprints_gt500": int(big.sum()),
       "area_m2_total": round(float(fp.area_m2.sum())), "area_m2_gt500": round(float(fp.area_m2[big].sum())),
       "n_parts_in_extract": int(len(parts)), "osm_src_counts": fp.osm_src.value_counts().to_dict(),
       "coverage_all": {k: share(v) for k, v in masks.items()},
       "coverage_gt500": {k: share(v, big) for k, v in masks.items()},
       "footprint_completeness": completeness, "overture": ovt_summary}

# Overlap between sources
o, gg, ov_ = masks["osm_any"], masks["google_2p5d"], masks["overture_any"]
res["overlap"] = {"osm_and_google": int((o & gg).sum()), "osm_only": int((o & ~gg).sum()),
                  "google_only": int((~o & gg).sum()), "neither": int((~o & ~gg).sum()),
                  "overture_and_not_osm": int((ov_ & ~o).sum())}

# Agreement on matched footprints: OSM height tag (direct) against Google p90 and p50, and Overture.
def agree(a, b, sub):
    d = (fp.loc[sub, a] - fp.loc[sub, b]).dropna()
    if not len(d):
        return None
    return {"n": int(len(d)), "median_abs_diff_m": round(float(d.abs().median()), 1),
            "median_signed_diff_m": round(float(d.median()), 1), "mean_abs_diff_m": round(float(d.abs().mean()), 1)}


tag = fp.h_osm_tag.notna() & fp.g_ok.fillna(False).astype(bool)
fp["g_p50_ok"] = np.where(fp.g_ok, fp.g_p50, np.nan)
res["agreement"] = {
    "osm_tag_vs_google_p90_all": agree("h_osm_tag", "h_google", tag),
    "osm_tag_vs_google_p90_osm_le_100": agree("h_osm_tag", "h_google", tag & (fp.h_osm_tag <= 100)),
    "osm_tag_vs_google_p90_osm_gt_100": agree("h_osm_tag", "h_google", tag & (fp.h_osm_tag > 100)),
    "osm_tag_vs_google_p50_osm_le_100": agree("h_osm_tag", "g_p50_ok", tag & (fp.h_osm_tag <= 100)),
    "osm_levels_vs_google_p90_osm_le_100": agree("h_osm_lv", "h_google", fp.h_osm_lv.notna() & fp.g_ok.fillna(False).astype(bool) & (fp.h_osm_lv <= 100)),
    "osm_tag_vs_levels_x_factor": agree("h_osm_tag", "h_osm_lv", fp.h_osm_tag.notna() & fp.h_osm_lv.notna()),
    "osm_tag_vs_overture": agree("h_osm_tag", "h_ovt", fp.h_osm_tag.notna()),
}

# Tall towers and the 100 m cap
t = fp[fp.h_osm_tag > 100]
res["towers_over_100m_osm_tag"] = {"n": int(len(t)), "google_reads_capped": int(t.g_capped.fillna(False).sum()),
                                   "google_p90_median": round(float(t.h_google.median()), 1) if len(t) else None,
                                   "area_m2": round(float(t.area_m2.sum()))}
res["google_capped_footprints"] = {"n": int(masks["google_capped_at_100"].sum()),
                                   "area_m2": round(float(fp.area_m2[masks["google_capped_at_100"]].sum()))}

# Fallback rule: area-class median from footprints with OSM tag height, scored by leave-one-out MAE.
bins = [0, 100, 500, 2000, 1e9]
labels = ["<100", "100-500", "500-2000", ">2000"]
fp["abin"] = pd.cut(fp.area_m2, bins, labels=labels)
known = fp[fp.h_osm_tag.notna()]
med = known.groupby("abin", observed=False).h_osm_tag.median()
cnt = known.groupby("abin", observed=False).h_osm_tag.size()
loo = []
for b in labels:
    v = known[known.abin == b].h_osm_tag.values
    for i in range(len(v)):
        rest = np.delete(v, i)
        if len(rest):
            loo.append(abs(v[i] - np.median(rest)))
res["fallback_area_rule"] = {"median_h_by_area_bin": {k: (round(float(med[k]), 1) if pd.notna(med[k]) else None) for k in labels},
                             "n_by_bin": {k: int(cnt[k]) for k in labels},
                             "loo_mae_m": round(float(np.mean(loo)), 1), "loo_median_ae_m": round(float(np.median(loo)), 1)}
g_err = (known.h_osm_tag - known.h_google).abs().dropna()
res["fallback_compare_google_mae_m"] = round(float(g_err.mean()), 1) if len(g_err) else None
nores = fp.h_osm.isna() & fp.h_ovt.isna()
nog = nores & ~masks["google_2p5d"]
res["guesswork"] = {
    "no_osm_no_overture_pct_area": round(100 * fp.area_m2[nores].sum() / fp.area_m2.sum(), 1),
    "no_osm_no_overture_pct_area_gt500": round(100 * fp.area_m2[nores & big].sum() / fp.area_m2[big].sum(), 1),
    "no_source_at_all_pct_area": round(100 * fp.area_m2[nog].sum() / fp.area_m2.sum(), 1),
    "no_source_at_all_pct_area_gt500": round(100 * fp.area_m2[nog & big].sum() / fp.area_m2[big].sum(), 1),
    "google_only_capped_pct_area": round(100 * fp.area_m2[nores & masks["google_capped_at_100"]].sum() / fp.area_m2.sum(), 1),
}
cols = ["osm", "name", "building", "area_m2", "h_osm_tag", "h_osm_part", "h_osm_lv", "h_osm", "osm_src",
        "g_npx", "g_p50", "g_p90", "g_max", "g_pres", "g_ok", "g_capped", "h_ovt", "h_union"]
fp[cols].to_csv(out + f"{box}_footprints.csv", index=False)
json.dump(res, open(out + f"{box}_summary.json", "w"), indent=1, default=str)
print(json.dumps(res, indent=1, default=str))
