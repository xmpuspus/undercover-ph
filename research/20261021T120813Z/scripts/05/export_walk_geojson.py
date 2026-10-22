"""Export walkable OSM ways as GeoJSON lines, for an overlay tile size test with tippecanoe.

Usage: venv/bin/python -I export_walk_geojson.py <pbf> <ncr_geojson_json> <region> <out.geojsonseq>
region: ncr or makati_cbd. Same walk filter and centroid rule as extract_walk_graph.py.
Properties: way id, highway, and the shelter flag bits from extract_walk_graph.FLAG_BITS.
"""

import json
import os
import sys

import osmium
from shapely.geometry import Point, shape
from shapely.prepared import prep

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract_walk_graph import BOXES, FLAG_BITS, classify, walkable  # noqa: E402
from pedestrian_access import node_blocks_public, read_node_rules, requires_access_evaluation, rule_tags


def main(pbf, ncr_json, region, out):
    ncr = prep(shape(json.load(open(ncr_json))[0]["geojson"]))
    box = BOXES.get(region)
    n = 0
    nodes = read_node_rules(pbf)
    blocked = {nid for nid, (_, _, tags) in nodes.items() if node_blocks_public(tags)}
    fp = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter("highway"))
    )
    with open(out, "w") as fh:
        for w in fp:
            tags = dict(w.tags)
            if not walkable(tags):
                continue
            if any(nd.ref in blocked for nd in w.nodes):
                continue
            try:
                coords = [(round(nd.lon, 7), round(nd.lat, 7)) for nd in w.nodes]
            except osmium.InvalidLocationError:
                continue
            if len(coords) < 2:
                continue
            clon = sum(c[0] for c in coords) / len(coords)
            clat = sum(c[1] for c in coords) / len(coords)
            if box and not (box[0] <= clat <= box[2] and box[1] <= clon <= box[3]):
                continue
            if not ncr.contains(Point(clon, clat)):
                continue
            bits = sum(FLAG_BITS[f] for f in classify(tags))
            needs_eval = requires_access_evaluation(tags) or any(
                requires_access_evaluation(nodes[nd.ref][2]) for nd in w.nodes if nd.ref in nodes)
            if needs_eval:
                bits |= FLAG_BITS["access_evaluation_needed"]
            feat = {"type": "Feature", "id": w.id,
                    "properties": {"hw": tags.get("highway"), "f": bits,
                                   "requires_access_evaluation": needs_eval, "rules": rule_tags(tags)},
                    "geometry": {"type": "LineString", "coordinates": coords}}
            fh.write(json.dumps(feat, separators=(",", ":")) + "\n")
            n += 1
    print(json.dumps({"region": region, "features": n, "bytes": os.path.getsize(out)}))


if __name__ == "__main__":
    main(*sys.argv[1:5])
