"""Which Google Open Buildings v3 outlines fill OSM gaps (decision 2026-10-23). build_buildings.py applies it."""

MAX_OSM_OVERLAP = 0.10
MIN_HEIGHT_M = 2.5


def verdict(conf, threshold, osm_overlap_share, raster_median_m):
    """"added", or the first rule the outline fails. raster_median_m is None when the raster has too few building pixels."""
    if conf < threshold:
        return "below_80pct_precision"
    if osm_overlap_share >= MAX_OSM_OVERLAP:
        return "overlaps_osm"
    if raster_median_m is None or raster_median_m < MIN_HEIGHT_M:
        return "height_raster_sees_no_building"
    return "added"
