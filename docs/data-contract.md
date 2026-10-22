# The pipeline writes eight files that the browser app reads

Date: 2026-10-21. Owner: the project. The pipeline in `pipeline/` writes every file below to `app/public/data/`. The app in `app/` reads them and nothing else.

## Area, time zone, and dates are fixed for the prototype

- Pilot box (Makati CBD): lat 14.548 to 14.562, lon 121.012 to 121.032.
- Graph area: the pilot box plus 500 m on each side. Use lat 14.5435 to 14.5665, lon 121.0074 to 121.0366.
- Building area: the graph area plus 800 m on each side, so long low-sun shadows reach the edges.
- Time zone: `Asia/Manila` (UTC+8, no daylight saving).
- Dates: 7 calendar days, 2026-10-21 to 2026-10-27. The app offers only dates in `manifest.dates`. It never interpolates a date.
- Buckets: every 30 minutes from 06:00 to 18:30, so 26 buckets. `manifest.buckets_min` holds minutes after midnight.

## Access rule: an edge with unchecked access is not routable by default

Each edge carries `routable` (boolean). The pipeline sets `routable = false` when either is true:

- The corrected extractor flags `access_evaluation_needed`.
- The edge is time-restricted and has no row in `hours.json`.

Amendment, 2026-10-22:

- A `barrier=kerb` node does not trigger the access check. A raised kerb sets the steps bit on its crossing edge.
- Vehicle-only conditional tags (`oneway`, `motor_vehicle`, `maxspeed`, and similar) do not trigger the access check.
- An indoor, corridor, or building-passage edge with a cited `hours.json` row is routable. The router opens it only inside those hours.
- A default building height is 7.5 m (2 levels). An overstated height invents shade, so the default errs low.
- Flag bit 10 (value 1024) marks an unsheltered edge that runs mostly inside a building footprint with no indoor or cover tag. It is not shelter. Its shade counts as low confidence.
- The router treats sun altitude at or below 3 degrees as `state: "night"`.
- Road side edges keep their samples outside building footprints. The offset shrinks to 1.5 m, then falls back to one centre edge.
- `graph.node_flags` holds one integer per node: 1 mapped crossing, 2 traffic signals, 4 junction of 3 or more ways, 8 grade-separated link.
- A route changes to the opposite side of the same road only at a node with bit 1 or 2. At a junction without them it costs 60 m and gets a warning. Elsewhere the router forbids it.
- `manifest.shadow_overlay` points to one ground-shadow PNG per date and daytime bucket, at 2 m per pixel.

The app builds its default adjacency only from edges with `routable == true` that are open at the chosen time. A user toggle "Include paths with unchecked access" stays off by default. When the user turns it on, the app draws those edges dashed and labels them on the route card.

## Files

### `manifest.json`

```json
{
  "generated_at": "ISO-8601 with +08:00",
  "osm_extract": "philippines-261020.osm.pbf, md5 941dd405...",
  "pilot_bbox": [121.012, 14.548, 121.032, 14.562],
  "graph_bbox": [121.0074, 14.5435, 121.0366, 14.5665],
  "timezone": "Asia/Manila",
  "dates": ["2026-10-21", "..."],
  "buckets_min": [360, 390, "...", 1110],
  "sun": {"2026-10-21": [[altitude_deg, azimuth_deg], "... one per bucket"]},
  "sunrise_sunset": {"2026-10-21": ["05:51", "17:33"]},
  "counts": {"nodes": 0, "edges": 0, "routable_edges": 0, "buildings": 0, "places": 0},
  "sources": [{"name": "", "licence": "", "url": "", "used_for": ""}],
  "limits": ["plain sentences the method page shows"]
}
```

### `graph.json`

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
- `side`: `"left"`, `"right"`, or `"centre"`. Two-sided road sidewalks become two edges, joined by crossing links.
- `landmark`: the nearest named building or place within 25 m, else `null`.
- `flags` is a bitmask:

| Bit | Value | Meaning |
| --- | --- | --- |
| 0 | 1 | Covered pedestrian way (`covered` = yes, arcade, colonnade, roof) |
| 1 | 2 | Pedestrian tunnel or underpass |
| 2 | 4 | Indoor, corridor, or building passage |
| 3 | 8 | Footbridge or elevated walkway |
| 4 | 16 | Steps |
| 5 | 32 | Sidewalk |
| 6 | 64 | Access evaluation needed |
| 7 | 128 | Time-restricted |
| 8 | 256 | Crossing |
| 9 | 512 | Elevator |

Sheltered means `flags & 7`. Only pedestrian-class ways get bits 0 to 2. Busways and vehicle tunnels never do.

### `shade.bin` and its header in `manifest.shade`

```json
"shade": {"n_dates": 7, "n_buckets": 26, "n_edges": 0,
          "layout": "uint8 building[d][b][e], then uint8 tree[d][b][e], then uint8 lowconf[e]"}
```

- `building[d][b][e]`: percent of edge length in building shadow, 0 to 100.
- `tree[d][b][e]`: percent of edge length in tree shadow and not in building shadow, 0 to 100.
- `lowconf[e]`: percent of the edge's building-shaded samples cast by a building with a default height, 0 to 100.
- Sheltered edges (`flags & 7`) count as 100% roof in the app. The pipeline still writes their values.
- Each sample point casts a ray toward the sun from its own height. Footbridge samples start at deck height.
- `shade.bin.gz`: a gzip copy of `shade.bin` (about 0.54 MB for 2.29 MB). Vercel compresses only listed MIME types, and `application/octet-stream` is not one. `pipeline/vercel_build.sh` writes the copy beside each `shade.bin` in `app/dist/data/` after the app build, so it always matches the shipped `shade.bin`. `app/vercel.json` serves it as `application/gzip`. The app fetches `shade.bin.gz` and inflates it with `DecompressionStream`. It reads `shade.bin` when the copy is missing (the dev server and local builds), broken, or the browser cannot inflate it.

### `buildings_display.geojson` (app) and `pipeline/inputs/buildings.geojson` (pipeline)

`pipeline/inputs/buildings.geojson` holds every building out to the shade margin, for the shade engine. The app loads `buildings_display.geojson`, the subset within 150 m of the walk area, with no null heights. Both are polygon features. Each `building:part` is its own feature. Properties: `height_m`, `min_height_m`, `source` (`osm`, `osm_levels`, `google_2023`, `default`), `name`.

### `places.json`

```json
[{"name": "Ayala MRT Station", "category": "station", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": ["Ayala MRT"]},
 {"name": "Muji", "category": "store", "lon": 0, "lat": 0,
  "node_id": 0, "aliases": [], "detail": "in Greenbelt 3"}]
```

Every place has a snapped `node_id` on a routable edge. Places come from named OSM features in the graph area.

`detail` is optional. It is set only on places whose name appears more than once, and it tells them apart in a few words. It comes from OSM: the named building or mall that contains the place, the address house name, the address street, or the nearest named street. The app shows it next to the name and never searches it.

### `hours.json`

```json
[{"name": "Glorietta", "rules": {"mon": ["10:00", "21:00"], "...": []},
  "source_url": "https://...", "checked": "2026-02-24"}]
```

Only rows with a cited source. No guessed hours.

### `weather.json` and `advisory.json`

- `weather.json`: `{"status": "ok", "source": "Open-Meteo", "fetched_at": "", "lat": 0, "lon": 0, "hourly": {"time": [], "temperature_2m": [], "apparent_temperature": [], "precipitation_probability": [], "uv_index": [], "weather_code": []}}`.
- `advisory.json`: `{"status": "ok", "source_url": "", "fetched_at": "", "issued_at": "", "text": "", "cities": []}`.
- If a fetch fails, the file holds `{"status": "unavailable", "fetched_at": "", "reason": ""}`. The app shows "Weather unavailable" and no number.
- An advisory covers only 2 hours, so the build copy is stale for most of the day. On Vercel the app first reads `/api/advisory` (`app/api/advisory.js`). That function parses the PAGASA page with the same rules as `pipeline/fetch_weather.py`, behind a 10-minute edge cache. If it fails, the app reads `advisory.json`.

## Markers tell the app which files are ready

- `READY.graph`: `manifest.json`, `graph.json`, `places.json`, `hours.json`, and `buildings_display.geojson` exist. `pipeline/set_dates.py` writes it during the build.
- `READY.shade`: `shade.bin` exists and `manifest.shade` matches it.
- `READY.weather`: `weather.json` and `advisory.json` exist.

The app never fabricates a payload. Unit tests can use small hand-built graphs inside the test files only.

## Router API: the UI calls five functions from `app/src/lib/router/index.ts`

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

- Walking speed: 1.1 m/s. Report minutes rounded up.
- Shade uses the departure bucket for the whole walk. A comment in the code says so.
- `state: "night"` when the sun altitude at the bucket is at or below 0. Then return the shortest and the most sheltered routes, and add a note.
- Recommended rule: start at k = 2 and lower k until the detour is 20% or less. Keep it only if it cuts sun minutes by at least 15%. If it does not, the most covered route takes its place when it meets both limits. Otherwise set `recommendedIsShortest`.
- Most covered rule: k = 8, lowered while the detour exceeds 50%.
- Rain mode uses the same rules with exposure = 1 for unsheltered edges and 0 for sheltered edges.
