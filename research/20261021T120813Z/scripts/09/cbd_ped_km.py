import json, math, collections
d = json.load(open("raw/05/osm_makati_cbd.json"))
nodes = {e["id"]: (e["lat"], e["lon"]) for e in d["elements"] if e["type"] == "node"}
def km(w):
    pts = [nodes[n] for n in w["nodes"] if n in nodes] if "nodes" in w else [(g["lat"], g["lon"]) for g in w.get("geometry", [])]
    s = 0
    for (a, b), (c, e) in zip(pts, pts[1:]):
        s += math.hypot((c - a) * 111.32, (e - b) * 111.32 * math.cos(math.radians(a)))
    return s
tot = collections.Counter()
for w in d["elements"]:
    if w["type"] != "way": continue
    t = w.get("tags", {})
    h = t.get("highway")
    if h in ("footway", "pedestrian", "steps", "corridor", "path"):
        k = "crossing" if t.get("footway") == "crossing" else ("sidewalk" if t.get("footway") == "sidewalk" else h)
        tot[k] += km(w)
        tot["ALL"] += km(w)
    elif h in ("residential","primary","secondary","tertiary","unclassified","service","trunk","living_street"):
        tot["road:"+h] += km(w)
for k, v in sorted(tot.items()): print(k, round(v, 2))
