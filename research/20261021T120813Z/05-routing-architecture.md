# A browser A* router on static files fits a one-person v1 in Makati CBD and scales to Metro Manila by tiling

Correction, 2026-10-21: the benchmarks below use the original access-blind graph and synthetic shade on a desktop M5. Their latency, payloads, route choices and cost models do not describe the corrected graph or a phone. The rebuilt Makati candidate graph has 2,265 nodes and 2,903 undirected edges, of which 809 need access evaluation. NCR has 139,237 nodes and 176,122 undirected edges. The profile excludes busways and vehicle tunnels without explicit foot permission. Only pedestrian-class ways receive shelter flags. Rule text now survives in graph sidecars, but no schedule evaluator exists. All corrected graphs declare `routing_ready: false`. See [the current evidence and limits](../../docs/research-corrections.md).

Labels: [VERIFIED] means I ran it or read the source file. [UNVERIFIED] means recall, estimate, or design choice.
[STAND-IN] marks results that use modelled shade. Real shade from report 04 does not exist yet.

The answer:

- Build your own A* router in TypeScript. Run it in the browser on typed arrays.
- Host the site as static files. You need no server.
- Makati CBD gives three routes in 0.16 to 0.25 ms (p50) on an Apple M5. [VERIFIED]
- All of Metro Manila gives three routes in 0.40 to 0.63 ms (p50). [VERIFIED]
- The Makati graph plus one season of shade is 55 KB after brotli compression. [VERIFIED] [STAND-IN for the shade part]
- Hosting costs $0 a month at 1,000 and at 50,000 queries. A server costs $0 to $4.68. [VERIFIED rates]
- Recommended route: start at k = 2. Lower k until the detour is 20% or less.
- If sun exposure then falls by 15% or more, show that route as recommended.

## 1. Only a custom router reads per-bucket shade and arrival time without forking an engine

| Option | Per-edge, per-bucket shade at query time | Shelter flag | Licence | Ops for one person | Fit |
| --- | --- | --- | --- | --- | --- |
| Own A* in JS or TS, in the browser | Yes, typed arrays, arrival-time interpolation | Yes, bit flag | Own code | Static files only | Best |
| Own Dijkstra, Python igraph, on a server | Yes, but one weight vector per request (departure bucket) | Yes | GPL (igraph) | One small server | Good |
| Own A* in Rust or WASM | Yes, same design as JS | Yes | Own code | Static files | Good, not measured |
| GraphHopper custom models | Partly. Needs Java import code and one encoded value per bucket | Yes, after import | Apache-2.0 | JVM server | Medium |
| Valhalla dynamic costing | No. Fixed list of pedestrian options | No | MIT | C++ server | Low |
| OSRM Lua profiles | No. Lua runs at preprocessing only | Build time only | BSD-2-Clause | Rebuild per bucket | Low |
| pgRouting | Yes. Cost column comes from SQL per query | Yes | GPL-2.0 | PostgreSQL server | Medium |

Evidence per engine:

- Own JS A*: measured in section 2. It reads shade at the time the walker reaches each edge. [VERIFIED] `scripts/05/bench_route.mjs`
- igraph: `get_shortest_path` takes one weight list per call. Time cannot change during the search. [VERIFIED] `scripts/05/bench_igraph.py`
- igraph package metadata says "GNU General Public License (GPL)". [VERIFIED] `venv/.../igraph-*.dist-info/METADATA`
- GraphHopper licence header is Apache-2.0. [VERIFIED] `raw/05/gh_EncodingManager.java`
- GraphHopper value expressions accept "one encoded value" combined with numbers by `+`, `*`, `-`. [VERIFIED] `raw/05/docs/gh_custom_models/custom-models.md`
- New encoded values need Java code through the `ImportRegistry` interface. [VERIFIED interface exists] [UNVERIFIED effort]
- Per-request custom models work only in flexible or hybrid mode, not with CH. [VERIFIED] `raw/05/docs/gh_profiles/profiles.md`
- Hybrid mode rejects a request that lowers any edge weight. [VERIFIED] custom-models.md, `parameters` section
- Request-side `parameters` exist only in GraphHopper 12.0, which is "not yet released". [VERIFIED] `raw/05/gh_CHANGELOG.md`
- The last GraphHopper release is 11.0, dated 14 Oct 2025. [VERIFIED] `raw/05/gh_CHANGELOG.md`
- The GraphHopper custom model doc names no time-of-day input. [VERIFIED by search of the doc]
- Valhalla pedestrian options are `walking_speed`, `walkway_factor`, `sidewalk_factor`, `step_penalty`, `elevator_penalty`, `use_lit`, and similar. [VERIFIED] `raw/05/docs/valhalla_route_api/`
- Valhalla has no option for a user value per edge. Shade needs a fork of its tile builder and costing. [UNVERIFIED inference]
- OSRM docs say profiles "are used when preprocessing the OSM data, NOT at query time". [VERIFIED] `raw/05/docs/osrm_profiles/profiles.md`
- OSRM weight updates need `osrm-customize` or `osrm-contract` with a speed CSV, then a reload. [VERIFIED] `raw/05/docs/osrm_traffic/`
- pgRouting `pgr_dijkstra` reads `cost` and `reverse_cost` from an edges SQL query. [VERIFIED] `raw/05/docs/pgrouting_dijkstra/`
- So a join to a shade table can set the cost per bucket. [UNVERIFIED design]
- pgRouting is GPL-2.0. [VERIFIED] `raw/05/docs/pgrouting_licence/LICENSE`
- OSRM, Valhalla, GraphHopper, and pgRouting were not benchmarked. Java is not installed. I did not pull engine images. [VERIFIED]

## 2. Metro Manila has 281,696 walk edges, and the browser router answers in under 3 ms

Source: Geofabrik `philippines-261020.osm.pbf` (MD5 checked) and the project clip `raw/shared/ncr.osm.pbf`. [VERIFIED]

Method:

- Walk filter: the osmnx `network_type="walk"` rule. Graph nodes are way ends and shared nodes. [VERIFIED] `scripts/05/extract_walk_graph.py`
- Makati CBD box: 14.548 to 14.562 N, 121.012 to 121.032 E. [VERIFIED]
- NCR: Nominatim relation 147488 polygon. Its area is 909 km2 and includes some bay water. [VERIFIED]
- Pairs: 100 random node pairs, 500 to 3,000 m apart in a straight line. Each query computes three routes. [VERIFIED]
- Hardware: Apple M5, 10 cores, 24 GB, Node 25.2.1, Python 3.12. [VERIFIED]
- Latency ranges cover 4 runs of 100 pairs each. [VERIFIED] `raw/05/derived/logs/`

| Measure | Makati CBD | Metro Manila (NCR) |
| --- | --- | --- |
| OSM ways | 2,107 | 155,016 |
| Graph nodes | 2,734 | 222,401 |
| Undirected edges | 3,578 | 281,696 |
| Walkable length | 115 km | 13,770 km |
| Mean edge length | 32.2 m | 48.9 m |
| Graph build from the NCR clip (both regions in one run) | 10.4 s | 10.4 s, 425 MB peak RSS |
| Graph build from the full Philippines file | 95 s | 95 s, 1.35 GB peak RSS |
| Graph file, no shade, brotli | 36.5 KB | 3.27 MB |
| Shade, 24 half-hours, 1 season, 4-bit, brotli [STAND-IN] | 18.9 KB | 1.00 MB |
| Shade, 24 half-hours, 4 seasons, 4-bit, brotli [STAND-IN] | 65 KB | 3.26 MB |
| Route overlay PMTiles, z12 to z16 | 192 KB | 15.4 MB |
| JS A*, three routes, p50 | 0.16 to 0.25 ms | 0.40 to 0.63 ms |
| JS A*, three routes, p95 | 0.61 to 1.29 ms | 1.92 to 2.92 ms |
| JS memory, array buffers | 1.1 MB | 21.2 MB |
| JS file load from disk | 8 ms | 7 ms |
| Python igraph, three routes, p50 | 1.1 to 1.7 ms | 35.4 to 44.3 ms |
| Python igraph, three routes, p95 | 2.0 to 3.4 ms | 54.9 to 61.3 ms |
| Python start: import, load, graph build | 0.40, 0.01, 0.00 s | 0.28, 0.04, 0.06 s |
| Python peak RSS | 43 MB | 208 MB |
| Query box plus 500 m buffer, edges p50 / p95 | 2,133 / 3,527 | 2,297 / 4,679 |
| Query box plus 1,200 m buffer, edges p50 / p95 | not run | 6,278 / 11,784 |

Checks and notes:

- The Overpass sample has 2,107 ways with a centroid in the Makati box. The PBF extract gives the same 2,107. [VERIFIED]
- The clip loses 5 of 155,016 NCR ways at its west edge. Makati counts are the same. [VERIFIED]
- NCR bench files came from the full-extract graph (281,696 edges). The clip gives 281,687.
- I did not rerun the benches on the clip.
- Report 04 assumed 500,000 NCR edges. The measured count is 281,696 undirected edges. [VERIFIED]
- Two sidewalk sides per street, as report 04 proposes, roughly double the edge count. [UNVERIFIED estimate]
- JS uses goal-directed A* and arrival-time shade. igraph uses plain Dijkstra and one departure bucket. [VERIFIED]
- Node on an M5 is not a phone. I did not measure phone latency. [VERIFIED gap]
- The graph file sizes for coordinates, adjacency, and lengths are real. Shade compression is [STAND-IN] and probably pessimistic.
- The stand-in shade has no spatial pattern. Real shade repeats along a street, so it can compress better. [UNVERIFIED]

## 3. Start at k = 2 and cap the detour at 20% to get the recommended route

Method:

- Cost per edge is `len x (1 + k x sun)`. `sun` is 1 minus the shade fraction at arrival time. [VERIFIED] `scripts/05/three_routes.mjs`
- This equals the bench form `len x (shade + alpha x (1 - shade))` with `alpha = 1 + k`. [VERIFIED]
- Sweep: k in {0, 0.25, 0.5, 1, 2, 4, 8, 16}. [VERIFIED]
- Pairs: 20 Makati pairs, 500 to 2,000 m apart. Departures: 08:30, 12:00, and 15:30. [VERIFIED]
- "Sun cut" is the drop in sun-exposed metres against the shortest route. [VERIFIED]
- Shade field: [STAND-IN] random street-canyon ratio and tree cover per edge, real edge bearing, real sun position.
- Output: `raw/05/derived/three_routes_makati.json` and `logs/three_routes_makati.log`. All 8 k values for 20 pairs took about 0.1 s. [VERIFIED]

Proposed rule:

1. Shortest: k = 0.
2. Most shaded: k = 8. If the detour exceeds 50%, drop to a lower k.
3. Recommended: k = 2. Step down through 1, 0.5, 0.25 until the detour is 20% or less.
4. If the sun cut is under 15%, show "no meaningfully shadier route" instead.

Results [STAND-IN], recommended rule with a 20% cap and a sun cut of at least 15%:

| Departure | Pairs where the rule fires | Detour p50 | Sun cut p50 | Pairs with three distinct routes |
| --- | --- | --- | --- | --- |
| 08:30 | 14 of 20 | 5.4% | 30.1% | 11 of 20 |
| 12:00 | 3 of 20 | 2.3% | 15.3% | 3 of 20 |
| 15:30 | 16 of 20 | 4.7% | 35.1% | 14 of 20 |

- [STAND-IN] The distinct counts compare against k = 8 without the 50% cap.

Comparisons [STAND-IN]:

- The rule "largest k under a 20% cap" gives the same sun cut at about double the detour.
- With that rule, 08:30 gives a 30.1% sun cut at 10.2% detour. 15:30 gives 36.5% at 12.0%.
- A 25% cap adds 0 to 2.4 points of sun cut over a 20% cap.
- A 15% cap fires on 2 fewer pairs at 08:30 and at 15:30.
- Fixed k = 2 without a cap went over 20% detour on 1 pair at 08:30 and 1 at 15:30.
- k = 8 detour reached 41% at 08:30 and 56.5% at 15:30. The most-shaded route needs its 50% cap.
- At noon the rule fires on only 3 of 20 pairs. Short noon shadows give little gain.
- This matches report 04 section 2.

Tuning:

- Re-run `three_routes.mjs` on real shade before launch. Keep the rule shape. Retune the cap and the 15% gain floor.
- After launch, count which of the three routes users pick. Store counts only, never origins or destinations.
- Singapore saw about 95% of users pick the recommended route. Use that share as the target. [VERIFIED from hack.gov.sg]

## 4. One cost function covers sun, rain, steps, and opening hours

Proposed cost per edge. Every multiplier is 1 or more, so the straight-line heuristic stays admissible:

`cost = len x (1 + k x sun(t) + r x uncovered + s x steps)`, and infinity if the edge is closed at arrival time.

- With arrival-time shade, the search gives a near-best route, not an exact one. It orders by cost, not time.
- Section 5 measures the error.

| Term | Meaning | Proposed value | Source of data |
| --- | --- | --- | --- |
| `k` | Sun penalty | 2, stepped down by the section 3 rule | Report 04 shade buckets |
| `sun(t)` | 1 minus shade fraction, at arrival time | 0 to 1 | Interpolated between buckets |
| `r` | Rain penalty on uncovered edges | 3 in light rain, 9 in heavy rain | OSM `covered`, `tunnel`, `indoor`, report 03 |
| `s` | Steps penalty | 2 for "fewer stairs", infinity for wheelchair | OSM `highway=steps` |
| closed | Mall or building passage outside its hours | Edge removed | Hand-built hours table |

Rain mode, measured on 20 Makati pairs with real OSM shelter tags (`covered`, `tunnel`, `indoor`, `corridor`):

- Makati CBD has 4.61 km of sheltered walkway in OSM. That is 4.0% of 115 km. [VERIFIED] `raw/05/derived/makati_osm_flags.json`
- The shortest route is 4.8% sheltered (p50). [VERIFIED]
- With r = 3 the route is 13.3% sheltered. With r = 9 it is 18.0%. [VERIFIED]
- The best pair reaches 38.6% shelter. Detour p50 stays at 0.2% to 0.6%. The worst detour is 28%. [VERIFIED]
- Rain mode needs the same 20% cap. Report 03 decides how much shelter OSM still misses.

Accessible profile, measured on the same 20 pairs:

- 14 of 20 shortest routes use at least one OSM `highway=steps` edge. [VERIFIED]
- With steps removed, 2 of 20 pairs have no route. Changed routes are 13.6% longer (p50). [VERIFIED]
- OSM probably lacks ramps and lifts at footbridges. A wheelchair profile needs field data before launch. [UNVERIFIED inference]

Opening hours, measured in OSM for Makati CBD:

- Only 2 walkable ways carry `opening_hours` ("07:00-21:00" and "Mo-Su 07:00-20:00"). [VERIFIED] `raw/05/derived/makati_timed_ways.json`
- 88 ways carry `motor_vehicle:conditional`, mostly "no @ (Su 06:00-10:00)". These are car rules. Walkers ignore them. [VERIFIED]
- Build a small hours table by hand: way id, days, open, close. Store a 1-byte schedule index per edge.
- The router already knows the arrival time. A closed edge costs one table lookup. [VERIFIED design in three_routes.mjs]

## 5. Precompute shade per bucket and interpolate at arrival time

Sun drift at Makati, NOAA equations, `raw/05/derived/sun_drift.txt` and `sun_drift_summary.txt`: [VERIFIED]

- Sun elevation changes 5.6 to 7.3 degrees per 30 minutes from 07:00 to 09:00 and 15:00 to 17:00.
- A 20 m building shadow shrinks 31 m between 07:00 and 07:30 on 20 March.
- The same shadow changes 7 to 12 m per 30 minutes at 08:00.
- It grows 10 to 31 m per 30 minutes at 16:00.
- From 09:00 to 15:00 the shadow changes 9.4 m or less per 30 minutes.
- Near noon the azimuth swings fast. On 21 June it turns 39 degrees between 11:30 and 12:00.
- At noon the shadow is only 3 to 16 m long. The azimuth swing moves little shade.

Frozen departure bucket against arrival-time interpolation, 20 Makati pairs [STAND-IN]:

- The chosen route changes for 4 to 12 of 20 pairs. [VERIFIED]
- Median extra sun exposure from the frozen bucket is 0%. The worst case is 0.6% to 15.1%. [VERIFIED]
- Interpolation costs two array reads per edge. Keep it, because it is free in the browser.

Decision:

- Precompute shade at build time. Shade is a fixed function of geometry, date, and hour.
- A live shadow cast per query adds nothing.
- Use 30-minute buckets from 06:00 to 09:00 and from 15:00 to 18:00.
- Use hourly buckets from 09:00 to 15:00. That gives 16 to 18 buckets per day.
- Store 12 monthly anchor dates on the build side. Ship only the current month to the browser.

Storage at the measured 281,696 NCR edges: [VERIFIED arithmetic]

| Layout | Bytes per edge | NCR size, raw |
| --- | --- | --- |
| Report 04, 6 dates x 12 hours | 72 | 20.3 MB |
| Report 04, 12 months x 16 buckets | 192 | 54.1 MB |
| Same, two sidewalk sides | 384 | 108 MB |
| Same, building and tree shade kept apart | 768 | 216 MB |
| Browser slice, one month, 16 buckets, 4-bit | 8 | 2.3 MB |

## 6. A static site costs $0 at 50,000 queries, and the basemap is the largest file

Payload per session, measured: [VERIFIED]

- MapLibre GL JS 6.15.0: 292 KB gzip, plus a 147 KB worker and 10 KB CSS.
- PMTiles 4.5.0: 8 KB gzip.
- App libraries total 457 KB gzip. Both libraries are BSD-3-Clause. `raw/05/npm_bundles/`
- Makati graph plus one season of shade: 55 KB. Makati overlay tiles: 192 KB at most.
- One Makati session with an empty cache: 705 KB, before basemap tiles. `raw/05/derived/cost_model.json`

Monthly bandwidth and cost, with every query as a new session (worst case): [VERIFIED model, rates from saved pages]

| Plan | 1,000 queries | 50,000 queries |
| --- | --- | --- |
| Static, Makati graph | 0.7 GB, $0 | 35 GB, $0 |
| Static, whole NCR graph per session | 4.9 GB, $0 | 246 GB, over the GitHub Pages soft limit |
| Static, NCR tiles per query (p95) | 0.7 GB, $0 | 36 GB, $0 |
| Cloud Run, every request cold (2 s billed, assumed) | 2,000 vCPU-s, $0 | 100,000 vCPU-s, $0 |
| Fly.io, shared-cpu-1x 512 MB, always on | $3.69 (Ashburn) | $3.69 (Ashburn) |
| Fly.io, same, Singapore | $4.68 (estimate) | $4.68 (estimate) |

Host limits and rates:

- GitHub Pages: 1 GB site, 100 GB a month soft bandwidth limit, no e-commerce or SaaS. [VERIFIED] `raw/05/docs/gh_pages_limits/`
- Cloudflare Pages: 25 MiB per file, 20,000 files on the free plan. [VERIFIED] `raw/05/docs/cf_pages_limits/`
- Cloud Run request billing: free 180,000 vCPU-s, 360,000 GiB-s, 2 million requests a month. [VERIFIED] `raw/05/cloudrun_pricing.html`
- Cloud Run paid rates (us-central1 as displayed): $0.000024 per vCPU-s, $0.40 per million requests. [VERIFIED]
- Fly.io: 512 MB costs $3.69 a month. Asia egress costs $0.04 per GB. [VERIFIED] `raw/05/docs/fly_pricing/`
- Fly.io Singapore 1 GB costs $8.50, against $6.70 in Ashburn. [VERIFIED]

Cold start:

- Browser: the arrays load from disk in 7 to 8 ms in Node. Network transfer time is not measured. [VERIFIED]
- Python server: import, load, and graph build take about 0.4 s in process. [VERIFIED]
- Container start on Cloud Run is not measured. The 2 s figure is an assumption. [UNVERIFIED]
- Even at 2 s per request, 50,000 cold requests stay inside the Cloud Run free tier. [VERIFIED arithmetic]

A server costs little but adds work and risk:

- Cloud Run needs a Google Cloud billing account. [UNVERIFIED]
- Fly.io: "New organizations don't have a free tier". The trial lasts 2 hours of runtime or 7 days. [VERIFIED]
- A server log holds origins and destinations. These can be personal data under RA 10173. See report 08.
- Browser routing keeps the origin and destination on the phone. [VERIFIED design]

Basemap terms:

- OpenFreeMap public instance: free, no key, no registration, commercial use allowed. [VERIFIED] `raw/05/docs/openfreemap_home/`
- OpenFreeMap has no SLA and "may discontinue it at any time without notice". Terms last updated 14 October 2026. [VERIFIED] `raw/05/docs/openfreemap_tos/`
- OpenFreeMap attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap". MapLibre adds it automatically. [VERIFIED]
- Protomaps daily builds are an ODbL Produced Work. You must credit OpenStreetMap. [VERIFIED] `raw/05/docs/protomaps_downloads/`
- Protomaps discourages hotlinking. Copy an extract to your own storage. [VERIFIED]
- The Protomaps hosted API needs an account and key. It is free only for non-commercial use. [VERIFIED] `raw/05/docs/protomaps_api/`
- Protomaps code is BSD-3-Clause. The style design is CC0. [VERIFIED] `raw/05/docs/protomaps_basemap_licence/`

Basemap size, `pmtiles extract --dry-run` on the 20 October 2026 build: [VERIFIED] `raw/05/protomaps_extract/dry_run.txt`

- NCR clip box to z15: 53 MB. To z14: 15 MB.
- The z15 file breaks the 25 MiB Cloudflare Pages file cap. Use z14, or R2, or GitHub Pages.
- The Makati box dry run timed out twice. [VERIFIED]
- Makati is inside the NCR box, so its extract is under 53 MB. [UNVERIFIED inference]

Basemap decision:

- Pilot: self-host a Protomaps extract. You then depend on no outside tile service.
- Fallback: if hosting gets in the way, switch the style URL to OpenFreeMap.

## 7. Eleven make targets take the OSM extract to a published site

Ordered targets for the repo `Makefile`:

1. `osm`: download the Geofabrik Philippines extract, check its MD5, then `osmium extract` the NCR box.
2. `graph`: run `extract_walk_graph.py`. Output nodes, edges, lengths, OSM flag bits, and shape points.
3. `heights`: build the building surface model from footprints and heights (reports 02 and 04).
4. `canopy`: build the tree canopy model from the leaves-ph raster, with roof pixels set to 0.
5. `shade`: cast shadows per bucket and per monthly anchor date (report 04 section 10).
6. `edge-shade`: sample each edge every 5 m at the sidewalk offset. Write uint8 per edge per bucket.
7. `hours`: check the hand-built passage hours table against current way ids.
8. `pack`: write the browser binary per region and month. Check each file under 25 MiB.
9. `tiles`: build the route overlay with tippecanoe and the basemap with `pmtiles extract`.
10. `test`: run the 20-pair route test. If a cap breaks or p95 latency doubles, fail the build.
11. `site`: copy the app and `pack` and `tiles` outputs to `site/dist`. Deploy is a manual step.

For Metro Manila, `pack` also splits the graph into tiles. See section 8.

## 8. Verdict: ship static browser routing for Makati, then add graph tiles for Metro Manila

v1 stack in five lines:

1. Graph: Geofabrik OSM extract to a walk graph with pyosmium, rebuilt each week.
2. Shade: per-edge, per-bucket shade precomputed at build time, shipped as 4-bit arrays per month.
3. Router: own A* in TypeScript in the browser, with arrival-time shade and the k = 2, 20% cap rule.
4. Map: MapLibre GL JS with PMTiles, a tippecanoe walk overlay, and a self-hosted Protomaps basemap.
5. Host: static files on GitHub Pages or Cloudflare Pages. No server. $0 a month.

Change needed for all of Metro Manila:

- Split the graph and shade into square tiles. Fetch only the tiles that cover the trip box plus a buffer.
- Use a buffer of 500 m or 0.6 times the straight-line distance, whichever is larger.
- A 20% detour can leave a 500 m box. [UNVERIFIED geometry estimate]
- Tile load per query: 4,679 edges p95 at 500 m and 11,784 at 1,200 m. [VERIFIED]
- That is about 71 KB and 179 KB, scaled from NCR bytes per edge. [UNVERIFIED estimate]
- Shipping the whole NCR graph costs 4.3 MB per session and 246 GB a month at 50,000 sessions. [VERIFIED]
- Router latency does not need to change. The full NCR graph answers in under 3 ms p95 on an M5. [VERIFIED]
- Use a basemap at z14, or move tiles to object storage, to stay under host file caps. [VERIFIED caps]

## Blockers and gaps

- Real shade does not exist yet. Every route-choice number in sections 3 and 5 is [STAND-IN].
- Java is not installed. I judged GraphHopper from its source and docs only.
- Phone latency, network transfer time, and Cloud Run container start are not measured.
- I judged OSRM, Valhalla, and pgRouting from their docs only.
- I installed the `pmtiles` CLI with Homebrew for the basemap dry run. `osmium` was installed too.

## Files

- Scripts: `scripts/05/extract_walk_graph.py`, `build_binary.py`, `bench_igraph.py`, `bench_route.mjs`, `three_routes.mjs`.
- More scripts: `dump_flags.py`, `list_timed_ways.py`, `export_walk_geojson.py`, `cost_model.py`, `drift_summary.py`, `fetch_docs.sh`, `html2txt.py`.
- Outputs: `raw/05/derived/` (graph counts, sizes, bench logs, three-route JSON, cost model, overlay tiles).
- Docs: `raw/05/docs/` (one folder per source, plain text in `txt/`). Basemap dry run: `raw/05/protomaps_extract/`.
- The extractor change saves OSM flag bits per edge. The original copy is `raw/05/derived/logs/extract_walk_graph.orig.py`.
