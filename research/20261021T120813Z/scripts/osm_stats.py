import json, re, sys
R = "research/20261021T120813Z/raw/02/"
num = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*(m)?\s*$")
out = {}
for n in sys.argv[1:]:
    d = json.load(open(R + f"overpass_{n}.json"))
    els = d["elements"]
    N = len(els)
    h = [e for e in els if "height" in e.get("tags", {})]
    lv = [e for e in els if "building:levels" in e.get("tags", {})]
    both = [e for e in h if "building:levels" in e["tags"]]
    either = {id(e) for e in h} | {id(e) for e in lv}
    hv = []
    bad = 0
    for e in h:
        m = num.match(e["tags"]["height"])
        if m: hv.append(float(m.group(1)))
        else: bad += 1
    lvv = []
    for e in lv:
        m = num.match(e["tags"]["building:levels"])
        if m: lvv.append(float(m.group(1)))
    btype = {}
    for e in els:
        t = e["tags"]["building"]; btype[t] = btype.get(t, 0) + 1
    top = sorted(btype.items(), key=lambda x: -x[1])[:5]
    pct = lambda a: round(100 * a / N, 1) if N else None
    out[n] = dict(osm_base=d.get("osm3s", {}).get("timestamp_osm_base"), n=N,
        height=len(h), height_pct=pct(len(h)), levels=len(lv), levels_pct=pct(len(lv)),
        both=len(both), either=len(either), either_pct=pct(len(either)),
        height_unparsed=bad, height_max=max(hv) if hv else None,
        height_median=sorted(hv)[len(hv)//2] if hv else None,
        levels_max=max(lvv) if lvv else None, top_types=top,
        names_with_height=[(e["tags"].get("name"), e["tags"]["height"]) for e in h][:15])
print(json.dumps(out, indent=1))
