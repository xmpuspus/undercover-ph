# The app reads four shared files and one folder per routing area

Dated 2026-10-22. The project owns it. The pipeline in `pipeline/` writes every file below to `app/public/data/`. The app in `app/` reads them and nothing else.

## Sixty-seven routing areas share one time zone and one date rule

- `areas.json` lists 67 routing areas. The 14 in Metro Manila have the ids metro-core, pasay-moa, cubao-eastwood, qc-north, manila, alabang, north-coast, marikina, paranaque-airport, las-pinas and paranaque-bf-aguirre. The other three are taguig-pateros, qc-commonwealth-fairview and qc-banawe. metro-core has Makati CBD.
- las-pinas joined on 2026-10-22, after its three route checks passed.
- 53 more areas in 44 other regions joined on 2026-10-22. Their ids and boxes are in `pipeline/regions/areas.json`.
- A route runs inside one area. Each area joins one or more districts, and each district stays a named neighbourhood.
- An area's `bbox` is the envelope of its district boxes. Its graph area is the union of its `graph_rects`, and each of those is a district box plus 500 m.
- The building area is each graph box plus 800 m, so long low-sun shadows reach the edges.
- The time zone is `Asia/Manila` (UTC+8, no daylight saving).
- The data covers 7 calendar days, 2026-10-21 to 2026-10-27. The app offers only dates in `manifest.dates`. It never interpolates a date.
- The data has a bucket every 30 minutes from 06:00 to 18:30, so 26 buckets. `manifest.buckets_min` holds minutes after midnight.

## An edge with unchecked access is not routable by default

Each edge carries `routable` (boolean). The pipeline sets `routable = false` when either of these is true.

- The corrected extractor flags `access_evaluation_needed`.
- The edge is time-restricted and has no row in `hours.json`.

On 2026-10-22 the contract added these rules.

- A `barrier=kerb` node does not trigger the access check. A raised kerb sets the steps bit on its crossing edge.
- Amendment, 2026-10-22. A `barrier=bollard` or `barrier=height_restrictor` node does not trigger the access check either. Both stop vehicles and let walkers pass. An access, foot or entrance tag on the same node still applies.
- Vehicle-only conditional tags (`oneway`, `motor_vehicle`, `maxspeed`, and similar) do not trigger the access check.
- An indoor, `corridor`, or building-passage edge with a cited `hours.json` row is routable. The router opens it only inside those hours.
- A default building height is 7.5 m (2 levels). An overstated height invents shade, so the default errs low.
- Flag bit 10 (value 1024) marks an unsheltered edge that runs mostly inside a building footprint with no indoor or cover tag. It is not shelter. Its shade counts as low confidence.
- The router treats sun altitude at or below 3 degrees as `state: "night"`.
- Road side edges keep their samples outside building footprints. The offset shrinks to 1.5 m, then falls back to one centre edge.
- `graph.node_flags` holds one integer per node. The bit values are 1 mapped crossing, 2 traffic signals, 4 junction of 3 or more ways, 8 grade-separated link.
- A route changes to the opposite side of the same road only at a node with bit 1 or 2. At a junction without them it costs 60 m and gets a warning. Elsewhere the router forbids it.
- Amendment, 2026-10-22. Two side edges are on opposite sidewalks when the walker has them on different hands, from each edge's `side` and the direction walked. A U-turn onto the other edge between the same two nodes counts as a change of sidewalk. The router does not use the mean offset of the sidewalk line for this.
- Amendment, 2026-10-22. A node rule applies to the way pieces that hold the node. The build leaves out a piece through an explicitly closed node and marks a piece through a node that needs an access check as unroutable. The rest of the way stays.
- Amendment, 2026-10-22. A walkable way with no node in the `graph_rects` stays when it joins two separate routable pieces of the area within 300 m outside them.
- Since 2026-10-22 the area builds write no shadow overlay PNGs and no `manifest.shadow_overlay`. The app draws building and tree shadows from `buildings.pmtiles` and `trees.pmtiles`.

The app builds its default adjacency only from edges with `routable == true` that are open at the chosen time. A user toggle "Include paths with unchecked access" stays off by default. When the user turns it on, the app draws those edges dashed and labels them on the route card.

## Files

### A data release keeps the slow-changing files, and every deploy builds the dated ones

`pipeline/districts/publish.py` builds these files from the staged areas. Git keeps only `areas.json`.
Since 2026-10-23 the others are assets of a GitHub release that `pipeline/data-release.json` names, with each
file's sha256. `pipeline/data_release.py publish` uploads them after a rebuild, and `fetch` downloads and checks
them. Each rebuild added about 21 MB to git before this. The area inputs in `pipeline/inputs/areas/` travel the
same way.

```text
app/public/data/
  areas.json             the 67 areas, each regional one with its region (in git)
  places_index.json      every place once, for search
  buildings.pmtiles      buildings of all areas, one file
  trees.pmtiles          tree crowns of all areas, one file
  areas/<id>/graph.json  \
  areas/<id>/places.json  > one asset per area, area-<id>.tar.gz
  areas/<id>/hours.json  /
```

The deploy builds these files, and git ignores them. Since 2026-10-22 the shade comes from a GitHub release that `.github/workflows/shade.yml` builds each morning at 04:30 Manila. `pipeline/vercel_build.sh` downloads it, shades only an area whose `graph.json` hash differs from the release's `graph.sha256`, and fetches the weather. With no release from today or the six days before, it shades every area itself.

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
- `graph_rects` are the boxes the graph really covers. A point between them is outside the area.
- `center` is the middle of `bbox`. The weather forecast and the sun position use this point.
- The values come from `pipeline/areas.json` and each area's manifest, and the publish step checks that they agree.
- `region` is `{"id", "name", "prsd", "provinces"}`. `prsd` names the PAGASA regional page for the advisory, and `provinces` are the
  provinces an advisory may name for the area. Metro Manila areas carry `{"id": "ncr", ...}`. An area without `region` is in Metro Manila.
- Regional areas come from `pipeline/regions/areas.json`. Publish ships one only when its checks pass, a shade run is newer than its
  graph, `pipeline/regions/city_check.py` finds its boxes in its own city, and 70% or more of its place pairs connect.

### `places_index.json`

```json
[{"name": "RCBC Plaza", "category": "office", "lon": 121.0163798, "lat": 14.5607614,
  "node_id": 11927, "area": "metro-core"},
 {"name": "Ayala MRT Station", "category": "station", "lon": 0, "lat": 0,
  "node_id": 0, "area": "metro-core", "aliases": ["Ayala MRT"], "detail": "..."}]
```

- One row for each real place, with the fields of `places.json` plus `area`. 16,667 rows.
- `node_id` is a node in that area's `graph.json`. It means nothing in another area's graph.
- `aliases` and `detail` appear only when the place has them.
- Areas overlap, for example taguig-pateros and metro-core, or paranaque-airport and pasay-moa. A place can be in both areas' `places.json`.
- The index treats two places as one when the names match and the points lie within 150 m. That is the radius `build_places.py` uses to merge a name.
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
- `side` is `"left"`, `"right"`, or `"centre"`. Two-sided road sidewalks become two edges, joined by crossing links. Left and right are relative to the edge's `u` to `v` direction, which is the OSM way direction.
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

Sheltered means `flags & 7`. Only pedestrian-class ways get bits 0 to 2. Busways and vehicle tunnels never do.

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
- Where two areas overlap, one copy stays when the heights match and the centres lie within 1 m. That removed 67,347 copies.
- Zooms 13 to 15. Zoom 15 keeps every footprint, unsimplified, on a grid of about 0.15 m. The app overzooms past 15.
- Zooms 13 and 14 thin out small footprints, with tippecanoe's defaults, to keep tiles light.
- A check build of the 13-area file drew 212,830 of its 637,936 buildings at zoom 13 and 637,731 at zoom 14. When the count matters, draw shadows from zoom 15 data.

### `trees.pmtiles`

- One file for all 67 areas, 85.0 MB. Its source layer is `trees`. GitHub refuses a file over 100 MB, so split it by region before about 10 more areas.
- Each feature is a point at a crown centre, with three numbers in metres. They are `r_m` (crown radius), `top_m` (crown top) and `base_m` (crown base).
- It holds 6,323,166 crowns of 3 m or taller, within 200 m of a walk area. The build removes 11,214 copies from overlapping areas.
- Zooms 14 and 15. Both zooms keep every crown, so tree shadows look the same at either zoom.
- The crowns equal each area's deploy-time `trees.json`, which `manifest.trees` describes.

### `places.json`

```json
[{"name": "Ayala MRT Station", "category": "station", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": ["Ayala MRT"]},
 {"name": "Muji", "category": "store", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": [], "detail": "in Greenbelt 3"}]
```

One per area, in `areas/<id>/places.json`. Every place has a snapped `node_id` on a routable edge of that area's graph. Places come from named OSM features in the graph area.

Named commercial sites (`landuse=commercial`), named tower parts (`building:part`) and tenant office areas are places too, so towers such as RCBC Plaza are found. The pipeline leaves out stations tagged disused, abandoned, proposed or under construction.

`detail` is optional. The pipeline adds it only to places whose name appears more than once. It tells them apart in a short phrase. It comes from OSM. The source is the named building or mall around the place, the address house name, the address street, or the nearest named street. The app shows it next to the name and never searches it.

### `hours.json`

```json
[{"name": "Glorietta", "rules": {"mon": ["10:00", "21:00"], "...": []},
  "source_url": "https://...", "checked": "2026-02-24"}]
```

One per area, in `areas/<id>/hours.json`. Only rows with a cited source. No guessed hours.

### `weather.json` and `advisory.json`

- Each area has both files. The forecast point is the area's `center`. Every area's advisory is a copy of the one fetch in `app/public/data/advisory.json`.
- `weather.json` looks like `{"status": "ok", "source": "Open-Meteo", "fetched_at": "", "lat": 0, "lon": 0, "hourly": {"time": [], "temperature_2m": [], "apparent_temperature": [], "precipitation_probability": [], "uv_index": [], "weather_code": []}}`.
- `advisory.json` looks like `{"status": "ok", "source_url": "", "fetched_at": "", "issued_at": "", "text": "", "cities": []}`.
- If a fetch fails, the file holds `{"status": "unavailable", "fetched_at": "", "reason": ""}`. The app shows "Weather unavailable" and no number.
- An advisory covers only 2 hours, so the build copy is stale for most of the day. On Vercel the app first reads `/api/advisory` (`app/api/advisory.js`). That function parses the PAGASA page with the same rules as `pipeline/fetch_weather.py`, behind a 10-minute edge cache. If it fails, the app reads `advisory.json`.

## Markers tell the app which files are ready

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
- The search ranks routes with the shade of the departure bucket. The route card reports the shade of the bucket in force when the walker reaches each edge (`coverAt` in `route.ts`).
- `state: "night"` when the sun altitude at the bucket is at or below 3 degrees (see the 2026-10-22 amendment). Then return the shortest and the most sheltered routes, and add a note.
- For the recommended route, start at k = 2 and lower k until the detour is 20% or less. Keep it only if it cuts sun minutes by at least 15%. If it does not, the most covered route takes its place when it meets both limits. Otherwise set `recommendedIsShortest`.
- For the most covered route, use k = 8 and lower it while the detour exceeds 50%.
- Rain mode uses the same rules with exposure = 1 for unsheltered edges and 0 for sheltered edges.
