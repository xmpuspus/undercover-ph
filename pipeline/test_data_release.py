"""Run: pipeline/shade/.venv/bin/python -m pytest pipeline/test_data_release.py -q"""
import gzip
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tarfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import data_release  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DISTRICTS = ROOT / "pipeline/districts"
# The jog probes need osmium: the graph venv on a laptop, the job's own Python in CI.
GRAPH_PY = ROOT / "pipeline/.venv/bin/python"
GRAPH_PY = str(GRAPH_PY) if GRAPH_PY.exists() else sys.executable
HAS_OSMIUM = subprocess.run([GRAPH_PY, "-I", "-c", "import osmium, shapely, pyproj"], capture_output=True).returncode == 0


def jog_probe(code, **payload):
    """Exercise osmium in the graph interpreter without writing fixture or cache files."""
    if not HAS_OSMIUM:
        pytest.skip("no Python with osmium, shapely and pyproj")
    setup = """
import io, json, os, sys
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import build_jog as jog
import test_build_jog as fixture
data = json.loads(sys.stdin.read())
graph = fixture.graph()
raw = json.dumps(graph).encode()
bbox = jog.graph_bbox(graph)
def features(xml=None, bounds=None):
    f = jog.Features({e['way_id'] for e in graph['edges']}, bounds if bounds is not None else bbox)
    f.apply_buffer((xml or fixture.osm_xml()).encode(), 'osm', locations=True, idx='flex_mem')
    return f
"""
    result = subprocess.run([GRAPH_PY, "-I", "-B", "-c", setup + code, str(DISTRICTS)],
                            input=json.dumps(payload), text=True, capture_output=True, cwd=ROOT, timeout=60)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_jog_merges_an_osm_sight_and_its_wikidata_item():
    result = jog_probe("""
xml = fixture.osm_xml().replace('<tag k="historic" v="memorial"/>',
    '<tag k="historic" v="memorial"/><tag k="wikidata" v="Q999999"/>')
f = features(xml)
wd = [{k: v for k, v in fixture.MARKER.items() if k != 'qid'} | {'src': 'wikidata:Q999999'}]
print(json.dumps(jog.attributes(graph, raw, f, wd)))
""")
    assert [s["src"] for s in result["sights"]] == ["osm:n901", "osm:w201"]
    assert result["counts"]["sights"] == 2
    assert result["sights"][result["edges"]["sight"][0]]["src"] == "osm:n901"


def test_jog_merges_osm_objects_with_the_same_wikidata_identity():
    result = jog_probe("""
xml = fixture.osm_xml().replace('<tag k="historic" v="memorial"/>',
    '<tag k="historic" v="memorial"/><tag k="wikidata" v="Q123"/>').replace(
    '<tag k="leisure" v="park"/>', '<tag k="leisure" v="park"/><tag k="wikidata" v="Q123"/>')
print(json.dumps(jog.attributes(graph, raw, features(xml), [])))
""")
    assert len(result["sights"]) == 1


def test_jog_keeps_a_closed_linear_historic_sight():
    sights = jog_probe("""
xml = fixture.osm_xml().replace('<tag k="leisure" v="park"/>',
    '<tag k="historic" v="citywalls"/><tag k="area" v="no"/>')
print(json.dumps(features(xml).sights))
""")
    assert sights["osm:w201"]["name"] == "Test Park"
    assert sights["osm:w201"]["kind"] == "citywalls"


def test_jog_uses_an_interior_point_for_an_assembled_area():
    assert jog_probe("""
from shapely.geometry import Point, Polygon
f = features()
s = f.sights['osm:w201']
print(json.dumps(Polygon([fixture.N[n] for n in fixture.WAYS[201][0]]).contains(Point(s['lon'], s['lat']))))
""")


def test_jog_recreation_ground_has_a_park_kind_when_it_is_a_pitch():
    assert jog_probe("""
print(json.dumps(jog.sight_kind({'name': 'Playing field', 'landuse': 'recreation_ground', 'leisure': 'pitch'})))
""") == "recreation_ground"


@pytest.mark.parametrize("payload", [None, "", "null", "[]", "{}", '{"items":null}', '{"items":[null,{},1]}',
                                     '{"items":[{"qid":"Q1","name":"","kind":"heritage","lon":121.021,"lat":14.5502}]}',
                                     '{"items":[{"qid":"Q1","name":"\\ud800","kind":"heritage","lon":121.021,"lat":14.5502}]}'])
def test_jog_missing_or_malformed_snapshot_is_safe(payload):
    result = jog_probe("""
class Snapshot:
    def read_text(self):
        if data['payload'] is None:
            raise FileNotFoundError('missing snapshot')
        return data['payload']
print(json.dumps(jog.read_wikidata(Snapshot(), bbox)))
""", payload=payload)
    assert result == []


@pytest.mark.parametrize("missing_way,empty_geom", [(True, False), (False, True), (True, True)])
def test_jog_unknown_way_empty_geometry_and_unnamed_sight_are_safe(missing_way, empty_geom):
    result = jog_probe("""
f = features()
edge = dict(graph['edges'][0])
if data['missing_way']:
    edge['way_id'] = -1
if data['empty_geom']:
    edge['geom'] = []
graph['edges'] = [edge]
print(json.dumps({'jog': jog.attributes(graph, raw, f, []),
    'unnamed': jog.sight_kind({'historic': 'memorial', 'name': '  '})}))
""", missing_way=missing_way, empty_geom=empty_geom)
    assert result["unnamed"] is None
    edges = result["jog"]["edges"]
    assert [edges[k][0] for k in ("road", "lit", "surface")] == ([0, 0, 0] if missing_way else [2, 1, 1])
    assert edges["park"] == [0]
    assert edges["water"] == [0 if empty_geom else 1]
    assert edges["sight"] == [-1 if empty_geom else 0]


def test_jog_link_roads_take_the_parent_class():
    result = jog_probe("""
print(json.dumps([jog.tag_codes({'highway': c})[0] for c in data['classes']]))
""", classes=["tertiary_link", "secondary_link", "primary_link", "trunk_link"])
    assert result == [3, 4, 5, 6]


def test_jog_relation_holes_and_closed_coastlines():
    result = jog_probe("""
from shapely.geometry import LineString
nodes = [(121,14.5), (121.02,14.5), (121.02,14.52), (121,14.52),
         (121.009,14.509), (121.011,14.509), (121.011,14.511), (121.009,14.511)]
xml = '<osm version="0.6">' + ''.join(
    f'<node id="{i}" lat="{y}" lon="{x}"/>' for i,(x,y) in enumerate(nodes,1))
for wid,refs,tags in [(101,[1,2,3,4,1],'<tag k="natural" v="coastline"/>'), (102,[5,6,7,8,5],'')]:
    xml += f'<way id="{wid}">' + ''.join(f'<nd ref="{n}"/>' for n in refs) + tags + '</way>'
xml += '<relation id="201"><member type="way" ref="101" role="outer"/>'
xml += '<member type="way" ref="102" role="inner"/><tag k="type" v="multipolygon"/>'
xml += '<tag k="leisure" v="park"/><tag k="name" v="Ring Park"/></relation></osm>'
graph['edges'] = [{'way_id': -1, 'len_m': 10, 'geom': [[121.0099,14.51],[121.0101,14.51]]},
                  {'way_id': -1, 'len_m': 10, 'geom': [[121.0049,14.505],[121.0051,14.505]]}]
f = features(xml, [120.99,14.49,121.03,14.53])
result = jog.attributes(graph, raw, f, [])
print(json.dumps(result))
""")
    assert result["edges"]["park"] == [0, 1]
    assert result["edges"]["water"] == [0, 0]
    assert [s["src"] for s in result["sights"]] == ["osm:r201"]


def test_jog_context_keeps_the_union_of_graph_rectangles():
    result = jog_probe("""
class Rects(list):
    rects = [[121.019,14.549,121.0205,14.552], [121.0218,14.549,121.023,14.552]]
bounds = Rects([121.019,14.549,121.023,14.552])
f = features(bounds=bounds)
class Snapshot:
    def read_text(self):
        return json.dumps({'items': [dict(fixture.MARKER, lon=121.021, lat=14.5502)]})
print(json.dumps({'osm': list(f.sights), 'wikidata': jog.read_wikidata(Snapshot(), bounds)}))
""")
    assert "osm:n901" not in result["osm"]
    assert result["wikidata"] == []


@pytest.mark.parametrize("mode", ["stage", "area", "area_explicit", "explicit"])
def test_jog_main_executes_the_selected_input_and_output_mode(mode):
    result = jog_probe("""
mode = data['mode']
jog.ROOT = Path('/jog-fixture')
stage = Path('/jog-fixture/pipeline/stage/test-area')
published = jog.ROOT / 'app/public/data/areas/test-area'
sys.modules['ctx'] = SimpleNamespace(OUT=stage, PBF=Path('/jog-fixture/area.osm'),
    AREA=SimpleNamespace(id='test-area'), GRAPH_BBOX=[121.019,14.549,121.023,14.552])
os.environ['UC_AREA'] = 'test-area'
base = stage if mode == 'stage' else published
graph_path, out_path = base/'graph.json', base/'jog.json'
snapshot = Path('/jog-fixture/wikidata.json')
writes, reads = {}, []
def read_bytes(path):
    reads.append(str(path))
    assert path == graph_path
    return raw
def read_text(path, *a, **kw):
    assert path == snapshot
    return json.dumps({'items': []})
def apply_file(handler, path, **kw):
    assert Path(path) == Path('/jog-fixture/area.osm')
    handler.apply_buffer(fixture.osm_xml().encode(), 'osm', **kw)
args = ['--wikidata', str(snapshot)]
if mode in ('area', 'area_explicit'):
    args += ['--area','test-area']
if mode in ('explicit','area_explicit'):
    args += ['--graph',str(graph_path),'--pbf','/jog-fixture/area.osm','--out',str(out_path)]
with patch.object(Path,'read_bytes',read_bytes), patch.object(Path,'read_text',read_text), \
     patch.object(Path,'exists',return_value=False), patch.object(Path,'mkdir'), \
     patch.object(Path,'write_text',lambda p,text: writes.setdefault(str(p),text)), \
     patch.object(jog.Features,'apply_file',apply_file), redirect_stdout(io.StringIO()):
    _, configured = jog.paths(args)
    jog.main(args)
result = json.loads(writes[str(out_path)])
print(json.dumps({'reads': reads, 'writes': list(writes), 'hash': result['graph_sha256'],
                  'expected_hash': jog.hashlib.sha256(raw).hexdigest(), 'edges': result['counts']['edges'],
                  'configured_box': configured}))
""", mode=mode)
    assert len(result["reads"]) == len(result["writes"]) == 1
    assert result["hash"] == result["expected_hash"]
    assert result["edges"] == 5
    assert result["configured_box"] == (None if mode == "explicit" else [121.019, 14.549, 121.023, 14.552])


@pytest.mark.parametrize("jog_fails", [False, True])
def test_build_runs_jog_after_graph_and_stops_on_its_failure(tmp_path, monkeypatch, jog_fails):
    spec = importlib.util.spec_from_file_location("jog_build_test", DISTRICTS / "build.py")
    build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(build)
    here = tmp_path / "pipeline/districts"
    here.mkdir(parents=True)
    (here / "routes.json").write_text('{"a1":[]}')
    monkeypatch.setattr(build, "HERE", here)
    calls = []

    def run(argv, **kwargs):
        calls.append(Path(argv[2]).name)
        assert kwargs["env"]["UC_AREA"] == "a1"
        code = int(jog_fails and calls[-1] == "build_jog.py")
        return subprocess.CompletedProcess(argv, code, stdout="", stderr="jog failed" if code else "")

    monkeypatch.setattr(build.subprocess, "run", run)
    if jog_fails:
        with pytest.raises(SystemExit, match="build_jog.py failed"):
            build.build("a1")
        assert calls[-1] == "build_jog.py"
        assert "build_places.py" not in calls
    else:
        build.build("a1")
        assert calls.index("build_places.py") > calls.index("build_jog.py")
    assert calls.index("build_jog.py") == calls.index("build_graph.py") + 1


def publish_module():
    spec = importlib.util.spec_from_file_location("jog_publish_test", DISTRICTS / "publish.py")
    publish = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(publish)
    return publish


def test_publish_checks_every_staged_jog_before_creating_output(monkeypatch):
    publish = publish_module()
    rows = [{"id": area, "name": area, "bbox": [121, 14, 121.01, 14.01],
             "graph_bbox": [121, 14, 121.01, 14.01], "graph_rects": [[121, 14, 121.01, 14.01]], "cities": []}
            for area in ("a1", "a2")]
    files = {str(publish.PIPE / "areas.json"): json.dumps({"areas": rows}).encode()}
    for row in rows:
        stage = publish.STAGE / row["id"]
        raw = b'{"nodes":[],"edges":[]}'
        files[str(stage / "graph.json")] = raw
        files[str(stage / "jog.json")] = json.dumps({"graph_sha256": hashlib.sha256(raw).hexdigest()}).encode()
        files[str(stage / "manifest_template.json")] = json.dumps({
            "counts": {"places": 0, "edges": 0}, "pilot_bbox": row["bbox"], "graph_bbox": row["graph_bbox"],
            "graph_rects": row["graph_rects"], "area": {"id": row["id"], "neighbourhoods": []}}).encode()
        for name in ("places.json", "hours.json"):
            files[str(stage / name)] = b"[]"
    del files[str(publish.STAGE / "a2/jog.json")]

    def read(path, *args, **kwargs):
        if str(path) not in files:
            raise FileNotFoundError(str(path))
        return files[str(path)]

    monkeypatch.setattr("builtins.open", lambda p, *a, **kw: io.StringIO(read(p).decode()))
    monkeypatch.setattr(Path, "read_bytes", read)
    monkeypatch.setattr(Path, "read_text", lambda p, *a, **kw: read(p).decode())
    monkeypatch.setattr(Path, "exists", lambda p: str(p) in files)
    monkeypatch.setattr(Path, "mkdir", lambda *a, **kw: pytest.fail("output created before all jog files were checked"))
    with pytest.raises(SystemExit, match="a2.*jog.json"):
        publish.main(tiles=False)


@pytest.fixture
def publish_world(tmp_path, monkeypatch):
    publish = publish_module()
    pipe, stage, data, inputs = (tmp_path / name for name in ("pipeline", "stage", "data", "inputs"))
    pipe.mkdir()
    rows = []
    for area in ("a1", "a2"):
        row = {"id": area, "name": area, "bbox": [121, 14, 121.01, 14.01],
               "graph_bbox": [121, 14, 121.01, 14.01], "graph_rects": [[121, 14, 121.01, 14.01]], "cities": []}
        rows.append(row)
        src = stage / area
        src.mkdir(parents=True)
        raw = '{ "nodes": [], "edges": [], "note": "é" }\n'.encode()
        (src / "graph.json").write_bytes(raw)
        (src / "jog.json").write_text(json.dumps({"version": 1, "graph_sha256": hashlib.sha256(raw).hexdigest()}))
        for name in ("places.json", "hours.json"):
            (src / name).write_text("[]")
        manifest = {"counts": {"edges": 0, "places": 0}, "pilot_bbox": row["bbox"],
                    "graph_bbox": row["graph_bbox"], "graph_rects": row["graph_rects"],
                    "area": {"id": area, "neighbourhoods": []}}
        (src / "manifest_template.json").write_text(json.dumps(manifest))
        (src / "buildings.geojson.gz").write_bytes(gzip.compress(b'{"features":[]}'))
        (inputs / area).mkdir(parents=True)
        (inputs / area / "canopy.tif").write_bytes(b"existing canopy")
    (pipe / "areas.json").write_text(json.dumps({"areas": rows}))
    for key, value in (("PIPE", pipe), ("STAGE", stage), ("DATA", data), ("INPUTS", inputs)):
        monkeypatch.setattr(publish, key, value)
    return publish, stage, data


@pytest.mark.parametrize("problem", ["missing", "malformed", "mismatched"])
def test_publish_rejects_bad_staged_jog_before_any_area_is_written(publish_world, problem):
    publish, stage, data = publish_world
    bad = stage / "a2/jog.json"
    if problem == "missing":
        bad.unlink()
    else:
        bad.write_text("invalid" if problem == "malformed" else '{"graph_sha256":"wrong"}')
    with pytest.raises(SystemExit, match="a2.*jog.json"):
        publish.main(tiles=False)
    assert not data.exists()


def test_publish_copies_graph_and_jog_bytes_together(publish_world):
    publish, stage, data = publish_world
    publish.main(tiles=False)
    for area in ("a1", "a2"):
        out = data / "areas" / area
        assert (out / "graph.json").read_bytes() == (stage / area / "graph.json").read_bytes()
        assert (out / "jog.json").read_bytes() == (stage / area / "jog.json").read_bytes()
        assert json.loads((out / "jog.json").read_text())["graph_sha256"] == hashlib.sha256((out / "graph.json").read_bytes()).hexdigest()


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
    monkeypatch.setattr(data_release, "STATE", tmp_path / "fetched.json")
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
    assert (data / "areas" / "a1" / "jog.json").read_bytes() == b"a1 jog.json"
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


def test_a_rebuilt_local_graph_is_kept_unless_replace_is_given(world):
    tmp, data, inputs, rel = world
    (data / "areas" / "a1" / "graph.json").write_bytes(b"rebuilt")
    (data / "trees.pmtiles").write_bytes(b"rebuilt tiles")
    data_release.fetch(["--tiles", "--app", "a1"])
    assert (data / "areas" / "a1" / "graph.json").read_bytes() == b"rebuilt"
    assert (data / "trees.pmtiles").read_bytes() == b"rebuilt tiles"
    data_release.fetch(["--tiles", "--app", "a1", "--replace"])
    assert (data / "areas" / "a1" / "graph.json").read_bytes() == b"a1 graph.json"
    assert (data / "trees.pmtiles").read_bytes() == b"trees.pmtiles" * 100


def test_a_stale_copy_from_an_older_release_is_replaced(world):
    tmp, data, inputs, rel = world
    data_release.fetch(["--app", "a1", "--tiles"])
    # A newer release comes in with git pull: its graph differs, and the local copy is what fetch left.
    (data / "areas" / "a1" / "graph.json").write_bytes(b"a1 graph.json v2")
    data_release.pack("area", "a1", rel / "area-a1.tar.gz")
    (data / "areas" / "a1" / "graph.json").write_bytes(b"a1 graph.json")
    m = json.loads((tmp / "data-release.json").read_text())
    m["assets"]["area-a1.tar.gz"] = {"sha256": data_release.sha256(rel / "area-a1.tar.gz"), "bytes": 1}
    (tmp / "data-release.json").write_text(json.dumps(m))
    data_release.fetch(["--app", "a1"])
    assert (data / "areas" / "a1" / "graph.json").read_bytes() == b"a1 graph.json v2"


def test_an_unknown_flag_stops_the_fetch(world):
    with pytest.raises(SystemExit):
        data_release.fetch(["--everything"])


def test_prune_orders_by_publish_time_and_keeps_the_named_release():
    rel = [
        {"tagName": "data-20261023-ffff", "publishedAt": "2026-10-23T01:00:00Z"},
        {"tagName": "data-20261023-0000", "publishedAt": "2026-10-23T09:00:00Z"},
        {"tagName": "data-20261022-aaaa", "publishedAt": "2026-10-22T09:00:00Z"},
        {"tagName": "shade-2026-10-23", "publishedAt": "2026-10-23T02:00:00Z"},
    ]
    # By name, data-20261023-0000 sorts below -ffff and would go; by time it is the newest.
    assert data_release.to_delete(rel, 1, None) == ["data-20261023-ffff", "data-20261022-aaaa"]
    assert data_release.to_delete(rel, 1, "data-20261022-aaaa") == ["data-20261023-ffff"]
    assert data_release.to_delete(rel, 6, None) == []


def test_a_release_gzipped_by_another_zlib_still_matches_local_files(world, capsys):
    tmp, data, inputs, rel = world
    # Python 3.9 and 3.12 gzip the same tar to different bytes. Only the tar bytes identify the files.
    raw = data_release.pack_tar("area", "a1")
    (rel / "area-a1.tar.gz").write_bytes(gzip.compress(raw, compresslevel=1, mtime=0))
    m = json.loads((tmp / "data-release.json").read_text())
    m["assets"]["area-a1.tar.gz"] = {"sha256": data_release.sha256(rel / "area-a1.tar.gz"), "bytes": 1}
    (tmp / "data-release.json").write_text(json.dumps(m))
    data_release.fetch(["--app", "a1"])
    assert "keeping local" not in capsys.readouterr().out
    assert json.loads(data_release.STATE.read_text())["area-a1.tar.gz"]["sha256"] == hashlib.sha256(raw).hexdigest()


def test_prune_never_deletes_a_pinned_release(monkeypatch):
    monkeypatch.setattr(data_release, "PINNED", {"data-20261020-old": "rollback"})
    rel = [{"tagName": f"data-2026102{i}-x", "publishedAt": f"2026-10-2{i}T00:00:00Z"} for i in range(1, 9)]
    rel.append({"tagName": "data-20261020-old", "publishedAt": "2026-10-20T00:00:00Z"})
    gone = data_release.to_delete(rel, 6, None)
    assert "data-20261020-old" not in gone and gone == ["data-20261022-x", "data-20261021-x"]


def update_area_release(world):
    tmp, data, inputs, rel = world
    tar_sha = data_release.pack("area", "a1", rel / "area-a1.tar.gz")
    manifest = json.loads(data_release.MANIFEST.read_text())
    manifest["assets"]["area-a1.tar.gz"] = {
        "sha256": data_release.sha256(rel / "area-a1.tar.gz"), "tar_sha256": tar_sha,
        "bytes": (rel / "area-a1.tar.gz").stat().st_size}
    data_release.MANIFEST.write_text(json.dumps(manifest))


def test_area_without_jog_packs_and_legacy_release_fetches_once(world, monkeypatch):
    tmp, data, inputs, rel = world
    area = data / "areas/a1"
    (area / "jog.json").unlink()
    update_area_release(world)
    with tarfile.open(rel / "area-a1.tar.gz") as tar:
        assert tar.getnames() == ["a1/graph.json", "a1/places.json", "a1/hours.json"]
    for name in ("graph.json", "places.json", "hours.json"):
        (area / name).unlink()
    data_release.fetch(["--app", "a1"])
    assert (area / "graph.json").read_bytes() == b"a1 graph.json"
    assert not (area / "jog.json").exists()
    monkeypatch.setattr(data_release, "download", lambda *args: pytest.fail("legacy area fetched twice"))
    data_release.fetch(["--app", "a1"])


def test_missing_optional_jog_is_filled_without_replacing_a_rebuilt_graph(world, capsys):
    tmp, data, inputs, rel = world
    area = data / "areas/a1"
    (area / "jog.json").unlink()
    (area / "graph.json").write_bytes(b"rebuilt")
    data_release.fetch(["--app", "a1"])
    assert (area / "graph.json").read_bytes() == b"rebuilt"
    assert not (area / "jog.json").exists()
    assert "keeping local" in capsys.readouterr().out
    (area / "graph.json").write_bytes(b"a1 graph.json")
    data_release.fetch(["--app", "a1"])
    assert (area / "jog.json").read_bytes() == b"a1 jog.json"
    assert (area / "graph.json").read_bytes() == b"a1 graph.json"


def test_legacy_area_upgrades_to_jog_and_can_return_to_an_older_release(world):
    tmp, data, inputs, rel = world
    area = data / "areas/a1"
    (area / "jog.json").unlink()
    update_area_release(world)
    data_release.fetch(["--app", "a1"])
    legacy = (rel / "area-a1.tar.gz").read_bytes(), data_release.MANIFEST.read_bytes()
    (area / "jog.json").write_bytes(b"new jog")
    update_area_release(world)
    (area / "jog.json").unlink()
    data_release.fetch(["--app", "a1"])
    assert (area / "jog.json").read_bytes() == b"new jog"
    # The old archive has no jog file. A tracked fetched copy must not linger beside it.
    (rel / "area-a1.tar.gz").write_bytes(legacy[0])
    data_release.MANIFEST.write_bytes(legacy[1])
    data_release.fetch(["--app", "a1"])
    assert not (area / "jog.json").exists()


def test_a_rebuilt_jog_file_is_kept_unless_replace_is_given(world):
    tmp, data, inputs, rel = world
    area = data / "areas/a1"
    data_release.fetch(["--app", "a1"])
    (area / "jog.json").write_bytes(b"rebuilt jog")
    data_release.fetch(["--app", "a1"])
    assert (area / "jog.json").read_bytes() == b"rebuilt jog"
    data_release.fetch(["--app", "a1", "--replace"])
    assert (area / "jog.json").read_bytes() == b"a1 jog.json"


def test_optional_jog_does_not_make_core_files_optional(world):
    tmp, data, inputs, rel = world
    area = data / "areas/a1"
    (area / "graph.json").unlink()
    with pytest.raises(SystemExit, match="is missing"):
        data_release.pack_tar("area", "a1")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo("a1/jog.json")
        info.size = 2
        tar.addfile(info, io.BytesIO(b"{}"))
    archive = rel / "area-a1.tar.gz"
    archive.write_bytes(gzip.compress(buf.getvalue(), mtime=0))
    manifest = json.loads(data_release.MANIFEST.read_text())
    manifest["assets"][archive.name] = {"sha256": data_release.sha256(archive), "bytes": archive.stat().st_size}
    data_release.MANIFEST.write_text(json.dumps(manifest))
    with pytest.raises(SystemExit, match="missing required"):
        data_release.fetch(["--app", "a1"])
    assert not (area / "graph.json").exists()
