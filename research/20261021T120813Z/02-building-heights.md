# OSM plus Google 2.5D gives a height to 96% of Makati CBD footprints, and OSM alone gives 27%

A correction on 2026-10-21 limits the headline. The headline counts heights that a rule assigns. No field check measured shade accuracy.

The Google median lacks a building-presence mask. Its 0.5 m output pixels have about 4 m effective resolution. Revisit the eight-pixel threshold before you call a height usable. See [the height and geometry corrections](../../docs/research-corrections.md).

[VERIFIED] means I read the source or ran the code. [UNVERIFIED] means a value I did not compute, a source I did not read, or my recall.

All numbers come from `raw/02/final_union/` and `raw/02/derived_osm_google_v2/`. Scripts are in `scripts/02/`.

## Makati CBD has 1,598 OSM building outlines, and Overture has exactly 1,598 OSM-sourced rows in the same box

- The decision is to ship building shade routing in v1 for a Makati CBD pilot, or to wait for v2.
- The unit is one building footprint polygon with one height in metres above ground.
- The Makati CBD box is lat 14.548 to 14.562, lon 121.012 to 121.032.
- The base count is 1,598 OSM outlines (`building` not `no`) with the centroid in the box. Of these, 778 are over 500 m2. [VERIFIED]
- As a cross-check, Overture holds exactly 1,598 OSM-sourced footprints in the same box. [VERIFIED]
- The router publishes derived shade data, so each source needs an open licence that permits derived works.

## Makati footprints get a height for 96.2% by count and 98.0% by area

The rule takes OSM `height` first, then OSM `building:levels` x 3.74 m, then the Google 2.5D 2023 zonal median.

| Measure | OSM rule only | Google 2.5D only | Union, OSM wins |
|---|---|---|---|
| By count | 432 of 1,598 (27.0%) | 1,524 (95.4%) | 1,537 (96.2%) |
| By footprint area | 54.7% | 97.4% | 98.0% |
| Over 500 m2, by count | 369 of 778 (47.4%) | 754 (96.9%) | 756 (97.2%) |
| Over 500 m2, by area | 64.7% | 97.8% | 98.4% |

All values are [VERIFIED] from `raw/02/final_union/makati.json`.

- 81 of the 432 OSM rule heights are podium heights, the height of the low base under a tower. In each, a `building:part` is more than 5 m taller. [VERIFIED]
- These 81 outlines hold 25.9% of the area over 500 m2. Their median gap to the tallest part is 93.5 m. [VERIFIED]
- Cast each building part on its own geometry. If you apply the tallest height to the entire podium, the shade can come out too large. If you ignore the part, it can come out too small.
- The Google value is the median (p50) of `building_height` over the 0.5 m pixels inside each footprint.
- If a footprint has at least 8 pixels and a median of 2.5 m or more, its Google value counts as usable.
- The levels factor 3.74 m is the median of `height` / `building:levels` on 278 Makati outlines. The ratio limits are 2 m to 6 m.
- Google fills 1,105 footprints, which hold 43.3% of the footprint area. These heights are not mapped but modelled.
- 61 footprints get no height. They hold 2.0% of the area, and 1.6% of the area over 500 m2.

## BGC and Ortigas show the same pattern, with the union covering over 97% of footprint area

| Box | Footprints | OSM rule, count / area | Union, count / area | Union over 500 m2, count / area |
|---|---|---|---|---|
| Makati CBD | 1,598 | 27.0% / 54.7% | 96.2% / 98.0% | 97.2% / 98.4% |
| BGC | 3,462 | 6.1% / 50.7% | 94.4% / 97.3% | 98.9% / 98.1% |
| Ortigas | 771 | 20.5% / 53.2% | 90.0% / 97.6% | 96.7% / 98.3% |

All values are [VERIFIED] from `raw/02/final_union/{bgc,ortigas}.json`. The levels factor is 3.82 m in BGC and 3.87 m in Ortigas.

## Only OSM and Google 2.5D give usable Makati heights, and no other source tested adds one, with Microsoft read as a 20,000-row sample

| Source | Access | Height in the Makati box | Licence | Vintage | Label |
|---|---|---|---|---|---|
| OSM `height` | Local PBF, MD5 checked | 263 of 1,598 (16.5%) | ODbL | 2026-10-20 | [VERIFIED] |
| OSM `building:levels` | Same | 433 (27.1%), including part levels | ODbL | 2026-10-20 | [VERIFIED] |
| OSM `building:part` | Same | 92 outlines get a part height | ODbL | 2026-10-20 | [VERIFIED] |
| Overture `2026-09-23.1` | Anonymous S3 through pyarrow | 432, all copied from OSM | ODbL for OSM rows | 2026-09-23 | [VERIFIED] |
| Google 2.5D Temporal | Anonymous GCS COG window | 1,524 (95.4%), capped near 100 m | CC BY 4.0 or ODbL | 2023-06-30 | [VERIFIED] |
| Microsoft ML Footprints | Anonymous Azure | 0 of 20,000 sampled rows | ODbL | 2026-02-03 build | [VERIFIED] sample |
| LiPAD LiDAR | Public WMS coverage grid | no DSM or DTM in any pilot cell | request form | not stated | [VERIFIED] flags |
| Meta / WRI canopy | Local leaves-ph file | 0 m on PBCom Tower and RCBC Plaza roofs | CC BY 4.0 | about 2018 to 2020 | [VERIFIED] |
| WSF 3D, GHSL built-height | not tested | 90 m to 100 m cells only | open | 2015 to 2018 | [UNVERIFIED] |
| Google Photorealistic 3D Tiles | not tested | terms not read | Google Maps Platform terms | live | [UNVERIFIED] |
| NAMRIA or Makati 3D model | not tested | none found | unknown | unknown | [UNVERIFIED] |

These notes give the source details.

- Overture holds 2,058 footprints in the box. Of these, 1,598 come from OSM, 395 from Google Open Buildings, and 65 from Microsoft. [VERIFIED]
- Overture carries heights only on OSM rows. The 460 non-OSM footprints have no height. [VERIFIED]
- The 460 non-OSM footprints cover 33,335 m2, or 2.4% of Overture footprint area in the box. [VERIFIED]
- Microsoft rows carry `"height": -1.0` in all 20,000 sampled rows of quadkey `132303122`. [VERIFIED]
- The Microsoft sample spans lat 13.92 to 14.61. 21 of its rows fall in the Makati box. [VERIFIED]
- I did not read the full 104 MB Microsoft file. Rows outside the sample stay [UNVERIFIED].
- Google states PH coverage, a 1.5 m error measured only in North America, Europe, and Japan, and a 100 m cap. [VERIFIED] https://sites.research.google/gr/open-buildings/temporal/
- Google states the CC BY 4.0 or ODbL choice. [VERIFIED] https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1
- I read Google with anonymous HTTP range requests. I did not use Earth Engine or the personal key. [VERIFIED]

## Google 2.5D reads 99 of 100 Makati towers above 100 m lower than OSM, and OSM has a height for 122 of 123

- The highest Google 2.5D value inside any Makati footprint is 99.5 m. Only 9 of 15.5 million pixels reach 100.0 m. [VERIFIED]
- 46 Makati outlines have an OSM rule height above 100 m. Google reads all 46 lower. [VERIFIED]
- 100 outlines have an OSM tag or part height above 100 m. Google reads 99 of them lower. [VERIFIED]
- For those 100 outlines, the OSM median is 136.2 m and the Google p90 median is 95.5 m. [VERIFIED]
- 79 Makati footprints read at the cap, which I define as a Google p90 of 95 m or more. [VERIFIED]
- 123 footprints show a height above 100 m from the OSM rule, an OSM part, or the Google cap. [VERIFIED]
- 6 of the 123 have no OSM rule height. 5 of them carry an OSM `building:part` height of 104.7 m to 192 m. [VERIFIED]
- 1 tower, Citadines Benavidez Makati, has no OSM height at all. Its Google median is 93.5 m. [VERIFIED]
- BGC has 2 such towers and Ortigas has 9. [VERIFIED]
- Those 100 outlines hold 26.8% of the Makati footprint area over 500 m2. [VERIFIED]
- At 45 degrees of sun altitude, a 200 m tower casts a 200 m shadow. With the Google value, the shadow is under 100 m.

## OSM outline tags often hold the podium height, so use `building:part` heights for towers

- In 81 Makati outlines, a `building:part` is more than 5 m taller than the rule height. [VERIFIED]
- PBCom Tower reads 36 m on its outline and 258 m on its part. [VERIFIED]
- Discovery Primea reads 14 m on its outline and 250 m on its part. [VERIFIED]
- The rule "height, else levels" gives these towers their podium height. So their shadows are too short.
- Cast shadows from the parts, or use the tallest part height for the outline.

## Google and OSM agree within 8.6 m median on Makati buildings up to 100 m

| Pair (Makati) | Matched | Median absolute difference | Median OSM minus Google or other |
|---|---|---|---|
| OSM `height` against Google median, OSM up to 100 m | 178 | 8.6 m | -1.6 m |
| OSM `height` against Google p90, OSM up to 100 m | 178 | 11.7 m | -10.8 m |
| OSM `height` against Google p90, OSM over 100 m | 36 | 46.1 m | +46.1 m |
| OSM `height` against OSM levels x 3.74 m | 256 | 0.1 m | 0.0 m |
| OSM against Overture | 432 | 0.0 m | 0.0 m |

All values are [VERIFIED]. BGC gives 7.7 m on 50 pairs, and Ortigas gives 8.6 m on 19 pairs.

- The three Google rows use only outlines without parts. The levels row and the Overture row use all outlines.
- The median fits OSM better than p90. The p90 reads about 11 m higher. [VERIFIED]
- Google states that its output "is not guaranteed to be orthorectified, especially for tall buildings." [VERIFIED] project page
- A leaning tower roof falls partly outside its footprint. So the footprint median can read low on tall buildings. [UNVERIFIED] inference
- OSM `height` and `building:levels` agree within 0.1 m median. Mappers probably derive one from the other. [UNVERIFIED] inference
- OSM is not a measured reference. No survey or LiDAR height exists for this box to settle the 8.6 m gap. [VERIFIED] for LiPAD

## The last fallback, an area-class default for 2% of Makati footprint area, missed by 45.0 m on average in a leave-one-out test

- The first fallback is the Google median. It agrees with OSM within 8.6 m median on buildings up to 100 m. [VERIFIED]
- The second fallback gives the 61 footprints with no height a default by footprint area class.
- The area-class medians from OSM heights are 25.5 m for 100 to 500 m2 and 71.0 m for 500 to 2,000 m2. Above that, the median is 96.8 m. [VERIFIED]
- The area rule misses by 45.0 m on average in a leave-one-out test. That error is too large for towers. [VERIFIED]
- So use the area rule only for the 61 leftovers. They hold 2.0% of the area, and 1.6% over 500 m2. [VERIFIED]
- Flag each Google-filled height as "modelled 2023" in the data. Google fills 43.3% of the area. [VERIFIED]

## Google 2.5D misses buildings that came after mid-2023

- 12 Makati outlines carry `building=construction` in OSM. [VERIFIED]
- 8 Makati outlines have an OSM height but no usable Google value. [VERIFIED]
- BPI Headquarters carries a 224 m part in OSM and reads 0 m in Google. [VERIFIED]
- New towers need an OSM height. Google gives no update after 2023-06-30. [VERIFIED]

## LiPAD has no LiDAR in any pilot grid cell

- The LiPAD home page shows a coverage map from the WMS layer `lipad:philgrid`. [VERIFIED]
- All six Makati 1 km cells read `DSM: 0`, `DTM: 0`, `ORTHO: 0`, `LAZ: null`. [VERIFIED]
- The cells are E285N1610, E286N1610, E287N1610, E285N1611, E286N1611, and E287N1611. [VERIFIED]
- BGC cell E289N1610 and Ortigas cell E290N1614 read the same. [VERIFIED]
- I read the 0 flags as "no product in this cell". The page has no legend text for them. [UNVERIFIED]
- Access needs a Google Form registration, a request form, a formal letter, and an area shapefile. [VERIFIED]
- Private or commercial use goes through the Business Development Officer. [VERIFIED]
- The terms page returned HTTP 404. The licence stays [UNVERIFIED].
- The WFS endpoint returned HTTP 502. The WMS GetFeatureInfo endpoint returned HTTP 200. [VERIFIED]

## Building shade routing can ship in a Makati v1 pilot on three conditions

The verdict is a CONDITIONAL yes for Makati CBD v1. The union gives a height to 98.4% of the area over 500 m2. The three conditions are these.

1. Use OSM first, with the tallest `building:part` height for towers.
2. Fill the rest with the Google 2.5D 2023 median. Label those heights as modelled.
3. Give the 61 leftovers an area-class default, and show that shade as low confidence.

- The single action that raises coverage most is the Google 2.5D join. It lifts Makati from 27.0% to 96.2% by count.
- Google 2.5D gets a BLOCKED verdict as a stand-alone source for towers. It reads 99 of 100 Makati towers above 100 m lower than OSM.
- The same verdict holds for BGC and Ortigas on the area over 500 m2. Ortigas has 9 tall footprints with no OSM height.

## Three checks are still open, starting with 10 Google-filled heights against field photos

- Check 10 Google-filled heights against field photos or street imagery shadows in Makati.
- Add an OSM `height` to Citadines Benavidez Makati after a survey, through normal OSM editing.
- I did not read the Google Photorealistic 3D Tiles terms, so extraction rights stay [UNVERIFIED].

## All source reads worked except the DuckDB extension install, the LiPAD WFS, and the LiPAD terms page

| Item | Value |
|---|---|
| OSM PBF | `raw/05/pbf/philippines-261020.osm.pbf`, MD5 `941dd405ba4f1c028ca874cde38ea200` |
| OSM extract | 128 s, 11,964,314 building areas read, 0 geometry errors |
| Overture | 512 files listed, 1 file and 10 row groups read, 4,677 rows in the Makati box plus margin |
| Overture failure | DuckDB `INSTALL httpfs` hung over 90 s, so I used pyarrow. Log in `raw/02/duckdb_ext_probe/` |
| Microsoft index | `dataset-links.csv`, HTTP 200, 7,171,802 bytes, 144 Philippines rows, upload 2026-02-23 |
| Microsoft sample | first 20,000 rows of quadkey `132303122`, HTTP 200, full file 104,273,738 bytes |
| Google manifest | `33_EPSG_32651_2023_06_30.json`, HTTP 200, 3,437,719 bytes |
| Google tile | `3397c_2023_06_30/tile_IQqvgG9RLG4.tif`, HTTP 200, 1,831,598,103 bytes, float32, nodata -99 |
| Google window | Makati box plus 60 m, 4,578 by 3,376 pixels at 0.5 m, read in 40 s |
| LiPAD | home HTTP 200, WMS GetFeatureInfo HTTP 200, WFS HTTP 502, retrieved 2026-10-21 |
