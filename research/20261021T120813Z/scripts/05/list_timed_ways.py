"""List walkable Makati CBD ways that carry opening_hours or a :conditional tag.

Usage: venv/bin/python -I list_timed_ways.py <pbf> <out_json>
"""

import json
import sys

import osmium

S, W, N, E = 14.548, 121.012, 14.562, 121.032


def main(pbf, out):
    rows = []
    fp = (
        osmium.FileProcessor(pbf, osmium.osm.NODE | osmium.osm.WAY)
        .with_locations()
        .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY))
        .with_filter(osmium.filter.KeyFilter("highway"))
    )
    for w in fp:
        tags = dict(w.tags)
        timed = {k: v for k, v in tags.items() if k == "opening_hours" or k.endswith(":conditional")}
        if not timed:
            continue
        try:
            lats = [n.lat for n in w.nodes]
            lons = [n.lon for n in w.nodes]
        except osmium.InvalidLocationError:
            continue
        clat, clon = sum(lats) / len(lats), sum(lons) / len(lons)
        if not (S <= clat <= N and W <= clon <= E):
            continue
        rows.append({
            "way": w.id,
            "highway": tags.get("highway"),
            "name": tags.get("name"),
            "covered": tags.get("covered"),
            "indoor": tags.get("indoor"),
            "level": tags.get("level"),
            **timed,
        })
    json.dump(rows, open(out, "w"), indent=1)
    values = {}
    for r in rows:
        v = r.get("opening_hours") or next((r[k] for k in r if k.endswith(":conditional")), None)
        values[v] = values.get(v, 0) + 1
    print(json.dumps({"ways": len(rows), "distinct_values": len(values),
                      "top_values": sorted(values.items(), key=lambda x: -x[1])[:12]}, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:3])
