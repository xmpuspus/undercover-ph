"""Read the Geofabrik Philippines extract once and keep Metro Manila shelter-relevant objects.
Usage: venv/bin/python -I extract_ncr.py PBF OUT_DIR
Metro Manila box: lat 14.35-14.80, lon 120.90-121.20. A way is kept when any node lies in the box
(same rule as the Overpass bbox filter used by the earlier attempts).
Writes OUT_DIR/ncr_ways.jsonl and OUT_DIR/ncr_nodes.jsonl. Relations are not read."""
import json
import sys
from pathlib import Path

import osmium

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pedestrian_access import node_blocks_public, read_node_rules, static_public_walkable

S, W, N, E = 14.35, 120.90, 14.80, 121.20
KEYS = ("covered", "tunnel", "indoor", "bridge", "layer", "opening_hours", "level", "building", "amenity", "man_made", "shelter")


def walkable(t):
    return static_public_walkable(t)


class H(osmium.SimpleHandler):
    def __init__(self, fw, fn, blocked):
        super().__init__()
        self.fw, self.fn = fw, fn
        self.nw = self.nn = self.seen = 0
        self.blocked = blocked

    def node(self, n):
        if not n.tags:
            return
        if not (S <= n.location.lat <= N and W <= n.location.lon <= E):
            return
        t = {k: v for k, v in n.tags}
        keep = (
            t.get("amenity") == "shelter"
            or (t.get("highway") == "bus_stop" and "shelter" in t)
            or t.get("railway") in ("station", "subway_entrance", "stop")
            or t.get("public_transport") in ("station", "stop_position", "platform")
            or t.get("entrance") is not None and "opening_hours" in t
            or t.get("man_made") == "canopy"
            or any(k in t for k in ("barrier", "access", "foot", "opening_hours", "locked"))
            or any(k.endswith(":conditional") for k in t)
        )
        if keep:
            self.nn += 1
            self.fn.write(json.dumps({"id": n.id, "lat": n.location.lat, "lon": n.location.lon, "tags": t}) + "\n")

    def way(self, w):
        self.seen += 1
        tg = w.tags
        if not tg:
            return
        hw = tg.get("highway")
        interesting = any(tg.get(k) is not None for k in KEYS) or hw is not None
        if not interesting:
            return
        t = {k: v for k, v in tg}
        walk = walkable(t)
        special = any(k in t for k in ("covered", "tunnel", "indoor", "layer", "opening_hours")) or t.get("bridge") not in (None, "no") \
            or t.get("building") == "roof" or t.get("amenity") == "shelter" or t.get("man_made") == "canopy"
        if not (walk or special):
            return
        pts = []
        inbox = False
        try:
            for nd in w.nodes:
                la, lo = nd.location.lat, nd.location.lon
                pts.append((nd.ref, round(la, 7), round(lo, 7)))
                if S <= la <= N and W <= lo <= E:
                    inbox = True
        except osmium.InvalidLocationError:
            return
        if not inbox:
            return
        if any(p[0] in self.blocked for p in pts):
            walk = False
        rec = {"id": w.id, "walk": walk, "pts": pts}
        rec["tags"] = t
        self.nw += 1
        self.fw.write(json.dumps(rec) + "\n")


def main(pbf, out):
    nodes = read_node_rules(pbf)
    blocked = {nid for nid, (_, _, tags) in nodes.items() if node_blocks_public(tags)}
    with open(out + "/ncr_ways.jsonl", "w") as fw, open(out + "/ncr_nodes.jsonl", "w") as fn:
        h = H(fw, fn, blocked)
        h.apply_file(pbf, locations=True, idx="flex_mem")
        print("ways seen", h.seen, "ways kept", h.nw, "nodes kept", h.nn)


if __name__ == "__main__":
    main(*sys.argv[1:3])
