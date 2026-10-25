# Add a walking area outside Metro Manila

The district pipeline builds a walking area in any Philippine city from public sources.
No source needs an account. Cebu City centre is the first area built this way.

Metro Manila builds do not read the settings files in this folder. Their districts have no `region` key, so they keep the paths and text in `pipeline/common.py`.
Only `fetch_gob.py` connects Metro Manila builds to this folder. It imports `region.py` and loads every manifest in `pipeline/raw/regions/gob_manifests/`. It then keeps only zone 51 tiles for a Metro Manila district, so the tiles it picks do not change.
A Makati CBD rebuild with this code wrote byte-identical `graph.json`, `places.json`, `hours.json` and `buildings_display.geojson`, and the same building set.

## The sources are public files

| Data | Source | How the pipeline reads it |
| --- | --- | --- |
| Streets, buildings, places | Geofabrik `philippines-261020.osm.pbf`, MD5 `941dd405ba4f1c028ca874cde38ea200` | `cut_pbf.py` cuts one PBF per region with osmium |
| Building heights | Google Open Buildings 2.5D Temporal, 2023 bands, bucket `open-buildings-temporal-data` | `pipeline/districts/fetch_gob.py` reads windows of the public COGs over HTTP |
| Tree heights | Meta and WRI High Resolution Canopy Height, `s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/` | `fetch_canopy.py` downloads whole quadkey tiles |
| Rain advisory | PAGASA regional forecast pages, `https://www.pagasa.dost.gov.ph/regional-forecast/<slug>` | `pipeline/fetch_weather.py` reads the area's page |

## Steps

Run every command from the repo root.
Use `pipeline/.venv` for the graph scripts. Use `pipeline/shade/.venv` for the canopy and shade scripts, because it has numba.

1. If the city has no region in `regions.json` yet, add one.
   Give it an `id`, a `name` and an `osm_bbox` that holds the whole metro area with some margin.
   Set `utm_epsg` to 32651 for a city east of 120 E, and to 32650 west of it.
   Set `pagasa_prsd` and `advisory_provinces` from the table below. Use `null` when no page fits.
   `crossing_streets` names the main streets whose crossings `graph_log.json` counts. It can be empty.

2. Cut the region's OSM extract. It takes about 5 seconds.

   ```sh
   pipeline/.venv/bin/python -I pipeline/regions/cut_pbf.py cebu
   ```

   This writes `pipeline/raw/regions/osm/cebu.osm.pbf` and a log with both MD5s.

3. Choose the district box from OSM names in the new PBF.
   `pipeline/regions/candidates.md` ranks candidate boxes by walkable length and places.
   A box of about 2 to 5 km per side matches the Metro Manila districts.

4. Add the district to `districts.json` in this folder. Use the same fields as `pipeline/districts.json`, plus `region`.
   To join two or more districts into one routing area, add a row to `areas.json` in this folder, in the shape of `pipeline/areas.json`.
   You can use a district id alone as a one-district area.

5. Check that Google heights cover the district.

   ```sh
   pipeline/.venv/bin/python -I pipeline/regions/fetch_gob_manifests.py
   ```

   It lists the bucket, downloads any missing 2023 manifest for zones 50 and 51, and prints the manifest and tile under each district centre.
   Pass `lon,lat` arguments to check other points.

6. Fetch the Google height window. Cebu took 3 minutes.

   ```sh
   pipeline/.venv/bin/python -I pipeline/districts/fetch_gob.py cebu-city-centre
   ```

   Open `pipeline/raw/districts/<id>/gob_2023/window_log.json`. Make sure that `nodata_px` is 0.

7. Build the area. Cebu took 20 to 35 seconds.

   ```sh
   pipeline/.venv/bin/python -I pipeline/districts/build.py cebu-city-centre
   ```

   The bundle goes to `pipeline/stage/<id>/`, the logs to `pipeline/work/districts/<id>/`.

8. Add two or three route pairs to `pipeline/districts/routes.json` under the area id.
   Pick names from `pipeline/stage/<id>/places.json`. Then run the checks again.

   ```sh
   pipeline/.venv/bin/python -I pipeline/districts/build.py --checks cebu-city-centre
   ```

   `pipeline/work/districts/<id>/summary.json` must show `"checks_passed": true`.

9. Write the area's canopy raster. The first run downloads each tile once, 386 MB for Cebu.

   ```sh
   pipeline/shade/.venv/bin/python pipeline/regions/fetch_canopy.py cebu-city-centre
   ```

   This writes `pipeline/inputs/areas/<id>/canopy.tif`. Tiles stay in `pipeline/raw/regions/canopy_meta/` for the next area.
   `shade.py` stops if a region area has no `canopy.tif`, because the Metro Manila raster does not cover it.

10. Run the shade step for seven dates.

    ```sh
    UCPH_AREA=cebu-city-centre UCPH_START_DATE=2026-10-22 pipeline/shade/.venv/bin/python pipeline/shade/shade.py
    ```

11. Fetch the weather and the advisory.

    ```sh
    UCPH_DATA=pipeline/stage/cebu-city-centre UCPH_START_DATE=2026-10-22 pipeline/.venv/bin/python -I pipeline/fetch_weather.py
    ```

    `fetch_weather.py` reads the area's own PAGASA page. It ignores a shared Metro Manila advisory from `UCPH_ADVISORY_FROM`.

## Region settings choose the OSM extract, the UTM zone and the PAGASA page

| Setting | Effect |
| --- | --- |
| `region` on a district | `ctx.py` takes `PBF`, `TO_UTM`, `TO_LL`, `OSM_EXTRACT` and `CROSSING_STREETS` from the region. `fetch_gob.py` reads tiles in the region's UTM zone only. |
| `osm_bbox` | The PBF box. `ctx.py` stops if a building area falls outside it. |
| `utm_epsg` | The metric CRS for the graph, buildings and Google tiles. `region.py` stops if the box spans two zones. |
| `pagasa_prsd`, `advisory_provinces` | `build_manifest.py` writes a `region` block into the area's `manifest_template.json`. `fetch_weather.py` reads it. |
| `canopy.tif` from `fetch_canopy.py` | Its `CLIPPED_FROM` tag names quadkey tiles, so `shade.py` lists the canopy source as "AWS Open Data tiles", not "via leaves-ph". |

## Every target city has Google heights in one manifest

The bucket holds 1,174 manifests. Three of them are 2023 manifests in the Philippine UTM zones.

- `33_EPSG_32651_2023_06_30.json`, 9,301 tiles, zone 51. https://storage.googleapis.com/open-buildings-temporal-data/v1/manifests/33_EPSG_32651_2023_06_30.json
- `35_EPSG_32651_2023_06_30.json`, 622 tiles, zone 51. https://storage.googleapis.com/open-buildings-temporal-data/v1/manifests/35_EPSG_32651_2023_06_30.json
- `33_EPSG_32650_2023_06_30.json`, 7,351 tiles, zone 50. https://storage.googleapis.com/open-buildings-temporal-data/v1/manifests/33_EPSG_32650_2023_06_30.json

The research folder already had the first two. The zone 50 manifest is in `pipeline/raw/regions/gob_manifests/`.
All nine target cities lie east of 120 E, so they use zone 51 and the first manifest.
Puerto Princesa (118.74 E) is the zone 50 check point.

The centres are OSM `place=city` nodes. Tiles and quadkeys are for the centre point. The PAGASA page is the one whose advisories of 2026-10-22 named the city's province.

| City | OSM centre (lon, lat) | Google tile (under `.../v1/geotiffs/`) | Canopy quadkey | PAGASA page |
| --- | --- | --- | --- | --- |
| Cebu City | 123.90182, 10.29349 | `33a9c_2023_06_30/tile_Zw4FDX48V88.tif` | 132330002 | `visprsd` |
| Iloilo City | 122.57368, 10.69265 | `33aec_2023_06_30/tile_ymq9Xq8So0Y.tif` | 132321110 | `visprsd` |
| Bacolod | 122.95138, 10.67628 | `33aec_2023_06_30/tile_ezcDMQzaCJM.tif` | 132321110 | `visprsd` |
| Davao City | 125.60806, 7.06483 | `32f94_2023_06_30/tile_UpB8qulC6Wc.tif` | 132330212 | `minprsd` |
| Cagayan de Oro | 124.64215, 8.47564 | `32ffc_2023_06_30/tile_e7LUBtCRM5w.tif` | 132330023 | `minprsd` |
| Zamboanga City | 122.07649, 6.90469 | `32504_2023_06_30/tile_bG7n_xQl_PQ.tif` | 132321321 | `minprsd` |
| General Santos | 125.17219, 6.11222 | `32f7c_2023_06_30/tile_spxFlkyhmL0.tif` | 132330223, 132330232 | `minprsd` |
| Baguio | 120.59339, 16.41199 | `3391c_2023_06_30/tile_4SMlG8LFNFY.tif` | 132303011 | `nlprsd` |
| Angeles | 120.59069, 15.13481 | `3396c_2023_06_30/tile_oEipgtbK6h0.tif` | 132303031 | `ncrprsd` |
| Puerto Princesa | 118.74382, 9.73986 | `33b54_2023_06_30/tile_NxppR967yKk.tif` (zone 50) | not checked | not checked |

Angeles uses the Metro Manila page because that office's advisories name Pampanga towns.
General Santos sits on a tile edge, so a box around it needs two canopy tiles.

## The canopy tiles match the leaves-ph raster

`fetch_canopy.py --check makati-cbd` rebuilt a 600 by 600 pixel block at Makati (121.0220 E, 14.5550 N) from the remote tile `132303122`.
It compared the block with the leaves-ph raster that Metro Manila areas use.

- Both are uint8 heights in metres. The tile tags say `UNITS=METERS`. Neither has a 255 nodata pixel in the block.
- 97.98% of pixels are equal and 99.9994% are within 1 m. The largest difference is 2 m.
- The mean is 0.755 m in both, the tallest pixel 20 m in both, and the zero share 82.66% against 82.65%.
- The 1 m differences come from where the average resampling meets pixel edges. The leaves-ph raster is one reprojected mosaic of all of Metro Manila.
- The area window for makati-cbd equals the grid of its existing `canopy.tif`, so the clip uses the same grid as `shade.clip_canopy_to()`.

The full result is in `pipeline/raw/regions/canopy_meta/check_makati-cbd.json`.

## Cebu City centre builds and passes every check

The build ran on 2026-10-22 with `UCPH_START_DATE=2026-10-22`. The district box holds Ayala Center Cebu, Cebu IT Park, Fuente Osmeña and Colon Street.
The numbers come from `pipeline/work/districts/cebu-city-centre/summary.json` and `pipeline/shade/run_log.cebu-city-centre.json`.

| Measure | Value |
| --- | ---: |
| Graph area | 20.3 km2 |
| Nodes | 6,740 |
| Edges | 10,285, or 459.1 km |
| Routable edges | 9,847, or 443.9 km |
| Largest routable network | 91.6% of routable nodes, 94.7% of routable length |
| Roofed, tunnel or indoor routable length | 5.22 km |
| Buildings | 17,110 |
| Buildings with an OSM or Google height | 14,054 (82.1%): 165 OSM height, 792 OSM levels, 13,097 Google |
| Buildings with the 7.5 m default | 1,352 (7.9%) |
| Small buildings with no height | 1,704 (10.0%) |
| Places | 1,280, and 8 more lie over 80 m from the network |
| Hours rows | 4, all from OSM |
| Tree crowns | 82,814; tallest canopy 33 m |
| Tallest building | 185 m, an OSM height |

Shade on 2026-10-23 covers this share of edge length.

| Time | Building shade | Tree shade |
| --- | ---: | ---: |
| 08:00 | 18.8% | 13.5% |
| 12:00 | 6.5% | 12.7% |
| 16:00 | 28.8% | 15.7% |

| From | To | Shortest | Straight line | Sheltered-first, k = 8 |
| --- | --- | ---: | ---: | --- |
| Ayala Center Cebu | Ayala Malls Central Bloc (IT Park) | 1,839 m | 1,432 m | 1,839 m, 16 m sheltered |
| Robinsons Fuente | Ayala Center Cebu | 2,169 m | 1,530 m | 2,189 m, 53 m sheltered |
| Colonnade Mall (Colon) | Robinsons Fuente | 1,660 m | 1,515 m | 1,738 m, 90 m sheltered |

| Step | Time |
| --- | ---: |
| Cut the Metro Cebu PBF (7.3 MB) | 4 to 5 s |
| Google height window, 4 tiles, 0 gap pixels | 182 s |
| Area build, all steps | 20 to 35 s |
| Canopy: one 386 MB tile download, then the mosaic | 169 s, then 9 s |
| Shade for 7 dates and the tree crowns | 26 to 34 s, of which 9 to 15 s is compute |
| Weather and advisory | 3 s |

The weather step read Visayas advisory No. 21, issued 03:24 PM on 2026-10-22. It does not name Cebu City, so `cities` is empty.
`graph.json` is 2.88 MB raw and 0.49 MB gzipped. `buildings_display.geojson` is 3.46 MB raw and 0.43 MB gzipped.

## Some parts still assume Metro Manila

- The app reads its live advisory from `app/api/_pagasa.js`, which fetches the Metro Manila page. `app/src/lib/advisory.ts` checks for "Makati" or "Metro Manila".
- `build_places.py` names rail stations MRT, LRT and PNR and skips Metro Manila Subway stations. Cebu has no rail, so this rule does not change its places.
- Cebu has no cited web hours. Its 4 hours rows come from OSM `opening_hours` only.
- The code supports zone 50, and unit tests check it on manifest names and region settings. Nobody built an area west of 120 E yet.
- Region areas sit in `pipeline/regions/areas.json`. A release step that reads only `pipeline/areas.json` does not ship them.
