# Graph pipeline notes

Built 2026-10-22 (Asia/Manila). These scripts write `graph.json`, `places.json`, `hours.json`, `buildings_display.geojson`, `manifest.json` and `READY.graph` to `app/public/data/`. The full `buildings.geojson` and `manifest_template.json` go to `pipeline/inputs/`, because the app does not load them. All checks passed on the last run.

## Run order

```sh
cd .
# Network reads, run once. Each download sits in its own directory under pipeline/raw/.
pipeline/.venv/bin/python -I pipeline/fetch_gob_window.py
curl -sS -L -A "Mozilla/5.0" -D pipeline/raw/beat_asia/headers.txt \
  -o pipeline/raw/beat_asia/page.html https://thebeat.asia/manila/nomads/explore/ayala-center-malls-guide
# Local rebuild, about two minutes.
zsh pipeline/run_all.sh
```

| Script | Writes |
| --- | --- |
| `extract_features.py` | `work/buildings_osm.jsonl`, `work/features.jsonl`, `work/elevators.json` |
| `fetch_gob_window.py` | `raw/gob_2023/building_area_height_presence.tif` |
| `build_hours.py` | `hours.json`, `work/hours_match.json` |
| `build_graph.py` | `graph.json`, `work/graph_log.json`, `work/edge_causes.json`, `work/edge_highway.json`, `work/node_osm_ids.json` |
| `build_places.py` | `places.json`, `work/places_log.json` |
| `build_buildings.py` | `inputs/buildings.geojson`, `work/buildings_log.json` |
| `route_check.py` | `work/route_check.json` |
| `build_manifest.py` | `manifest.json`, `READY.graph`, `inputs/manifest_template.json` |
| `build_display.py` | `buildings_display.geojson` |

The venv at `pipeline/.venv` uses Python 3.12 with osmium 4.3.2, shapely 2.2.0, numpy, scipy, rasterio 1.5.2 and pyproj 3.8.0. `pipeline/requirements.txt` pins them.
The graph imports `pedestrian_access.py` and `classify()` from the research scripts. Nothing under `research/` changed.

## Areas

- Pilot box: `[121.012, 14.548, 121.032, 14.562]`.
- Graph area: `[121.0074, 14.5435, 121.0366, 14.5665]`, from the contract.
- Building area: `[120.9999, 14.5362, 121.0441, 14.5738]`. This is the graph area plus 800 m, rounded outward.

## Project decisions of 2026-10-22 changed access, heights, side offsets and one flag

Seven decisions of 2026-10-22 changed the build. `access_policy.py` wraps the research policy for points 1 to 3. Nothing under `research/` changed.

1. A `barrier=kerb` node no longer triggers the access check. A kerb is a curb, not a gate.
2. A node with `kerb=raised` adds the steps bit (16) to the crossings that touch it. Lowered, flush and untyped kerbs pass.
3. Only `access:conditional`, `foot:conditional` and `opening_hours` restrict walkers. Other `:conditional` keys restrict vehicles only.
4. An indoor, corridor or building-passage edge with a cited hours row is routable. The router opens and closes it by those hours.
5. Every default height is now 7.5 m, two levels of 3.74 m. Overstated height invents shade, so the default errs low.
6. A side offset shrinks in 0.5 m steps, down to 1.5 m, until no sample sits inside a footprint. Otherwise the side becomes a centre edge.
7. An unsheltered edge mostly inside a footprint, with no cover or indoor tag, gets the new bit 10 (1024).

Gates and entrances keep the research rule. Footprints of 100 m2 or less with no height stay null.

## Counts from the last run

- Nodes: 3,714. Edges: 6,274, or 255.3 km. Before the side-offset fallback there were 6,280.
- Edges by side: 2,950 centre, 1,485 left, 1,839 right.
- Routable edges: 5,586, or 221.4 km. Before the 2026-10-22 decisions: 4,823, or 195.2 km.
- Routable network: 103 pieces. The largest holds 3,069 of 3,499 routable nodes (87.7%) and 199.3 km (90.0%).
- Bit 10, inside a footprint with cover unverified: 65 edges, 1.67 km. 61 of them are routable.
- `node_flags`: 1,896 of 3,714 nodes carry at least one node bit. 1,018 carry a crossing or signal bit.
- Sheltered length (flags & 7): 3.31 km in the graph, 2.23 km of it in 91 routable edges.
- Buildings: 35,107 OSM objects, written as 35,124 polygon features.
- Places: 1,141 kept. 27 were dropped for lying more than 80 m from a routable node.
- Hours rows: 18. Five come from the Beat Asia guide and 13 from OSM.

Buildings by height source, as OSM objects:

| Source | Objects | Share of footprint area |
| --- | ---: | ---: |
| `osm` | 725 | 13.4% |
| `osm_levels` | 519 | 6.2% |
| `google_2023` | 32,332 | 77.0% |
| `default` (7.5 m) | 730 | 2.8% |
| null | 801 | 0.5% |

Places by category:

| Category | Places | Category | Places |
| --- | ---: | --- | ---: |
| station | 5 | park | 18 |
| bus_station | 5 | landmark | 21 |
| mall | 21 | embassy | 39 |
| store | 12 | office | 210 |
| hotel | 92 | residential | 142 |
| hospital | 2 | shopping_area | 13 |
| school | 42 | building | 475 |
| place_of_worship | 28 | neighbourhood | 13 |
| museum | 3 | | |

## Route check: Ayala MRT to Greenbelt is 1,229.6 m, and 1,238.0 m sheltered-first

`route_check.py` reads the node ids from `places.json`, so the test covers the real snap.
Start: "Ayala MRT Station" (OSM way 27663063), node 3121. End: "Greenbelt" (OSM relation 12227982), node 749.

| Run | Length | Sheltered | Share | Minutes at 1.1 m/s |
| --- | ---: | ---: | ---: | ---: |
| Shortest | 1,229.6 m | 79.4 m | 6.5% | 19 |
| Sheltered-first, k = 8 | 1,238.0 m | 317.6 m | 25.7% | 19 |
| Sheltered-first, k = 8, malls closed | 1,232.5 m | 134.9 m | 10.9% | 19 |

- The sheltered-first cost is `len_m x (1 + 8)` on unsheltered edges and `len_m` on sheltered edges.
- The shortest route takes 79.4 m of pedestrian underpass near 6750 Ayala Avenue and Makati Shangri-La, then Legazpi Street.
- The sheltered-first route adds 182.7 m of One Ayala indoor corridors. Those edges open only during mall hours.
- `route_check.py` ignores hours. The "malls closed" run drops every edge with an `hours_idx`, as before 10:00.
- Before the 2026-10-22 decisions, the shortest route was 1,375.6 m with no sheltered metre.

## The access rule now removes 688 edges, or 33.9 km

The graph copies the research extractor's whole-way node rule. A node with a gate, entrance or hours tag flags its whole way.

Loss by single cause. Each row counts edges that carry that cause and no other:

| Cause | Edges | km |
| --- | ---: | ---: |
| Gate node (`gate`, `lift_gate`, `swing_gate`) | 550 | 30.4 |
| Indoor, corridor or building passage without hours | 53 | 0.8 |
| Entrance node | 34 | 0.7 |
| Foot or access conditional on the way | 6 | 0.5 |
| Node with hours | 4 | 0.4 |
| Other barriers | 15 | 0.3 |

- Whole ways that touch an explicitly closed node are left out of the graph. That removes 288 ways, or 5.4 km.
- No edge is unroutable only for missing hours. Every time-restricted edge without hours also needs an access check.
- 299 kerb nodes no longer trigger the check. 37 raised kerbs touch the graph.
- The raised kerbs add the steps bit to 37 crossings and 2 other edges. The 2 sit where no crossing touches the kerb.
- 91 ways lost a vehicle-only conditional: 70 `motor_vehicle:conditional` and 21 `oneway:conditional`.
- Ayala Avenue, Paseo de Roxas and Makati Avenue carry `motor_vehicle:conditional=no @ (Su 06:00-10:00)`, the Sunday car-free rule.
- 25 of the 31 One Ayala indoor edges became routable. The other 6 also touch an entrance node, so they stay unroutable.
- Before the 2026-10-22 decisions, the rule removed 1,457 edges, or 60.2 km. Kerbs removed 12.7 km and vehicle conditionals 13.1 km.

## Flags follow the contract bits

- The research extractor uses different bit values. `build_graph.py` maps tags to the contract bits instead.
- Bits 0 to 2 use the same pedestrian-class guard as `classify()`. The script stops if the two ever disagree.
- `classify()` reads the way tags without vehicle-only conditionals, so those keys set neither bit 6 nor bit 7.
- `tunnel=building_passage` sets bit 2. `tunnel=yes` sets bit 1. Cover tags set bit 0.
- Bit 3 marks any `bridge` value except `no` on a pedestrian-class way, steps included. This is wider than `classify()`.
- Bit 4 marks steps and the edges that cross a raised kerb.
- Bit 5 marks `footway=sidewalk` ways and road side edges on a side with a mapped sidewalk.
- Bit 7 marks ways with hours or walker conditionals, ways through a node with hours, and edges with mall hours.
- Bit 8 marks `footway=crossing`. Bit 9 marks the 2 edges through the one elevator node.
- Bit 10 marks an unsheltered edge with over half its length inside a building footprint. It is a pipeline addition to the contract.
- The check confirms that no edge of a non-pedestrian way carries bits 0 to 2, and no bit 10 edge carries them either.

The contract table with the added bit:

| Bit | Value | Meaning |
| --- | ---: | --- |
| 0 | 1 | Covered pedestrian way (`covered` = yes, arcade, colonnade, roof) |
| 1 | 2 | Pedestrian tunnel or underpass |
| 2 | 4 | Indoor, corridor, or building passage |
| 3 | 8 | Footbridge or elevated walkway |
| 4 | 16 | Steps, or a crossing over a raised kerb |
| 5 | 32 | Sidewalk |
| 6 | 64 | Access evaluation needed |
| 7 | 128 | Time-restricted |
| 8 | 256 | Crossing |
| 9 | 512 | Elevator |
| 10 | 1024 | Inside a building footprint, cover unverified. Sets no shelter bit. The router shows it as low-confidence shade. |

Bit 10 rules:

- The edge carries none of bits 0 to 2. Its way has no `covered` or `indoor` tag other than `no`.
- Over 50% of its length lies inside the union of the footprints it touches. Raised parts count, since a walker passes under them.
- 104 unsheltered edges lie mostly inside a footprint. 39 of them have a `covered` or `indoor` tag, mostly covered driveways, so they get no bit 10.
- All 65 bit 10 edges are centre edges: 37 footways, 16 service roads and 12 steps. No side edge qualifies after the offset fix.

## node_flags mark where a walker can cross between side edges

Both side edges of a road share its nodes, so a route could cross a busy road mid-block. The fix adds a per-node attribute.
`graph.json` now has a top-level `node_flags` array. It holds one integer per node, in the same order as `nodes`.

| Bit | Value | Meaning |
| --- | ---: | --- |
| 0 | 1 | Mapped crossing: `highway=crossing`, any `crossing=*` except `no`, `railway=crossing`, or a touching `footway=crossing` edge |
| 1 | 2 | Traffic signals: `highway=traffic_signals` or `crossing=traffic_signals` on the node |
| 2 | 4 | Junction: 3 or more distinct OSM highway ways meet at the node, each way counted once |
| 3 | 8 | Grade-separated link: a footbridge, underpass or steps edge touches the node |

Rules and choices:

- `crossing=no` says that people cannot cross there. Those nodes get neither bit 1 nor bit 2. 2 graph nodes have it.
- A `footway=crossing` way that also has `crossing=no` does not set bit 1.
- Junctions count every highway way with a node in the building area, walkable or not. A road closed to walkers still makes a junction.
- Bit 8 uses the footbridge and tunnel edge bits and `highway=steps`. A crossing over a raised kerb does not set it.

Counts from the last run:

| Node bit | Nodes |
| --- | ---: |
| 1 crossing | 865 |
| 2 signals | 397 |
| 4 junction | 936 |
| 8 grade-separated | 258 |

Graph nodes that lie on each named road, and those with a crossing or signal bit:

| Road (OSM name) | Graph nodes on it | Bit 1 | Bit 2 | Bit 1 or 2 |
| --- | ---: | ---: | ---: | ---: |
| Ayala Avenue | 87 | 9 | 34 | 41 |
| Paseo de Roxas | 88 | 19 | 45 | 46 |
| Makati Avenue | 107 | 18 | 36 | 40 |
| Senator Gil J. Puyat Avenue | 106 | 21 | 32 | 40 |

- "On a road" means the node lies on any OSM highway way with that exact name, carriageways included.
- Gil Puyat Avenue carries the OSM name "Senator Gil J. Puyat Avenue". The six "Buendia Avenue" residential ways are a different street.
- Adding the key changed nothing else. The file without `node_flags` has the same bytes as before, md5 `e785a52b3ce984acff8e828edf9d97a5`.
- `shade.bin` keeps its edge order, so it stays valid.

## Sidewalk sides use these rules and offsets

- Each road sets a status for its left and right sides from `sidewalk`, `sidewalk:both`, `sidewalk:left` and `sidewalk:right`.
- A side marked as present becomes a side edge with bit 5.
- A one-sided tag gives one side edge. The first plan had two. A second edge would invent a sidewalk the data denies.
- A tertiary or larger road with no sidewalk tag gets two side edges. They carry no bit 5, because no tag confirms a sidewalk.
- A road tagged `sidewalk=no` or `separate` keeps one centre edge. Separately mapped sidewalks stay their own centre edges.
- Ways: 763 have two side edges, 252 have one, 1,851 keep a centre edge.
- Both sides use the road's own `u` and `v`. Left and right follow the OSM way direction.
- Starting offset: half the carriageway width plus 1 m. Width comes from `width`, else `lanes` x 3.2 m, else the class median.
- Width source by side-split way: 944 from `lanes`, 38 from `width`, 33 from the class median.
- Class medians from all lane-tagged ways in the area: primary 3, secondary 3, tertiary 2, residential 2, unclassified 2, service 1.
- The offset then shrinks in 0.5 m steps, down to 1.5 m, until no 1 m sample sits inside a ground-level footprint.
- Ground-level means `min_height_m` is 0. A raised part, such as a skybridge, can sit above a sidewalk.
- The test grows each footprint by 5 cm, so rounding to 7 decimals cannot put a sample inside.
- 380 side edges moved closer to the road. 29 sides, 15 left and 14 right, still sat inside at 1.5 m.
- Those 29 sides became 23 centre edges on the road centreline. Six pieces lost both sides, so one centre edge serves both.
- A fallback centre edge keeps bit 5 when the side it replaces had a mapped sidewalk.
- Final offsets run from 1.5 m to 10.6 m. The median is 4.75 m.
- A recheck of the written file finds no side edge with a 1 m sample inside a ground-level footprint.
- The offset uses mitre joins capped at twice the offset. A test confirmed all 3,353 side edges sit on their stated side.
- `len_m` is the length of the offset line. It can be shorter than the node-to-node distance on the inner side of a bend.

Limits of the side model:

- Side geometry ends at the offset line, a few metres from its nodes. Drawn routes jump between the line and the node.
- The shade builder must sample side geometry as written. The geometry is already offset.
- A route can change sides at any node, not only at a crossing.
- The offset ignores real kerb lines. A dual carriageway can get a side edge on its median.
- Before the offset fix, 109 side edges, about 6.0 km, lay mostly inside building footprints. After it, none do.
- A shrunken offset can still place a sidewalk line on the carriageway edge where buildings reach the road.

## Graph area membership

- The graph keeps every whole way with at least one node in the graph area. No way is clipped.
- The research extractor used the mean node position. That rule could drop a long road whose middle lies inside the area.
- The farthest node lies 513 m outside the graph area. The building area still covers it.

## Hours come only from cited rows

I re-read the Beat Asia guide once on 2026-10-22 at 00:17 Manila time. The page returned HTTP 200.
It shows "Published: February 24, 2026". The server header shows a last change on 2026-10-05. The page MD5 is `e18fee5aa7c4ec6f3e780dab74c0f39e`.

What the page says, word for word in `work/beat_asia_extract.txt`:

- Glorietta: "Sunday to Thursday, from 10 AM to 9 PM; Friday to Saturday, from 10 AM to 10 PM". This matches web_notes.
- Greenbelt: "Daily, from 11 AM to 10 PM". This matches web_notes.
- One Ayala: "Monday to Thursday, from 10 AM to 9 PM; Friday to Sunday, from 10 AM to 10 PM". This matches web_notes.
- New on the page: The Landmark department store and the SM Store hours. I added both as cited rows.
- New on the page: "Greenbelt 1 and 2 are currently undergoing major renovations and will open sometime in 2028".

Hours rules:

- `checked` holds the source's own date. That is 2026-02-24 for the guide and 2026-10-20 for OSM.
- OSM rows come from mall, park and highway ways in the graph area with a simple `opening_hours` value.
- The parser skipped one value: Glorietta 4 reads `Mo-Su 10:00-21:)0`.
- Guide rows win for edge hours. OSM rows apply only to malls without a guide row, such as WalterMart Makati.
- OSM gives Glorietta and Glorietta 5 a 21:00 close on Friday and Saturday. The guide gives 22:00.
- Matched footprints: Glorietta and Glorietta 1 to 5, Greenbelt 3 to 5, two One Ayala areas, The Landmark, SM Makati.
- Greenbelt 1 and 2 get no hours, because the guide says they are closed.
- Only indoor, corridor and building-passage edges get mall hours. OSM maps these only at One Ayala, so 31 edges carry hours.
- 25 of those 31 edges are routable under the 2026-10-22 decisions. The router opens and closes them by the One Ayala row.
- 44 routable plain footways, 792 m in total, run mostly inside mall footprints. They have no indoor tag and no hours.

## Places snap to the main network when they can

- Places come from named OSM features whose point lies in the graph area. Bus stops, platforms and parking entrances are left out.
- Stations take a display name from their network, such as "Ayala MRT Station". The OSM name and short forms become aliases.
- Aliases also come from `alt_name`, `short_name`, `official_name`, `old_name`, `loc_name` and `name:en`.
- Places with the same name within 150 m merge into one. 21 merged.
- The snap uses distance to the place polygon, or to its point.
- Within 80 m, a node in the largest routable network wins over a closer node on a small island.
- Without that rule, Ayala MRT snapped to a two-node piece of EDSA and the route test failed. 71 places moved this way.
- 36 places still snap to small islands, because no main-network node lies within 80 m.
- Median snap distance: 12.5 m. Maximum: 79.9 m.

## Building heights follow report 02, with a lower default

- Order: OSM `height`, else `building:levels` x 3.74 m, else the Google 2023 median, else a 7.5 m default.
- Google counts when a footprint has at least 8 pixels and a median of 2.5 m or more.
- Google stops near 100 m. 256 OSM heights exceed 100 m. 3 Google-filled footprints read at the cap.
- Each `building:part` is its own feature with its own height and `min_height_m`.
- A part belongs to the outline that contains its representative point. 6 parts have no outline.
- An outline's Google median uses only its area outside its parts. A tower part therefore does not raise the podium.
- 16 outlines are at least 90% covered by parts. Those outlines are left out, so the parts describe the building.
- 4 of those 16 outlines had their own OSM height.
- `min_height_m` comes from `min_height`, else `building:min_level` x 3.74 m, else 0.
- The default is 7.5 m, two levels of 3.74 m, for footprints over 100 m2. It applies inside and outside the pilot box.
- The default changed on 2026-10-22. It replaces report 02's area classes of 25.5, 71.0 and 96.8 m.
- Footprints of 100 m2 or less with no height carry a null height and a null source. There are 801.
- All 730 defaults and 801 nulls replace a Google median under 2.5 m. Google sees little or no building there.
- The low default can understate a taller real building. Its shade still counts as low confidence.
- Inside the pilot box, Google fills 1,106 features and 61 get a default or null. Report 02 counted 1,105 and 61.
- Google medians use no presence mask, as in report 02. A mask would reject 268 of them and move 0.6% by more than 5 m.
- Multipolygons become one Polygon feature per part. That turns 35,107 objects into 35,124 features.

## Checks before READY.graph

`build_manifest.py` stops and removes `READY.graph` if any check fails. It checks these items:

- Every edge has the contract keys, a sequential id, valid `u` and `v`, and at least two geometry points.
- No edge of a non-pedestrian way carries bits 0 to 2.
- Every access-flagged edge is unroutable. Every time-restricted edge without hours is unroutable.
- Every place `node_id` touches a routable edge.
- Every hours row has a source URL, a date and seven valid days.
- Every building is a Polygon with the four contract properties.
- No bit 10 edge carries a shelter bit.
- `node_flags` has one integer per node, and each value uses only bits 0 to 3.
- The shortest Ayala MRT to Greenbelt route exists.

The research test suite still passes: 9 tests, run with the research venv.

`build_manifest.py` keeps the shade builder's `sun`, `sunrise_sunset` and `shade` keys, its sources and its limits.
It replaces only its own limit lines, which it records in `work/graph_limits.json`.
An earlier run on 2026-10-22 at 00:34 replaced the shade builder's 12 limits. I asked that builder to add them again.

## Questions still open

- Should plain footways inside mall footprints take mall hours? 44 routable edges, 792 m, run mostly inside one.
- Should gates and entrances get a field check? They still remove 584 edges, or 31.1 km.
- The 65 bit 10 edges need a field check to confirm cover or open sky.

## Deploy build

Git keeps the graph files, `buildings_display.geojson` and `pipeline/inputs/`. Every Vercel build makes the dated files.

1. `pipeline/vercel_build.sh` runs from `app/`. It makes a venv from `pipeline/shade/requirements.txt` under `app/node_modules/.cache/`.
2. For each area it runs `pipeline/refresh_dates.sh` with today's date in Asia/Manila.
3. `set_dates.py` copies `manifest_template.json` to `manifest.json`, sets `dates` and `generated_at`, and writes `READY.graph`.
4. `shade/shade.py` writes `shade.bin`, the overlays, its manifest keys and `READY.shadows`. The script writes `READY.shade`.
5. `fetch_weather.py` writes `weather.json`, `advisory.json` and `READY.weather`.
6. `pnpm test` runs the router tests on the new files, then `pnpm run build` builds the app.
7. The script writes `shade.bin.gz` beside each `shade.bin` in `app/dist/data/`, because Vercel does not compress `application/octet-stream`.

With `app/public/data/areas.json`, the build loops over `areas/<id>/`, with inputs in `pipeline/inputs/areas/<id>/`.
Listed areas use shade.py's area mode by default: per-date files in `shade/`, `trees.json`, and no overlays.
`UCPH_AREA_OVERLAYS=1` gives them `shade.bin` and overlays instead, like the root area.
The PAGASA advisory is fetched once and copied to each area. Weather is one Open-Meteo call per area centre.
`UCPH_OVERLAY_DATES` sets how many dates get overlays. The default is 7.

## Districts: six routing areas are staged and pass every check

Sixteen districts in `pipeline/districts.json` group into six routing areas, listed in `pipeline/areas.json`.
A route can run anywhere inside one area. Each district stays a named neighbourhood inside its area.
The areas follow option B of the project decisions of 2026-10-22.
The staged bundles sit in `pipeline/stage/<area>/`. Nothing under `app/public/data/` changed.

### How the areas were chosen

- The first rule merged every district whose graph area (box plus 500 m) touched another.
- That rule joined ten districts into one area of about 51,500 edges. BGC and Ortigas overlap even as core boxes.
- Option B cuts three thin links: Pasay-MOA touched Makati CBD by 22 m, and Eastwood and Cubao touched Ortigas and Greenhills.
- metro-core keeps makati-cbd, rockwell-poblacion, bgc, mandaluyong-shaw, ortigas, pasig-center and greenhills, at 30,894 edges.
- Cubao and Eastwood do not touch each other. Their graph areas sit 86 m apart, but roads across the gap join them.
- No district was dropped. All sixteen sit inside the NCR clip. Alabang's building area reaches 14.3962, inside the clip's 14.35 edge.

### Code and run order

```sh
cd undercover-ph   # the repo root
pipeline/.venv/bin/python -I pipeline/districts/fetch_gob.py <district> [...]   # network read, once
pipeline/.venv/bin/python -I pipeline/districts/build.py <area> [...]          # about 2 to 5 minutes per area
pipeline/.venv/bin/python -I pipeline/districts/build.py --checks <area>       # routes, display, checks only
pipeline/.venv/bin/python -I pipeline/districts/report.py                      # tables and the Makati diff
```

- `pipeline/districts/` holds copies of the single-area scripts. Only their import line changed, to `ctx.py`.
- `ctx.py` reads `UC_AREA` and gives the copies the area's boxes and staging paths. A district id builds a one-district area.
- An area's graph area is the union of its member graph boxes, not their envelope. `in_bbox()` tests the union.
- `build_hours.py`, `build_manifest.py` and `build_display.py` are new versions for areas.
- `hours_sources.json` lists cited web hours. `routes.json` lists the route checks. `indoor_report.py` lists indoor edges by footprint.
- Each area writes `graph.json`, `places.json`, `hours.json`, `buildings_display.geojson`, `buildings.geojson.gz` and `manifest_template.json`.
- The template has the root template's shape plus `area` (neighbourhoods) and `graph_rects`.

### Google heights come from one window per district

- `fetch_gob.py` reads each district's building area from the public 2023 tiles, with no account.
- Eight districts span two to six tiles. All tiles share one 0.5 m pixel grid, so the script pastes them with no resampling.
- Every window has zero gap pixels and zero disagreeing overlap pixels. The 16 windows take 1.1 GB in `pipeline/raw/districts/`.
- The buildings step reads each footprint's pixels from whichever member window covers it. No merged area raster is built.

### The Makati rebuild matches the served files

`pipeline/stage/makati-cbd/` is a one-district test build, compared with the root data by `report.py`.

- `graph.json`, `hours.json` and `buildings_display.geojson` are byte-identical. The full building set has identical content.
- `places.json` differs in two places. "Buendia PNR Station" is gone, because OSM tags it `disused:railway=station`.
- "One Ayala" now snaps to a node reachable at every hour, not to a node inside the mall.
- Three limit sentences now read the same for every area. They no longer name Ayala Avenue or One Ayala.

### The area scripts make four changes to the single-area method

- Stations tagged as disused, abandoned, proposed or under construction are skipped. So are Metro Manila Subway stations, whose service this build cannot confirm.
- Stations on LRT lines get an "LRT" name and aliases, like the MRT and PNR stations.
- A building whose stored height is at or below its base gets a null height. There are 63: 42 in manila, 14 in metro-core, 5 in pasay-moa and 2 in qc-north.
- Places prefer a node in the largest network of always-open routable edges, within 80 m.
- Without that rule, SM Megamall had no route before 10:00. Its node sat inside a pocket reached only through mall corridors.
- The rule has a cost. Ortigas MRT to SM Megamall grows from 755 m to 1,644 m, because the place snaps to an outside door.

### Hours come from OSM and three cited pages

- OSM rows come from mall, park and highway ways with a simple `opening_hours` value, as for Makati.
- The Beat Asia guide still gives the five Makati rows. They enter an area only when their mall footprints lie inside it.
- Araneta City's mall-hours page gives "Sunday–Thursday: 10AM–9PM" and "Friday–Saturday: 10AM–10PM". It covers Gateway Mall 1 and 2, Ali Mall and Farmers Plaza.
- That page shows no date, so its `checked` value is the read date, 2026-10-22.
- LRTA's schedule page says every LRT-2 station opens at 4:50 AM. Its closing times sit in an image, which I read.
- The image gives Cubao 9:39 PM eastbound and 9:07 PM westbound. The Cubao station passage gets 04:50 to 21:07, the earlier close.
- `hours_sources.json` keeps that transcription with the image's MD5. The build stops if the saved image changes.
- MRT-3's site shows no hours in its page text. `greenhills.com.ph` did not resolve. Neither gave a cited row.
- Indoor corridors at MRT-3 stations stay unroutable: Shaw Boulevard 694 m, Ayala 421 m, Buendia 260 m.

### Counts, sizes and neighbourhoods

| Area | Districts | Graph area km2 | Edges | Routable km | Largest piece, nodes / km | Sheltered routable km | Bit 10 edges / km | Places (dropped) |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| metro-core | makati-cbd, rockwell-poblacion, bgc, mandaluyong-shaw, ortigas, pasig-center, greenhills | 52.1 | 30,894 | 1,256.9 | 89.1% / 92.3% | 6.90 | 341 / 10.4 | 4,211 (136) |
| pasay-moa | pasay-moa | 12.5 | 5,735 | 236.0 | 84.3% / 89.5% | 2.01 | 101 / 3.0 | 539 (19) |
| cubao-eastwood | cubao, eastwood | 13.3 | 5,661 | 306.7 | 81.5% / 87.5% | 1.51 | 46 / 1.8 | 827 (55) |
| qc-north | qc-triangle, up-diliman | 21.2 | 9,343 | 479.7 | 85.6% / 93.1% | 3.73 | 117 / 3.6 | 1,437 (80) |
| manila | manila-ermita, manila-ubelt, binondo | 29.1 | 16,711 | 739.5 | 83.8% / 93.4% | 6.00 | 277 / 6.7 | 3,182 (37) |
| alabang | alabang | 14.6 | 5,312 | 252.7 | 80.2% / 80.1% | 1.72 | 225 / 6.0 | 473 (11) |

| Area | graph.json raw / gzip | places.json raw / gzip | buildings_display raw / gzip | buildings.geojson.gz |
| --- | --- | --- | --- | ---: |
| metro-core | 8.80 MB / 1.51 MB | 0.62 MB / 0.10 MB | 31.12 MB / 3.54 MB | 6.82 MB |
| pasay-moa | 1.59 MB / 0.26 MB | 0.08 MB / 0.01 MB | 3.47 MB / 0.39 MB | 0.92 MB |
| cubao-eastwood | 1.61 MB / 0.28 MB | 0.12 MB / 0.02 MB | 8.86 MB / 1.03 MB | 2.41 MB |
| qc-north | 2.77 MB / 0.47 MB | 0.21 MB / 0.04 MB | 11.85 MB / 1.34 MB | 3.42 MB |
| manila | 4.65 MB / 0.79 MB | 0.47 MB / 0.08 MB | 14.44 MB / 1.64 MB | 3.55 MB |
| alabang | 1.50 MB / 0.25 MB | 0.07 MB / 0.01 MB | 3.26 MB / 0.37 MB | 0.81 MB |
| all six | 20.92 MB / 3.57 MB | 1.58 MB / 0.26 MB | 73.01 MB / 8.31 MB | 17.93 MB |

| Area | Walkable km by neighbourhood (edge midpoint in the district box; margin = outside every district box) |
| --- | --- |
| metro-core | bgc 275.4, makati-cbd 121.3, margin 496.2, mandaluyong-shaw 110.9, greenhills 44.3, rockwell-poblacion 74.9, ortigas 157.7, pasig-center 102.9 |
| pasay-moa | pasay-moa 162.1, margin 96.6 |
| cubao-eastwood | margin 209.6, cubao 93.7, eastwood 30.9 |
| qc-north | qc-triangle 187.2, up-diliman 102.3, margin 229.1 |
| manila | margin 302.7, manila-ermita 290.2, manila-ubelt 174.4, binondo 42.2 |
| alabang | alabang 175.7, margin 85.6 |

### Route checks

Each pair runs three times: shortest, sheltered-first with k = 8 on unsheltered length, and k = 8 with hours-bound edges removed.

| Area | From | To | Shortest | Straight line | Ratio | Sheltered | Sheltered-first, k = 8 | k = 8, malls closed |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| metro-core | Ayala MRT Station | Greenbelt | 1,230 m | 818 m | 1.5 | 79 m | 1,238 m, 318 m sheltered | 1,232 m, 135 m sheltered |
| metro-core | Guadalupe MRT Station | Power Plant Mall | 1,389 m | 1,012 m | 1.37 | 0 m | 1,389 m, 0 m sheltered | 1,389 m, 0 m sheltered |
| metro-core | Ortigas MRT Station | SM Megamall | 1,644 m | 352 m | 4.66 | 345 m | 1,767 m, 658 m sheltered | 1,644 m, 345 m sheltered |
| metro-core | Shaw Boulevard | Shangri-La Plaza | 326 m | 184 m | 1.77 | 56 m | 326 m, 56 m sheltered | 326 m, 56 m sheltered |
| metro-core | Ayala MRT Station | Market! Market! | 4,234 m | 3,024 m | 1.4 | 48 m | 4,387 m, 457 m sheltered | 4,386 m, 274 m sheltered |
| metro-core | Shaw Boulevard | SM Megamall | 595 m | 548 m | 1.09 | 56 m | 595 m, 56 m sheltered | 595 m, 56 m sheltered |
| metro-core | Ortigas MRT Station | Greenhills Mall | 2,381 m | 1,822 m | 1.31 | 193 m | 2,385 m, 388 m sheltered | 2,385 m, 388 m sheltered |
| metro-core | Santolan-Annapolis MRT Station | Greenhills Mall | 1,603 m | 1,065 m | 1.5 | 0 m | 1,603 m, 0 m sheltered | 1,603 m, 0 m sheltered |
| metro-core | UV Expresss Terminal | Bahay na Tisa | 897 m | 691 m | 1.3 | 0 m | 897 m, 0 m sheltered | 897 m, 0 m sheltered |
| pasay-moa | EDSA LRT Station | SM Mall of Asia | 2,989 m | 2,088 m | 1.43 | 220 m | 3,036 m, 273 m sheltered | 3,015 m, 170 m sheltered |
| cubao-eastwood | Araneta Center - Cubao LRT Station | Gateway Mall 1 | 1,552 m | 129 m | 12.04 | 118 m | 1,552 m, 118 m sheltered | 2,010 m, 0 m sheltered |
| cubao-eastwood | Araneta Center - Cubao LRT Station | Eastwood Mall | 4,510 m | 3,212 m | 1.4 | 55 m | 4,551 m, 155 m sheltered | 4,551 m, 155 m sheltered |
| qc-north | North Avenue MRT Station | SM City North Edsa | 2,494 m | 556 m | 4.48 | 232 m | 2,494 m, 232 m sheltered | 2,494 m, 232 m sheltered |
| qc-north | Quezon Avenue MRT Station | U.P. Town Center | 5,650 m | 4,049 m | 1.4 | 0 m | 5,650 m, 0 m sheltered | 5,650 m, 0 m sheltered |
| manila | Carriedo LRT Station | Lucky Chinatown | 1,244 m | 954 m | 1.3 | 0 m | 1,258 m, 24 m sheltered | 1,258 m, 24 m sheltered |
| manila | Legarda LRT Station | University of Santo Tomas | 1,478 m | 1,051 m | 1.41 | 0 m | 1,503 m, 36 m sheltered | 1,503 m, 36 m sheltered |
| manila | United Nations LRT Station | Robinsons Manila | 1,039 m | 684 m | 1.52 | 0 m | 1,039 m, 0 m sheltered | 1,039 m, 0 m sheltered |
| alabang | Alabang PNR Station | Alabang Town Center | 2,853 m | 2,059 m | 1.39 | 0 m | 2,853 m, 0 m sheltered | 2,853 m, 0 m sheltered |


- North Avenue MRT to SM North EDSA runs 4.5 times the straight line. Unroutable edges on the EDSA side force a loop along Misamis Street.
- Cubao LRT to Gateway Mall 1 runs 12 times the straight line. The Gateway corridor also touches an entrance node, which stays blocked.
- Pasig Center has no rail station in OSM, so its check starts at a UV Express terminal.

### Phase B waits for the release decision

Phase B moves the bundles to `app/public/data/areas/<id>/` and the inputs to `pipeline/inputs/areas/<id>/`.
It also writes `areas.json` and `places_index.json`, and points `run_all.sh` at the area build. None of this has run.

- 2026-10-22: removed `Buendia PNR Station` from the root `places.json`. OSM tags it disused. The area build skips disused stations, so the next build drops it by rule.
