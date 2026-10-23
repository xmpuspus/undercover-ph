"""Run: pipeline/shade/.venv/bin/python -m pytest pipeline/districts/test_v3_rule.py -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import v3_rule  # noqa: E402


def test_an_outline_both_google_sources_agree_on_goes_in():
    assert v3_rule.verdict(0.80, 0.763, 0.0, 6.2) == "added"


def test_an_outline_under_the_80pct_precision_cutoff_stays_out():
    assert v3_rule.verdict(0.762, 0.763, 0.0, 6.2) == "below_80pct_precision"


def test_an_outline_over_an_osm_building_stays_out():
    assert v3_rule.verdict(0.90, 0.763, 0.10, 6.2) == "overlaps_osm"
    assert v3_rule.verdict(0.90, 0.763, 0.099, 6.2) == "added"


def test_an_outline_the_height_raster_does_not_see_stays_out():
    assert v3_rule.verdict(0.90, 0.763, 0.0, None) == "height_raster_sees_no_building"
    assert v3_rule.verdict(0.90, 0.763, 0.0, 2.4) == "height_raster_sees_no_building"
    assert v3_rule.verdict(0.90, 0.763, 0.0, 2.5) == "added"
