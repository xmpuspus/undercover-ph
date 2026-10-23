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
    monkeypatch.setattr(data_release, "DATA", data)
    monkeypatch.setattr(data_release, "INPUTS", inputs)
    monkeypatch.setattr(data_release, "MANIFEST", tmp_path / "data-release.json")
    monkeypatch.setenv("UCPH_DATA_BASE", f"file://{tmp_path / 'rel'}")
    files = [data / n for n in data_release.TILES]
    data_release.pack_inputs("a1", rel / "inputs-a1.tar.gz")
    files.append(rel / "inputs-a1.tar.gz")
    for f in files[:2]:
        (rel / f.name).write_bytes(f.read_bytes())
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
