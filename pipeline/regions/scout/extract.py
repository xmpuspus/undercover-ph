"""Pass 1 of the city scout: one read of the national OSM extract, saved as numpy arrays.

Usage: pipeline/.venv/bin/python -I pipeline/regions/scout/extract.py [pbf] [out.npz]
Default pbf: research/20261021T120813Z/raw/05/pbf/philippines-261020.osm.pbf (md5 941dd405...).

Saves, for the whole country:
  seg_*   one row per walkable way segment: midpoint, length in metres, covered flag.
          Walkable = access_policy / pedestrian_access.static_public_walkable on the raw tags,
          and no node of the way is blocked (node_blocks_public). Same test as build_graph.py.
          Covered = a pedestrian-class way (footway, path, pedestrian, steps, corridor) with
          covered=yes/arcade/colonnade/roof, or indoor=yes/corridor, highway=corridor, tunnel=building_passage.
          Same rule as contract_flags() bits 0 and 2 in build_graph.py.
  bld_*   one row per closed building way: centroid, 1 if height or building:levels parses.
          Building relations (multipolygons) are not read. They are a small share of footprints.
  plc_*   one row per named feature that build_places.category() accepts (nodes and closed ways).
          Bus stops, platforms and stop positions are dropped, as in build_places.make_place().
          kind: 1 university or college, 2 mall, 3 transit hub (bus station, rail station), 0 other.
  twn_*   place=city/town/suburb/village nodes, for naming.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "pipeline"))
import numpy as np  # noqa: E402
import osmium  # noqa: E402
from access_policy import node_walker_tags  # noqa: E402
from build_places import category  # noqa: E402
from common import haversine, parse_height, parse_levels  # noqa: E402
from pedestrian_access import PEDESTRIAN, node_blocks_public, static_public_walkable  # noqa: E402

PBF = ROOT / "research/20261021T120813Z/raw/05/pbf/philippines-261020.osm.pbf"
NODE_KEYS = ("access", "foot", "barrier", "locked")
COVER_VALUES = ("yes", "arcade", "colonnade", "roof")
MAJOR_PLACES = {"city", "town", "suburb", "village", "quarter"}


def kind_of(t, cat):
    if t.get("amenity") in ("university", "college"):
        return 1
    if cat == "mall":
        return 2
    if cat in ("station", "bus_station"):
        return 3
    return 0


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.blocked = set()
        self.seg = []
        self.bld = []
        self.plc = []
        self.plc_names = []
        self.twn = []
        self.twn_names = []
        self.n_ways = 0

    def add_place(self, t, lon, lat, closed):
        if "name" not in t:
            return
        cat = category(t, closed)
        if not cat or t.get("highway") == "bus_stop" or t.get("public_transport") in ("platform", "stop_position"):
            return
        self.plc.append((lon, lat, kind_of(t, cat)))
        self.plc_names.append(t["name"])

    def node(self, n):
        if not n.tags:
            return
        t = {x.k: x.v for x in n.tags}
        if any(k in t for k in NODE_KEYS) and node_blocks_public(node_walker_tags(t)):
            self.blocked.add(n.id)
        if t.get("place") in MAJOR_PLACES and "name" in t:
            self.twn.append((n.location.lon, n.location.lat, {"city": 0, "town": 1, "suburb": 2, "village": 3, "quarter": 4}[t["place"]]))
            self.twn_names.append(t["name"])
        if "name" in t:
            self.add_place(t, n.location.lon, n.location.lat, False)

    def way(self, w):
        if not w.tags:
            return
        t = {x.k: x.v for x in w.tags}
        hw = t.get("highway")
        pts = None
        if hw and static_public_walkable(t):
            pts = [(n.ref, n.lon, n.lat) for n in w.nodes if n.location.valid()]
            if len(pts) >= 2 and not any(r in self.blocked for r, _, _ in pts):
                cov = 0
                if hw in PEDESTRIAN:
                    if t.get("covered") in COVER_VALUES or t.get("indoor") in ("yes", "corridor") \
                            or hw == "corridor" or t.get("tunnel") == "building_passage":
                        cov = 1
                for i in range(1, len(pts)):
                    a, b = pts[i - 1], pts[i]
                    self.seg.append(((a[1] + b[1]) / 2, (a[2] + b[2]) / 2, haversine(a[2], a[1], b[2], b[1]), cov))
        closed = w.is_closed() and len(w.nodes) >= 4
        is_b = t.get("building", "no") != "no"
        if closed and (is_b or "name" in t):
            pts = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
            if pts:
                lon = sum(p[0] for p in pts) / len(pts)
                lat = sum(p[1] for p in pts) / len(pts)
                if is_b:
                    tagged = 1 if (parse_height(t.get("height")) is not None or parse_levels(t.get("building:levels")) is not None) else 0
                    self.bld.append((lon, lat, tagged))
                if "name" in t:
                    self.add_place(t, lon, lat, True)


def main():
    pbf = Path(sys.argv[1]) if len(sys.argv) > 1 else PBF
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parent / "cache" / "national.npz"
    out.parent.mkdir(parents=True, exist_ok=True)
    h = H()
    h.apply_file(str(pbf), locations=True)
    seg = np.array(h.seg, dtype="f8").reshape(-1, 4)
    bld = np.array(h.bld, dtype="f8").reshape(-1, 3)
    plc = np.array(h.plc, dtype="f8").reshape(-1, 3)
    twn = np.array(h.twn, dtype="f8").reshape(-1, 3)
    np.savez_compressed(out, seg=seg, bld=bld, plc=plc, twn=twn,
                        plc_names=np.array(h.plc_names, dtype=object), twn_names=np.array(h.twn_names, dtype=object))
    print({"segments": len(seg), "walk_km": round(seg[:, 2].sum() / 1000, 1), "buildings": len(bld),
           "places": len(plc), "towns": len(twn), "blocked_nodes": len(h.blocked)})


if __name__ == "__main__":
    main()
