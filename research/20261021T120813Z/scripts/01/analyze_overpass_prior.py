import json, sys, math, statistics, datetime, collections, glob, os
RAW = sys.argv[1]
OUT = sys.argv[2]
NAMES = ["makati", "bgc", "ortigas", "updiliman", "manila", "cubao"]
BBOX = {
 "makati": (14.548,121.012,14.562,121.032), "bgc": (14.545,121.040,14.560,121.058),
 "ortigas": (14.578,121.053,14.592,121.067), "updiliman": (14.647,121.055,14.664,121.075),
 "manila": (14.575,120.970,14.595,120.990), "cubao": (14.615,121.048,14.625,121.060),
}
PED = ("footway", "pedestrian", "path", "steps")
ROAD = ("trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
        "tertiary", "tertiary_link", "unclassified", "residential", "service")


def hav(a, b):
    r = 6371008.8
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp = p2 - p1
    dl = math.radians(b["lon"] - a["lon"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def wlen(w):
    g = w.get("geometry") or []
    s = 0.0
    for a, b in zip(g, g[1:]):
        if a and b:
            s += hav(a, b)
    return s / 1000.0


def ts(w):
    return datetime.datetime.fromisoformat(w["timestamp"].replace("Z", "+00:00"))


def med(lst):
    if not lst:
        return None
    lst = sorted(lst)
    return lst[len(lst) // 2] if len(lst) % 2 else lst[len(lst) // 2 - 1] + (lst[len(lst) // 2] - lst[len(lst) // 2 - 1]) / 2


res = {}
for i, k in enumerate(NAMES, 1):
    try:
        d = json.load(open(f"{RAW}/{i:02d}-{k}-network-response.json"))
    except ValueError:
        print(k, "response is not JSON (HTTP 502 text), skipped"); continue
    els = d["elements"]
    ways = [e for e in els if e["type"] == "way"]
    nodes = [e for e in els if e["type"] == "node"]
    r = collections.OrderedDict()
    r["osm_base"] = d.get("osm3s", {}).get("timestamp_osm_base")
    r["ways_total_highway"] = len(ways)
    r["ways_with_null_geom_points"] = sum(1 for w in ways if any(p is None for p in (w.get("geometry") or [])))
    km = collections.Counter(); cnt = collections.Counter()
    sub = collections.Counter(); subc = collections.Counter()
    covered_km = 0.0; covered_n = 0
    ped_ways = []
    for w in ways:
        t = w.get("tags", {}); h = t.get("highway")
        if h in PED:
            L = wlen(w); km[h] += L; cnt[h] += 1; ped_ways.append(w)
            if h == "footway":
                f = t.get("footway", "(none)")
                sub[f] += L; subc[f] += 1
            if t.get("covered") == "yes" or t.get("tunnel") == "building_passage":
                covered_km += L; covered_n += 1
    r["ped_km"] = {h: round(km[h], 3) for h in PED}
    r["ped_ways"] = {h: cnt[h] for h in PED}
    r["ped_km_total"] = round(sum(km.values()), 3)
    r["footway_subtag_km"] = {f: round(v, 3) for f, v in sorted(sub.items(), key=lambda x: -x[1])}
    r["footway_subtag_ways"] = dict(subc)
    r["sidewalk_plus_crossing_km"] = round(sub.get("sidewalk", 0) + sub.get("crossing", 0), 3)
    r["ped_covered_km"] = round(covered_km, 3)
    r["ped_covered_ways"] = covered_n
    fb = [w for w in ped_ways if w["tags"].get("highway") == "footway" and w["tags"].get("bridge") not in (None, "no")]
    r["footbridges_footway_bridge_yes"] = sum(1 for w in fb if w["tags"].get("bridge") == "yes")
    r["footbridges_any_bridge_value"] = len(fb)
    r["footbridge_km"] = round(sum(wlen(w) for w in fb), 3)
    ug = [w for w in ped_ways if w["tags"].get("highway") == "footway" and w["tags"].get("tunnel") == "yes"]
    r["underpass_footway_tunnel_yes"] = len(ug)
    r["underpass_km"] = round(sum(wlen(w) for w in ug), 3)
    r["footway_tunnel_building_passage"] = sum(1 for w in ped_ways if w["tags"].get("tunnel") == "building_passage")
    r["steps_ways"] = cnt["steps"]
    r["crossing_ways_footway_crossing"] = subc.get("crossing", 0)
    cn = [n for n in nodes if n.get("tags", {}).get("highway") == "crossing"]
    r["crossing_nodes"] = len(cn)
    r["crossing_node_types"] = dict(collections.Counter(n["tags"].get("crossing", "(none)") for n in cn))
    r["elevator_nodes"] = sum(1 for n in nodes if n.get("tags", {}).get("highway") == "elevator")
    r["elevator_ways"] = sum(1 for w in ways if w.get("tags", {}).get("highway") == "elevator")
    # roads
    rk = collections.Counter(); rc = collections.Counter()
    any_k = 0.0; real_k = 0.0; sep_k = 0.0; no_k = 0.0; tot = 0.0
    for w in ways:
        t = w.get("tags", {})
        if t.get("highway") not in ROAD:
            continue
        L = wlen(w); tot += L; rk[t["highway"]] += L; rc[t["highway"]] += 1
        sw = {kk: v for kk, v in t.items() if kk == "sidewalk" or kk.startswith("sidewalk:")}
        # sidewalk:both:surface etc. are attribute keys that imply a sidewalk; keep them in "any key"
        if sw:
            any_k += L
            main = [v for kk, v in sw.items() if kk in ("sidewalk", "sidewalk:left", "sidewalk:right", "sidewalk:both")]
            if main and all(v in ("no", "none") for v in main):
                no_k += L
            elif any(v in ("both", "left", "right", "yes", "separate") for v in main) or (not main):
                real_k += L
            if any(v == "separate" for v in main):
                sep_k += L
    r["road_km_total"] = round(tot, 3)
    r["road_km_by_class"] = {h: round(rk[h], 3) for h in ROAD if rk[h]}
    r["road_ways"] = sum(rc.values())
    r["road_km_any_sidewalk_key"] = round(any_k, 3)
    r["road_share_any_sidewalk_key"] = round(any_k / tot, 3) if tot else None
    r["road_km_sidewalk_present_value"] = round(real_k, 3)
    r["road_share_sidewalk_present_value"] = round(real_k / tot, 3) if tot else None
    r["road_km_sidewalk_no_or_none"] = round(no_k, 3)
    r["road_km_sidewalk_separate"] = round(sep_k, 3)
    # freshness
    fts = [ts(w) for w in ped_ways if w["tags"].get("highway") == "footway"]
    ats = [ts(w) for w in ped_ways]
    m = med([t.timestamp() for t in fts])
    r["footway_ways_n"] = len(fts)
    r["footway_median_ts"] = datetime.datetime.fromtimestamp(m, datetime.timezone.utc).date().isoformat() if m else None
    m2 = med([t.timestamp() for t in ats])
    r["ped_all_median_ts"] = datetime.datetime.fromtimestamp(m2, datetime.timezone.utc).date().isoformat() if m2 else None
    if fts:
        yrs = collections.Counter(t.year for t in fts)
        r["footway_ts_by_year"] = dict(sorted(yrs.items()))
        r["footway_share_edited_since_2024"] = round(sum(1 for t in fts if t.year >= 2024) / len(fts), 3)
    # bbox area
    s, w_, n, e = BBOX[k]
    area = hav({"lat": s, "lon": w_}, {"lat": n, "lon": w_}) * hav({"lat": s, "lon": w_}, {"lat": s, "lon": e}) / 1e6
    r["bbox_area_km2"] = round(area, 3)
    r["ped_km_per_km2"] = round(r["ped_km_total"] / area, 2)
    r["ped_km_per_road_km"] = round(r["ped_km_total"] / tot, 3) if tot else None
    res[k] = r
    # landmarks
    lf = f"{RAW}/{i+6:02d}-{k}-landmarks-response.json"
    if os.path.exists(lf):
        ld = json.load(open(lf))
        names = sorted({e["tags"]["name"] for e in ld["elements"] if "tags" in e and "name" in e["tags"]})
        r["landmark_name_count"] = len(names)
        r["landmark_names"] = names[:60]
json.dump(res, open(OUT, "w"), indent=1)
for k, r in res.items():
    print(k, json.dumps({x: r[x] for x in ("ped_km_total", "road_km_total", "road_share_any_sidewalk_key", "footway_median_ts", "crossing_nodes", "footbridges_footway_bridge_yes")}))
