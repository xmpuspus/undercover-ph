"""Keep the large data files out of git: the map tiles, each area's walk graph and places, and its shade inputs.

Usage, from the repository root (standard library only):
  python3 -I pipeline/data_release.py publish            pack, upload to a new GitHub release, write data-release.json
  python3 -I pipeline/data_release.py fetch --tiles      app/public/data/buildings.pmtiles and trees.pmtiles
  python3 -I pipeline/data_release.py fetch --app        every area's graph.json, places.json, hours.json and jog.json, and
                                                         app/public/data/places_index.json
  python3 -I pipeline/data_release.py fetch --app ID [ID ...]      only those areas' graph, places, hours and jog data
  python3 -I pipeline/data_release.py fetch --inputs ID [ID ...]   pipeline/inputs/areas/<id>/ for those areas
  python3 -I pipeline/data_release.py fetch --all        all of it, for every area in data-release.json
Flags combine, for example `fetch --tiles --app`. Add --replace to overwrite local changes (see below).

pipeline/data-release.json (kept in git) names the release tag and each asset's sha256 and size. fetch skips a file
whose sha256 already matches, checks every download, and fails on a mismatch, so a deploy never ships a wrong file.
Each area has two assets, so the shade workflow downloads only its own area:
area-<id>.tar.gz (graph.json, places.json, hours.json, optional jog.json, into app/public/data/areas/<id>/) and
inputs-<id>.tar.gz (manifest_template.json, buildings.geojson.gz, canopy.tif, into pipeline/inputs/areas/<id>/).
Run publish after pipeline/districts/publish.py. areas.json stays in git, since the workflows list areas from it.
An area or an older release without jog.json still packs and fetches.

fetch keeps local work. pipeline/.data-fetched.json (ignored by git) records the sha256 of each file or area as
fetch last left it. A local file that matches the release is left alone. One that still matches that record is
stale, and fetch replaces it. One that matches neither came from a local rebuild, and fetch keeps it and prints
a note, unless --replace is given. So a local deploy build never overwrites maps that are not yet published.
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
STATE = ROOT / "pipeline/.data-fetched.json"
TILES = ("buildings.pmtiles", "trees.pmtiles")
INDEX = "places_index.json"
INPUT_FILES = ("manifest_template.json", "buildings.geojson.gz", "canopy.tif")
APP_FILES = ("graph.json", "places.json", "hours.json", "jog.json")
OPTIONAL_APP_FILES = ("jog.json",)
REPO = os.environ.get("UCPH_DATA_REPO", "xmpuspus/undercover-ph")
# A commit's data-release.json must still download, so old releases stay for the last few data changes.
KEEP = 6
# Releases that prune never deletes, with the reason. Remove a tag here when its reason no longer holds.
PINNED = {
    "data-20261023-89883d3432": "the last v1 canopy (Meta 2024 CHM), the way back from CHMv2 until a field check passes",
}


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


def pack_tar(kind, area):
    """A reproducible tar of one area's files: sorted names, zeroed times and owners. Uncompressed, because gzip
    output differs between Python and zlib versions, so only the tar bytes identify the files."""
    root, names = kinds()[kind]
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w", format=tarfile.PAX_FORMAT) as tar:
        for name in names:
            src = root / area / name
            if not src.exists():
                if kind == "area" and name in OPTIONAL_APP_FILES:
                    continue
                sys.exit(f"{src} is missing; run pipeline/districts/publish.py first")
            info = tarfile.TarInfo(f"{area}/{name}")
            info.size, info.mtime, info.mode = src.stat().st_size, 0, 0o644
            with open(src, "rb") as fh:
                tar.addfile(info, fh)
    return buf.getvalue()


def pack(kind, area, out):
    """Write the area's tar, gzipped, to out, and return the sha256 of the uncompressed tar."""
    raw = pack_tar(kind, area)
    out.write_bytes(gzip.compress(raw, compresslevel=6, mtime=0))
    return hashlib.sha256(raw).hexdigest()


def publish():
    areas = area_ids()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        files, tars = [DATA / name for name in (*TILES, INDEX)], {}
        for a in areas:
            for kind in kinds():
                tars[f"{kind}-{a}.tar.gz"] = pack(kind, a, tmp / f"{kind}-{a}.tar.gz")
                files.append(tmp / f"{kind}-{a}.tar.gz")
        assets = {f.name: {"sha256": sha256(f), "bytes": f.stat().st_size} for f in files}
        for name, tar_sha in tars.items():
            assets[name]["tar_sha256"] = tar_sha
        digest = hashlib.sha256(json.dumps(assets, sort_keys=True).encode()).hexdigest()[:10]
        old = json.load(open(MANIFEST)) if MANIFEST.exists() else {}
        same = {n: a.get("tar_sha256", a["sha256"]) for n, a in assets.items()}
        if {n: a.get("tar_sha256", a["sha256"]) for n, a in old.get("assets", {}).items()} == same:
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
    """Delete data releases beyond the newest `keep`, by publish time. Two releases from one day share the date
    in their tag, so the tag does not order them. The release that data-release.json names always stays."""
    out = subprocess.run(["gh", "release", "list", "-R", REPO, "--limit", "200", "--json", "tagName,publishedAt"],
                         capture_output=True, text=True, check=True).stdout
    current = json.load(open(MANIFEST))["tag"] if MANIFEST.exists() else None
    for tag in to_delete(json.loads(out or "[]"), keep, current):
        subprocess.run(["gh", "release", "delete", tag, "-R", REPO, "--cleanup-tag", "--yes"], check=True)
        print(f"deleted old data release {tag}")


def to_delete(releases, keep, current):
    """Tags of data releases past the newest `keep` by publishedAt, never `current`."""
    data = sorted((r for r in releases if r["tagName"].startswith("data-")), key=lambda r: r["publishedAt"], reverse=True)
    return [r["tagName"] for r in data[keep:] if r["tagName"] != current and r["tagName"] not in PINNED]


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
        if a == "--replace":
            flags[a] = []
            cur = None
        elif a in ("--tiles", "--app", "--inputs", "--all"):
            cur = flags.setdefault(a, [])
        elif cur is None or a.startswith("--"):
            sys.exit(__doc__)
        else:
            cur.append(a)
    return flags


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}


def save_state(state):
    tmp = STATE.with_name(STATE.name + ".tmp")
    tmp.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")
    tmp.replace(STATE)


def stamp(paths):
    """Size and modification time, including absent optional files, to detect changes without hashing."""
    return [[p.name, p.stat().st_size, p.stat().st_mtime_ns] if p.exists() else [p.name, None, None] for p in paths]


def local_sha(key, paths, digest, state):
    """The sha256 of the local copy: from the record when the files have not changed since, else computed."""
    rec = state.get(key) or {}
    if rec.get("stamp") == stamp(paths):
        return rec["sha256"]
    return digest()


def keep_local(key, local, want, state, replace, what):
    """True when the local copy is neither the release's nor what fetch last left, so a rebuild made it."""
    if replace or local == want or (state.get(key) or {}).get("sha256") == local:
        return False
    print(f"keeping local {what}: it differs from the release and from the last fetch. Publish it, or fetch with --replace.")
    return True


def fetch_file(name, meta, dest, state, replace):
    """Put one release file at dest, unless a local rebuild changed it."""
    if dest.exists():
        local = local_sha(name, [dest], lambda: sha256(dest), state)
        if keep_local(name, local, meta["sha256"], state, replace, dest.name):
            return
        if local != meta["sha256"]:
            dest.unlink()
    download(name, meta, dest)
    state[name] = {"sha256": meta["sha256"], "stamp": stamp([dest])}


def release_tar_sha(name, meta, state):
    """The uncompressed tar sha256 of a release tarball: from data-release.json, else from a cached download."""
    if meta.get("tar_sha256"):
        return meta["tar_sha256"]
    key = f"release-tar:{meta['sha256']}"
    if key not in state:
        with tempfile.TemporaryDirectory() as tmp:
            tgz = download(name, meta, Path(tmp) / name)
            state[key] = hashlib.sha256(gzip.decompress(tgz.read_bytes())).hexdigest()
    return state[key]


def restore(kind, a, assets, tag, state, replace=False):
    """Put one area's files of one kind in place from its tarball, unless a local rebuild changed them."""
    root, names = kinds()[kind]
    name = f"{kind}-{a}.tar.gz"
    if name not in assets:
        sys.exit(f"{name} is not in {tag}")
    paths = [root / a / f for f in names]
    optional = set(OPTIONAL_APP_FILES) if kind == "area" else set()
    complete = all(p.exists() for p in paths if p.name not in optional)
    local = None
    if complete:
        local = local_sha(name, paths, lambda: hashlib.sha256(pack_tar(kind, a)).hexdigest(), state)
        want = release_tar_sha(name, assets[name], state)
        if local == want:
            state[name] = {"sha256": want, "stamp": stamp(paths)}
            return
    with tempfile.TemporaryDirectory() as tmp:
        tgz = download(name, assets[name], Path(tmp) / name)
        raw = gzip.decompress(tgz.read_bytes())
        with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
            seen = set()
            for member in tar.getmembers():
                # Only the known files of this one area may come out of the archive.
                if member.name not in {f"{a}/{f}" for f in names} or not member.isfile() or member.name in seen:
                    sys.exit(f"{name}: unexpected member {member.name!r}")
                seen.add(member.name)
            if not {f"{a}/{f}" for f in names if f not in optional} <= seen:
                sys.exit(f"{name}: missing required area files")
            # A missing jog file can be filled when every existing file matches the release.
            # A rebuilt graph or jog file still keeps the whole local area together.
            same_existing = complete and all(
                f"{a}/{p.name}" in seen and p.read_bytes() == tar.extractfile(f"{a}/{p.name}").read()
                for p in paths if p.exists())
            if complete and not same_existing and keep_local(name, local, want, state, replace, f"{kind} files of {a}"):
                return
            tar.extractall(root, filter="data")
            for f in optional:
                if f"{a}/{f}" not in seen:
                    (root / a / f).unlink(missing_ok=True)
    state[name] = {"sha256": hashlib.sha256(raw).hexdigest(), "stamp": stamp(paths)}


def fetch(args):
    m = json.load(open(MANIFEST))
    assets = m["assets"]
    flags = parse(args)
    replace = bool(flags.pop("--replace", None) is not None)
    if not flags:
        sys.exit(__doc__)
    state = load_state()
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
        fetch_file(name, assets[name], DATA / name, state, replace)
    try:
        for a in app_ids:
            restore("area", a, assets, m["tag"], state, replace)
        for a in input_ids:
            restore("inputs", a, assets, m["tag"], state, replace)
    finally:
        save_state(state)
    print(json.dumps({"tag": m["tag"], "tiles": want_tiles, "index": want_index, "app": len(app_ids), "inputs": len(input_ids)}))


if __name__ == "__main__":
    if sys.argv[1:2] == ["publish"]:
        publish()
    elif sys.argv[1:2] == ["fetch"]:
        fetch(sys.argv[2:])
    else:
        sys.exit(__doc__)
