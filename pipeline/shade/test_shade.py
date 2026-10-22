"""Engine checks on small hand-built height grids. These grids exist only in this test file."""

import gzip
import json
import math
import os
import shutil
import subprocess
import sys

import numpy as np
import pandas as pd
import pvlib
import pytest

import shade


def grid(rows=200, cols=200):
    top = np.zeros((rows, cols), np.float32)
    bottom = np.full((rows, cols), np.inf, np.float32)
    canopy = np.zeros((rows, cols), np.float32)
    deflt = np.zeros((rows, cols), np.uint8)
    return top, bottom, canopy, deflt


def box(surf, r0, r1, c0, c1, h, base=0.0, default=False):
    top, bottom, _, deflt = surf
    top[r0:r1, c0:c1] = h
    bottom[r0:r1, c0:c1] = base
    deflt[r0:r1, c0:c1] = 1 if default else 0


def cast(surf, pts, alt, az, z=1.5):
    top, bottom, canopy, deflt = surf
    zmax = float(max(top.max(), canopy.max()))
    gx = np.array([p[0] for p in pts], float)
    gy = np.array([p[1] for p in pts], float)
    z0 = np.full(len(pts), z) if np.isscalar(z) else np.asarray(z, float)
    return shade.run_bucket(gx, gy, z0, (top, bottom, canopy, deflt, zmax), alt, az)


def test_30m_wall_casts_its_shadow_length():
    # Wall face at col 100, sun due east. At 30 degrees a 1.5 m sample is shaded to (30-1.5)/tan(30) = 49.4 m.
    s = grid(cols=300)
    box(s, 0, 200, 100, 102, 30.0)
    alt = 30.0
    reach = (30.0 - 1.5) / math.tan(math.radians(alt))
    xs = [100 - d for d in (2, 20, reach - 2, reach + 2, 60)]
    codes = cast(s, [(x, 100.5) for x in xs], alt, 90.0)
    assert list(codes) == [shade.BLDG, shade.BLDG, shade.BLDG, shade.SUN, shade.SUN]
    # Ground level reaches 30 / tan(30) = 52.0 m.
    codes = cast(s, [(100 - 50.5, 100.5), (100 - 53.5, 100.5)], alt, 90.0, z=0.0)
    assert list(codes) == [shade.BLDG, shade.SUN]


def test_shadow_falls_north_of_a_south_wall_at_noon():
    # Row grows south. A wall in rows 100-102 with the sun due south shades the north side only.
    s = grid()
    box(s, 100, 102, 0, 200, 30.0)
    codes = cast(s, [(100.5, 100 - 5), (100.5, 102 + 5)], 60.0, 180.0)
    assert list(codes) == [shade.BLDG, shade.SUN]


def test_ray_passes_under_a_raised_podium():
    # A 10 m wide deck from 5 m to 20 m starts 2 m east of the sample. Sun east at 15 degrees:
    # the ray is at 2.0 m entering and 4.5 m leaving, so it stays under the deck.
    s = grid()
    box(s, 0, 200, 102, 112, 20.0, base=5.0)
    assert cast(s, [(100.0, 100.5)], 15.0, 90.0)[0] == shade.SUN
    box(s, 0, 200, 102, 112, 20.0, base=0.0)
    assert cast(s, [(100.0, 100.5)], 15.0, 90.0)[0] == shade.BLDG


def test_sample_on_a_tall_roof_is_unshaded():
    s = grid()
    box(s, 80, 120, 80, 120, 100.0)
    box(s, 80, 120, 125, 135, 60.0)  # lower neighbour toward the sun
    box(
        s, 80, 120, 10, 20, 150.0
    )  # taller tower behind, so the march ceiling sits above the roof sample
    roof = cast(s, [(100.5, 100.5)], 20.0, 90.0, z=100.0 + 1.5)
    street = cast(s, [(70.5, 100.5)], 20.0, 90.0)  # west of the tower, in its shadow
    assert roof[0] == shade.SUN
    assert street[0] == shade.BLDG


def test_north_south_street_at_solar_noon_is_sunny():
    # Solar noon in Makati on 22 Oct falls near 11:40 local time, so take the real transit.
    day = pd.DatetimeIndex([pd.Timestamp("2026-10-22 00:00", tz=shade.TZ)])
    transit = pvlib.solarposition.sun_rise_set_transit_spa(day, *shade.CENTRE)[
        "transit"
    ]
    pos = pvlib.solarposition.get_solarposition(
        pd.DatetimeIndex(transit), *shade.CENTRE
    )
    alt, az = float(pos["apparent_elevation"].iloc[0]), float(pos["azimuth"].iloc[0])
    assert 60 < alt < 70 and 179 < az < 181
    s = grid(300, 300)
    box(s, 0, 300, 100, 140, 50.0)  # west block
    box(s, 0, 300, 160, 200, 50.0)  # east block, 20 m street between cols 140 and 160
    codes = cast(s, [(150.5, r + 0.5) for r in range(20, 280, 20)], alt, az)
    assert set(codes) == {shade.SUN}
    # An east-west street with a 20 m block on its south side: the shadow reaches (20-1.5)/tan(alt), about 9 m.
    e = grid(300, 300)
    box(e, 100, 140, 0, 300, 50.0)
    box(e, 160, 200, 0, 300, 20.0)
    north_side = cast(e, [(c + 0.5, 141.5) for c in (50, 150, 250)], alt, 180.0)
    south_side = cast(e, [(c + 0.5, 157.5) for c in (50, 150, 250)], alt, 180.0)
    assert set(north_side) == {shade.SUN} and set(south_side) == {shade.BLDG}


def test_tree_blocks_above_trunk_and_building_wins():
    s = grid()
    s[2][95:100, 100:105] = 12.0  # crown 3-12 m just east of the sample
    assert cast(s, [(99.0, 97.5)], 40.0, 90.0)[0] == shade.TREE
    # A trunk-height ray under a tall, thin crown misses it: sun so low the ray stays below 3 m.
    assert cast(s, [(99.0, 97.5)], 5.0, 90.0, z=0.5)[0] == shade.SUN
    # A building behind the tree takes priority.
    box(s, 0, 200, 110, 115, 40.0, default=True)
    assert cast(s, [(99.0, 97.5)], 40.0, 90.0)[0] == shade.BLDG_DEFAULT


def test_start_cell_is_not_its_own_obstacle():
    s = grid()
    box(s, 0, 200, 100, 140, 30.0)
    # Sample rasterised just inside the facade cell, sun to the west: open sky.
    assert cast(s, [(100.4, 100.5)], 30.0, 270.0)[0] == shade.SUN


def test_samples_cover_both_ends_and_weights_sum_to_length():
    lat0, lon0 = 14.555, 121.022
    dlon = 12.0 / (111320.0 * math.cos(math.radians(lat0)))
    edges = [
        {"geom": [[lon0, lat0], [lon0 + dlon, lat0]], "flags": 0},
        {"geom": [[lon0, lat0], [lon0, lat0]], "flags": 8},
    ]
    x, y, z, idx, w, lengths = shade.edge_samples(edges)
    e0 = idx == 0
    assert lengths[0] == pytest.approx(12.0, abs=0.1)
    assert e0.sum() == 4  # 0, 5, 10, end
    assert w[e0].sum() == pytest.approx(lengths[0])
    assert w[e0][0] == pytest.approx(2.5) and w[e0][-1] == pytest.approx(
        (lengths[0] - 10) / 2
    )
    assert z[e0][0] == pytest.approx(1.5)
    assert z[idx == 1][0] == pytest.approx(7.5)  # footbridge deck 6 m + 1.5 m


def test_edge_percent_rounds_without_exceeding_100():
    codes = np.array([shade.BLDG, shade.TREE, shade.SUN, shade.BLDG_DEFAULT], np.uint8)
    idx = np.array([0, 0, 1, 1])
    w = np.array([33.5, 66.5, 1.0, 1.0])
    b, t, *_ = shade.edge_percent(codes, idx, w, 2)
    assert int(b[0]) + int(t[0]) == 100
    assert list(b) == [34, 50] and int(t[1]) == 0


def test_night_bucket_writes_255():
    alt = np.array([[-1.0, 10.0]])
    az = np.array([[270.0, 100.0]])
    edges = [
        {"geom": [[121.022, 14.555], [121.0221, 14.555]], "flags": 0, "len_m": 10.8}
    ]
    feats = [
        {
            "type": "Feature",
            "properties": {"height_m": 20.0, "min_height_m": 0, "source": "default"},
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [121.0222, 14.5549],
                        [121.0224, 14.5549],
                        [121.0224, 14.5551],
                        [121.0222, 14.5551],
                        [121.0222, 14.5549],
                    ]
                ],
            },
        }
    ]
    building, tree, lowconf, stats, _ = shade.compute(
        edges, feats, alt, az, log=lambda *_: None
    )
    assert building[0, 0, 0] == 255 and tree[0, 0, 0] == 255
    assert building[0, 1, 0] <= 100


def test_overlay_frame_puts_north_on_row_zero_at_2m_pixels():
    bbox = list(shade.GRAPH_BBOX)
    (lon, lat), (rows, cols) = shade.overlay_frame(bbox)
    assert lat[0, 0] > lat[-1, 0] and lon[0, -1] > lon[0, 0]
    x, y = shade.project_lonlat(lon[:2, :2].ravel(), lat[:2, :2].ravel())
    assert abs(x[1] - x[0] - 2) < 0.05 and abs(y[0] - y[2] - 2) < 0.05
    c, r = shade.lonlat_to_overlay_px(lon[5, 7], lat[5, 7], bbox, (rows, cols))
    assert abs(c - 7.5) < 1e-6 and abs(r - 5.5) < 1e-6


ROOT_DATA = shade.ROOT / "app/public/data"


def _root_run():
    if (
        not (ROOT_DATA / "READY.shade").exists()
        or not (ROOT_DATA / "shade.bin").exists()
    ):
        pytest.skip("no finished root Makati run")
    dates = json.loads((ROOT_DATA / "manifest.json").read_text())["dates"]
    b, t, low, n_e = shade.read_shade_bin(
        ROOT_DATA / "shade.bin", len(dates), len(shade.BUCKETS_MIN)
    )
    return dates, b, t, low, n_e


def test_per_date_files_equal_slices_of_the_root_shade_bin(tmp_path):
    dates, b, t, low, n_e = _root_run()
    files, low_path = shade.write_shade_per_date(tmp_path / "shade", b, t, low, dates)
    nb = len(shade.BUCKETS_MIN)
    for d, path in enumerate(files):
        assert path.name == f"{dates[d]}.bin"
        assert path.read_bytes() == b[d].tobytes() + t[d].tobytes()
        assert path.stat().st_size == 2 * nb * n_e
    assert low_path.read_bytes() == low.tobytes()
    rb, rt, rl, rn = shade.read_shade_per_date(tmp_path / "shade", dates, nb)
    assert (
        rn == n_e
        and np.array_equal(rb, b)
        and np.array_equal(rt, t)
        and np.array_equal(rl, low)
    )


def test_area_run_on_a_copy_of_makati_matches_the_root_run(tmp_path):
    # The --area path, fed a copy of the root Makati inputs, must reproduce the root shade.bin.
    dates, b, t, low, n_e = _root_run()
    tag = "pytest-makati-area"
    stage = tmp_path / tag
    stage.mkdir()
    shutil.copy(ROOT_DATA / "graph.json", stage / "graph.json")
    (stage / "buildings.geojson.gz").write_bytes(
        gzip.compress((shade.ROOT / "pipeline/inputs/buildings.geojson").read_bytes())
    )
    shutil.copy(
        shade.ROOT / "pipeline/inputs/manifest_template.json",
        stage / "manifest_template.json",
    )
    env = dict(
        os.environ,
        UCPH_DATA=str(stage),
        UCPH_INPUTS=str(tmp_path / "inputs"),
        UCPH_START_DATE=dates[0],
    )
    env.pop("UCPH_AREA", None)
    try:
        subprocess.run(
            [sys.executable, str(shade.HERE / "shade.py"), "--area", tag],
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )
        m = json.loads((stage / "manifest.json").read_text())
        assert m["dates"] == dates and m["shade"]["per_date"] is True
        assert m["shade"]["files"] == [f"shade/{d}.bin" for d in dates]
        for d, day in enumerate(dates):
            assert (stage / "shade" / f"{day}.bin").read_bytes() == b[d].tobytes() + t[
                d
            ].tobytes()
        assert (stage / "shade/lowconf.bin").read_bytes() == low.tobytes()
        trees = json.loads((stage / "trees.json").read_text())
        assert trees["fields"] == ["lon", "lat", "r_m", "top_m", "base_m"]
        assert trees["count"] == len(trees["lon"]) and min(trees["top_m"]) >= 3.0
        assert (stage / "READY.shade").exists()
    finally:
        for p in (
            shade.HERE / f"run_log.{tag}.json",
            shade.HERE / f"owned_limits.{tag}.json",
        ):
            p.unlink(missing_ok=True)
        shutil.rmtree(shade.HERE / "debug" / tag, ignore_errors=True)


def test_staged_makati_cbd_matches_the_root_run():
    # Once the graph builder stages makati-cbd, its area output must equal the root run's.
    dates, b, t, low, n_e = _root_run()
    stage = shade.ROOT / "pipeline/stage/makati-cbd"
    if not (stage / "READY.shade").exists():
        pytest.skip("makati-cbd has no staged shade run")
    if (stage / "graph.json").read_bytes() != (ROOT_DATA / "graph.json").read_bytes():
        pytest.skip("the staged makati-cbd graph differs from the root graph")
    m = json.loads((stage / "manifest.json").read_text())
    if m["dates"] != dates:
        pytest.skip("the staged makati-cbd run used other dates")
    rb, rt, rl, rn = shade.read_shade_per_date(
        stage / "shade", dates, len(shade.BUCKETS_MIN)
    )
    assert (
        rn == n_e
        and np.array_equal(rb, b)
        and np.array_equal(rt, t)
        and np.array_equal(rl, low)
    )
