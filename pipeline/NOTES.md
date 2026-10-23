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

## Three nested boxes set the pilot, graph and building areas

- The pilot box is `[121.012, 14.548, 121.032, 14.562]`.
- The graph area is `[121.0074, 14.5435, 121.0366, 14.5665]`, from the contract.
- The building area is `[120.9999, 14.5362, 121.0441, 14.5738]`. This is the graph area plus 800 m, rounded outward.

## Project decisions of 2026-10-22 changed access, heights, side offsets and one flag

Seven decisions of 2026-10-22 changed the build. `access_policy.py` wraps the research policy for points 1 to 3. Nothing under `research/` changed.

1. A `barrier=kerb` node no longer triggers the access check. A kerb is a curb and has no gate.
2. A node with `kerb=raised` adds the steps bit (16) to the crossings that touch it. Lowered, flush and untyped kerbs pass.
3. Only `access:conditional`, `foot:conditional` and `opening_hours` restrict walkers. Other `:conditional` keys restrict vehicles only.
4. An indoor, `corridor` or building-passage edge with a cited hours row is routable. The router opens and closes it by those hours.
5. Every default height is now 7.5 m, two levels of 3.74 m. Overstated height invents shade, so the default errs low.
6. A side offset shrinks in 0.5 m steps, down to 1.5 m, until no sample sits inside a footprint. Otherwise the side becomes a centre edge.
7. An unsheltered edge mostly inside a footprint, with no cover or indoor tag, gets the new bit 10 (1024).

Gates and entrances keep the research rule. Footprints of 100 m2 or less with no height stay null.

## Counts from the last run

- The graph has 3,714 nodes and 6,274 edges, or 255.3 km. Before the side-offset fallback it had 6,280 edges.
- By side, the edges are 2,950 centre, 1,485 left and 1,839 right.
- 5,586 edges are routable, or 221.4 km. Before the 2026-10-22 decisions the count was 4,823, or 195.2 km.
- The routable network has 103 pieces. The largest holds 3,069 of 3,499 routable nodes (87.7%) and 199.3 km (90.0%).
- 65 edges, or 1.67 km, carry bit 10 (inside a footprint, cover unverified). 61 of them are routable.
- In `node_flags`, 1,896 of 3,714 nodes carry at least one node bit. 1,018 carry a crossing or signal bit.
- Sheltered length (flags & 7) is 3.31 km in the graph, and 2.23 km of it is in 91 routable edges.
- The build has 35,107 OSM buildings, written as 35,124 polygon features.
- The build kept 1,141 places and dropped 27 that lie more than 80 m from a routable node.
- The build has 18 hours rows. Five come from the Beat Asia guide and 13 from OSM.

The next table gives buildings by height source, as OSM objects.

| Source | Objects | Share of footprint area |
| --- | ---: | ---: |
| `osm` | 725 | 13.4% |
| `osm_levels` | 519 | 6.2% |
| `google_2023` | 32,332 | 77.0% |
| `default` (7.5 m) | 730 | 2.8% |
| null | 801 | 0.5% |

The next table gives places by category.

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

## The Ayala MRT to Greenbelt route is 1,229.6 m, and 1,238.0 m sheltered-first

`route_check.py` reads the node ids from `places.json`, so the test covers the real snap.
The start is "Ayala MRT Station" (OSM way 27663063), node 3121. The end is "Greenbelt" (OSM relation 12227982), node 749.

| Run | Length | Sheltered | Share | Minutes at 1.1 m/s |
| --- | ---: | ---: | ---: | ---: |
| Shortest | 1,229.6 m | 79.4 m | 6.5% | 19 |
| Sheltered-first, k = 8 | 1,238.0 m | 317.6 m | 25.7% | 19 |
| Sheltered-first, k = 8, malls closed | 1,232.5 m | 134.9 m | 10.9% | 19 |

- The sheltered-first cost is `len_m x (1 + 8)` on unsheltered edges and `len_m` on sheltered edges.
- The shortest route takes 79.4 m of pedestrian underpass near 6750 Ayala Avenue and Makati Shangri-La, then Legazpi Street.
- The sheltered-first route adds 182.7 m of One Ayala indoor passages. Those edges open only during mall hours.
- `route_check.py` ignores hours. The "malls closed" run drops every edge with an `hours_idx`, as before 10:00.
- Before the 2026-10-22 decisions, the shortest route was 1,375.6 m with no sheltered metre.

## The access rule now removes 688 edges, or 33.9 km

The graph copies the research extractor's whole-way node rule. A node with a gate, entrance or hours tag flags its whole way.

The table gives loss by single cause. Each row counts edges that carry that cause and no other.

| Cause | Edges | km |
| --- | ---: | ---: |
| Gate node (`gate`, `lift_gate`, `swing_gate`) | 550 | 30.4 |
| Indoor, `corridor` or building passage without hours | 53 | 0.8 |
| Entrance node | 34 | 0.7 |
| Foot or access conditional on the way | 6 | 0.5 |
| Node with hours | 4 | 0.4 |
| Other barriers | 15 | 0.3 |

- The graph leaves out whole ways that touch an explicitly closed node. That removes 288 ways, or 5.4 km.
- No edge is unroutable only for missing hours. Every time-restricted edge without hours needs an access check as well.
- 299 kerb nodes no longer trigger the check. 37 raised kerbs touch the graph.
- The raised kerbs add the steps bit to 37 crossings and 2 other edges. The 2 sit where no crossing touches the kerb.
- 91 ways lost a vehicle-only conditional. 70 were `motor_vehicle:conditional` and 21 were `oneway:conditional`.
- Ayala Avenue, Paseo de Roxas and Makati Avenue carry `motor_vehicle:conditional=no @ (Su 06:00-10:00)`, the Sunday car-free rule.
- 25 of the 31 One Ayala indoor edges became routable. The other 6 touch an entrance node as well, so they stay unroutable.
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

The contract table follows, with the added bit.

| Bit | Value | Meaning |
| --- | ---: | --- |
| 0 | 1 | Covered pedestrian way (`covered` = yes, arcade, colonnade, roof) |
| 1 | 2 | Pedestrian tunnel or underpass |
| 2 | 4 | Indoor, `corridor`, or building passage |
| 3 | 8 | Footbridge or elevated walkway |
| 4 | 16 | Steps, or a crossing over a raised kerb |
| 5 | 32 | Sidewalk |
| 6 | 64 | Access evaluation needed |
| 7 | 128 | Time-restricted |
| 8 | 256 | Crossing |
| 9 | 512 | Elevator |
| 10 | 1024 | Inside a building footprint, cover unverified. Sets no shelter bit. The router shows it as low-confidence shade. |

Bit 10 follows these rules.

- The edge carries none of bits 0 to 2. Its way has no `covered` or `indoor` tag other than `no`.
- Over 50% of its length lies inside the union of the footprints it touches. Raised parts count, since a walker passes under them.
- 104 unsheltered edges lie mostly inside a footprint. 39 of them have a `covered` or `indoor` tag, mostly covered driveways. They get no bit 10.
- All 65 bit 10 edges are centre edges. They are 37 footways, 16 service roads and 12 steps. No side edge qualifies after the offset fix.

## node_flags mark where a walker can cross between side edges

Both side edges of a road share its nodes, so a route could cross a busy road mid-block. The fix adds a per-node attribute.
`graph.json` now has a top-level `node_flags` array. It holds one integer per node, in the same order as `nodes`.

| Bit | Value | Meaning |
| --- | ---: | --- |
| 0 | 1 | Mapped crossing, from `highway=crossing`, any `crossing=*` except `no`, `railway=crossing`, or a touching `footway=crossing` edge |
| 1 | 2 | Traffic signals, from `highway=traffic_signals` or `crossing=traffic_signals` on the node |
| 2 | 4 | Junction, where 3 or more distinct OSM highway ways meet at the node, each way counted once |
| 3 | 8 | Grade-separated link, where a footbridge, underpass or steps edge touches the node |

These rules and choices apply.

- `crossing=no` says that people cannot cross there. Those nodes get neither bit 1 nor bit 2. 2 graph nodes have it.
- A `footway=crossing` way with `crossing=no` does not set bit 1.
- Junctions count every highway way with a node in the building area, walkable or not. A road closed to walkers still makes a junction.
- Bit 8 uses the footbridge and tunnel edge bits and `highway=steps`. A crossing over a raised kerb does not set it.

The last run gave these counts.

| Node bit | Nodes |
| --- | ---: |
| 1 crossing | 865 |
| 2 signals | 397 |
| 4 junction | 936 |
| 8 grade-separated | 258 |

The table gives graph nodes on each named road, and those with a crossing or signal bit.

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
- 763 ways have two side edges, 252 have one, and 1,851 keep a centre edge.
- Both sides use the road's own `u` and `v`. Left and right follow the OSM way direction.
- The starting offset is half the carriageway width plus 1 m. Width comes from `width`, else `lanes` x 3.2 m, else the class median.
- Among side-split ways, 944 take width from `lanes`, 38 from `width` and 33 from the class median.
- The class medians from all lane-tagged ways in the area are primary 3, secondary 3, tertiary 2, residential 2, unclassified 2, service 1.
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

The side model has these limits.

- Side geometry ends at the offset line, a few metres from its nodes. Drawn routes jump between the line and the node.
- The shade builder must sample side geometry as written. The geometry is already offset.
- A route changes sides only at a node with a mapped crossing or signals (flag 1 or 2). A junction (flag 4) costs 60 m x (1 + k). The router forbids a change anywhere else.
- The offset ignores real kerb lines. A dual carriageway can get a side edge on its median.
- Before the offset fix, 109 side edges, about 6.0 km, lay mostly inside building footprints. After it, none do.
- A shrunken offset can still place a sidewalk line on the carriageway edge where buildings reach the road.

## The graph keeps every whole way with a node in the graph area

- The graph keeps every whole way with at least one node in the graph area. The build clips no way.
- The research extractor used the mean node position. That rule could drop a long road whose middle lies inside the area.
- The farthest node lies 513 m outside the graph area. The building area still covers it.

## Hours come only from cited rows

I re-read the Beat Asia guide once on 2026-10-22 at 00:17 Manila time. The page returned HTTP 200.
It shows a publication date of February 24, 2026. The server header shows a last change on 2026-10-05. The page MD5 is `e18fee5aa7c4ec6f3e780dab74c0f39e`.

The page text, word for word, is in `work/beat_asia_extract.txt`.

- For Glorietta the page says "Sunday to Thursday, from 10 AM to 9 PM; Friday to Saturday, from 10 AM to 10 PM". This matches web_notes.
- For Greenbelt the page says "Daily, from 11 AM to 10 PM". This matches web_notes.
- For One Ayala the page says "Monday to Thursday, from 10 AM to 9 PM; Friday to Sunday, from 10 AM to 10 PM". This matches web_notes.
- The page has new rows for The Landmark department store and the SM Store hours. I added both as cited rows.
- The page says "Greenbelt 1 and 2 are currently undergoing major renovations and will open sometime in 2028".

Hours follow these rules.

- `checked` holds the source's own date. That is 2026-02-24 for the guide and 2026-10-20 for OSM.
- OSM rows come from mall, park and highway ways in the graph area with a simple `opening_hours` value.
- The parser skipped one value. Glorietta 4 reads `Mo-Su 10:00-21:)0`.
- Guide rows win for edge hours. OSM rows apply only to malls without a guide row, such as WalterMart Makati.
- OSM gives Glorietta and Glorietta 5 a 21:00 close on Friday and Saturday. The guide gives 22:00.
- The matched footprints are Glorietta and Glorietta 1 to 5, Greenbelt 3 to 5, two One Ayala areas, The Landmark and SM Makati.
- Greenbelt 1 and 2 get no hours, because the guide says they are shut.
- Only indoor, `corridor` and building-passage edges get mall hours. OSM maps these only at One Ayala, so 31 edges carry hours.
- 25 of those 31 edges are routable under the 2026-10-22 decisions. The router opens and closes them by the One Ayala row.
- 44 routable plain footways, 792 m in total, run mostly inside mall footprints. They have no indoor tag and no hours.

## Places snap to the main network when they can

- Places come from named OSM features whose point lies in the graph area. The build leaves out bus stops, platforms and parking entrances.
- Stations take a display name from their network, such as "Ayala MRT Station". The OSM name and short forms become aliases.
- Aliases come from `alt_name`, `short_name`, `official_name`, `old_name`, `loc_name` and `name:en` as well.
- Places with the same name within 150 m merge into one. 21 merged.
- The snap uses distance to the place polygon, or to its point.
- Within 80 m, a node in the largest routable network wins over a closer node on a small island.
- Without that rule, Ayala MRT snapped to a two-node piece of EDSA. The route test failed. 71 places moved this way.
- 36 places still snap to small islands, because no main-network node lies within 80 m.
- The median snap distance is 12.5 m and the greatest is 79.9 m.

## Building heights follow report 02, with a lower default

- The order is OSM `height`, else `building:levels` x 3.74 m, else the Google 2023 median, else a 7.5 m default.
- Google counts when a footprint has at least 8 pixels and a median of 2.5 m or more.
- Google stops near 100 m. 256 OSM heights exceed 100 m. 3 Google-filled footprints read at the cap.
- Each `building:part` is its own feature with its own height and `min_height_m`.
- A part belongs to the outline that holds its representative point. 6 parts have no outline.
- An outline's Google median uses only its area outside its parts. A tower part does not raise the podium.
- 16 outlines are at least 90% covered by parts. The build leaves those outlines out, so the parts describe the building.
- 4 of those 16 outlines had their own OSM height.
- `min_height_m` comes from `min_height`, else `building:min_level` x 3.74 m, else 0.
- The default is 7.5 m, two levels of 3.74 m, for footprints over 100 m2. It applies inside and outside the pilot box.
- The default changed on 2026-10-22. It replaces report 02's area classes of 25.5, 71.0 and 96.8 m.
- Footprints of 100 m2 or less with no height carry a null height and a null source. 801 footprints qualify.
- All 730 defaults and 801 nulls replace a Google median under 2.5 m. Google sees little or no building there.
- The low default can understate a taller real building. Its shade still counts as low confidence.
- Inside the pilot box, Google fills 1,106 features and 61 get a default or null. Report 02 counted 1,105 and 61.
- Google medians use no presence mask, as in report 02. A mask would reject 268 of them and move 0.6% by more than 5 m.
- Multipolygons become one Polygon feature per part. That turns 35,107 objects into 35,124 features.

## Checks before READY.graph

`build_manifest.py` stops and removes `READY.graph` if any check fails. The checks cover these items.

- Every edge has the contract keys, a sequential id, valid `u` and `v`, and at least two geometry points.
- No edge of a non-pedestrian way carries bits 0 to 2.
- Every access-flagged edge is unroutable. Every time-restricted edge without hours is unroutable.
- Every place `node_id` touches a routable edge.
- Every hours row has a source URL, a date and seven valid days.
- Every building is a Polygon with the four contract properties.
- No bit 10 edge carries a shelter bit.
- `node_flags` has one integer per node, and each value uses only bits 0 to 3.
- The shortest Ayala MRT to Greenbelt route exists.

The research test suite still passes with 9 tests, run with the research venv.

`build_manifest.py` keeps the shade builder's `sun`, `sunrise_sunset` and `shade` keys, its sources and its limits.
It replaces only its own limit lines, which it records in `work/graph_limits.json`.
An earlier run on 2026-10-22 at 00:34 replaced the shade builder's 12 limits. I asked that builder to add them again.

## Questions still open

- Should plain footways inside mall footprints take mall hours? 44 routable edges, 792 m, run mostly inside one.
- Should gates and entrances get a field check? They still remove 584 edges, or 31.1 km.
- The 65 bit 10 edges need a field check to confirm cover or open sky.

## Deploy build

Git keeps each area's graph, places and hours, the two PMTiles files, and `pipeline/inputs/areas/<id>/`. The deploy makes the dated files.

Since 2026-10-22 a GitHub workflow casts the shade and the deploy downloads it. Vercel stops a build at 45 minutes, and shade for every area no longer fits.

- `.github/workflows/shade.yml` runs at 04:30 Manila. Each area is its own job: `set_dates.py`, then `shade/shade.py`. One release, `shade-YYYY-MM-DD`, holds every area's `manifest.json`, `shade/`, `READY.shade` and `graph.sha256`. The workflow keeps the 3 newest releases and pushes an empty commit to deploy.
- `daily-rebuild.yml` at 05:40 still pushes an empty commit if main has none from today, for a morning when the shade workflow failed.

The deploy build:

1. `pipeline/vercel_build.sh` runs from `app/`.
2. It reads the area ids from `app/public/data/areas.json`, and stops if that file is missing.
3. On Vercel it downloads the newest shade release from today or the two days before. `pipeline/stale_shade.py` lists each area whose `graph.json` hash differs from the release's `graph.sha256`. Only those areas get a venv and a shade run here. With no release, every area does. Off Vercel, every area is shaded here unless `UCPH_SHADE_SOURCE=release`.
4. It fetches the PAGASA advisory once, into `app/public/data/advisory.json`.
5. For each area it shaded here, it runs `pipeline/refresh_dates.sh` with today's date in Asia/Manila. The data folder is `app/public/data/areas/<id>/` and the inputs folder is `pipeline/inputs/areas/<id>/`. For the other areas it runs only `fetch_weather.py`.
6. `set_dates.py` copies `manifest_template.json` to `manifest.json`, sets `dates` and `generated_at`, and writes `READY.graph`.
7. `shade/shade.py` runs in area mode. It writes `shade/<date>.bin`, `shade/lowconf.bin`, `trees.json`, its manifest keys and `READY.shade`.
8. `fetch_weather.py` writes `weather.json`, a copy of the advisory and `READY.weather`. The forecast point is the area centre.
9. `pnpm test` runs the router tests, then `pnpm run build` builds the app. `UCPH_SKIP_TESTS=1` skips the tests, for timing runs only.
10. The script writes a gzip copy beside each `.bin` in `app/dist/data/areas/`, because Vercel does not compress `application/octet-stream`, and drops `trees.json`.

A local run of the release path (14 areas, one stale on purpose) took 63 s, against 748 s when it shaded every area.

The area builds write no shadow overlays. The app draws shadows from `buildings.pmtiles` and `trees.pmtiles`.
`refresh_dates.sh` needs `UCPH_AREA`, `UCPH_DATA` and `UCPH_INPUTS`, and `set_dates.py` needs the last two. Neither has a root Makati mode any more.

## Six routing areas are staged from sixteen districts and pass every check

Sixteen districts in `pipeline/districts.json` group into six routing areas, listed in `pipeline/areas.json`.
A route can run anywhere inside one area. Each district stays a named neighbourhood inside its area.
The areas follow option B of the project decisions of 2026-10-22.
The staged bundles sit in `pipeline/stage/<area>/`. `publish.py` copies them into the app (see the last section).

### How the areas were chosen

- The first rule merged every district whose graph area (box plus 500 m) touched another.
- That rule joined ten districts into one area of about 51,500 edges. BGC and Ortigas overlap even as core boxes.
- Option B cuts three thin links. Pasay-MOA touched Makati CBD by 22 m, and Eastwood and Cubao touched Ortigas and Greenhills.
- metro-core keeps makati-cbd, rockwell-poblacion, bgc, mandaluyong-shaw, ortigas, pasig-center and greenhills, at 30,894 edges.
- Cubao and Eastwood do not touch each other. Their graph areas sit 86 m apart, but roads across the gap join them.
- The build dropped no district. All sixteen sit inside the NCR clip. Alabang's building area reaches 14.3962, inside the clip's 14.35 edge.

### Code and run order

```sh
cd undercover-ph   # the repo root
pipeline/.venv/bin/python -I pipeline/districts/fetch_gob.py <district> [...]   # network read, once
pipeline/.venv/bin/python -I pipeline/districts/build.py <area> [...]          # about 2 to 5 minutes per area
pipeline/.venv/bin/python -I pipeline/districts/build.py --checks <area>       # routes, display, checks only
pipeline/.venv/bin/python -I pipeline/districts/report.py                      # tables and the Makati diff
pipeline/.venv/bin/python -I pipeline/districts/publish.py                     # app data, inputs and PMTiles
```

- `pipeline/districts/` holds copies of the single-area scripts. Only their import line changed, to `ctx.py`.
- `ctx.py` reads `UC_AREA` and gives the copies the area's boxes and staging paths. A district id builds a one-district area.
- `build.py` accepts only ids from `pipeline/areas.json` and `pipeline/districts.json`. It stops on any other id before it builds a path.
- `build_places.py` carries the search fixes of the root script. It adds named `landuse=commercial` sites, named `building:part` towers such as RCBC Plaza, and One Ayala as a mall. It writes `detail` for repeated names and compact JSON.
- `route_check.py` follows the browser router's side-switch rule. A walker changes to the other side of a road only at a node with flag 1 or 2. A junction (flag 4) costs 60 m x (1 + k). Anywhere else the change is forbidden.
- Like the browser, it never turns back along the edge just walked. Such a U-turn would dodge the side-switch rule.
- `publish.py` needs tippecanoe and tile-join. It writes no file outside `app/public/data/`, `pipeline/inputs/areas/` and `pipeline/work/tiles/`.
- `publish.py` stops on an area whose last checks failed. `--hold <id>` leaves that area out of the app.
- An area's graph area is the union of its member graph boxes and never their envelope. `in_bbox()` tests the union.
- `build_hours.py`, `build_manifest.py` and `build_display.py` are new versions for areas.
- `hours_sources.json` lists cited web hours. `routes.json` lists the route checks. `indoor_report.py` lists indoor edges by footprint.
- Each area writes `graph.json`, `places.json`, `hours.json`, `buildings_display.geojson`, `buildings.geojson.gz` and `manifest_template.json`.
- The template has the root template's shape plus `area` (neighbourhoods) and `graph_rects`.

### Google heights come from one window per district

- `fetch_gob.py` reads each district's building area from the public 2023 tiles, with no account.
- Eight districts span two to six tiles. All tiles share one 0.5 m pixel grid, so the script pastes them with no resampling.
- Every window has zero gap pixels and zero disagreeing overlap pixels. The 16 windows take 1.1 GB in `pipeline/raw/districts/`.
- The buildings step reads each footprint's pixels from whichever member window covers it. The step builds no merged area raster.

### The Makati rebuild matches the served files

`pipeline/stage/makati-cbd/` is a one-district test build, compared with the root data by `report.py`.

- `graph.json`, `hours.json` and `buildings_display.geojson` match byte for byte. The full building set has the same content.
- `places.json` differs in two places. "Buendia PNR Station" is gone, because OSM tags it `disused:railway=station`.
- "One Ayala" now snaps to a node reachable at every hour, and no longer to a node inside the mall.
- Three limit sentences now read the same for every area. They no longer name Ayala Avenue or One Ayala.

### The area scripts make four changes to the single-area method

- The build skips stations tagged as disused, abandoned, proposed or under construction. It skips Metro Manila Subway stations too, because it cannot check their service.
- Stations on LRT lines get an "LRT" name and aliases, like the MRT and PNR stations.
- A building whose stored height is at or below its base gets a null height. 63 buildings qualify. They are 42 in manila, 14 in metro-core, 5 in pasay-moa and 2 in qc-north.
- Places prefer a node in the largest network of always-open routable edges, within 80 m.
- Without that rule, SM Megamall had no route before 10:00. Its node sat inside a pocket reached only through mall passages.
- The rule has a cost. Ortigas MRT to SM Megamall grows from 755 m to 1,644 m, because the place snaps to an outside door.

### Hours come from OSM and three cited pages

- OSM rows come from mall, park and highway ways with a simple `opening_hours` value, as for Makati.
- The Beat Asia guide still gives the five Makati rows. They enter an area only when their mall footprints lie inside it.
- Araneta City's mall-hours page gives Sunday to Thursday 10AM to 9PM and Friday to Saturday 10AM to 10PM. It covers Gateway Mall 1 and 2, Ali Mall and Farmers Plaza.
- That page shows no date, so its `checked` value is the read date, 2026-10-22.
- LRTA's schedule page says every LRT-2 station opens at 4:50 AM. Its closing times sit in an image, which I read.
- The image gives Cubao 9:39 PM eastbound and 9:07 PM westbound. The Cubao station passage gets 04:50 to 21:07, the earlier close.
- `hours_sources.json` keeps that transcription with the image's MD5. The build stops if the saved image changes.
- MRT-3's site shows no hours in its page text. `greenhills.com.ph` did not resolve. Neither gave a cited row.
- Indoor passages at MRT-3 stations stay unroutable. They total 694 m at Shaw Boulevard, 421 m at Ayala and 260 m at Buendia.

### Counts, sizes and neighbourhoods

| Area | Districts | Graph area km2 | Edges | Routable km | Largest piece, nodes / km | Sheltered routable km | Bit 10 edges / km | Places (dropped) |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| metro-core | makati-cbd, rockwell-poblacion, bgc, mandaluyong-shaw, ortigas, pasig-center, greenhills | 52.1 | 30,894 | 1,256.9 | 89.1% / 92.3% | 6.90 | 341 / 10.4 | 4,356 (137) |
| pasay-moa | pasay-moa | 12.5 | 5,735 | 236.0 | 84.3% / 89.5% | 2.01 | 101 / 3.0 | 578 (19) |
| cubao-eastwood | cubao, eastwood | 13.3 | 5,661 | 306.7 | 81.5% / 87.5% | 1.51 | 46 / 1.8 | 847 (55) |
| qc-north | qc-triangle, up-diliman | 21.2 | 9,343 | 479.7 | 85.6% / 93.1% | 3.73 | 117 / 3.6 | 1,501 (81) |
| manila | manila-ermita, manila-ubelt, binondo | 29.1 | 16,711 | 739.5 | 83.8% / 93.4% | 6.00 | 277 / 6.7 | 3,250 (38) |
| alabang | alabang | 14.6 | 5,312 | 252.7 | 80.2% / 80.1% | 1.72 | 225 / 6.0 | 482 (12) |

| Area | graph.json raw / gzip | places.json raw / gzip | buildings_display raw / gzip | buildings.geojson.gz |
| --- | --- | --- | --- | ---: |
| metro-core | 8.80 MB / 1.51 MB | 0.53 MB / 0.10 MB | 31.12 MB / 3.54 MB | 6.82 MB |
| pasay-moa | 1.59 MB / 0.26 MB | 0.07 MB / 0.01 MB | 3.47 MB / 0.39 MB | 0.92 MB |
| cubao-eastwood | 1.61 MB / 0.28 MB | 0.10 MB / 0.02 MB | 8.86 MB / 1.03 MB | 2.41 MB |
| qc-north | 2.77 MB / 0.47 MB | 0.18 MB / 0.04 MB | 11.85 MB / 1.34 MB | 3.42 MB |
| manila | 4.65 MB / 0.79 MB | 0.40 MB / 0.08 MB | 14.44 MB / 1.64 MB | 3.55 MB |
| alabang | 1.50 MB / 0.25 MB | 0.06 MB / 0.01 MB | 3.26 MB / 0.37 MB | 0.81 MB |
| all six | 20.92 MB / 3.57 MB | 1.34 MB / 0.27 MB | 73.01 MB / 8.31 MB | 17.93 MB |

| Area | Walkable km by neighbourhood (edge midpoint in the district box, and margin means outside every district box) |
| --- | --- |
| metro-core | bgc 275.4, makati-cbd 121.3, margin 496.2, mandaluyong-shaw 110.9, greenhills 44.3, rockwell-poblacion 74.9, ortigas 157.7, pasig-center 102.9 |
| pasay-moa | pasay-moa 162.1, margin 96.6 |
| cubao-eastwood | margin 209.6, cubao 93.7, eastwood 30.9 |
| qc-north | qc-triangle 187.2, up-diliman 102.3, margin 229.1 |
| manila | margin 302.7, manila-ermita 290.2, manila-ubelt 174.4, binondo 42.2 |
| alabang | alabang 175.7, margin 85.6 |

### 18 route pairs run three ways, and none switches sides at an unmarked junction

Each pair runs three times. The runs are shortest, sheltered-first with k = 8 on unsheltered length, and k = 8 with hours-bound edges removed.

The checks follow the browser's side-switch rule since 2026-10-22. Seven of the 18 pairs grew in at least one run, by 0.1 m to 35.1 m. A side change now needs a mapped crossing or signals. Cubao LRT to Eastwood Mall grew most, from 4,510 m to 4,545 m. No route got shorter, and none of the 54 runs switches sides at an unmarked junction.

| Area | From | To | Shortest | Straight line | Ratio | Sheltered | Sheltered-first, k = 8 | k = 8, malls closed |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| metro-core | Ayala MRT Station | Greenbelt | 1,230 m | 818 m | 1.5 | 79 m | 1,238 m, 318 m sheltered | 1,232 m, 135 m sheltered |
| metro-core | Guadalupe MRT Station | Power Plant Mall | 1,391 m | 1,012 m | 1.37 | 0 m | 1,391 m, 0 m sheltered | 1,391 m, 0 m sheltered |
| metro-core | Ortigas MRT Station | SM Megamall | 1,644 m | 352 m | 4.66 | 345 m | 1,767 m, 658 m sheltered | 1,644 m, 345 m sheltered |
| metro-core | Shaw Boulevard | Shangri-La Plaza | 326 m | 184 m | 1.77 | 56 m | 326 m, 56 m sheltered | 326 m, 56 m sheltered |
| metro-core | Ayala MRT Station | Market! Market! | 4,234 m | 3,024 m | 1.4 | 48 m | 4,387 m, 457 m sheltered | 4,386 m, 274 m sheltered |
| metro-core | Shaw Boulevard | SM Megamall | 595 m | 548 m | 1.09 | 56 m | 595 m, 56 m sheltered | 595 m, 56 m sheltered |
| metro-core | Ortigas MRT Station | Greenhills Mall | 2,381 m | 1,822 m | 1.31 | 193 m | 2,385 m, 388 m sheltered | 2,385 m, 388 m sheltered |
| metro-core | Santolan-Annapolis MRT Station | Greenhills Mall | 1,604 m | 1,065 m | 1.51 | 0 m | 1,604 m, 0 m sheltered | 1,604 m, 0 m sheltered |
| metro-core | UV Expresss Terminal | Bahay na Tisa | 897 m | 691 m | 1.3 | 0 m | 897 m, 0 m sheltered | 897 m, 0 m sheltered |
| pasay-moa | EDSA LRT Station | SM Mall of Asia | 2,989 m | 2,088 m | 1.43 | 220 m | 3,036 m, 273 m sheltered | 3,015 m, 170 m sheltered |
| cubao-eastwood | Araneta Center - Cubao LRT Station | Gateway Mall 1 | 1,552 m | 129 m | 12.04 | 118 m | 1,552 m, 118 m sheltered | 2,010 m, 0 m sheltered |
| cubao-eastwood | Araneta Center - Cubao LRT Station | Eastwood Mall | 4,545 m | 3,212 m | 1.42 | 55 m | 4,586 m, 155 m sheltered | 4,586 m, 155 m sheltered |
| qc-north | North Avenue MRT Station | SM City North Edsa | 2,494 m | 556 m | 4.48 | 232 m | 2,494 m, 232 m sheltered | 2,494 m, 232 m sheltered |
| qc-north | Quezon Avenue MRT Station | U.P. Town Center | 5,663 m | 4,049 m | 1.4 | 0 m | 5,663 m, 0 m sheltered | 5,663 m, 0 m sheltered |
| manila | Carriedo LRT Station | Lucky Chinatown | 1,244 m | 954 m | 1.3 | 0 m | 1,258 m, 24 m sheltered | 1,258 m, 24 m sheltered |
| manila | Legarda LRT Station | University of Santo Tomas | 1,480 m | 1,051 m | 1.41 | 0 m | 1,505 m, 36 m sheltered | 1,505 m, 36 m sheltered |
| manila | United Nations LRT Station | Robinsons Manila | 1,039 m | 684 m | 1.52 | 0 m | 1,039 m, 0 m sheltered | 1,039 m, 0 m sheltered |
| alabang | Alabang PNR Station | Alabang Town Center | 2,853 m | 2,059 m | 1.39 | 0 m | 2,853 m, 0 m sheltered | 2,853 m, 0 m sheltered |

- North Avenue MRT to SM North EDSA runs 4.5 times the straight line. Unroutable edges on the EDSA side force a loop along Misamis Street.
- Cubao LRT to Gateway Mall 1 runs 12 times the straight line. The Gateway passage touches an entrance node as well, and that node stays blocked.
- Pasig Center has no rail station in OSM, so its check starts at a UV Express terminal.

The browser router agrees with these checks. A copy of `app/src/lib/router` ran under Node on every staged area at 12:00.
All 43 pairs in the 14 staged areas gave the same shortest length within 1.5 m, or no route in both.

### Eight more Metro Manila areas were staged on 2026-10-22, and seven pass

| Area | Districts | Graph area km2 | Edges | Routable km | Largest piece, nodes / km | Places (dropped) | Checks |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| north-coast | caloocan-monumento, malabon-navotas-center, navotas-fishport, valenzuela-center, valenzuela-malinta | 41.2 | 15,449 | 825.1 | 61.8% / 68.2% | 1,462 (36) | pass |
| marikina | marikina-center, marikina-riverbanks | 16.1 | 7,022 | 376.6 | 78.4% / 89.7% | 813 (58) | pass |
| paranaque-airport | paranaque-aseana-pitx, paranaque-naia | 19.4 | 6,223 | 300.7 | 78.2% / 80.4% | 515 (45) | pass |
| las-pinas | las-pinas-center | 13.6 | 4,301 | 243.8 | 54.1% / 55.6% | 510 (46) | fail |
| paranaque-bf-aguirre | paranaque-bf-aguirre | 13.1 | 3,207 | 200.0 | 38.5% / 40.6% | 341 (41) | pass |
| taguig-pateros | taguig-mckinley-hill, taguig-center, arca-south, pateros-center | 32.0 | 14,281 | 708.9 | 83.5% / 85.4% | 1,308 (70) | pass |
| qc-commonwealth-fairview | qc-commonwealth, qc-fairview, qc-sm-fairview | 32.0 | 9,331 | 474.2 | 86.9% / 89.8% | 955 (164) | pass |
| qc-banawe | qc-banawe | 12.3 | 5,204 | 377.5 | 89.1% / 95.3% | 556 (22) | pass |

| Area | From | To | Shortest | Straight line | Ratio | Sheltered | Sheltered-first, k = 8 | k = 8, malls closed |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| north-coast | Yamaha Monumento LRT Station | Malabon Town Center | 3,169 m | 2,377 m | 1.33 | 0 m | 3,169 m, 0 m sheltered | 3,169 m, 0 m sheltered |
| north-coast | Navotas City Hall | Navotas Fishport Complex | 2,150 m | 1,796 m | 1.2 | 0 m | 2,150 m, 0 m sheltered | 2,150 m, 0 m sheltered |
| north-coast | Valenzuela City Medical Center | Valenzuela Town Center | 5,352 m | 930 m | 5.75 | 0 m | 5,352 m, 0 m sheltered | 5,352 m, 0 m sheltered |
| north-coast | Caloocan PNR Station | Yamaha Monumento LRT Station | 2,061 m | 1,184 m | 1.74 | 0 m | 2,061 m, 0 m sheltered | 2,061 m, 0 m sheltered |
| marikina | Santolan LRT Station | Riverbanks Center | 1,966 m | 1,092 m | 1.8 | 62 m | 1,966 m, 62 m sheltered | 1,966 m, 62 m sheltered |
| marikina | Riverbanks Center | Marikina City Hall | 2,432 m | 1,846 m | 1.32 | 0 m | 2,432 m, 0 m sheltered | 2,432 m, 0 m sheltered |
| marikina | Marikina-Pasig LRT Station | Marikina City Hall | 1,764 m | 1,415 m | 1.25 | 0 m | 1,764 m, 0 m sheltered | 1,764 m, 0 m sheltered |
| paranaque-airport | PITX LRT Station | Ayala Malls Manila Bay | 2,324 m | 1,714 m | 1.36 | 0 m | 2,324 m, 0 m sheltered | 2,324 m, 0 m sheltered |
| paranaque-airport | MIA Road LRT Station | Aseana Powerstation | 1,806 m | 1,338 m | 1.35 | 0 m | 1,807 m, 66 m sheltered | 1,807 m, 66 m sheltered |
| paranaque-airport | Nichols PNR Station | Newport Mall | 1,319 m | 859 m | 1.53 | 0 m | 1,319 m, 0 m sheltered | 1,319 m, 0 m sheltered |
| las-pinas | Robinsons Place Las Piñas | SM Center Las Piñas | no route | | | | no route | no route |
| las-pinas | Robinsons Place Las Piñas | Las Piñas City Hall | no route | | | | no route | no route |
| las-pinas | Vista Mall Las Piñas | Las Piñas Doctors Hospital | no route | | | | no route | no route |
| paranaque-bf-aguirre | SM City BF Parañaque | Aguirre Central Park | 1,759 m | 1,502 m | 1.17 | 0 m | 1,759 m, 0 m sheltered | 1,759 m, 0 m sheltered |
| paranaque-bf-aguirre | SM City BF Parañaque | Vista Mall Lakefront | 2,012 m | 1,360 m | 1.48 | 0 m | 2,012 m, 0 m sheltered | 2,012 m, 0 m sheltered |
| paranaque-bf-aguirre | Aguirre Central Park | W.Mall | 4,074 m | 1,872 m | 2.18 | 0 m | 4,074 m, 0 m sheltered | 4,074 m, 0 m sheltered |
| taguig-pateros | Venice Grand Canal Mall | New Taguig City Hall | 2,451 m | 994 m | 2.47 | 0 m | 2,451 m, 0 m sheltered | 2,451 m, 0 m sheltered |
| taguig-pateros | Ayala Malls Arca South | Taguig-Pateros District Hospital | 1,450 m | 1,321 m | 1.1 | 0 m | 1,450 m, 0 m sheltered | 1,450 m, 0 m sheltered |
| taguig-pateros | Pateros Municipal Hall | Taguig City Hall | 1,930 m | 1,574 m | 1.23 | 0 m | 1,930 m, 0 m sheltered | 1,930 m, 0 m sheltered |
| qc-commonwealth-fairview | Batasan MRT Station | Ever Gotesco Commonwealth | 936 m | 773 m | 1.21 | 0 m | 936 m, 0 m sheltered | 936 m, 0 m sheltered |
| qc-commonwealth-fairview | Regalado Avenue MRT Station | Fairview Center Mall | 227 m | 125 m | 1.82 | 0 m | 227 m, 0 m sheltered | 227 m, 0 m sheltered |
| qc-commonwealth-fairview | Regalado Avenue MRT Station | SM City Fairview | 3,702 m | 3,171 m | 1.17 | 0 m | 3,702 m, 0 m sheltered | 3,702 m, 0 m sheltered |
| qc-banawe | Fe Del Mundo Medical Center | St. Luke's Medical Center | 2,219 m | 1,528 m | 1.45 | 0 m | 2,219 m, 0 m sheltered | 2,219 m, 0 m sheltered |
| qc-banawe | Z Square | Fisher Mall Quezon Avenue | 2,454 m | 2,103 m | 1.17 | 0 m | 2,454 m, 0 m sheltered | 2,454 m, 0 m sheltered |
| qc-banawe | Fisher Mall Quezon Avenue | Capitol Medical Center | 694 m | 366 m | 1.89 | 0 m | 694 m, 0 m sheltered | 694 m, 0 m sheltered |

- Las Piñas fails every check. Only 56 of its 3,134 nodes have a mapped crossing or signals, against 4,001 of 19,404 in metro-core.
- So the side-switch rule splits the walk network. From Robinsons Place a walker reaches 972 of the 1,627 nodes the old check reached.
- The browser router finds no route for these pairs either. It says a route exists only on paths with unchecked access.
- The old check found 1,937 m to 3,188 m, because it ignored the side-switch rule. `publish.py --hold las-pinas` keeps the area out of the app.
- Valenzuela City Medical Center to Valenzuela Town Center runs 5.75 times the straight line, 5,352 m for 930 m. The old check gave 1,753 m through mid-block side changes.
- paranaque-bf-aguirre and north-coast pass, but their largest routable piece holds only 38.5% and 61.8% of routable nodes. Places there can have no route.
- The NCR builder staged these areas with the old places and route-check scripts. This build reran places, checks, display and manifest for all eight.

### Phase B moved 13 areas into the app on 2026-10-22

`publish.py --hold las-pinas` reads `pipeline/areas.json` and the staged areas, and writes these files to git.

- `app/public/data/areas.json` holds id, name, cities, `bbox`, `graph_bbox`, `graph_rects`, neighbourhoods and `center` for each area.
- `app/public/data/places_index.json` holds 16,010 places, each once, with its area id and its node in that area. It is 2.10 MB, or 0.39 MB as gzip.
- `app/public/data/areas/<id>/graph.json`, `places.json` and `hours.json`, compact.
- `pipeline/inputs/areas/<id>/manifest_template.json` and `buildings.geojson.gz`, beside the area's `canopy.tif`.
- `app/public/data/buildings.pmtiles` holds 637,936 buildings in layer `buildings`, at zooms 13 to 15, and is 24.4 MB.
- `app/public/data/trees.pmtiles` holds 1,325,409 crowns in layer `trees`, at zooms 14 and 15, and is 17.9 MB.

- Zoom 15 keeps every building. An indexed check build found all 637,936 there.
- The default tile grid (detail 12, about 0.29 m) lost 14 pillar parts under 0.1 m2 in Manila. Detail 13 keeps them.
- Zooms 13 and 14 thin small footprints, with tippecanoe's defaults. The check build drew 212,830 at zoom 13 and 637,731 at zoom 14.
- The largest building tile is 472 KB at zoom 13, 307 KB at zoom 14 and 193 KB at zoom 15.
- Trees use drop rate 1, so both zooms keep every crown. The largest tree tile is 489 KB at zoom 14 and 227 KB at zoom 15.
- Where areas overlap, the tiles keep one copy of a building or crown. Copies have the same heights and a centre within 1 m.
- That removed 55,927 building copies and 8,889 crown copies.
- The index keeps a place once. Places with the same name within 150 m count as one. The copy stays under the area that holds its point deepest inside its `graph_rects`.
- That dropped 954 copies, most of them where taguig-pateros overlaps metro-core (558) and paranaque-airport overlaps pasay-moa (171).
- The root Makati files left git. They are `graph.json`, `places.json`, `hours.json`, `buildings_display.geojson` and `pipeline/inputs/manifest_template.json` and `buildings.geojson`.
- metro-core covers Makati CBD. `pipeline/inputs/canopy_height_makati.tif` stays, because `test_night_bucket_writes_255` in `shade/test_shade.py` reads it.
- `pipeline/inputs/areas/makati-cbd/` and `pipeline/inputs/areas/las-pinas/` stay out of git.
- The root scripts (`run_all.sh` and `pipeline/build_*.py`) still build the single Makati area into `app/public/data/`. The app no longer reads those files.

| Area | Places (with detail) | In the index | canopy.tif | buildings.geojson.gz | graph.json |
| --- | --- | ---: | ---: | ---: | ---: |
| metro-core | 4,356 (400) | 4,080 | 6.61 MB | 6.82 MB | 8.80 MB |
| pasay-moa | 578 (56) | 522 | 0.82 MB | 0.92 MB | 1.59 MB |
| cubao-eastwood | 847 (50) | 808 | 2.47 MB | 2.41 MB | 1.61 MB |
| qc-north | 1,501 (98) | 1,454 | 3.30 MB | 3.42 MB | 2.77 MB |
| manila | 3,250 (218) | 3,234 | 1.74 MB | 3.55 MB | 4.65 MB |
| alabang | 482 (23) | 479 | 1.64 MB | 0.81 MB | 1.50 MB |
| north-coast | 1,462 (229) | 1,462 | 2.20 MB | 4.59 MB | 4.35 MB |
| marikina | 813 (86) | 809 | 2.24 MB | 2.95 MB | 1.97 MB |
| paranaque-airport | 515 (45) | 400 | 1.59 MB | 1.14 MB | 1.76 MB |
| paranaque-bf-aguirre | 341 (27) | 316 | 1.69 MB | 1.05 MB | 0.91 MB |
| taguig-pateros | 1,308 (118) | 990 | 3.32 MB | 4.61 MB | 4.07 MB |
| qc-commonwealth-fairview | 955 (110) | 951 | 6.74 MB | 6.34 MB | 2.64 MB |
| qc-banawe | 556 (54) | 505 | 1.31 MB | 2.30 MB | 1.45 MB |

RCBC Plaza is in metro-core as an office, and One Ayala as a mall. Buendia PNR Station is gone.

### The deploy build for 13 areas takes about 8 minutes

A clean `git archive` copy built in an `amazonlinux:2023` container with 4 CPUs and 8 GB, as on Vercel, but on arm64. Vercel runs x86_64.

| Step | Seconds | Of which shade.py |
| --- | ---: | ---: |
| dnf, Node 22, Python 3.12, pnpm | 20 | |
| `pnpm install --frozen-lockfile` | 11 | |
| shade venv from scratch | 56 | |
| metro-core | 70 | 59.5 |
| pasay-moa | 13 | 8.0 |
| cubao-eastwood | 18 | 13.7 |
| qc-north | 40 | 27.7 |
| manila | 34 | 28.8 |
| alabang | 13 | 9.0 |
| north-coast | 40 | 33.0 |
| marikina | 24 | 17.8 |
| paranaque-airport | 19 | 12.1 |
| paranaque-bf-aguirre | 13 | 7.1 |
| taguig-pateros | 40 | 34.7 |
| qc-commonwealth-fairview | 37 | 30.4 |
| qc-banawe | 18 | 10.8 |
| app build and 104 gzip copies | 27 | |
| `vercel_build.sh` in total | 464 | 292.6 |

- Each area's time includes `set_dates.py` and one Open-Meteo call. Vercel stops a build at 45 minutes.
- The run used `UCPH_SKIP_TESTS=1`, because the app tests wait on the app side of the area change.
- The build cache keeps the venv, so later builds skip the 56 s step.
- The 104 shade files take 49.0 MB, and their gzip copies 13.6 MB. `app/dist` holds 205 MB.
- Of that, each area's `trees.json` adds 47 MB that the app does not read, because the map reads `trees.pmtiles`.
- The six-area run before it took 276 s.

### A fixed side test and two graph rules join the split areas, and las-pinas ships

Missing crossings did not split the areas on 2026-10-22. Three other causes did.

- **The side test misread sidewalks in las-pinas.** The router compared each sidewalk line's mean vertex with its chord midpoint. On a bent piece, or one with uneven vertices, that vector points along the road or to the wrong side. At node 2137 on Alabang-Zapote Road, a mid-block way split, all four onward moves read as side changes, so the road ended there.
- **The graph boxes of north-coast leave gaps.** The Valenzuela piece, 2,738 nodes and 322 places, joined the rest only through 79 m of M. H. del Pilar Street on the Tinajeros Bridge, which lies outside all five boxes.
- **Gates split paranaque-bf-aguirre.** Its walk network fell into 148 routable pieces. Gate nodes made 11.98 km of edges unroutable, and 294 ways touching a closed gate node, 24.7 km, stayed out of the graph.
- **A node rule acted on its whole way, in every area.** One gate made a whole way unroutable, and one closed node removed a whole way. So a public road lost its full length to a gate at one end.

The fix changed three things.

- `app/src/lib/router/astar.ts` and `pipeline/districts/route_check.py` tell sidewalks apart from each edge's `side` and the direction walked. A U-turn onto the other edge between the same two nodes is a change of sidewalk. The crossing rule stays. A change is free at flag 1 or 2, costs 60 m x (1 + k) with a warning at flag 4, and is forbidden elsewhere.
- `pipeline/districts/build_graph.py` applies a node rule to the way pieces that hold the node. A piece through a closed node stays out, and a piece through a node that needs a check is unroutable. The rest of the way stays in.
- It keeps a walkable way outside the graph boxes when it joins two separate routable pieces within 300 m (`CONNECT_M`). The way may have no access rule on itself or its nodes.
- No rebuilt edge passes a closed node, and no routable edge passes a node that needs a check. A position-aware check over all 14 graphs found 0 of each.

Each area was rebuilt with `build.py`, shaded, and published by `publish.py` with no held area. The rebuild with the old scripts gave byte-identical pasay-moa files first.
Place pairs are 600 seeded random pairs of an area's places, routed with the side rule, before on the old places and after on the new ones.
Largest piece is the share of routable nodes in the largest piece of the router's search graph.

| Area | Edges | Connector ways (km) | Place pairs with a route | Largest piece |
| --- | --- | --- | --- | --- |
| metro-core | 30,894 to 34,477 | 103 (8.2) | 93.5% to 94.8% | 89.1% to 93.1% |
| pasay-moa | 5,735 to 6,292 | 22 (2.5) | 96.0% to 97.8% | 83.5% to 89.6% |
| cubao-eastwood | 5,661 to 6,463 | 31 (2.4) | 78.3% to 92.8% | 80.6% to 93.3% |
| qc-north | 9,343 to 10,547 | 23 (3.8) | 89.3% to 90.3% | 85.6% to 89.7% |
| manila | 16,711 to 18,559 | 116 (12.9) | 93.8% to 97.0% | 83.5% to 88.9% |
| alabang | 5,312 to 5,621 | 8 (0.8) | 75.3% to 76.0% | 80.0% to 82.0% |
| north-coast | 15,449 to 16,919 | 51 (5.4) | 58.0% to 99.0% | 61.7% to 92.7% |
| marikina | 7,022 to 7,706 | 30 (1.8) | 70.7% to 74.8% | 78.3% to 81.8% |
| paranaque-airport | 6,223 to 6,957 | 48 (2.1) | 76.2% to 86.8% | 78.1% to 86.2% |
| las-pinas | 4,301 to 4,855 | 39 (3.5) | 31.0% to 87.5% | 31.8% to 73.5% |
| paranaque-bf-aguirre | 3,207 to 3,712 | 26 (2.3) | 38.8% to 50.7% | 35.7% to 42.0% |
| taguig-pateros | 14,281 to 15,543 | 122 (8.2) | 78.0% to 80.2% | 83.0% to 85.3% |
| qc-commonwealth-fairview | 9,331 to 10,420 | 65 (7.0) | 92.5% to 92.8% | 86.8% to 89.7% |
| qc-banawe | 5,204 to 6,015 | 40 (3.1) | 89.8% to 99.2% | 89.1% to 96.1% |

- With the fixed side test, every area's reach equals its reach with no side rule at all.
- las-pinas passes its three checks. Robinsons Place to SM Center is 2,274 m, to City Hall 2,122 m, and Vista Mall to Las Pinas Doctors Hospital 3,202 m. None needs an unmarked crossing.
- Valenzuela City Medical Center to Valenzuela Town Center falls from 5,352 m to 1,729 m, against 930 m straight.
- Ayala MRT Station to Greenbelt keeps the same routes, lengths and steps at 08:00, 12:00, 15:00 and 16:00, and in rain mode.
- In the old routes for 2,843 place pairs, 2,623 moves crossed a road mid-block without a step, 1,473 of them on trunk, primary or secondary roads. The fixed test forbids them. 271 old unmarked-crossing warnings were moves along one sidewalk.

Three items stay open.

- Gated villages are a project decision. In paranaque-bf-aguirre, 120 edges, 7.1 km, pass a gate and stay unroutable, and 298 pieces, 12.2 km, pass a closed gate and stay out. With every gate in its graph open, 66.8% of place pairs would route.
- `barrier=bollard` and `barrier=height_restrictor` still need an access check, although both let walkers pass. In north-coast they hold 1.1 km of unroutable edges.
- Fixed later on 2026-10-22. The step text took a sidewalk's compass side from the same mean vertex vector. On 20% to 33% of side edges that word differed from the side the line's ends show, and on 6% to 11% by 90 degrees or more. `steps.ts` now takes the word from the edge's `side` and its u-to-v chord.

### Bollards and height bars stop closing paths, and metro-core gains 9 km of walkable path

On 2026-10-22 `pipeline/access_policy.py` stopped treating `barrier=bollard` and `barrier=height_restrictor` as an access rule. Walkers pass both. All 14 areas were rebuilt with `pipeline/districts/build.py` and published with `publish.py --no-tiles`, since buildings and trees did not change.

- Metro-core holds back 66.0 km of paths for an access check, down from 75.0 km. North-coast gains 1.2 km of walkable path.
- Place-pair reach moves by less than a point in most areas. Most of those paths already had another way in.
- cubao-eastwood and taguig-pateros lost 30 and 10 connector edges, so their shade was rebuilt. The other 12 kept their edge counts.


### 53 regional areas ship on 2026-10-22, and three needed their boxes moved first

Each of the 53 areas in `pipeline/regions/areas.json` passed these checks before publish.

- Build checks and three route-check pairs. `pipeline/regions/pick_routes.py` picks the pairs by kind and distance, without reading the graph. Every pair routes.
- Place-pair reach of 70% or more. The lowest are Dasmarinas at 71.6% and Lapu-Lapu at 81.7%. Most areas reach 85% to 100%.
- A shade run with `UCPH_START_DATE=2026-10-23`. All 53 wrote `READY.shade`, in 31 s to 91 s each.
- `pipeline/regions/city_check.py`. At least half of each area's land lies in the cities it names, by the OSM city boundaries. Vigan, Laoag, Pagadian and Surigao have no boundary in OSM, so their city point must lie inside the boxes. All 53 pass.
- A one-off map check found the busiest 1 km square of shops and services in each city. 52 of 53 areas hold it. Tacloban university belt does not, because Tacloban downtown holds it.

Three areas had boxes in the wrong place.

- Lapu-Lapu sat mostly on Mandaue, and no box held a bridge to Mactan, so reach was 56%. Its three districts moved onto Mactan: poblacion, city hall and airport, and south. Reach rose to 81.7%.
- Mandaue had 51% of its land in Cebu City. Its districts moved east to centro, north and east. 87% now lies in Mandaue.
- Dasmarinas missed its busiest square by 588 m: Robinsons Place, two jeepney terminals and National University at Pala-Pala. A fourth district, `dasmarinas-pala-pala`, holds it now.

Four pipeline faults were fixed on the way.

- `fetch_canopy.py` refused two Meta tiles whose pixel sizes differ in the 14th digit. It now compares them with a tolerance.
- `shade.py` reads `manifest.json` before the template. A rebuilt area kept its old box in shade and canopy. `build.py` now deletes the old shade outputs.
- `publish.py` reads `trees.json` from the shade run, so it now needs a shade run newer than the graph.
- The Mandaue pair BR Town Square to Boardwalk Plaza found no path. Boardwalk Plaza sits behind two gates tagged `access=permissive` and a lift gate. The access rule closes every tagged gate until the gated-street decision. The picker took its next pair instead.

Two limits stay open.

- Only buildings with an OSM outline cast shade. `pipeline/tools/footprint_cover.py` measures the share of Google's building area with an outline. Metro Manila areas have 53% to 74%. The regional areas have 12% to 70%, with a median of 42%, and 41 of 53 are under half. Baliwag, Cabanatuan, Iligan and Digos are near 12%. The next step is to fill outlines from Google's presence band in `build_buildings.py`.
- `trees.pmtiles` is 85.8 MB and `buildings.pmtiles` 52.5 MB. GitHub refuses a file over 100 MB. About 10 more areas of trees fill the gap, so split the tree file by region before the next wave.

### Google Open Buildings v3 fills the outlines OSM lacks, on 2026-10-23, and adds 1.03 million outlines

Only buildings with an outline cast shade, and OSM had outlines for 12% to 70% of Google's building area outside Metro Manila. `pipeline/districts/fetch_gob_v3.py` cuts Google Open Buildings v3 outlines (CC BY 4.0) into each district box. It reads 21 level-6 S2 files, 2.9 GB, kept in `pipeline/raw/gob_v3/`. `build_buildings.py` adds an outline only when all four rules hold.

- Its confidence reaches the 80%-precision threshold Google gives for its level-4 S2 cell (0.716 to 0.763 for the Philippine cells).
- The 2023 height raster sees a building in it: 8 or more pixels with presence 0.5 or more, and a median height of 2.5 m or more on those pixels.
- It overlaps OSM outlines and parts by less than 10% of its own area.
- Its height is that raster median. No default height applies, so a wrong outline gets no invented height.

Results across the 67 areas:

- 1,033,164 outlines added (997,898 in 65 areas, plus 19,242 in Baliwag and 16,024 in metro-core). In metro-core, 147,068 of 300,923 candidates overlapped OSM and 129,012 fell below the threshold.
- Outline share of Google's building area: Metro Manila 64% to 78%, was 53% to 74%. Other regions 41% to 72% (median 55%), was 12% to 70% (median 42%). Areas under half: 11, was 41. Baliwag went from 12% to 47%.
- Place-pair reach did not change in any area. Walkable km fell 0% to 2%, because sidewalk offsets now keep clear of the new outlines.
- `buildings.pmtiles` holds 2,016,478 buildings in 74.4 MB, up from 1,332,251 in 52.5 MB.
- An overlay on Esri imagery in Baliwag, Makati, Cebu and Davao showed the added outlines on real roofs and none on open ground. Dense low-rise blocks still miss many houses, so the fill errs low. In Cebu's Colon district OSM was already complete, and Google added 2 outlines.

Next, per Xavier on 2026-10-23: compare Google and OSM outlines building by building, for detail and coverage, before the next release.
That pass also counts fake outlines in a random sample of added ones against imagery. Google's own figure at this cutoff is 80% precision.
The raster check removes more, but nobody has counted what remains.

Only main deploys on Vercel (`git.deploymentEnabled` in `app/vercel.json`, 2026-10-23). A branch preview has no shade release for its graphs,
so it shaded every area itself, ran past 20 minutes, and held the one build slot while a production build waited.

### OSM and Google v3 outlines compared on 2026-10-23: keep both, OSM first; about 1 in 10 added outlines is not a building

`pipeline/tools/compare_outlines.py` compares the two sets in every area, using only outlines whose centre lies in the graph boxes and v3 outlines at the 80%-precision cutoff. Coverage counts the share of the Google 2023 raster's building area that each set covers. That raster is Google's too, so it may favour v3. The imagery check below does not.

| Group | OSM coverage | v3 coverage | Both together | OSM outlines | v3 outlines |
| --- | ---: | ---: | ---: | ---: | ---: |
| Metro Manila, 14 areas (median) | 67% | 61% | 83% | 666,419 | 634,626 |
| Other regions, 53 areas (median) | 42% | 55% | 65% | 717,854 | 1,233,443 |

- Both sets together cover more than either one in all 67 areas. OSM covers more than v3 in 23 areas, including 10 of the 14 in Metro Manila (metro-core by 20 points). v3 covers more in Las Pinas, BF Homes, Alabang and north-coast. v3 covers more in the rest, by up to 42 points (Cabanatuan, Iligan).
- Neither set is clearly more detailed. One OSM outline holds 2 or more v3 outlines for 4.9% of OSM outlines in Metro Manila and 5.9% elsewhere. One v3 outline holds 2 or more OSM outlines for 3.2% and 2.1% of v3 outlines. Median footprints are 95 and 89 m2 in Metro Manila, 90 and 76 m2 elsewhere.
- Only 14% (Metro Manila) and 22% (elsewhere) of OSM outlines match a v3 outline one to one (intersection over union 0.5 or more). Most overlap partly, so the two sets draw the same buildings with different shapes and offsets.
- Only OSM carries heights and building parts. 1.8% (Metro Manila) and 1.2% (elsewhere) of OSM outlines have a height or levels tag. Those are mostly the towers, which cast the longest shadows.

Imagery check on Esri World Imagery at zoom 19, by eye, rule and every verdict in `tmp/outline-compare-20261023/sample-notes.md`:

- 96 random added outlines: 78 real, 9 not buildings, 9 unclear (cloud or blur). That is 10% of the clear ones (95% interval 6% to 19%), about 107,000 of the 1,033,164 added. The 9 are tree canopy, a pool, bare soil, a grass strip, a court and an alley. Three are doubtful. The lead read page 1 (0 of 22) and an agent read pages 2 to 4 (9 of 65) more strictly.
- 48 random outlines the height raster check turned away: 18 real, 25 not buildings, 5 unclear. That is 58% of the clear ones. So the check removes outlines about six times as likely to be wrong, but also about 2 real roofs for every 3 fakes it removes.
- Two more filters were tested on the same samples (`tmp/outline-compare-20261023/canopy-eval.json` and `confidence-eval.json`). Neither helps, so the rule stays as built.
  - Tree canopy: only 1 of the 9 added fakes has half or more of its pixels at 3 m or taller in the Meta canopy raster, and 2 of 75 real roofs do. A canopy rule would drop 2 real roofs to remove 1 fake. Most added fakes are pools, soil, grass, a court or an alley, which the canopy raster does not mark.
  - Confidence: the 9 added fakes sit 0.012 to 0.155 above the cutoff (median 0.062), and the 75 real roofs 0.003 to 0.192 (median 0.059). A higher cutoff removes both at about the same rate.

Decision: keep OSM first and fill from v3, as built. In Metro Manila areas, v3 alone would cover 9 to 32 points less than the two together, and it would drop every OSM height tag.
