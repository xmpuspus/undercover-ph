# Other local projects have tree canopy, flood and weather data, and a search of two of them found no walkway data

I read these local files on 2026-10-21. The leaves-ph tree layer below gives tree shade. A note said that Singapore's Undercover project lists trees as future work, but report 04 found no page that says so. [UNVERIFIED]

## leaves-ph has a tree canopy height raster with about 1.19 m pixels that covers all six pilot areas

- `leaves-ph/data/meta/canopy_height_ncr.tif` holds Meta / WRI Global Canopy Height v2. It stores uint8 height in metres at about 1.19 m pixels, in `EPSG:4326`, and is 64 MB.
- The bounding box in `_fetch_manifest_meta.json` is 120.9 to 121.15 E and 14.4 to 14.8 N. All six pilot candidates are inside it.
- The source is four zoom-9 quadkey tiles from the AWS Open Data bucket `dataforgood-fb-data`, prefix `forests/v1/alsgedi_global_v6_float/chm/`.
- `leaves-ph/site/public/data/tree_crowns_ncr_tagged.pmtiles` holds 242,810 tree crown polygons with median (p50) and p95 height.
- The Meta imagery dates from about 2018 to 2020. So it misses towers and street trees that came after that date.
- The crowns come from a 5 m canopy mask. The crown layer has no small street trees or hedges under 5 m.
- The license is CC-BY-4.0. `leaves-ph/pipeline/fetch_meta_canopy_height.py` is the fetch code.
- I sampled the raster over Makati CBD (121.012 to 121.032 E, 14.548 to 14.562 N) on 2026-10-21.
- In that box, 18.4% of pixels read above 0 m and 6.9% read 5 m or more. The highest value is 26 m.
- PBCom Tower and RCBC Plaza read 0 m in a 21 by 21 pixel window. The raster does not count tower roofs as canopy.
- The raster grid is 23,864 by 38,182 pixels, with a nodata value of 255.

## flood-status-ph sets the rule that river levels alone cannot mark a street flooded or dry

- flood-status-ph reads live PAGASA Pasig-Marikina-Tullahan river levels.
- Its README states the rule "A high river does not prove the condition of a named street."
- A street keeps the state `Not recently checked` until a reviewed field report exists. No observer positions exist yet.
- Rain mode v1 must not call a street flooded or dry from river levels alone.
- Rain mode v1 uses shelter routing plus static flood-prone flags. The app labels these flags as history. It does not show them as live status.

## rainbank-ph has street flood records from one event, 17 August 2026

- `rainbank-ph/data/makati-2026-08-17.json` and `regional-roads-2026-08-17.json` hold the 17 August 2026 flood records.
- They include Makati DRRMO street depths and 43 MMDA and LGU road observations.
- The router can use them as a starting list of flood-prone street segments for a historical flag layer.

## ph-civic-data-mcp already has the weather tools for a hot or rainy mode

- The PAGASA tools are `get_weather_forecast`, `get_weather_alerts`, and `list_pagasa_advisory_files`.
- `get_solar_and_climate` uses NASA POWER data. `get_air_quality` uses Open-Meteo data.
- A server can use these tools to suggest a hot or rainy mode, with no new scraper.

## solar-map-ph has CI checks that block residential building geometry from publication

- Its CI checks block publication of residential geometry per building.
- The router can use the same checks for crowd reports or building-level data that it publishes.

## No local data exists for walkways, sidewalks, or covers

- A search of `public-transportation-innovation/` and `traffic-intelligence/docs` found no covered walkway, footbridge, or shade data.
- `public-transportation-innovation/LANDSCAPE-STUDY.md` names GTFS Pathways and footbridges as gaps in PH data.
