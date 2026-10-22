# Sibling projects already hold the tree layer that Singapore lists as future work

These local files were read on 2026-10-21.

## leaves-ph gives a 1 m tree canopy height raster for all of NCR

- `leaves-ph/data/meta/canopy_height_ncr.tif`: Meta / WRI Global Canopy Height v2, uint8 height in metres, about 1.19 m pixels, EPSG:4326, 64 MB.
- Bbox in `_fetch_manifest_meta.json`: 120.9 to 121.15 E, 14.4 to 14.8 N. All six pilot candidates fall inside it.
- Source: AWS Open Data bucket `dataforgood-fb-data`, prefix `forests/v1/alsgedi_global_v6_float/chm/`, four zoom-9 quadkey tiles.
- `leaves-ph/site/public/data/tree_crowns_ncr_tagged.pmtiles`: 242,810 crown polygons with p50 and p95 height.
- Limit: the Meta imagery dates from about 2018 to 2020. It misses towers and street trees that came after that date.
- Limit: crowns come from a 5 m canopy mask. Small street trees and hedges under 5 m drop out.
- License: CC-BY-4.0. Fetch code: `leaves-ph/pipeline/fetch_meta_canopy_height.py`.
- The raster was sampled over Makati CBD (121.012 to 121.032 E, 14.548 to 14.562 N) on 2026-10-21.
- In that bbox, 18.4% of pixels read above 0 m and 6.9% read 5 m or more. The maximum is 26 m.
- PBCom Tower and RCBC Plaza read 0 m in a 21 by 21 pixel window. The raster does not count tower roofs as canopy.
- Raster grid: 23,864 by 38,182 pixels, nodata 255.

## flood-status-ph teaches one hard rule for rain mode

- It reads live PAGASA Pasig-Marikina-Tullahan river levels.
- Its README states: "A high river does not prove the condition of a named street."
- A street keeps the state `Not recently checked` until a reviewed field report exists. No observer positions exist yet.
- Rain mode v1 must not call a street flooded or dry from river levels alone.
- Rain mode v1 uses shelter routing plus static flood-prone flags. The app labels these flags as history, not live status.

## rainbank-ph gives one historical flood event for Makati

- `rainbank-ph/data/makati-2026-08-17.json` and `regional-roads-2026-08-17.json` hold the 17 August 2026 flood records.
- They include Makati DRRMO street depths and 43 MMDA and LGU road observations.
- Use: a seed list of flood-prone street segments for a historical flag layer.

## ph-civic-data-mcp gives weather tools

- `get_weather_forecast`, `get_weather_alerts`, `list_pagasa_advisory_files` (PAGASA).
- `get_solar_and_climate` (NASA POWER) and `get_air_quality` (Open-Meteo).
- Use: a server-side mode suggestion (hot or rainy) without a new scraper.

## solar-map-ph gives a residential privacy gate pattern

- Its CI gates block per-building residential geometry from publication.
- Use: the same pattern for crowd reports or building-level data that the router publishes.

## No local data exists for walkways, sidewalks, or covers

- A search of `public-transportation-innovation/` and `traffic-intelligence/docs` found no covered walkway, footbridge, or shade data.
- `public-transportation-innovation/LANDSCAPE-STUDY.md` names GTFS Pathways and footbridges as gaps in PH data.
