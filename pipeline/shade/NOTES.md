# Shade pipeline log

The shade step computes building and tree shade for every walk edge. It covers 7 dates and 26 half-hour buckets, then writes `shade.bin`.

## How to run

```sh
cd pipeline/shade
.venv/bin/python -m pytest test_shade.py -q
.venv/bin/python shade.py            # needs app/public/data/READY.graph
```

The venv uses Python 3.13 from Homebrew. Packages: numpy 2.5.4, numba 0.68.0, rasterio 1.5.2, pyproj 3.8.0, shapely 2.2.0, pvlib 0.16.1, pillow 13.0.0. `requirements.txt` pins them with every transitive package.

Inputs and settings:

- Buildings come from `pipeline/inputs/buildings.geojson`. Tree heights come from `pipeline/inputs/canopy_height_makati.tif`.
- That canopy file is a 1.24 MB clip of the leaves-ph NCR raster, made by `clip_canopy.py`. It holds the source pixels unchanged.
- The clip gave a byte-identical `shade.bin` (md5 `eca694d2132789e3f2b3817b45504059`, dates from 22 October).
- `UCPH_DATA` and `UCPH_INPUTS` point the run at another area. The bboxes come from that area's manifest or template.
- `UCPH_CANOPY` and `UCPH_BUILDINGS` override single input files. `UCPH_START_DATE` sets the first date. Without it, the manifest's first date applies.
- `UCPH_OVERLAY_DATES` limits overlays to the first N dates. `shade.bin` always covers all 7.
- Each run writes `READY.shadows` after the manifest, so the app shows overlays only when they are complete.
- Each routing area keeps its clip in `pipeline/inputs/areas/<id>/canopy.tif`.
- Alabang's building area reaches about 420 m past the NCR raster's south edge, so it has no canopy there.

## Method

1. pvlib gives the apparent elevation and azimuth at 14.555 N, 121.022 E for each bucket.
2. `sun_rise_set_transit_spa` gives sunrise and sunset per date, rounded to the minute.
3. The grid uses a transverse Mercator projection centred on the pilot. Grid north equals true north at the centre.
4. The grid covers the graph area plus 800 m on each side, at 1 m cells.
5. Each building part burns its own geometry. Overlaps keep the highest top and the lowest base.
6. The default-height flag comes from the part that owns the highest top in each cell.
7. The canopy raster is resampled to the grid by nearest neighbour. Nodata and building cells become 0.
8. Samples run every 5 m along each edge `geom`, with both ends included. Each sample carries half the gap to each neighbour as its weight.
9. Ground samples sit at 1.5 m. Footbridge samples (flag 8) sit at 7.5 m, a 6 m deck plus 1.5 m.
10. Each ray steps toward the sun azimuth in 1 m horizontal steps. Above 45 degrees, steps shrink so that each rise stays at 1 m or less.
11. A building blocks the ray when its base is at or below the ray height and its top is at or above it.
12. A crown blocks the ray between 25% of the canopy height and the full height. That lower zone is the UMEP trunk default.
13. The march stops when the ray rises above the tallest top or crown, or leaves the grid.
14. A building hit ends the ray. A crown hit only marks it, so a building further along still wins.
15. The ray skips buildings in its own start cell. Otherwise a sidewalk sample that rasterises into a facade cell reads as shaded at every hour.
16. Sheltered edges (`flags & 7`) get computed values like every other edge.
17. Per edge, `building` is the rounded percent of weighted length in building shadow.
18. `tree` is the rounded building-plus-tree percent minus `building`. So the two values never add up to more than 100.
19. `lowconf` pools all daytime buckets. It is the weighted percent of building-shaded samples whose blocking cell has a default height.
20. When the apparent elevation is at or below 0, both arrays hold 255 for that bucket.

## Checks before the real graph arrived

- 11 unit tests pass in `test_shade.py`, on hand-built grids only. The 11th checks the overlay frame.
- A 30 m wall at 30 degrees shades a 1.5 m sample to 49.4 m and the ground to 52.0 m. The test checks both within 2 m.
- A wall to the south at noon shades its north side and leaves the south side sunny. This pins the row sign.
- A ray passes under a deck with a 5 m base. The same deck on the ground blocks it.
- A sample on a 100 m roof stays sunny. A street sample west of the tower falls in its shadow.
- A north-south street between 50 m blocks stays sunny at the real solar noon of 22 October.
- Solar noon falls near 11:40 local time, so the 12:00 azimuth is 191 degrees, not 180.
- The resampled canopy over the pilot box matches the source. 18.4% of cells read above 0 m, 6.9% read 5 m or more, and the maximum is 26 m.
- At 200 random source pixels of 8 m or more, 99% match exactly and all match within 2 m.

## Sun table

- Sunrise runs from 05:48 to 05:50 and sunset from 17:33 to 17:30 across 21 to 27 October.
- The 18:00 and 18:30 buckets are below the horizon on every date, so they hold 255.
- The 17:30 bucket sits at 0.2 to 0.3 degrees. The model still computes it, and nearly every ray at that height hits something.
- On 22 October at 08:00 the sun stands at 29.7 degrees and azimuth 112.0. Shadows should point toward 292 degrees, west-northwest.
- On 22 October at 15:00 the sun stands at 34.3 degrees and azimuth 245.3. Shadows should point toward 65 degrees, east-northeast.
- From 25 to 27 October the 17:30 bucket drops to or below 0 degrees. Those dates have 3 night buckets instead of 2.

## Real run on 22 October 2026

The current outputs come from the run at 01:06. It used the graph with READY.graph at 01:04:15.

- `graph.json` md5 is `5522d54adb938effb78ff13e90c0c8a9`. `shade.bin` md5 is `97cf750271de2f35de31c7bff159c7a5`.
- The 01:03 graph write added node flags only. `shade.bin` came out byte-identical to the 00:58 run, so edge geometry did not change.
- A copy of the graph this run used sits in `debug/graph.used-by-shade.json`, for later comparison.
- The final rebuild shrank side offsets to keep samples out of ground-level footprints. It turned 29 side edges into 23 centre edges.
- That left 6,274 edges. Flag bit 1024 now marks 65 centre edges that run mostly inside a footprint with no cover tag.
- The 00:41 rebuild lowered the 730 default-height buildings from 25.5, 71.0 or 96.8 m to 7.5 m.

### Run history

| Run | Graph md5 | Edges | Default heights | Building shade at 08:00, 12:00, 16:00 |
| --- | --- | --- | --- | --- |
| 00:33 | `904044ac...` | 6,280 | 25.5 to 96.8 m | 55.4%, 26.1%, 65.8% |
| 00:44 | `506b513b...` | 6,280 | 7.5 m | 53.9%, 25.5%, 63.8% |
| 00:58 | `e785a52b...` | 6,274 | 7.5 m | 53.3%, 23.7%, 62.7% |
| 01:06 | `5522d54a...` | 6,274 | 7.5 m | 53.3%, 23.7%, 62.7% |

- The graph build rewrote the manifest at 00:34:47 and dropped the shade limits once. Its script now keeps lines it does not own.
- `shade.py` now records its own limit lines in `owned_limits.json`. Each run replaces only those lines, so old counts do not pile up.

### Inputs

- `graph.json` holds 6,274 edges and 3,714 nodes, 255.3 km in total. Edge ids equal their positions.
- 158 edges are sheltered (`flags & 7`). 80 edges are footbridges. No edge carries a deck height, so all 80 use 6 m.
- `pipeline/inputs/buildings.geojson` holds 35,124 parts. 801 parts of 100 m2 or less have a null height, so the model leaves them out.
- 22 parts have a raised base. The tallest top is 312.0 m, at The Stratford Residences.
- The tallest canopy cell in the grid reads 27 m.
- The grid measures 4,748 by 4,146 cells at 1 m.

### Outputs

- `app/public/data/shade.bin` holds 2,290,010 bytes. That equals 6,274 edges times 365 bytes.
- `manifest.json` holds `sun`, `sunrise_sunset`, `shade` and `shadow_overlay`, with `n_edges` 6,274.
- It also holds 14 shade limits and 2 shade sources. The 14th limit covers the overlay height.
- The manifest has 53 limits with no duplicates. Every key and limit line from the graph build stayed unchanged.
- Copies of the manifest before each write sit in `debug/manifest.before-shade*.json`.
- `READY.shade` holds the write time, the edge count and the runtime.
- `run_log.json` holds the time for each bucket, the share for each bucket and the added limits.

### Shade shares on 22 October, by edge length

| Time | Sun altitude | Building shade | Tree shade |
| --- | --- | --- | --- |
| 08:00 | 29.7 | 53.3% | 9.2% |
| 12:00 | 64.0 | 23.7% | 10.0% |
| 16:00 | 20.8 | 62.7% | 7.2% |

- Unsheltered edges alone give 53.0% and 9.2% at 08:00, 23.1% and 10.1% at 12:00, and 62.4% and 7.2% at 16:00.
- The values read back from `shade.bin` match the unrounded shares within 0.1 point.
- At 06:00 the sun stands at 2.2 degrees, and buildings shade 98.9% of edge length. At 17:30 they shade 100%.
- Low-confidence shade averages 1.0% per edge, or 1.45% weighted by length. 11 edges have a value of 50 or more.

### Runtime

- Setup takes 1.9 s. That covers the height grids, the canopy resampling and 60,421 samples.
- The 165 daytime buckets take 2.25 s in total. Each takes 0.002 s to 0.12 s, with a mean of 0.014 s.
- The shade step takes 4.85 s to 7.66 s on this Mac, depending on load. That excludes the debug images and overlays.

### Debug images

- `debug/shadow-2026-10-22-0800.png` and `debug/shadow-2026-10-22-1500.png` show ground shadow over the pilot box.
- Enlarged crops from the first run sit beside them as `debug/crop-*.png`.
- At 08:00 the arrow points east-southeast. Building shadows extend west-northwest, and the stepped tower outline repeats on its west side.
- At 15:00 the arrow points west-southwest. Long tower shadows run east-northeast, up and to the right.
- In both images the shadows point away from the sun, which matches the expected bearings above.
- Each rerun redrew both images. Directions stay the same. Default-height houses cast shorter shadows since the 00:41 rebuild.

### Findings for the graph build and the router

- 1,272 samples (2%) sit inside a solid building part at their own height. The start-cell skip stops a facade sample from shading itself.
- 100 unsheltered edges (2.4 km) run mostly inside a building part at walking height. 62 of them carry flag 1024.
- Nobody has checked why the other 38 lack the flag. The graph build notes expect most are vehicle ways with a cover tag, which its rule excludes.
- Sampling also differs. This step samples every 5 m on a 1 m grid. The graph build tests 1 m samples against polygons.
- These edges read as building shade at most hours. A field check must show whether a real roof covers them.
- Before the final rebuild, this count was 193 edges (8.0 km). The graph build notes trace most of those to road side edges pushed into footprints.
- `len_m` equals the haversine length along `geom`. 2,772 edges are shorter than the chord between their own nodes, by up to 2.93 m.
- The side offsets cause that shortfall, and the graph build intends it. A straight-line A* heuristic needs a factor of 0.86 or less.

## Shadow overlays for the map

The app shows ground shadow as a MapLibre image source per date and bucket. `shade.py` writes these overlays in the same run as `shade.bin`.

- The overlays use the same height grids and ray march as `shade.bin`. Each pixel casts its ray from 0.5 m.
- Each PNG covers `manifest.graph_bbox` at 2 m per pixel, 1,573 by 1,272 pixels, with row 0 at the north edge.
- MapLibre stretches an image linearly in Web Mercator. So rows step evenly in Mercator y, not in latitude.
- Building shadow is rgba(15, 23, 42, 0.55) and tree shadow is rgba(22, 101, 52, 0.50). Sun and roof pixels are transparent.
- Each file is a 3-colour palette PNG with a transparency chunk. Alpha values are 140 and 128 out of 255.
- A QA pass in the tilted 3D view found the first colours too faint. The 01:27 rerun uses the stronger colours above. File sizes did not change.
- Buckets with the sun above 3 degrees get a file. That is 06:30 to 17:00, 22 buckets on each of 7 dates.

### Overlay results

- 154 files in `app/public/data/shadows/{date}/{HHMM}.png` hold 26,314,259 bytes in total.
- Files range from 140 KB to 178 KB, under the 250 KB budget.
- `manifest.shadow_overlay` holds the bbox, the four corners, `px_m` 2, the path pattern and the bucket list per date.
- Rendering takes 48 s to 62 s for all 154 files, depending on machine load. Each file takes 0.3 s on average and 1.4 s at most.
- READY.shadows holds the write time, the file count, the total bytes and the runtime.

### Overlay read-back checks

- `debug/overlay-check-2026-10-22-0800.png` and `-1600.png` composite the overlay files from disk on building outlines.
- The outlines come from `pipeline/inputs/buildings.geojson` coordinates through the same Mercator mapping. Misplaced rows would split roofs from outlines.
- Transparent roof pixels fall exactly inside each outline, and shadows touch their facades. So row 0 is north and the corners are right.
- At 08:00 the sun stands at azimuth 112.0. Tower shadows stretch west-northwest, toward 292 degrees.
- At 16:00 the sun stands at azimuth 251.9. Tower shadows stretch east-northeast, toward 72 degrees.
- In both overlays the shadows point away from the sun.
- A unit test checks the frame. Row 0 is north, pixels measure 2 m, and the pixel mapping inverts exactly.

## Areas for the second deploy

`shade.py --area <id>` runs one routing area from `pipeline/areas.json`, or a single district. The root run keeps its old behaviour.

### How to run an area

```sh
cd pipeline/shade
UCPH_START_DATE=2026-10-22 .venv/bin/python shade.py --area metro-core
```

- `--area` or `UCPH_AREA` selects the area before the settings load. `UCPH_DATA`, `UCPH_INPUTS` and the other overrides still win.
- Data defaults to `pipeline/stage/<id>/`. Inputs default to `pipeline/inputs/areas/<id>/`.
- The run reads `graph.json`, `buildings.geojson` or `buildings.geojson.gz`, and `manifest_template.json`. It looks in the data folder, then the inputs folder.
- The canopy comes from `INPUTS/canopy.tif`, else the first `INPUTS/canopy_height*.tif`. When neither exists, the run clips `canopy.tif` from the leaves-ph NCR raster.
- The clip matches `clip_canopy.py`: the `load_canopy()` window plus 16 pixels, tiled 256, deflate, predictor 2.
- Without the NCR raster, as on a build server, a missing clip stops the run with a clear error.
- Dates come from `UCPH_START_DATE`, else the area's `manifest.json`, else its template. These runs used 2026-10-22, the root manifest's first date.
- The run starts `manifest.json` from the template when it is missing or holds other dates, as `set_dates.py` does for the root.

### Area outputs

- `shade/<date>.bin` holds uint8 building[b][e], then uint8 tree[b][e], for one date. That is 52 bytes per edge.
- `shade/lowconf.bin` holds uint8 lowconf[e].
- `manifest.shade` gains `per_date: true`, a date-ordered `files` list and `lowconf`. Its `layout` string describes the per-date files.
- `trees.json` holds tree crowns as columnar arrays `lon`, `lat`, `r_m`, `top_m` and `base_m`. `manifest.trees` names the file, count and fields.
- `READY.shade` in the data folder holds the time, area, edge count and runtime.
- Areas get no PNG overlays. The app draws shadows in the browser from building footprints and `trees.json`.
- Logs go to `run_log.<folder>.json`, owned limit lines to `owned_limits.<folder>.json`, and checks to `debug/<folder>/`.

### Tree crowns come from the same canopy grid as routing shade

1. The run takes the 1 m canopy grid, with building cells already set to 0.
2. It keeps cells of 3 m or more, within 200 m of the graph envelope. A 27 m crown at 8 degrees of sun casts about 190 m.
3. A 3 by 3 mean smooths the grid, so whole-metre plateaus stop tying.
4. Local height maxima seed the crowns. The search window is 5 m below 10 m height, 7 m to 20 m, and 9 m above.
5. Touching maxima merge into one marker. A watershed then assigns each canopy cell to a marker.
6. Flat canopy patches can still end up with one marker each. So a segment wider than 8 m in radius splits into 10 m squares.
7. Each segment becomes a disc of equal area at its centroid. Its top is the 90th percentile height, and its base sits at a quarter of that.

Checks on the crowns:

- The disc areas add up exactly to the canopy area of 3 m or more in every area.
- Before the split, Makati had 520 discs wider than 12 m and one 86.8 m disc. After it, the widest disc is 8.0 m.
- `debug/<area>/trees-check.png` draws the discs over the canopy for the densest 300 m square. In Makati and metro-core, the discs sit on the canopy with no offset.
- In Makati, crowns under 4 m2 hold 0.79% of the canopy area. The run keeps them.

### Area checks

- A `--no-write` root run gives the same 164 bucket shares and limit lines as before the area code.
- A copy of the Makati inputs, run through `--area`, reproduces the root `shade.bin` byte for byte for every date and for lowconf.
- The staged `makati-cbd` bundle has the root graph, and its per-date files equal the root `shade.bin` slices.
- A district layout, with buildings, template and `canopy_height_<id>.tif` in the inputs folder, gives the same bytes without a new clip.
- `test_shade.py` holds 14 tests. Three cover the per-date files, and all 14 pass.
- Every area's file sizes fit the layout, `n_edges` matches its graph, and its dates match the root manifest.

### Results for each area on 22 October

The graph build rebuilt bundles several times between 10:00 and 10:43. A watcher reran any area whose inputs were newer than its `READY.shade` and quiet for 60 s. Every area was current from 10:43:59.

| Area | Edges | Buildings | One date file | Seven dates | lowconf | Crowns | trees.json | trees.json gzip |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| makati-cbd | 6,274 | 35,124 | 326 KB | 2.28 MB | 6.3 KB | 32,399 | 1,068 KB | 221 KB |
| metro-core | 30,894 | 189,704 | 1,606 KB | 11.25 MB | 30.9 KB | 247,610 | 8,182 KB | 1,689 KB |
| pasay-moa | 5,735 | 25,183 | 298 KB | 2.09 MB | 5.7 KB | 14,991 | 494 KB | 106 KB |
| cubao-eastwood | 5,661 | 65,167 | 294 KB | 2.06 MB | 5.7 KB | 65,669 | 2,169 KB | 450 KB |
| qc-north | 9,343 | 96,652 | 486 KB | 3.40 MB | 9.3 KB | 136,914 | 4,538 KB | 921 KB |
| manila | 16,711 | 100,359 | 869 KB | 6.08 MB | 16.7 KB | 50,055 | 1,655 KB | 347 KB |
| alabang | 5,312 | 21,701 | 276 KB | 1.93 MB | 5.3 KB | 76,476 | 2,532 KB | 510 KB |

| Area | Grid | Shade compute | Crowns | Run total | Building and tree shade at 08:00, 12:00, 16:00 on 23 October |
| --- | --- | ---: | ---: | ---: | --- |
| makati-cbd | 4,748 x 4,146 m | 5.1 s | 1.3 s | 9.7 s | 53.4/9.1%, 23.9/10.0%, 62.9/7.1% |
| metro-core | 11,000 x 10,895 m | 28.2 s | 14.5 s | 48.5 s | 40.4/11.2%, 15.3/11.1%, 52.7/10.7% |
| pasay-moa | 5,502 x 4,810 m | 4.1 s | 1.2 s | 6.5 s | 35.2/6.8%, 10.7/6.5%, 36.1/7.5% |
| cubao-eastwood | 6,902 x 5,363 m | 5.6 s | 1.9 s | 8.8 s | 34.3/13.2%, 10.1/12.1%, 37.0/14.1% |
| qc-north | 8,086 x 5,252 m | 10.8 s | 3.2 s | 17.3 s | 24.0/24.2%, 6.1/22.0%, 30.0/25.4% |
| manila | 6,042 x 8,572 m | 12.7 s | 3.4 s | 17.9 s | 45.6/9.6%, 14.9/10.2%, 52.1/10.3% |
| alabang | 5,612 x 5,252 m | 3.6 s | 1.7 s | 6.9 s | 19.5/21.0%, 7.3/19.4%, 28.6/22.6% |

- Run totals exclude the canopy clip, which already existed for the final runs.
- The first metro-core run, with its 6.6 MB clip, took 97 s of wall time and peaked at 3.56 GB of memory.
- In metro-core, 163 daytime buckets take 15.7 s in total, 0.10 s each on average and 0.30 s at most.
- Canopy clips in `pipeline/inputs/areas/<id>/canopy.tif` total 17.8 MB. metro-core's is 6.61 MB.
- metro-core's tallest top is 318 m. The model leaves out 9,084 buildings without a height.
- metro-core has 410 unsheltered edges that run mostly inside a building part.

### Area limits

- One sun position at the area centre serves every edge. Across 10 km the sun direction shifts by about 0.1 degrees.
- The grid covers the envelope of the member districts. Buildings outside their building boxes are not loaded, so some low-sun shadows can be missing.
- Edge samples more than 800 m past the graph area fall outside the grid and count as sun. metro-core has 74 and alabang 52.
- The canopy raster ends about 420 m inside Alabang's southern building margin, so that strip has no trees.
- metro-core's `trees.json` holds 247,610 crowns, 8.2 MB raw and 1.7 MB gzipped. A phone loads it once per area.

## Limits

- One sun position at the pilot centre serves each bucket and the whole walk.
- Crowns block all light. The UMEP default transmissivity is 3%, so tree shade is slightly overstated.
- The canopy map dates from about 2018 to 2020. It misses newer trees and keeps removed ones.
- Overlapping parts merge into one block from the lowest base to the highest top. This fills any gap between stacked parts.
- The low-confidence flag follows the part that owns the highest top in a cell.
- The model loads buildings to 800 m past the graph area. With a 312 m top, that covers far shadows only above 21.3 degrees.
- Buckets below 21.3 degrees on some date are 06:00, 06:30, 07:00, 16:00, 16:30, 17:00 and 17:30.
- Towers east of the building area could shade the east side at 06:00 and 06:30. The model cannot see them.
- A ray that leaves the grid counts as sun.
- Footbridge decks use 6 m because the graph carries no heights.
- The 1 m grid does not add detail. Google heights have an effective resolution of about 4 m.
- Nobody has checked the shade against field photos.
