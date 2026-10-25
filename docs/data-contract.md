# Search starts with a small index and routing loads one area at a time

Dated 2026-10-23. The project owns this contract. The pipeline writes source data to `app/public/data/`. The app build derives the search files and column graphs described below.

## Sixty-seven routing areas share one time zone and one date rule

- `areas.json` lists 67 routing areas. The 14 in Metro Manila have the ids below. metro-core has Makati CBD.
  - metro-core, pasay-moa, cubao-eastwood, qc-north, manila, alabang, north-coast, marikina, paranaque-airport, las-pinas, paranaque-bf-aguirre, taguig-pateros, qc-commonwealth-fairview and qc-banawe.
- las-pinas joined on 2026-10-22, after its three route checks passed.
- 53 more areas, in or around 44 cities and provinces outside Metro Manila, joined on 2026-10-22. Their ids and boxes are in `pipeline/regions/areas.json`.
- A route runs inside one area. Each area combines one or more districts, and each district stays a named neighbourhood.
- An area's `bbox` is the envelope of its district boxes. Its graph area is the union of its `graph_rects`, and each of those is a district box plus 500 m.
- The building area is each graph box plus 800 m, so long low-sun shadows reach the edges.
- The time zone is `Asia/Manila` (UTC+8, no daylight saving).
- The data covers 7 calendar days, from the day of the shade build. Each morning the shade workflow builds a new set, so the 7-day window moves forward one day. One example window is 2026-10-21 to 2026-10-27.
- The app offers only dates in `manifest.dates`. It never interpolates a date.
- The data has a bucket every 30 minutes from 06:00 to 18:30, so 26 buckets. `manifest.buckets_min` holds minutes after midnight.

## An edge with unchecked access is not routable by default

Each edge carries `routable` (boolean). The pipeline sets `routable = false` when either of these is true.

- The corrected extractor flags `access_evaluation_needed`.
- The edge is time-restricted and has no row in `hours.json`.

On 2026-10-22 the project added these rules to the contract.

- A `barrier=kerb` node does not trigger the access check. A raised kerb sets the steps bit on its crossing edge.
- A `barrier=bollard` or `barrier=height_restrictor` node does not trigger the access check either. Both stop vehicles and let walkers pass. An access, foot or entrance tag on the same node still applies.
- Vehicle-only conditional tags (`oneway`, `motor_vehicle`, `maxspeed`, and similar) do not trigger the access check.
- An indoor, `corridor`, or building-passage edge with a cited `hours.json` row is routable. The router opens it only inside those hours.
- A default building height is 7.5 m (2 levels). An overstated height adds shade that does not exist, so the default is low on purpose.
- Flag bit 10 (value 1024) marks an unsheltered edge that runs mostly inside a building footprint with no indoor or cover tag. It is not shelter. Its shade counts as low confidence.
- The router treats sun altitude at or below 3 degrees as `state: "night"`.
- Road side edges keep their samples outside building footprints. If a sample is inside a footprint, the build decreases the offset, down to 1.5 m. If a sample is still inside, the side becomes one centre edge.
- `graph.node_flags` holds one integer per node. The bit values are 1 mapped crossing, 2 traffic signals, 4 junction of 3 or more ways, 8 grade-separated link.
- A route changes to the opposite side of the same road only at a node with bit 1 or 2. At a junction without them, it costs 60 x (1 + k) m and gets a warning. On the shortest route (k = 0), that is 60 m. Elsewhere the router forbids it.
- If one side edge is on the walker's left and the next on the right, they are on opposite sidewalks. The same is true for right then left. The router gets each hand from the edge's `side` and the direction walked. A U-turn onto the other edge between the same two nodes counts as a change of sidewalk. The router does not use the mean offset of the sidewalk line for this.
- A node rule applies to the way pieces that hold the node. The build leaves out a piece that passes through an explicitly closed node. It marks a piece through a node that needs an access check as unroutable. The rest of the way stays.
- A walkable way can have no node in the `graph_rects`. If such a way joins two separate routable pieces of the area, the build keeps it. The run outside the rects must be 300 m or less.
- Since 2026-10-22 the area builds write no shadow overlay PNGs and no `manifest.shadow_overlay`. The app draws building and tree shadows from `buildings.pmtiles` and `trees.pmtiles`.

The app builds its default adjacency only from edges with `routable == true` that are open at the chosen time. A user toggle "Include paths with unchecked access" stays off by default. When the user turns it on, the app draws those edges dashed and labels them on the route card.

## Files

### A data release keeps the slow-changing files, and every deploy builds the dated ones

`pipeline/districts/publish.py` builds these files from the staged areas. Git keeps only `areas.json`.
Since 2026-10-23 the others are assets of a GitHub release that `pipeline/data-release.json` names, with each
file's sha256. `pipeline/data_release.py publish` uploads them after a rebuild, and `fetch` downloads and checks
them. Each rebuild added about 21 MB to git before this. The area inputs in `pipeline/inputs/areas/` are
release assets in the same way.

```text
app/public/data/
  areas.json             the 67 areas, each regional one with its region (in git)
  places_index.json      every place once, input to the app build
  buildings.pmtiles      buildings of all areas, one file
  trees.pmtiles          tree crowns of all areas, one file
  areas/<id>/graph.json   \
  areas/<id>/places.json   | one asset per area, area-<id>.tar.gz
  areas/<id>/hours.json    |
  areas/<id>/jog.json     / optional in areas and releases built before jog data
```

The deploy builds these files, and git ignores them. Since 2026-10-22 the shade comes from a GitHub release that `.github/workflows/shade.yml` builds each morning at 04:30 Manila. `pipeline/vercel_build.sh` downloads that release and fetches the weather. It shades only an area whose `graph.json` hash differs from the `graph.sha256` in the release. If no release is from today or the six days before, it shades every area itself.

```text
app/public/data/
  advisory.json          one PAGASA fetch, copied into each area
  areas/<id>/manifest.json
  areas/<id>/shade/<date>.bin      one file per date, 7 dates
  areas/<id>/shade/lowconf.bin
  areas/<id>/trees.json            the shade engine's crowns; the app reads trees.pmtiles
  areas/<id>/weather.json
  areas/<id>/advisory.json
  areas/<id>/READY.graph, READY.shade, READY.weather
```

After the app build, the script writes a gzip copy beside each `.bin` in `app/dist/data/areas/`.
All JSON files that publish.py writes are compact, with no spaces or line breaks.

### The app build creates search files without changing pipeline data

`app/scripts/build-data.ts` runs as a Vite plugin on every build, including direct `vite build` commands. It serves the same derived files from memory during development. It never writes `app/public/data/`, and leaves `graph.json`, its hash, and the shade workflow unchanged.

The plugin copies the full public directory to the build output directory in the Vite config, with eight file copies at a time. On a filesystem with copy-on-write clones, the copies can reuse disk blocks. Other filesystems use normal copies. Output files stay independent of their sources. The copy keeps the bundle files that the build writes, including the worker with its build-specific shell list. The development server still serves the original public directory.

- `data/search/top.json` has every station, mall, bus terminal, hospital and landmark. It has the app's suggested names and each area's six `wellKnown` suggestions too. The build rejects a file over 300,000 decoded bytes.
- The landing screen starts one shared request for `top.json`. The app registers the service worker only after this request succeeds or fails. So the shell precache starts after the search download. If the request fails, the worker still installs. The app then clears the shared request, so Retry starts a new one.
- `top.json` names the other files as `area-<id>.json`. These files start to download when the user points at, taps or focuses the landing card. The app downloads three at a time. Search works as soon as the area list and `top.json` arrive. The app adds the places from each later file without blocking the search input.
- The app never fetches `places_index.json`. The plugin reads it on the build host.
- Search files use version 1 column arrays. `order` is the original index position. Names, categories, node ids, aliases and details keep their values. Coordinates use integer offsets at seven decimals from an origin per area. This preserves the source values.
- The app prepares search keys once per new place. It publishes the first results at once. Then it publishes places from background files in batches, every 200 ms and when the background loads finish. The merge sorts by `order` only when it publishes. After all files arrive, the ranking and the order of ties match the full index, in any arrival order.
- If a background file fails, the results that loaded stay usable. A later visit tries that file again. If the top file fails, the app shows the existing retry state.

### `graph.cols.json` keeps edge order and shade alignment

Every build writes `data/areas/<id>/graph.cols.json` beside the original graph in its output. The app requests the file only after the user picks that area with a place, a point or a trip link.

Version 1 has two node coordinate columns, one column per edge field, and flat arrays of geometry longitudes and latitudes. Geometry offsets mark the slice of each edge. Node and geometry coordinates have six decimal places. Optional `absent` indexes list the edges that omit a field, so the decoder leaves that field out again. `node_flags` stays in node order.

Rounding only the nodes can change which of two equal-cost paths A* picks. Two integer `routing_node_offsets` columns keep the seventh decimal as the difference from the rounded node. The decoder restores those node values for routing. Display geometry stays at six decimals. Edge ids, order, lengths, flags and access rules keep their values, so the shade arrays keep the same edge indexes.

The router loader in the app passes the column file name to `loadData`. By default, `loadData` still reads `graph.json`, for existing readers that load it from disk. Unit tests check three things. The decoded graph equals the rounded source graph. The gzip size of the column file is at most 80% of the gzip size of `graph.json`. Sampled place pairs in metro-core and Cebu City Centre get the same route edges and metrics.

While the first files of an area load, the trip panel shows a `Loading` status line. The line counts streamed bytes. If every current response gives a usable length, the line shows a percentage. The HTTP length of a compressed response does not measure the decoded stream bytes, so in that case the line shows KB. The line goes away when the load succeeds or fails. Later date changes use the existing shade loading state.

### The installed app caches its shell and the last area's trip data

`manifest.webmanifest` declares a standalone app with 192 and 512 PNG icons. Their artwork fits inside the maskable safe circle. `index.html` links a 180 PNG Apple touch icon. `app/scripts/make-icons.mjs` regenerates these from the umbrella logo.

Production builds register `sw.js`. Development uses Vite directly. The worker claims the open page after installation. Its shell list has the entry script and its static dependencies, and the map code needed to reopen a trip. The list has the Latin WOFF2 fonts, the document, the shell script, the manifest and the icons too. The worker caches other views and font subsets when the app first uses them.

A JSON file or image opened in a tab keeps its own cache key. Only an HTML response at the app root or `index.html` can replace the canonical app document.

Documents, data JSON, shade `.bin` and `.bin.gz` files, and `/api/` use the network first with HTTP cache revalidation. The worker serves a cached response only when the network fails. HTTP errors still reach the app. Hashed `/assets/` use the cache first. Cross-origin map tiles and PMTiles range requests go to the network, and the worker does not cache them.

On first use of a lazy component, the app imports it and checks its exact build URL with HEAD in parallel. If HEAD gets a 404 or 410, the app uses the existing deployment recovery, which reloads the page once. If that recovery fails again within a minute, the app shows the Reload card. The worker leaves HEAD requests to the network.

If the phone is offline, the app still uses the cached import. It does the same when HEAD times out after three seconds or the server does not support HEAD. The Map, steps, navigation, About and rain components share this check. The two navigation components reuse one promise. Hashed asset GETs stay cache-first.

`browserLoad.test.ts` adds browser tests without changing the protected acceptance specs. It checks that a named place missing from the built top index joins the visible results after the held shards arrive, with no new keystroke. It checks the bounds and visibility of the Loading line at desktop and narrow phone widths, in light and dark modes. Test captures stay in memory. The saved screenshots under `app/scripts/review-evidence/` stay available for visual review.

A regression test checks the names, contents and modification times of those screenshots before and after the browser tests. So the tests cannot overwrite the saved evidence.

After an area download succeeds, the worker keeps the fetched data for offline use. When the chosen bundle is ready, the worker keeps the areas that are still in app memory, at most two. It does not remove pending downloads. It removes the data of other areas. So offline routing still works when the user goes back to a bundle in memory.

If the first trip loads before the worker claims the page, the app sends its fetched file list once the worker controls the page. The worker then fills any missing cache entries. Shared search data stays cached. A cached trip link restores routing without a connection. The external basemap tiles still need the map provider. `sw.js` has `Cache-Control: no-cache`, and the existing Content-Security-Policy is unchanged.

### `areas.json`

```json
{"areas": [{"id": "metro-core", "name": "Makati, BGC, Ortigas and Shaw",
  "cities": ["Makati", "..."],
  "bbox": [121.012, 14.533, 121.09, 14.608],
  "graph_bbox": [121.0074, 14.5285, 121.0946, 14.6125],
  "graph_rects": [[121.0074, 14.5435, 121.0366, 14.5665], "..."],
  "neighbourhoods": [{"id": "makati-cbd", "name": "Makati CBD", "bbox": [121.012, 14.548, 121.032, 14.562]}],
  "center": [121.051, 14.5705]}]}
```

- `bbox` is the envelope of the district boxes. `graph_bbox` is the envelope of `graph_rects`.
- `graph_rects` are the boxes that the graph covers. A point between them is outside the area.
- `center` is the middle of `bbox`. The weather forecast and the sun position use this point.
- The values come from `pipeline/areas.json` and each area's manifest, and the publish step checks that they agree.
- `region` is `{"id", "name", "prsd", "provinces"}`. `prsd` names the PAGASA regional page for the advisory, and `provinces` are the
  provinces an advisory can name for the area. Metro Manila areas carry `{"id": "ncr", ...}`. An area without `region` is in Metro Manila.
- Regional areas come from `pipeline/regions/areas.json`. Publish ships a regional area only when four conditions are true.
  - Its checks pass.
  - A shade run is newer than its graph.
  - `pipeline/regions/city_check.py` finds its boxes in its own city.
  - 70% or more of its place pairs connect.

### `places_index.json`

```json
[{"name": "RCBC Plaza", "category": "office", "lon": 121.0163798, "lat": 14.5607614,
  "node_id": 11927, "area": "metro-core"},
 {"name": "Ayala MRT Station", "category": "station", "lon": 0, "lat": 0,
  "node_id": 0, "area": "metro-core", "aliases": ["Ayala MRT"], "detail": "..."}]
```

- One row for each distinct place, with the fields of `places.json` plus `area`. The file has 16,667 rows.
- `node_id` is a node in that area's `graph.json`. It means nothing in another area's graph.
- `aliases` and `detail` appear only when the place has them.
- Areas overlap, for example taguig-pateros and metro-core, or paranaque-airport and pasay-moa. A place can be in both areas' `places.json`.
- If the names match and the points lie within 150 m, the index treats two places as one. That is the radius `build_places.py` uses to merge a name.
- It keeps the copy whose point lies farthest inside its own area's `graph_rects`, so the route has the most graph around it. That drops 963 copies.
- Each area's `places.json` keeps all its places, because the router needs them.

### `manifest.json`

One per area, in `areas/<id>/manifest.json`.

```json
{
  "generated_at": "ISO-8601 with +08:00",
  "osm_extract": "philippines-261020.osm.pbf, md5 941dd405...",
  "pilot_bbox": [121.012, 14.533, 121.09, 14.608],
  "graph_bbox": [121.0074, 14.5285, 121.0946, 14.6125],
  "building_bbox": [120.9999, 14.5212, 121.1021, 14.6198],
  "timezone": "Asia/Manila",
  "dates": ["2026-10-22", "..."],
  "buckets_min": [360, 390, "...", 1110],
  "sun": {"2026-10-22": [[altitude_deg, azimuth_deg], "... one per bucket"]},
  "sunrise_sunset": {"2026-10-22": ["05:49", "17:32"]},
  "counts": {"nodes": 0, "edges": 0, "routable_edges": 0, "buildings": 0, "places": 0},
  "sources": [{"name": "", "licence": "", "url": "", "used_for": ""}],
  "limits": ["plain sentences the method page shows"],
  "area": {"id": "metro-core", "name": "", "neighbourhoods": [{"id": "", "name": "", "cities": [], "bbox": [], "graph_bbox": []}]},
  "graph_rects": [[0, 0, 0, 0]],
  "trees": {"path": "trees.json", "count": 0, "fields": ["lon", "lat", "r_m", "top_m", "base_m"], "source": ""},
  "shade": {"...": "see below"}
}
```

`pilot_bbox` equals the area's `bbox` in `areas.json`. `counts.buildings` counts the full building set, out to the shade margin.

### `graph.json`

One per area, in `areas/<id>/graph.json`. Node and edge ids count from 0 in each area.

```json
{
  "nodes": [[lon, lat], "..."],
  "edges": [{
    "id": 0, "u": 0, "v": 1, "len_m": 12.3,
    "geom": [[lon, lat], "..."],
    "flags": 0, "routable": true, "side": "centre",
    "way_id": 123, "name": "Ayala Avenue", "landmark": "Glorietta 4",
    "hours_idx": null, "level": null
  }]
}
```

- `geom` runs from `u` to `v`.
- `side` is `"left"`, `"right"`, or `"centre"`. Two-sided road sidewalks become two edges, joined by crossing links. Left and right are as seen when moving along the edge from `u` to `v`, which is the OSM way direction.
- `landmark` is the nearest named building or place within 25 m, or `null`.
- `flags` is a bitmask with these bits.

| Bit | Value | Meaning |
| --- | --- | --- |
| 0 | 1 | Covered pedestrian way (`covered` = yes, arcade, colonnade, roof) |
| 1 | 2 | Pedestrian tunnel or underpass |
| 2 | 4 | Indoor, `corridor`, or building passage |
| 3 | 8 | Footbridge or elevated walkway |
| 4 | 16 | Steps |
| 5 | 32 | Sidewalk |
| 6 | 64 | Access evaluation needed |
| 7 | 128 | Time-restricted |
| 8 | 256 | Crossing |
| 9 | 512 | Elevator |
| 10 | 1024 | Unsheltered edge mostly inside a building footprint, with no indoor or cover tag. Its shade counts as low confidence. |

Sheltered means `flags & 7`. Only pedestrian-class ways get bits 0 to 2. Busways and vehicle tunnels never do.

### `jog.json` adds jogging attributes in graph edge order

One per area, beside `graph.json`. `pipeline/districts/build_jog.py` reads the graph, the area's OSM extract,
the area's `hours.json` beside the graph (or `--hours PATH`), and the committed
`pipeline/districts/wikidata_heritage.json` snapshot. It never reads the network or changes
the graph. The snapshot records its query and fetch date. If the snapshot is missing or malformed, the script prints a
warning and keeps the OSM sights. The script skips invalid snapshot rows.

The table lists the top-level fields.

| Field | Meaning |
| --- | --- |
| `version` | Integer `1` |
| `graph_sha256` | Lowercase SHA-256 of the exact `graph.json` bytes read |
| `edges` | Seven integer arrays, each with one entry per graph edge, in the graph's array order. Older files can omit `hours`. |
| `sights` | Sight points, each with `name`, `kind`, `lon`, `lat` and `src` |
| `counts` | `edges`, `walk_m`, `lit_tagged_m`, `lit_share`, `sights` and `park_hours_edges` (edges whose `hours` index is at least 0) |
| `sources` | Objects with `name`, `licence` and `url`, one for OpenStreetMap under ODbL and one for Wikidata under CC0 |

Consumers must check `graph_sha256` before using the arrays. Sidewalk edges inherit the tags of their
`way_id`, including the road class. Link roads use their parent class. A missing OSM way keeps the default
tag codes. An empty or invalid edge geometry keeps its tag codes and has park 0, water 0, sight -1 and hours -1.

| Array | Codes |
| --- | --- |
| `edges.road` | 0 path, footway, pedestrian, steps or cycleway. 1 service or living_street. 2 residential or unclassified. 3 tertiary. 4 secondary. 5 primary. 6 trunk. Unmatched classes use 0. |
| `edges.lit` | 0 unknown. 1 `lit=yes`, `24/7`, `automatic` or `sunset-sunrise`. 2 `lit=no` |
| `edges.surface` | 0 unknown. 1 paved. 2 unpaved |
| `edges.park` | 1 when the edge midpoint lies in or on the boundary of a park area, else 0 |
| `edges.water` | 1 when the midpoint lies within 50 m of water geometry, else 0 |
| `edges.sight` | Index of the nearest sight point within 40 m of the midpoint, or -1. Equal distances use the lower index. |
| `edges.hours` | Index of the area's `hours.json` row for the park containing the edge midpoint, or -1. The park's exact OSM way or relation URL must equal the row's `source_url`. |

`edges.hours` uses the same polygons, boundaries and holes as `edges.park`. Duplicate URLs and overlapping
parks use the lowest matching row index. A missing or malformed hours file gives -1 everywhere. The build
skips rows without a string `source_url`, and the other row indexes do not change.

An older jog file without the column loads as -1 everywhere. A present column must have one integer of -1
or more per edge. If it does not, the app rejects the supplement. An index absent from the area's hours rows
counts as no hours. Jog searches check both park and graph hours at entry and exit, at the runner's pace on
each leg. Walking routes still use graph hours alone.

Paved surfaces are `paved`, `asphalt`, `concrete`, `concrete:lanes`, `concrete:plates`, `paving_stones`, `sett`,
`cobblestone`, `unhewn_cobblestone`, `metal`, `wood`, `rubber` and `bricks`. Unpaved surfaces are `unpaved`,
`compacted`, `fine_gravel`, `gravel`, `pebblestone`, `ground`, `dirt`, `earth`, `grass`, `grass_paver`, `sand`,
`mud`, `clay`, `rock`, `stone`, `woodchips`, `snow`, `ice` and `salt`. Other surface values stay unknown.

Park areas carry `leisure=park`, `leisure=garden`, `leisure=nature_reserve` or `landuse=recreation_ground`.
Water geometry comes from `natural=water`, `waterway=river`, `canal` or `stream`, or `natural=coastline`.
Water polygons include their interiors. Coastlines stay boundary lines, including closed island outlines.
Multipolygon holes stay excluded.

The midpoint of an edge is the point at half its line length, in a local UTM projection. All proximity
limits use metres in that projection.

Sights come from three groups of named OSM features.

- Historic features, except `historic=no`, `tomb` and `boundary_stone`.
- Tourism features with `artwork`, `museum`, `attraction`, `viewpoint`, `gallery`, `zoo`, `aquarium` or `theme_park`.
- Park areas.

Each OSM object appears once, even when it has several qualifying tags. `kind` is its historic, tourism or
park tag value, in that priority order.

Nodes use their own coordinates. Areas use an interior representative point. If that point falls outside
the graph box, the part of the area inside the box gives the point. Linear ways use their line midpoint.
This includes closed ways tagged `area=no` and ways with no assembled area. If needed, the part of the way
inside the box gives the midpoint.

Source ids are `osm:n123`, `osm:w123` or `osm:r123`, from the original object id. The build keeps only
points in the graph box.

Every valid Wikidata snapshot item in the graph box gives its point, name and kind (`nhcp_marker` or
`heritage`), with `src` such as `wikidata:Q123`. Repeated source ids give one row. OSM objects and snapshot
items with the same Wikidata id give one sight. For an OSM object, that id comes from its `wikidata` tag.
The first OSM source in sorted order gives the point and name of the sight. Unlinked objects keep their
separate source ids.

The build sorts the sight list by `src`, so the same inputs always give the same indexes.

`counts.edges` is the graph edge count. `counts.walk_m` sums graph `len_m`, including both sidewalks and
edges whose access needs a check. `counts.lit_tagged_m` sums the lengths with light code 1 or 2.
`counts.lit_share` divides those tagged metres by `walk_m`, or is 0 when the graph has no length.
Unknown light does not mean unlit. `counts.sights` is the length of `sights`.

The browser loads this supplement only for the Run a loop feature, inside `jogWorker.ts`. It checks
`graph_sha256` against the area's published 65-byte `graph.sha256`. It checks the column lengths against
the loaded graph. This check does not download `graph.json` again.

The app starts to capture the digest with the first graph load, and the capture never delays walking
routes. If the app captured a digest, the worker rejects a later digest from another build. If the capture
was unavailable, the worker can try it again. Each deploy writes the digest from the exact graph it ships,
after any local re-shading. Deploys that do not download a shade release write the digest in the same way.

`parseJog` rejects invalid versions, sizes, codes, sight coordinates and light shares. If the supplement is
absent, invalid, mismatched or slow, the loop finder still works with shade and crossings. The card area
then shows "Street data for sights, light and road size did not load."

The page sends its in-memory routing data once per area to the dedicated worker. Queries send only run
settings and local history through `postMessage`. When the app loads a new shade date, it sends the shade
arrays for that date. The worker keeps at most two areas.

If the earlier load of street data failed, the Other loops button requests it again. Optional street-data
requests stop after three seconds. Loop searches have their own default budget of 1,500 ms. If the worker
fails to start, the page shows a retry state.

### Run history stays in IndexedDB on the phone

Database `ucph-jog`, version 1, has object store `runs` with key path `id`. Each planned run is
`{id, area, date, length_m, streets}`. Each street sample is `[way_id, side, lonE5, latE5]`, with side 0
for centre, 1 for left and 2 for right. Coordinates are integer degrees times 100,000. The app samples the
geometry at most 23 m apart before rounding. That leaves room for rounding error within the 25 m limit.

An edge matches past runs only when its way id and side match and its geometry midpoint is within 30 m
of a saved sample. An edge without a way id never matches. The app skips corrupt records and shows a notice.

Scoring inspects at most 10,000 records and 1,000,000 samples. Rejected records count toward both limits.
Validation stops before a record goes past the remaining sample allowance. If a history is over these limits,
the app shows a notice and keeps all its records.

Reading and exporting use a separate history worker, so cloning a large legacy record cannot block the page.
If the history worker fails or takes more than ten seconds, the app shows a message and unlocks the loop
controls. The count includes every saved record. Export reads the full store as `{runs: [...]}`. It refuses
a file over 50 MB with a message, and it does not download a partial history. Clear history clears the store.

Saving first requests persistent browser storage. Safari outside a Home Screen app shows the retention
notice. The feature saves the planned loop and does not track a run with GPS.

History never enters a request URL, header or body. Export creates a local Blob download. Run starts and
settings do not enter trip links. The app never writes a start from the phone's location as coordinates in a link.

To add the file to an already published area, run
`pipeline/.venv/bin/python -I pipeline/districts/build_jog.py --area qc-north`. The script accepts a
positional area id too. `--graph`, `--pbf`, `--wikidata` and `--out` set explicit paths. Without an area
argument, `UC_AREA` chooses staged input and output under `pipeline/stage/<area>/`.

Area mode uses `ctx` for its OSM extract and the union of its graph rectangles. It keeps this boundary when
you pass explicit paths with it. With no area argument or area context, the script derives a box from the
graph's nodes and valid edge geometry. The box has a 50 m margin for nearby sights. Graph bytes do not
record the area's boundary. To reuse that boundary with explicit paths, pass `--area`.

`build.py` runs this step after `build_graph.py` and stops if it fails. `publish.py` copies graph and jog
bytes together, so the jog hash still matches the graph. Before writing any area, publish checks every staged
`jog.json` and its hash against the staged graph. Backfilling a published area with `--area` leaves staged
inputs unchanged. To prepare an existing staged graph for publish, run
`UC_AREA=qc-north pipeline/.venv/bin/python -I pipeline/districts/build_jog.py` for each staged area.

Data releases pack and fetch `jog.json` when it exists. Areas and older releases without it stay valid.
Fetch preserves local rebuilds. When fetch restores a legacy archive, it removes a jog file that an earlier
fetch wrote. Adding jog data alone leaves shade hashes unchanged.

### `shade/<date>.bin`, `shade/lowconf.bin` and their header in `manifest.shade`

```json
"shade": {"n_dates": 7, "n_buckets": 26, "n_edges": 0,
          "layout": "shade/<date>.bin: uint8 building[b][e], then uint8 tree[b][e]; shade/lowconf.bin: uint8 lowconf[e]",
          "per_date": true,
          "files": ["shade/2026-10-22.bin", "... one per date in manifest.dates"],
          "lowconf": "shade/lowconf.bin"}
```

- Each date file holds `2 x n_buckets x n_edges` bytes, so a phone loads one day at a time.
- `building[b][e]` is the percent of edge length in building shadow, 0 to 100. 255 marks a night bucket.
- `tree[b][e]` is the percent of edge length in tree shadow and not in building shadow, 0 to 100.
- `lowconf[e]` is the percent of the edge's building-shaded samples cast by a building with a default height, 0 to 100. It holds `n_edges` bytes and serves every date.
- Paths in `files` and `lowconf` start at the area folder.
- Sheltered edges (`flags & 7`) count as 100% roof in the app. The pipeline still writes their values.
- Each sample point casts a ray toward the sun from its own height. Footbridge samples start at deck height.
- `<name>.bin.gz` is a gzip copy beside every `.bin`. For metro-core a date file is 1,792,804 bytes, and its copy is 563,428.
- Vercel compresses only listed MIME types, and `application/octet-stream` is not one of them.
- `pipeline/vercel_build.sh` writes the copies after the app build, in `app/dist/data/areas/`, so each copy matches the shipped file.
- `app/vercel.json` serves `.bin.gz` as `application/gzip`. The app fetches the copy and inflates it with `DecompressionStream`.
- If the copy is missing, broken, or the wrong size, the app reads the `.bin`. The dev server and local builds have no copies.

### `buildings.pmtiles` (app) and `pipeline/inputs/areas/<id>/buildings.geojson.gz` (pipeline)

- `buildings.geojson.gz` holds every building of one area out to the shade margin, for the shade engine. It stays in the pipeline.
- `buildings.pmtiles` is one file for all 67 areas. Its source layer is `buildings`.
- Each feature is a polygon with two numbers, `height_m` and `min_height_m`. Each `building:part` is its own feature.
- It holds every building that has a height and lies within 150 m of a walk area. That is 2,016,478 buildings and 74.4 MB.
- If two areas overlap and two copies have the same height and centres within 1 m, the build keeps one. That removed 67,347 copies.
- The tiles cover zooms 13 to 15. Zoom 15 keeps every footprint, unsimplified, on a grid of about 0.15 m. The app overzooms past 15.
- At zooms 13 and 14, tippecanoe drops some small footprints with its default settings, to keep the tiles small.
- A check build of the 13-area file drew 212,830 of its 637,936 buildings at zoom 13 and 637,731 at zoom 14. When the count matters, draw shadows from zoom 15 data.

### `trees.pmtiles`

- One file for all 67 areas, 85.0 MB. Its source layer is `trees`. The file is a GitHub release asset, so the 100 MB limit for files in git does not apply.
- Each feature is a point at a crown centre, with three numbers in metres. They are `r_m` (crown radius), `top_m` (crown top) and `base_m` (crown base).
- It holds 6,323,166 crowns of 3 m or taller, within 200 m of a walk area. The build removes 11,214 copies from overlapping areas.
- The tiles cover zooms 14 and 15. Both zooms keep every crown, so tree shadows look the same at either zoom.
- The crowns equal each area's deploy-time `trees.json`, which `manifest.trees` describes.

### `places.json`

```json
[{"name": "Ayala MRT Station", "category": "station", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": ["Ayala MRT"]},
 {"name": "Muji", "category": "store", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": [], "detail": "in Greenbelt 3"}]
```

One per area, in `areas/<id>/places.json`. Every place has a snapped `node_id` on a routable edge of that area's graph. Places come from named OSM features in the graph area.

Named commercial sites (`landuse=commercial`), named tower parts (`building:part`) and tenant office areas are places too, so search finds towers such as RCBC Plaza. The pipeline leaves out stations tagged disused, abandoned, proposed or under construction.

`detail` is optional. The pipeline adds it only to places whose name appears more than once. It tells them apart in a short phrase. It comes from OSM. The source is the named building or mall around the place, the address house name, the address street, or the nearest named street. The app shows it next to the name and never searches it.

### `hours.json`

```json
[{"name": "Glorietta", "rules": {"mon": ["10:00", "21:00"], "...": []},
  "source_url": "https://...", "checked": "2026-02-24"}]
```

One per area, in `areas/<id>/hours.json`. Every row has a cited source, and the file has no guessed hours.

### `weather.json` and `advisory.json`

- Each area has both files. The forecast point is the area's `center`. Every area's advisory is a copy of the one fetch in `app/public/data/advisory.json`.
- `weather.json` looks like `{"status": "ok", "source": "Open-Meteo", "fetched_at": "", "lat": 0, "lon": 0, "hourly": {"time": [], "temperature_2m": [], "apparent_temperature": [], "precipitation_probability": [], "uv_index": [], "weather_code": []}}`.
- `advisory.json` looks like `{"status": "ok", "source_url": "", "fetched_at": "", "issued_at": "", "text": "", "cities": []}`.
- If a fetch fails, the file holds `{"status": "unavailable", "fetched_at": "", "reason": ""}`. The app shows "Weather unavailable" and no number.
- An advisory covers only 2 hours, so the build copy is stale for most of the day. On Vercel the app first reads `/api/advisory` (`app/api/advisory.js`). That function parses the PAGASA page with the same rules as `pipeline/fetch_weather.py`, behind a 10-minute edge cache. If it fails, the app reads `advisory.json`.

## Three marker files in each area folder mark the files that are ready

Each area folder has its own three markers.

- `READY.graph` means `manifest.json`, `graph.json`, `places.json` and `hours.json` exist. `pipeline/set_dates.py` writes it during the build.
- `READY.shade` means every file in `manifest.shade.files` and `shade/lowconf.bin` exist and match `manifest.shade`. `shade.py` writes it last.
- `READY.weather` means `weather.json` and `advisory.json` exist.

The app never fabricates a payload. Unit tests can use small hand-built graphs inside the test files only.

## The UI calls five router functions from `app/src/lib/router/index.ts`

```ts
type Mode = "shade" | "rain";
interface Query { from: number; to: number; dateIdx: number; bucketIdx: number;
  mode: Mode; stepFree: boolean; includeUnchecked: boolean; departMin: number }
type SegKind = "sun" | "building" | "tree" | "roof" | "unchecked";
interface Step { text: string; textTl: string; distance_m: number; minutes: number;
  cover: "roof" | "shade" | "sun" | "mixed"; landmark: string | null;
  flags: ("stairs" | "footbridge" | "underpass" | "indoor" | "hours" | "unchecked" | "crossing")[];
  closesAt: string | null; at: [number, number] }
interface Route { label: "recommended" | "shortest" | "most";
  edgeIds: number[]; coords: [number, number][]; length_m: number; minutes: number;
  covered_pct: number; sun_minutes: number;
  split: { roof_m: number; building_m: number; tree_m: number; sun_m: number };
  segments: { coords: [number, number][]; kind: SegKind }[];
  steps: Step[]; warnings: string[]; lowconf_pct: number }
interface Result { state: "ok" | "night" | "no_route" | "outside";
  routes: Route[]; recommendedIsShortest: boolean; notes: string[] }

loadData(base?: string): Promise<Data>
findRoutes(data: Data, q: Query): Result
snapToNode(data: Data, lon: number, lat: number): { node: number; dist_m: number } | null
searchPlaces(data: Data, q: string, limit?: number): Place[]
openAt(data: Data, hoursIdx: number, dateIdx: number, minute: number): boolean
```

- The walking speed is 1.1 m/s. Report minutes rounded up.
- `aStar(data, spec, start, end, k, options?)` accepts optional `{extra, entry, junctionExtra, mPerMin}`.
  - `extra[e]` adds non-negative cost per metre.
  - `entry: {edge, context?}` carries the sidewalk state of the earlier leg.
  - `junctionExtra[e]` adds metres at an unmarked side change into edge `e`.
  - `mPerMin` changes the arrival times that the opening-hours check uses.
  - Without these options, walking routes do not change.
- `buildSteps` accepts an optional fourth argument for metres per minute. Walking still defaults to 66.
- Jog legs can pass `potential` to `aStar` too. It is a Float64Array of consistent weighted distance bounds.
  - The jog engine computes these bounds from the destination of each leg, on permitted streets.
  - The bounds include repeat penalties. They ignore hours and side changes.
  - The computation stops at the start of the leg and clips farther distances at that cost.
  - A* uses the larger of the geometric bound and the absolute difference of these distances as its estimate.
  - A larger estimate can make A* check fewer nodes. It never adds routing cost.
  - Nonfinite entries use the original geometric bound.
- The search ranks routes with the shade of the departure bucket. The route card reports the shade of the bucket in force when the walker reaches each edge (`coverAt` in `route.ts`).
- If the sun altitude at the bucket is at or below 3 degrees, return `state: "night"` (see the rules added on 2026-10-22). Then return the shortest and the most sheltered routes, and add a note.
- For the recommended route, start at k = 2 and lower k until the detour is 20% or less. Keep it only if it cuts sun minutes by at least 15%. If it does not, and the most covered route meets both limits, use the most covered route instead. Otherwise set `recommendedIsShortest`.
- For the most covered route, use k = 8 and lower it while the detour exceeds 50%.
- Rain mode uses the same rules with exposure = 1 for unsheltered edges and 0 for sheltered edges.
