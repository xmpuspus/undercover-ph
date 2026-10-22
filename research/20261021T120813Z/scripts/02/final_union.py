"""Union for one box: OSM height, else building:levels x factor, else Google 2.5D zonal median.

Usage: python3 -I final_union.py FOOTPRINTS_CSV OSM_JSONL SUMMARY_JSON
Google value = zonal median (p50) of building_height inside the footprint at 0.5 m.
Google usable = at least 8 pixels and p50 >= 2.5 m. Google at cap = p90 >= 95 m (raster max 99.5 m).
"""
import json
import re
import sys

import pandas as pd

fp = pd.read_csv(sys.argv[1])
fac = json.load(open(sys.argv[3]))["levels_factor_m"]
lv = {}
for line in open(sys.argv[2]):
    r = json.loads(line)
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*$", r["tags"].get("building:levels") or "")
    if m and 0 < float(m.group(1)) <= 120:
        lv[f"{r['osm_type'][0]}{r['osm_id']}"] = float(m.group(1))
fp["lv_outline"] = fp.osm.map(lv)
fp["h_osm_rule"] = fp.h_osm_tag.combine_first(fp.lv_outline * fac)
fp["g_use"] = (fp.g_npx >= 8) & (fp.g_p50 >= 2.5)
fp["g_cap"] = fp.g_npx.ge(8) & (fp.g_p90 >= 95)
fp["h_final"] = fp.h_osm_rule.combine_first(fp.g_p50.where(fp.g_use))
big = fp.area_m2 > 500


def share(mask, sub):
    s, k = fp[sub], mask[sub]
    return {"count": int(k.sum()), "of": int(len(s)), "pct_count": round(100 * k.sum() / len(s), 1),
            "pct_area": round(100 * s.area_m2[k].sum() / s.area_m2.sum(), 1)}


allr = pd.Series(True, index=fp.index)
osm, goo, uni = fp.h_osm_rule.notna(), fp.g_use, fp.h_final.notna()
tall = (fp.h_osm_rule > 100) | (fp.h_osm_part > 100) | fp.g_cap
res = {"levels_factor_m": fac, "google_stat": "zonal median (p50) at 0.5 m, usable if >=8 px and p50 >= 2.5 m",
       "osm_rule": {"all": share(osm, allr), "gt500": share(osm, big)},
       "google": {"all": share(goo, allr), "gt500": share(goo, big)},
       "union": {"all": share(uni, allr), "gt500": share(uni, big)},
       "union_source_counts": {"osm": int(osm.sum()), "google_fill": int((~osm & goo).sum()), "none": int((~uni).sum())},
       "tall_over_100m_any_signal": int(tall.sum()),
       "tall_no_osm_rule_height": int((tall & ~osm).sum()),
       "tall_no_osm_rule_height_but_part": int((tall & ~osm & fp.h_osm_part.notna()).sum()),
       "tall_no_osm_height_at_all": int((tall & ~osm & fp.h_osm_part.isna()).sum()),
       "google_cap_no_osm_rule": int((fp.g_cap & ~osm).sum()),
       "google_cap_total": int(fp.g_cap.sum()),
       "osm_rule_gt100": int((fp.h_osm_rule > 100).sum()),
       "osm_rule_gt100_google_p90_below": int(((fp.h_osm_rule > 100) & (fp.g_p90 < fp.h_osm_rule)).sum()),
       "osm_outline_below_part_by_5m": int((fp.h_osm_part > fp.h_osm_rule + 5).sum()),
       "no_height_area_pct": round(100 * fp.area_m2[~uni].sum() / fp.area_m2.sum(), 1),
       "no_height_area_pct_gt500": round(100 * fp.area_m2[~uni & big].sum() / fp.area_m2[big].sum(), 1)}
cols = ["osm", "name", "area_m2", "h_osm_tag", "lv_outline", "h_osm_part", "h_osm_rule", "g_p50", "g_p90"]
res["tall_no_osm_rule_rows"] = fp[tall & ~osm][cols].round(1).to_dict("records")
print(json.dumps(res, indent=1, default=str))
