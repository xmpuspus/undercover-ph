"""List the Google Open Buildings 2.5D Temporal manifests and fetch the 2023 ones for the Philippine UTM zones.

Usage: pipeline/.venv/bin/python -I pipeline/regions/fetch_gob_manifests.py [lon,lat ...]
The bucket gs://open-buildings-temporal-data is public. The GCS JSON API lists v1/manifests/ with no account.
A manifest name is <S2 cell token>_EPSG_<code>_<date>.json. The script keeps the 2023_06_30 manifests for
EPSG:32650 and EPSG:32651 and downloads those that the research folder lacks.
It then prints the manifest and tile under each district centre in pipeline/regions/districts.json and
under each lon,lat argument, so a new city shows whether it has Google heights.
Writes pipeline/raw/regions/gob_manifests/listing.json, fetch_log.json and the manifests.
curl does the HTTP work, as in fetch_weather.py.
"""
import json
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import region  # noqa: E402

LIST_URL = "https://storage.googleapis.com/storage/v1/b/open-buildings-temporal-data/o"
OBJ_URL = "https://storage.googleapis.com/open-buildings-temporal-data/"
RESEARCH = region.ROOT / "research/20261021T120813Z/raw/02/gob_temporal_manifest"
ZONES = ("EPSG_32650", "EPSG_32651")
YEAR = "2023_06_30"


def curl(url, out=None):
    cmd = ["curl", "-sS", "-L", "--fail", "--max-time", "300", url]
    if out:
        cmd[1:1] = ["-o", str(out)]
    return subprocess.run(cmd, capture_output=True, check=True).stdout


def listing():
    items, token = [], None
    while True:
        q = {"prefix": "v1/manifests/", "maxResults": "1000", "fields": "nextPageToken,items(name,size,updated)"}
        if token:
            q["pageToken"] = token
        page = json.loads(curl(LIST_URL + "?" + urllib.parse.urlencode(q)))
        items += page.get("items", [])
        token = page.get("nextPageToken")
        if not token:
            return items


def manifest_paths():
    out = {p.name: p for p in sorted(RESEARCH.glob(f"*_{YEAR}.json"))}
    for p in sorted(region.GOB_MANIFESTS.glob(f"*_{YEAR}.json")):
        out.setdefault(p.name, p)
    return out


def tiles(paths):
    rows = []
    for name, p in paths.items():
        m = json.load(open(p))
        for ts in m["tilesets"]:
            for s in ts["sources"]:
                a, d = s["affineTransform"], s["dimensions"]
                x0, y1 = a["translateX"], a["translateY"]
                rows.append({"manifest": name, "epsg": region.manifest_epsg(name), "uri": m["uriPrefix"] + s["uris"][0],
                             "extent": (x0, y1 + a["scaleY"] * d["height"], x0 + a["scaleX"] * d["width"], y1)})
    return rows


def coverage(points, rows):
    from pyproj import Transformer

    for label, lon, lat in points:
        epsg = 32600 + region.utm_zone(lon)
        x, y = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True).transform(lon, lat)
        hits = [t for t in rows if t["epsg"] == epsg and t["extent"][0] <= x <= t["extent"][2]
                and t["extent"][1] <= y <= t["extent"][3]]
        names = sorted({t["manifest"] for t in hits})
        print(json.dumps({"point": label, "lon": lon, "lat": lat, "epsg": epsg, "manifests": names,
                          "tiles": [t["uri"] for t in hits][:3]}, ensure_ascii=False))


def main(args):
    region.GOB_MANIFESTS.mkdir(parents=True, exist_ok=True)
    items = listing()
    (region.GOB_MANIFESTS / "listing.json").write_text(json.dumps(items, indent=1))
    keep = [i for i in items if YEAR in i["name"] and any(z in i["name"] for z in ZONES)]
    have = manifest_paths()
    log = {"listed": len(items), "listed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
           "ph_zone_manifests_2023": [i["name"] for i in keep], "downloaded": [], "already_here": []}
    for i in keep:
        name = Path(i["name"]).name
        if name in have:
            log["already_here"].append(str(have[name].relative_to(region.ROOT)))
            continue
        out = region.GOB_MANIFESTS / name
        curl(OBJ_URL + i["name"], out)
        if out.stat().st_size != int(i["size"]):
            sys.exit(f"{name}: {out.stat().st_size} bytes, the listing says {i['size']}")
        log["downloaded"].append({"name": name, "bytes": out.stat().st_size, "url": OBJ_URL + i["name"]})
    (region.GOB_MANIFESTS / "fetch_log.json").write_text(json.dumps(log, indent=1))
    print(json.dumps(log, indent=1))
    points = []
    for d in region.district_rows():
        w, s, e, n = d["bbox"]
        points.append((d["id"], round((w + e) / 2, 5), round((s + n) / 2, 5)))
    for a in args:
        lon, lat = (float(v) for v in a.split(","))
        points.append((a, lon, lat))
    coverage(points, tiles(manifest_paths()))


if __name__ == "__main__":
    main(sys.argv[1:])
