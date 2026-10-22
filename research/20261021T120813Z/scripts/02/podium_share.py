"""Count OSM-rule heights that are podium heights (a building:part is over 5 m taller). Usage: python3 -I podium_share.py FOOTPRINTS_CSV OSM_JSONL FACTOR"""
import json
import re
import sys

import pandas as pd

fp = pd.read_csv(sys.argv[1])
fac = float(sys.argv[3])
lv = {}
for line in open(sys.argv[2]):
    r = json.loads(line)
    m = re.match(r"^\s*(\d+(?:\.\d+)?)\s*$", r["tags"].get("building:levels") or "")
    if m and 0 < float(m.group(1)) <= 120:
        lv[f"{r['osm_type'][0]}{r['osm_id']}"] = float(m.group(1))
rule = fp.h_osm_tag.combine_first(fp.osm.map(lv) * fac)
pod = fp.h_osm_part > rule + 5
big = fp.area_m2 > 500
print(json.dumps({"osm_rule_heights": int(rule.notna().sum()), "podium": int(pod.sum()), "podium_gt500": int((pod & big).sum()),
                  "podium_pct_area_all": round(100 * fp.area_m2[pod].sum() / fp.area_m2.sum(), 1),
                  "podium_pct_area_gt500": round(100 * fp.area_m2[pod & big].sum() / fp.area_m2[big].sum(), 1),
                  "podium_median_gap_m": round(float((fp.h_osm_part - rule)[pod].median()), 1)}, indent=1))
