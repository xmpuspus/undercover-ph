"""Run: pipeline/shade/.venv/bin/python -m pytest pipeline/test_data_release.py -q"""
import io
import json
import sys
import tarfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import data_release  # noqa: E402


@pytest.fixture
def world(tmp_path, monkeypatch):
    data, inputs, rel = tmp_path / "data", tmp_path / "inputs", tmp_path / "rel" / "data-test"
    for d in (data, inputs / "a1", rel):
        d.mkdir(parents=True)
    for name in data_release.TILES:
        (data / name).write_bytes(name.encode() * 100)
    for name in data_release.INPUT_FILES:
        (inputs / "a1" / name).write_bytes(f"a1 {name}".encode())
    (data / "areas" / "a1").mkdir(parents=True)
    for name in data_release.APP_FILES:
        (data / "areas" / "a1" / name).write_bytes(f"a1 {name}".encode())
    (data / data_release.INDEX).write_bytes(b"[]")
    monkeypatch.setattr(data_release, "DATA", data)
    monkeypatch.setattr(data_release, "INPUTS", inputs)
    monkeypatch.setattr(data_release, "MANIFEST", tmp_path / "data-release.json")
    monkeypatch.setenv("UCPH_DATA_BASE", f"file://{tmp_path / 'rel'}")
    files = [data / n for n in (*data_release.TILES, data_release.INDEX)]
    for f in files:
        (rel / f.name).write_bytes(f.read_bytes())
    for kind in ("inputs", "area"):
        data_release.pack(kind, "a1", rel / f"{kind}-a1.tar.gz")
        files.append(rel / f"{kind}-a1.tar.gz")
    assets = {f.name: {"sha256": data_release.sha256(f), "bytes": f.stat().st_size} for f in files}
    (tmp_path / "data-release.json").write_text(json.dumps({"tag": "data-test", "repo": "x/y", "assets": assets}))
    return tmp_path, data, inputs, rel


def test_the_same_inputs_pack_to_the_same_bytes(world, tmp_path):
    data_release.pack_inputs("a1", tmp_path / "one.tar.gz")
    data_release.pack_inputs("a1", tmp_path / "two.tar.gz")
    assert (tmp_path / "one.tar.gz").read_bytes() == (tmp_path / "two.tar.gz").read_bytes()


def test_fetch_restores_tiles_and_inputs_and_checks_them(world):
    tmp, data, inputs, rel = world
    want = {n: (data / n).read_bytes() for n in data_release.TILES}
    for n in data_release.TILES:
        (data / n).unlink()
    for n in data_release.INPUT_FILES:
        (inputs / "a1" / n).unlink()
    data_release.fetch(["--tiles", "--inputs", "a1"])
    for n, b in want.items():
        assert (data / n).read_bytes() == b
    assert (inputs / "a1" / "canopy.tif").read_bytes() == b"a1 canopy.tif"


def test_a_tampered_asset_stops_the_fetch(world):
    tmp, data, inputs, rel = world
    (data / "trees.pmtiles").unlink()
    (rel / "trees.pmtiles").write_bytes(b"tampered")
    with pytest.raises(SystemExit):
        data_release.fetch(["--tiles"])
    assert not (data / "trees.pmtiles").exists()


def test_an_archive_with_a_foreign_path_is_refused(world):
    tmp, data, inputs, rel = world
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo("../evil.txt")
        info.size = 4
        tar.addfile(info, io.BytesIO(b"evil"))
    (rel / "inputs-a1.tar.gz").write_bytes(buf.getvalue())
    m = json.loads((tmp / "data-release.json").read_text())
    m["assets"]["inputs-a1.tar.gz"] = {"sha256": data_release.sha256(rel / "inputs-a1.tar.gz"), "bytes": 1}
    (tmp / "data-release.json").write_text(json.dumps(m))
    for n in data_release.INPUT_FILES:
        (inputs / "a1" / n).unlink()
    with pytest.raises(SystemExit):
        data_release.fetch(["--inputs", "a1"])
    assert not (tmp / "evil.txt").exists() and not (inputs / "evil.txt").exists()


def test_an_unknown_area_stops_the_fetch(world):
    with pytest.raises(SystemExit):
        data_release.fetch(["--inputs", "nowhere"])


def test_fetch_app_restores_each_area_and_the_index_without_a_marker_in_public(world):
    tmp, data, inputs, rel = world
    for n in data_release.APP_FILES:
        (data / "areas" / "a1" / n).unlink()
    (data / data_release.INDEX).unlink()
    data_release.fetch(["--app"])
    assert (data / "areas" / "a1" / "graph.json").read_bytes() == b"a1 graph.json"
    assert (data / data_release.INDEX).read_bytes() == b"[]"
    assert sorted(p.name for p in (data / "areas" / "a1").iterdir()) == sorted(data_release.APP_FILES)


def test_fetch_app_for_named_areas_leaves_the_index(world):
    tmp, data, inputs, rel = world
    (data / "areas" / "a1" / "hours.json").unlink()
    (data / data_release.INDEX).unlink()
    data_release.fetch(["--app", "a1"])
    assert (data / "areas" / "a1" / "hours.json").read_bytes() == b"a1 hours.json"
    assert not (data / data_release.INDEX).exists()


def test_flags_combine_with_their_own_area_lists(world):
    tmp, data, inputs, rel = world
    (data / "trees.pmtiles").unlink()
    (data / "areas" / "a1" / "places.json").unlink()
    (inputs / "a1" / "canopy.tif").unlink()
    data_release.fetch(["--tiles", "--app", "a1", "--inputs", "a1"])
    assert (data / "trees.pmtiles").exists()
    assert (data / "areas" / "a1" / "places.json").exists()
    assert (inputs / "a1" / "canopy.tif").exists()


def test_a_changed_local_graph_is_replaced_by_the_release_copy(world):
    tmp, data, inputs, rel = world
    (data / "areas" / "a1" / "graph.json").write_bytes(b"stale")
    data_release.fetch(["--app", "a1"])
    assert (data / "areas" / "a1" / "graph.json").read_bytes() == b"a1 graph.json"


def test_an_unknown_flag_stops_the_fetch(world):
    with pytest.raises(SystemExit):
        data_release.fetch(["--everything"])
