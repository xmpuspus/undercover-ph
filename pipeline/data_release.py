"""Keep the large data files out of git: the map tiles, each area's walk graph and places, and its shade inputs.

Usage, from the repository root (standard library only):
  python3 -I pipeline/data_release.py publish            pack, upload to a new GitHub release, write data-release.json
  python3 -I pipeline/data_release.py fetch --tiles      app/public/data/buildings.pmtiles and trees.pmtiles
  python3 -I pipeline/data_release.py fetch --app        every area's graph.json, places.json and hours.json, and
                                                         app/public/data/places_index.json
  python3 -I pipeline/data_release.py fetch --app ID [ID ...]      only those areas' graph, places and hours
  python3 -I pipeline/data_release.py fetch --inputs ID [ID ...]   pipeline/inputs/areas/<id>/ for those areas
  python3 -I pipeline/data_release.py fetch --all        all of it, for every area in data-release.json
Flags combine, for example `fetch --tiles --app`.

pipeline/data-release.json (kept in git) names the release tag and each asset's sha256 and size. fetch skips a file
whose sha256 already matches, checks every download, and fails on a mismatch, so a deploy never ships a wrong file.
Each area has two assets, so the shade workflow downloads only its own area:
area-<id>.tar.gz (graph.json, places.json, hours.json, into app/public/data/areas/<id>/) and
inputs-<id>.tar.gz (manifest_template.json, buildings.geojson.gz, canopy.tif, into pipeline/inputs/areas/<id>/).
Run publish after pipeline/districts/publish.py. areas.json stays in git, since the workflows list areas from it.
Git history still holds the copies committed before 2026-10-23; clone with --depth 1 to skip them.
Environment: UCPH_DATA_REPO (owner/name, default xmpuspus/undercover-ph), UCPH_DATA_BASE (another download base,
for tests).
"""
import gzip
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app/public/data"
INPUTS = ROOT / "pipeline/inputs/areas"
MANIFEST = ROOT / "pipeline/data-release.json"
TILES = ("buildings.pmtiles", "trees.pmtiles")
INDEX = "places_index.json"
INPUT_FILES = ("manifest_template.json", "buildings.geojson.gz", "canopy.tif")
APP_FILES = ("graph.json", "places.json", "hours.json")
REPO = os.environ.get("UCPH_DATA_REPO", "xmpuspus/undercover-ph")
# A commit's data-release.json must still download, so old releases stay for the last few data changes.
KEEP = 6


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def area_ids():
    return [a["id"] for a in json.load(open(DATA / "areas.json"))["areas"]]


def kinds():
    """Each per-area asset kind: (asset prefix, folder that holds <id>/, the files in it)."""
    return {"inputs": (INPUTS, INPUT_FILES), "area": (DATA / "areas", APP_FILES)}


def pack_inputs(area, out):
    pack("inputs", area, out)


def pack(kind, area, out):
    """A reproducible tarball: sorted names, zeroed times and owners, so the same files give the same sha256."""
    root, names = kinds()[kind]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for name in names:
            src = root / area / name
            if not src.exists():
                sys.exit(f"{src} is missing; run pipeline/districts/publish.py first")
            info = tarfile.TarInfo(f"{area}/{name}")
            info.size, info.mtime, info.mode = src.stat().st_size, 0, 0o644
            with open(src, "rb") as fh:
                tar.addfile(info, fh)
    out.write_bytes(gzip.compress(buf.getvalue(), compresslevel=6, mtime=0))


def publish():
    areas = area_ids()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        files = [DATA / name for name in (*TILES, INDEX)]
        for a in areas:
            for kind in kinds():
                pack(kind, a, tmp / f"{kind}-{a}.tar.gz")
                files.append(tmp / f"{kind}-{a}.tar.gz")
        assets = {f.name: {"sha256": sha256(f), "bytes": f.stat().st_size} for f in files}
        digest = hashlib.sha256(json.dumps(assets, sort_keys=True).encode()).hexdigest()[:10]
        old = json.load(open(MANIFEST)) if MANIFEST.exists() else {}
        if old.get("assets") == assets:
            print(f"data unchanged; {MANIFEST.name} already names {old['tag']}")
            return
        tag = f"data-{datetime.now(timezone.utc):%Y%m%d}-{digest}"
        notes = (f"Map tiles, walk graphs, places and shade inputs for {len(areas)} areas. Read by pipeline/data_release.py "
                 "through pipeline/data-release.json, not by hand.")
        subprocess.run(["gh", "release", "create", tag, "-R", REPO, "--title", f"Data {tag[5:]}", "--notes", notes,
                        "--latest=false"], check=True)
        for i in range(0, len(files), 20):
            subprocess.run(["gh", "release", "upload", tag, "-R", REPO, *map(str, files[i:i + 20])], check=True)
    MANIFEST.write_text(json.dumps({"tag": tag, "repo": REPO, "assets": assets}, indent=1, sort_keys=True) + "\n")
    print(json.dumps({"tag": tag, "assets": len(assets), "bytes": sum(a["bytes"] for a in assets.values())}))
    prune(keep=KEEP)


def prune(keep):
    """Delete data releases beyond the newest `keep`. Tags start with the date, so a name sort is a date sort."""
    out = subprocess.run(["gh", "release", "list", "-R", REPO, "--limit", "200", "--json", "tagName", "--jq", ".[].tagName"],
                         capture_output=True, text=True, check=True).stdout.split()
    for tag in sorted((t for t in out if t.startswith("data-")), reverse=True)[keep:]:
        subprocess.run(["gh", "release", "delete", tag, "-R", REPO, "--cleanup-tag", "--yes"], check=True)
        print(f"deleted old data release {tag}")


def download(name, meta, dest):
    """Download one asset to dest, check its sha256, and return dest. Skips a file that already matches."""
    if dest.exists() and sha256(dest) == meta["sha256"]:
        return dest
    m = json.load(open(MANIFEST))
    base = os.environ.get("UCPH_DATA_BASE") or f"https://github.com/{m['repo']}/releases/download"
    url = f"{base}/{m['tag']}/{name}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    subprocess.run(["curl", "-fsSL", "--retry", "3", "-o", str(part), url], check=True)
    got = sha256(part)
    if got != meta["sha256"]:
        part.unlink()
        sys.exit(f"{name}: sha256 {got} does not match {meta['sha256']} in {MANIFEST.name}")
    part.replace(dest)
    return dest


def parse(args):
    """Each flag with the area ids that follow it, for example {"--tiles": [], "--inputs": ["cebu"]}."""
    flags, cur = {}, None
    for a in args:
        if a in ("--tiles", "--app", "--inputs", "--all"):
            cur = flags.setdefault(a, [])
        elif cur is None or a.startswith("--"):
            sys.exit(__doc__)
        else:
            cur.append(a)
    return flags


def restore(kind, a, assets, tag):
    """Put one area's files of one kind in place from its tarball. Skips files that already match the release."""
    root, names = kinds()[kind]
    name = f"{kind}-{a}.tar.gz"
    if name not in assets:
        sys.exit(f"{name} is not in {tag}")
    want = assets[name]["sha256"]
    # The marker sits only in pipeline/inputs, never under app/public, which the site serves as it is.
    marker = root / a / ".release-sha256" if kind == "inputs" else None
    have = all((root / a / f).exists() for f in names)
    if have and marker and marker.exists() and marker.read_text().strip() == want:
        return
    if have:
        # Files from a local build: packing is reproducible, so equal bytes mean the release holds the same.
        with tempfile.TemporaryDirectory() as tmp:
            pack(kind, a, Path(tmp) / name)
            if sha256(Path(tmp) / name) == want:
                if marker:
                    marker.write_text(want + "\n")
                return
    with tempfile.TemporaryDirectory() as tmp:
        tgz = download(name, assets[name], Path(tmp) / name)
        with tarfile.open(tgz, "r:gz") as tar:
            for member in tar.getmembers():
                # Only the known files of this one area may come out of the archive.
                if member.name not in {f"{a}/{f}" for f in names} or not member.isfile():
                    sys.exit(f"{name}: unexpected member {member.name!r}")
            tar.extractall(root, filter="data")
    if marker:
        marker.write_text(want + "\n")


def fetch(args):
    m = json.load(open(MANIFEST))
    assets = m["assets"]
    flags = parse(args)
    if not flags:
        sys.exit(__doc__)
    every = flags.keys() >= {"--all"}

    def ids(kind, flag):
        listed = [n[len(kind) + 1 : -len(".tar.gz")] for n in assets if n.startswith(f"{kind}-")]
        if every or (flag == "--app" and flag in flags and not flags[flag]):
            return listed
        return flags.get(flag, [])

    want_tiles = every or "--tiles" in flags
    app_ids, input_ids = ids("area", "--app"), ids("inputs", "--inputs")
    # The search index covers every area, so it comes with the full set of area files.
    want_index = every or ("--app" in flags and not flags["--app"])
    for name in (*(TILES if want_tiles else ()), *((INDEX,) if want_index else ())):
        if name not in assets:
            sys.exit(f"{name} is not in {m['tag']}")
        download(name, assets[name], DATA / name)
    for a in app_ids:
        restore("area", a, assets, m["tag"])
    for a in input_ids:
        restore("inputs", a, assets, m["tag"])
    print(json.dumps({"tag": m["tag"], "tiles": want_tiles, "index": want_index, "app": len(app_ids), "inputs": len(input_ids)}))


if __name__ == "__main__":
    if sys.argv[1:2] == ["publish"]:
        publish()
    elif sys.argv[1:2] == ["fetch"]:
        fetch(sys.argv[2:])
    else:
        sys.exit(__doc__)
