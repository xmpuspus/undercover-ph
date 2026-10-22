"""Checks for the region settings, the canopy tile index and the regional PAGASA parser.

Run: pipeline/shade/.venv/bin/python -m pytest pipeline/regions/test_regions.py -q
The advisory strings copy the formats of the PAGASA pages read on 2026-10-22. The saved Visayas page is
pipeline/raw/regions/pagasa/visprsd.html; its test is skipped when that download is absent.
"""
import html
import json
import re
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import fetch_canopy  # noqa: E402
import fetch_weather  # noqa: E402
import region  # noqa: E402

VISPRSD = region.RAW / "pagasa/visprsd.html"


def test_ncr_quadkeys_equal_the_leaves_ph_tiles():
    # leaves-ph data/meta/_fetch_manifest_meta.json lists these four tiles for its NCR box.
    assert sorted(fetch_canopy.quadkeys((120.9, 14.4, 121.15, 14.8))) == [
        "132303031", "132303033", "132303120", "132303122"]


def test_cebu_city_centre_needs_one_canopy_tile():
    assert fetch_canopy.quadkeys((123.877, 10.279, 123.924, 10.346)) == ["132330002"]


def test_tiles_of_one_zoom_share_a_pixel_size_despite_float_noise():
    # Pixel sizes read from the Meta tiles 132303122 and 132303332 on 2026-10-22.
    assert fetch_canopy.same_res((1.1943285669558747, 1.1943285669558819), (1.1943285669559032, 1.1943285669558783))
    assert not fetch_canopy.same_res((1.1943285669558747, 1.1943285669558747), (2.3886571339117494, 2.3886571339117494))


def test_utm_zone_follows_120_east():
    assert region.utm_epsg({"id": "cebu", "osm_bbox": [123.75, 10.2, 124.05, 10.45], "utm_epsg": 32651}) == 32651
    assert region.utm_epsg({"id": "palawan", "osm_bbox": [118.6, 9.6, 118.9, 9.9], "utm_epsg": 32650}) == 32650
    with pytest.raises(SystemExit):
        region.utm_epsg({"id": "split", "osm_bbox": [119.9, 15.0, 120.1, 15.2]})
    with pytest.raises(SystemExit):
        region.utm_epsg({"id": "wrong", "osm_bbox": [123.75, 10.2, 124.05, 10.45], "utm_epsg": 32650})


def test_manifest_epsg_comes_from_the_name():
    assert region.manifest_epsg("33_EPSG_32650_2023_06_30.json") == 32650
    assert region.manifest_epsg("35_EPSG_32651_2023_06_30.json") == 32651


def test_every_region_district_names_a_known_region_inside_its_box():
    from districts import dcommon

    regions = region.regions()
    for row in region.district_rows():
        d = dcommon.District(row)
        assert d.region in regions
        assert region.inside(d.building_bbox, regions[d.region]["osm_bbox"])


@pytest.mark.parametrize("name", ["Cebu City", "CebuCity", "CityOfCebu", "City of Cebu"])
def test_city_spellings_share_one_key(name):
    assert fetch_weather._key(name) == "cebu"


def places(text, cities=("Cebu City",), provinces=("Cebu",)):
    return fetch_weather.region_places(text, list(cities), list(provinces))


def test_a_listed_city_counts_and_other_towns_do_not():
    assert places("Thunderstorm Advisory No. 3 #VISPRSD over #Cebu(Talisay, CebuCity and Mandaue)") == ["Cebu City"]
    assert places("Thunderstorm Advisory No. 3 #VISPRSD over #Cebu(Badian, Sibonga, CityOfCarcar)") == []


def test_a_province_without_a_list_counts_as_the_whole_province():
    assert places("Thunderstorm Advisory No. 3 #VISPRSD expected over #Cebu within 2 hours") == ["Cebu"]
    assert places("Thunderstorm Advisory No. 3 expected over Cebu within 2 hours") == ["Cebu"]


def test_a_city_in_plain_text_is_not_the_province():
    assert places("Thunderstorm Advisory No. 3 rainshowers over Cebu City and Talisay") == ["Cebu City"]


def test_the_ncr_page_format_with_spaces_and_and():
    text = "Thunderstorm Advisory No. 1 #NCR_PRSD over Bataan (Dinalupihan and Hermosa), Pampanga (Lubao, and Angeles City)"
    assert places(text, ["Angeles"], ["Pampanga"]) == ["Angeles"]
    assert places(text, ["Guagua"], ["Pampanga"]) == []


@pytest.mark.skipif(not VISPRSD.exists(), reason="saved PAGASA page not downloaded")
def test_saved_visayas_page_keeps_only_the_newest_advisory():
    page = VISPRSD.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    block = fetch_weather.latest_block(text)
    assert block.startswith("Thunderstorm Advisory No. 20")
    assert "Thunderstorm Advisory No. 19" not in block
    assert places(block) == []
    assert fetch_weather.region_places(block, ["Bacolod"], ["Negros Occidental"]) == ["Bacolod"]


def test_a_region_on_the_shared_metro_manila_page_matches_its_own_cities(tmp_path, monkeypatch):
    text = "Thunderstorm Advisory No. 1 #NCR_PRSD over Metro Manila, Pampanga (Lubao, and Angeles City)"
    shared = {"status": "ok", "source_url": fetch_weather.ADVISORY_URL, "fetched_at": "", "issued_at": None,
              "text": text, "cities": ["Metro Manila"]}
    f = tmp_path / "advisory.json"
    f.write_text(json.dumps(shared))
    monkeypatch.setenv("UCPH_ADVISORY_FROM", str(f))
    monkeypatch.setattr(fetch_weather, "REGION", {"name": "Angeles", "advisory_provinces": ["Pampanga"]})
    monkeypatch.setattr(fetch_weather, "area_cities", lambda: ["Angeles"])
    assert fetch_weather.shared_advisory()["cities"] == ["Angeles"]
