# A 30 m building shades a sidewalk 4 m away at most hours, except near noon on 111 days a year

A correction on 2026-10-21 followed a later run of the sun script. The noon-window calculation holds for one chosen height and offset. It does not measure shade across the city.

Cast separate building-part geometry. Derive tile margins from obstacle height and the lowest sun elevation. A 200 m obstacle at 15 degrees casts a shadow of about 746 m. See [the geometry and validation corrections](../../docs/research-corrections.md).

[VERIFIED] has a source URL I read. [UNVERIFIED] is recall, estimate, or a source I could not open.

I did not run the script before I wrote this report. The code is saved and ready. The sun table below uses the same NOAA equations as the script, but I worked it by hand. Expect about 0.3 degrees of error in altitude and 1 degree in azimuth. Run the script once to replace the table.

    python3 -I research/20261021T120813Z/scripts/04/sun_geometry.py research/20261021T120813Z/raw/04

The files are `scripts/04/sun_geometry.py` and `raw/04/sun_geometry_handcomputed.csv`.

## 1. On six sample dates in Manila (14.58 N, 121.0 E, UTC+8), a 30 m building casts 0.4 to 277.5 m shadows from 07:00 to 17:00

The method uses NOAA declination and equation of time, then the solar hour angle. Azimuth runs clockwise from north. Shadow length equals height over tan(altitude). The ground is flat. [UNVERIFIED] I computed this table by hand and did not run it.

| Date | Hour | Alt (deg) | Az (deg) | 30 m building shadow (m) | 10 m tree shadow (m) |
|---|---|---|---|---|---|
| 21 Mar | 07:00 | 13.8 | 93 | 122.4 | 40.8 |
| 21 Mar | 09:00 | 42.5 | 103 | 32.7 | 10.9 |
| 21 Mar | 12:00 | 75.8 | 176 | 7.6 | 2.5 |
| 21 Mar | 15:00 | 44.1 | 256 | 30.9 | 10.3 |
| 21 Mar | 17:00 | 15.5 | 266 | 108.5 | 36.2 |
| 1 May | 07:00 | 19.5 | 79 | 84.7 | 28.2 |
| 1 May | 09:00 | 48.3 | 84 | 26.8 | 8.9 |
| 1 May | 12:00 | 88.2 | 281 | 1.0 | 0.3 |
| 1 May | 15:00 | 44.9 | 277 | 30.2 | 10.1 |
| 1 May | 17:00 | 16.2 | 282 | 103.1 | 34.4 |
| 21 Jun | 07:00 | 19.8 | 70 | 83.5 | 27.8 |
| 21 Jun | 09:00 | 47.2 | 71 | 27.8 | 9.3 |
| 21 Jun | 12:00 | 81.1 | 357 | 4.7 | 1.6 |
| 21 Jun | 15:00 | 46.2 | 289 | 28.8 | 9.6 |
| 21 Jun | 17:00 | 18.8 | 290 | 88.3 | 29.4 |
| 15 Aug | 07:00 | 17.6 | 80 | 94.8 | 31.6 |
| 15 Aug | 09:00 | 46.3 | 85 | 28.7 | 9.6 |
| 15 Aug | 12:00 | 89.3 | 170 | 0.4 | 0.1 |
| 15 Aug | 15:00 | 46.6 | 275 | 28.4 | 9.5 |
| 15 Aug | 17:00 | 17.8 | 280 | 93.4 | 31.1 |
| 21 Sep | 07:00 | 17.4 | 94 | 95.6 | 31.9 |
| 21 Sep | 09:00 | 46.1 | 105 | 28.9 | 9.6 |
| 21 Sep | 12:00 | 75.9 | 192 | 7.5 | 2.5 |
| 21 Sep | 15:00 | 40.8 | 258 | 34.8 | 11.6 |
| 21 Sep | 17:00 | 12.0 | 268 | 141.4 | 47.1 |
| 21 Dec | 07:00 | 8.7 | 117 | 195.4 | 65.1 |
| 21 Dec | 09:00 | 32.9 | 131 | 46.3 | 15.4 |
| 21 Dec | 12:00 | 51.9 | 182 | 23.5 | 7.8 |
| 21 Dec | 15:00 | 30.8 | 231 | 50.4 | 16.8 |
| 21 Dec | 17:00 | 6.2 | 244 | 277.5 | 92.5 |

Read the table with these notes.

- On 1 May and 15 Aug at noon, the sun sits within 2 degrees of the zenith. Ignore the azimuth there.
- On 15 Aug at noon, the sun is 0.7 degrees from the zenith. The 30 m shadow is 0.4 m.
- On 21 Dec at 17:00, the sun is near sunset. Real shadows hit neighbouring buildings long before 277 m.
- The table uses declinations of 0.4, 14.9, 23.4, 13.9, 0.8, and -23.4 degrees. [UNVERIFIED] Recalled values.

## 2. The building part of the claim "buildings shrink near noon, trees and covers dominate midday" holds only near noon on 111 days a year

The claim is partly true. Outside those two windows, buildings dominate.

The table gives these numbers.

- When the sun is below 82.4 degrees, a 30 m building shades a sidewalk 4 m from its facade. That angle is atan(30/4).
- At 12:00 the 30 m shadow is 7.5 m in Mar and Sep. It is 4.7 m in Jun and 23.5 m in Dec. All reach a 4 m offset.
- At 12:00 on 1 May the shadow is 1.0 m. On 15 Aug it is 0.4 m. Neither reaches a 4 m offset.
- At 09:00 and 15:00 the shadow is 27 to 35 m on every date except Dec (46 to 50 m). Buildings dominate those hours.
- At noon the shadow of a 10 m tree is only 0.1 to 2.5 m long, or 7.8 m in Dec. The crown shades the ground below it at every hour.

The sun passes 82.4 degrees for about one to two hours around noon. My hand estimate from the table was roughly two to three weeks around each zenith pass. The estimated windows were late April to mid May, and early to mid August. [UNVERIFIED] A later run of `scripts/12/noon_windows.py` replaces it with 111 days, 9 Apr to 2 Jun and 12 Jul to 5 Sep (`raw/04/noon_windows.txt`).

The test has these limits.

- The test uses one 30 m building on flat ground. Real shade depends on street direction, setbacks, and neighbours. The router must cast real footprints.
- I did not measure physical covers such as arcades, overpasses, and jeepney sheds. Their share of midday shade is [UNVERIFIED]. Test it with a cover inventory for NCR.
- Tree shade is not opaque. UMEP defaults to 3 percent light through a crown. [VERIFIED] https://umep-docs.readthedocs.io/en/latest/processor/Outdoor%20Thermal%20Comfort%20TreePlanter.html
- One transmissivity does not fit all trees. [VERIFIED] https://par.nsf.gov/servlets/purl/10416263
- A satellite canopy raster cannot tell species apart.

## 3. The vector shadow docs I read give no speed figure, and vector methods have no tree transmissivity

- pybdshadow makes shadow polygons from footprints with heights. It gets sun position from suncalc-py. It works with GeoDataFrames and uses TransBigData and keplergl. [VERIFIED] https://pybdshadow.readthedocs.io/en/latest/
- The pybdshadow docs give no benchmark and no building count. They state no licence. I recall BSD-3. [UNVERIFIED]
- Speed for 100k buildings has no published figure. Time it on a Makati sample.
- With shapely extrusion, you write the code. For each building, union the footprint, the shifted footprint, and the hull of each edge pair.
- I estimate tens of seconds per timestamp for 100k buildings with vectorised shapely 2. [UNVERIFIED] Estimate only.
- Then intersect with sample points or sidewalk buffers through an STRtree.
- Shadow Accrual Maps is a GPU method that sums shadows over a time interval. It is C++ with OpenGL and OpenCL. Case studies cover Manhattan, Chicago, and Boston. The abstract gives no timings. [VERIFIED] https://arxiv.org/abs/1907.04435
- The repo ViDA-NYU/shadow-accrual-maps carries the label "Data". I found no Python package called shadow-accrue. [VERIFIED] https://arxiv.org/abs/1907.04435
- Shadow Accrual Maps is not a practical v1 choice.
- 3D-city ray tracing is accurate on facades and overhangs. It needs LoD1 or LoD2 meshes and a tracer such as Embree. It is too heavy for footprints plus heights. [UNVERIFIED]
- Vector methods have no tree transmissivity. Crown polygons add work, because 242,810 crowns multiply the cost.

## 4. Raster shadow casting handles trees and buildings together, so it is the recommended method

- UMEP SOLWEIG takes a building DSM and a separate canopy DSM (CDSM). Non-vegetated pixels are 0. All grids need the same extent and pixel size. [VERIFIED] https://umep-docs.readthedocs.io/en/latest/processor/Outdoor%20Thermal%20Comfort%20SOLWEIG.html
- Default transmissivity is 3 percent. The default trunk zone is 25 percent of canopy height. [VERIFIED] https://umep-docs.readthedocs.io/en/latest/pre-processor/Spatial%20Data%20Tree%20Generator.html
- SOLWEIG outputs Tmrt (mean radiant temperature). Its page does not mention UTCI or PET. [VERIFIED] https://umep-docs.readthedocs.io/en/latest/processor/Outdoor%20Thermal%20Comfort%20SOLWEIG.html
- The docs state no UMEP licence. A QGIS-less CuPy port has a GPL v2-or-later header. [VERIFIED] https://solweig-solfd.readthedocs.io/en/latest/_modules/src/processor/solweig_algorithm_qgisless_cupy.html
- I expect UMEP is GPL. [UNVERIFIED] Plan for GPL, or reimplement the shadow step.
- GRASS r.sun and r.sunmask cast terrain shadow from a DEM. They give no canopy transmissivity. Use them as a cross-check only. [UNVERIFIED]
- Numpy or numba ray marching steps toward the sun and tests whether the DSM tops the ray. A 100 m shadow at 1 m needs about 100 steps per pixel. [UNVERIFIED]
- The CuPy port shows a GPU path exists. [VERIFIED] https://solweig-solfd.readthedocs.io/en/latest/_modules/src/processor/solweig_algorithm_qgisless_cupy.html
- I estimate that a GPU speeds a large raster by 10 to 50 times. [UNVERIFIED] Estimate only.

Build the surface model (DSM) in five steps.

1. Rasterise footprints at 1 m with `rasterio.features.rasterize`. Burn the height attribute and take the highest value on overlaps.
2. Set the canopy raster to 0 inside footprints. This removes roofs from the tree layer. [UNVERIFIED] Check how the Meta CHM treats roofs.
3. Keep two layers, the building DSM and the CDSM. Manila is flat, so use a zero ground. Add a DEM only for hills outside NCR.
4. Do not merge the layers with max(). One merged layer treats trees as opaque.
5. Burn crown polygons p50 into the CDSM. Run p95 as a sensitivity case.

## 5. The v1 router needs only shade fraction and metres in sun, and thermal comfort indexes come later

- For the v1 router, use shade fraction by time bucket and metres in sun.
- My estimate is that a Tmrt proxy drops 10 to 20 C in midday shade. [UNVERIFIED] Do not show it as a measured value.
- For v1.5, compute UTCI from air temperature, humidity, wind, and Tmrt. The `pythermalcomfort` package computes it. [UNVERIFIED]
- As a research add-on, SOLWEIG Tmrt maps need a sky view factor, wall rasters, and weather data. [VERIFIED] https://umep-docs.readthedocs.io/en/latest/processor/Outdoor%20Thermal%20Comfort%20SOLWEIG.html
- PET is a second research add-on and needs a person model. Skip it until a pilot shows value.
- Tree shade error is large. A Phoenix tool modelled tree shade with an RMSE of 5.1 C and a bias of -2.0 C. [VERIFIED] https://meetingorganizer.copernicus.org/ICUC12/session/54471&live

## 6. pvlib with `nrel_numba` is the choice for sun position

- pvlib `get_solarposition` offers nrel_numpy (default), nrel_numba, spa_c, ephemeris, and pyephem. It builds on NREL SPA (Reda and Andreas 2004). [VERIFIED] https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.solarposition.get_solarposition.html
- SPA accuracy is about 0.0003 degrees, and pvlib is BSD-3. [UNVERIFIED] Recalled.
- suncalc-py feeds pybdshadow. [VERIFIED] https://pybdshadow.readthedocs.io/en/latest/
- suncalc-py is fast and light, with lower accuracy. [UNVERIFIED]
- Use pvlib with `nrel_numba` for batch time grids. Use the apparent elevation, which includes refraction.
- The saved script uses the NOAA series with the standard library only. The `--pvlib` flag prints a cross-check.

## 7. Morning and afternoon need separate buckets, and storage is 72 to 192 bytes per edge per shade layer

- Morning and afternoon do not mirror each other. On 21 Mar the altitude is 42.5 at 09:00 and 44.1 at 15:00. On 21 Sep it is 46.1 and 40.8. Do not fold them in v1.
- Manila declination runs from -23.4 to +23.4. Use the six dates in section 1 as anchors, or twelve months. Interpolate by declination.
- Shadow length changes 3 to 4 times between 07:00 and 09:00. Use 30-minute buckets from 06:30 to 08:30 and 15:30 to 17:30. Use hourly buckets between. [UNVERIFIED] My design.
- Error is not measured. Compute shade at 5-minute steps for one tile as truth. If mean edge error stays under 0.05 shade fraction, accept the scheme. [UNVERIFIED] The target is my choice.
- Storage uses one uint8 per bucket per edge.
- 6 dates x 12 hourly buckets is 72 bytes per edge.
- 12 months x 16 mixed buckets is 192 bytes per edge.
- At 500,000 NCR walking edges, 72 bytes is 36 MB and 192 bytes is 96 MB. The edge count is [UNVERIFIED].
- Store building shade and tree shade apart. The split doubles the bytes. It lets the app tell the user why a street is cool.

## 8. Score each sidewalk side as its own edge, and test a 5 m sample spacing on one tile

- Sample every 5 m along each edge. Include both end points. Weight each sample by its spacing. [UNVERIFIED] Test the spacing on one tile.
- For the sidewalk offset, shift the road centreline by half the carriageway width plus about 1 m. Use OSM `sidewalk=*` and `width` tags where they exist.
- Where tags are missing, assume 1.5 to 2 m sidewalks. [UNVERIFIED] Check in the field.
- If OSM maps the sidewalk as its own way, sample that way directly.
- Score the left and right sidewalks apart, as two directed edges. A route can then pick the shady side.
- In the afternoon the sun sits west. Buildings on the west side of a N-S street shade the west sidewalk. Do not assume one side.
- Average a 1 m radius around each point. A single 1 m pixel is noisy.
- Treat crossings as fully exposed unless a cover polygon shows cover.

## 9. MinistryOfCoolWalks.jl is the only prior shade router that the search found and read, and it does not use tree data yet

| Project | Scope | Licence | Source |
|---|---|---|---|
| MinistryOfCoolWalks.jl (Henrik Wolf, Julia) | Cool routes. Casts building shade. Tree loaders exist, but the README says tree data is "not (yet) used". | MIT [VERIFIED] | https://github.com/henrik-wolf/MinistryOfCoolWalks.jl |
| ShadeMap (shademap.app) | Browser JS shade from terrain (DEM, DSM, LiDAR) and buildings (OSM or GeoJSON). Trees not mentioned. API key by request form. Tiers are Learn (free, personal), Ship (1,000 external loads a month), and Scale (unlimited). | Not stated. Commercial tiers. [VERIFIED] | https://shademap.app/about |
| Shadow Accrual Maps (NYU) | GPU shadow sums over time | Not confirmed | https://arxiv.org/abs/1907.04435 |
| pybdshadow | Python vector building shadows | Not stated. BSD-3 recalled. [UNVERIFIED] | https://pybdshadow.readthedocs.io/en/latest/ |
| UMEP and SOLWEIG | Raster shadow and Tmrt | Not stated. Port is GPL v2+. [VERIFIED] | links in section 4 |
| ASU (Ariane Middel) | Tempe and Phoenix tree and structure shade studies. A web tool for shade management (ICUC12, 2025). | Not found | https://meetingorganizer.copernicus.org/ICUC12/session/54471&live [VERIFIED] |
| Barcelona and Tempe shade routing | Not found | [UNVERIFIED] | none |
| Undercover (undercover.gov.sg, "Silverfox") | Search found no page. I did not confirm that it lists trees as future work. | Unknown | none |
| CARES Singapore street shade study | Natural plus built shade cuts heat stress most (up to 92 percent). Secondary article. | n/a | https://voiddeck.science.edu.sg/articles/environment/street-shade/ [VERIFIED] |

ShadeMap has commercial terms for production use. Plan an open pipeline and use ShadeMap only for visual checks.

## 10. The recommended pipeline casts raster shade per 1 km tile and stores it per edge

Run these ten steps.

1. Build grids per tile. Use 1 km tiles with a 150 m margin so shadows cross tile edges. Use geopandas, rasterio, and numpy.
2. Make the building DSM from footprints plus heights. Make the CDSM from the Meta/WRI raster with roof pixels zeroed.
3. Compute sun position for each bucket with pvlib (`nrel_numba`), using apparent elevation.
4. Run the raster shadow step per bucket with a numba ray march. Keep building shade and tree shade as separate rasters.
5. Start tree transmissivity at 3 percent, then tune it.
6. Sample edges with shapely 2 and rasterio `sample`. Use 5 m spacing at the sidewalk offset, both sides.
7. Store uint8 arrays per edge (building, tree) in Parquet, indexed by edge id.
8. Route with cost = length x (1 + k x sun exposure) for the chosen time bucket.
9. Check the output against 10 field photos and one short SOLWEIG run for Makati CBD.
10. Re-test the noon claim from section 2 with real footprints.

These compute times are estimates. [UNVERIFIED] Time them on a sample tile.
- Makati CBD has about 5 km2, or 5 million pixels. A numba ray march takes 1 to 5 seconds per bucket per core.
- For Makati CBD, 72 buckets take a few minutes. Edge sampling takes under a minute.
- All NCR has about 620 km2, or 620 million pixels. Expect 100 to 500 seconds per bucket on 8 cores.
- For all NCR, 72 buckets take 2 to 10 hours. I estimate that one GPU cuts that to under 1 hour.
- Vector route (pybdshadow or shapely) handles buildings only. It takes tens of seconds per bucket for 100k buildings. It has no trees.

Five items are still open.

- Run `sun_geometry.py` and diff its output against the hand-computed CSV.
- Time the numba ray march on one Makati tile.
- Check the Meta CHM value over building roofs.
- Find the undercover.gov.sg source for "trees as future work".
- Check licences for pybdshadow, pvlib, and UMEP on their GitHub pages. The web fetch tool could not open github.com.
