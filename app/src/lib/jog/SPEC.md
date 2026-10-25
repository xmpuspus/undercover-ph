# Run a loop returns up to three jog loops by day or night and scores them on shade, traffic safety, new streets and sights

This spec lists what Run a loop must do, as decided on 2026-10-24. Each item has an id and names the test that
checks it. Section 8 of [the method notes](../../../../docs/methodology.md) explains the method and its data limits.

## Words used in this spec

- A loop is a walkable path that starts and ends at the same graph node.
- A leg is one A* search inside a loop. It goes from the start to waypoint A, from A to B, or from B back to the
  start.
- A street key is an edge's OSM `way_id` plus its `side` (centre, left or right). A graph rebuild keeps the key.
- A street segment is the unordered pair of an edge's end nodes. Both sidewalks of one block share it. The code
  calls it `corridor`.
- A leg is dark when the sun is at 3 degrees or lower at the leg's time slot. The router already uses this rule
  for night. A leg is dark too when its minute falls before sunrise or from sunset on (J-N4).
- Pace is minutes per km. The arrival time at an edge is the departure time plus the metres run divided by metres
  per minute.

## The pipeline writes one jog file per area and never changes the graph

- J-D1. `pipeline/districts/build_jog.py AREA_ID` writes `jog.json` beside the area's `graph.json`, from that
  graph and the area's OSM PBF. It never changes `graph.json`. The test is `test_build_jog.py::test_graph_untouched`.
- J-D2. `jog.json` has `version` 1, `graph_sha256` (sha256 of the `graph.json` bytes it read), `edges` (equal-length
  integer arrays by edge index), `sights`, `counts` and `sources`. The test is `test_build_jog.py::test_shape`.
- J-D3. `edges.road` holds the OSM highway class of the edge's way. The codes are 0 path or footway, 1 service or
  living street, 2 residential or unclassified, 3 tertiary, 4 secondary, 5 primary and 6 trunk. A side edge gets
  the class of its road. The test is `test_build_jog.py::test_tag_counts`.
- J-D4. `edges.lit` is 0 for unknown, 1 for lit (`lit` in yes, 24/7, automatic, sunset-sunrise) and 2 for not lit
  (`lit=no`). `edges.surface` is 0 for unknown, 1 for paved and 2 for unpaved. The test is `test_tag_counts`.
- J-D5. `edges.park` is 1 when the edge midpoint lies in an area tagged `leisure=park`, `leisure=garden`,
  `leisure=nature_reserve` or `landuse=recreation_ground`.
  `edges.water` is 1 when the midpoint lies within 50 m of water, a river, a canal or the coast. The test is
  `test_tag_counts`.
- J-D6. `edges.sight` holds the index of the nearest sight within 40 m of the edge midpoint, or -1. The test is
  `test_tag_counts`.
- J-D7. `sights` holds named OSM features and Wikidata items. The OSM features are `historic` (except the values
  no, tomb and boundary_stone), `tourism` with the values artwork, museum, attraction, viewpoint, gallery, zoo,
  aquarium or theme_park, and parks. The Wikidata items (CC0) are heritage items and the markers of the National
  Historical Commission of the Philippines (NHCP). Each sight is one point (a node, or an area's representative
  point) with name, kind, lon, lat and source id. The test is `test_tag_counts`.
- J-D8. `counts.lit_share` is the lit-tagged share of walkable metres. The test is `test_tag_counts`.
- J-D9. A committed snapshot `pipeline/districts/wikidata_heritage.json` holds the markers, with the query text and
  fetch date. `build_jog.py` reads the snapshot and never the network. The test is `test_build_jog.py::test_offline`.
- J-D10. `pipeline/data_release.py` packs `jog.json` with the area's app files, and `fetch` puts it in place.
  The test is the extended `pipeline/test_data_release.py`.
- J-D11. `build.py` runs `build_jog.py` after `build_graph.py`, and `publish.py` copies `jog.json` to the app.
  The test is `test_build_jog.py::test_pipeline_wiring`.
- J-D12. `docs/data-contract.md` documents `jog.json`. Review check.
- J-D13. `edges.hours` holds the index of the area's `hours.json` row for the park where the edge midpoint lies,
  or -1. The build matches the park to its row by the row's OpenStreetMap URL (way or relation).
  `counts.park_hours_edges` counts the edges with a row. An older file without the column counts as -1 for every
  edge. The test is `test_build_jog_hours.py`.

## The app engine returns up to three distinct loops within 10% of the target length

- J-E1. `aStar` takes an optional per-edge extra cost (non-negative, per metre), an optional entry edge and side
  context, and an optional pace for opening hours. Without these options, `aStar` returns the same routes as
  before. The tests are the existing router suites and `jog/__tests__/astar-extra.test.ts`.
- J-E2. `findLoops(data, jog, query)` in `app/src/lib/jog/loops.ts` returns up to three loops. The same query and
  seed give the same loops. The test is `loops.test.ts::deterministic`.
- J-E3. Every loop starts and ends at the start node, and its edges connect. No join between two legs makes a
  forbidden side switch in the middle of a block. The test is `loops.test.ts::closes`.
- J-E4. Every returned loop is within 10% of the target length. If none is, the state is `no_loop` and a note gives
  the closest length found. The test is `loops.test.ts::length`.
- J-E5. Any two returned loops share at most 30% of their street-segment metres. The test is
  `loops.test.ts::differ`.
- J-E6. A loop repeats at most 10% of its metres, apart from the stem from a dead-end start, unless the runner
  asks for out and back. The test is `loops.test.ts::no_out_and_back`.
- J-E7. The runner's pace sets the time slot of each leg. The engine reads shade, light and opening hours at that
  slot. The test is `loops.test.ts::pace_moves_slot`.
- J-E8. If the start is on a dead end or inside a park, the route goes out to the first junction. It loops from
  there and comes back the same way. The test is `loops.test.ts::dead_end_start`.
- J-E9. The engine stops at its time budget (default 1,500 ms) and returns the best loops found so far, with
  `elapsedMs` and `searches`. The test is `loops.test.ts::budget`.
- J-E10. The "Other loops" button passes a new seed, and the engine returns loops that differ from the last set.
  The test is `loops.test.ts::reseed`.
- J-E12. If the runner arrives outside a park's opening hours, no loop enters that park's edges. The engine reads the
  hours from `edges.hours` and the area's `hours.json` rows. A start inside a closed park gives `no_loop`, with a
  note that names the park and its opening time. An index with no row in the area's `hours.json` counts as no
  hours. The test is `park-hours.test.ts`.
- J-E11. The search runs in a web worker. The main thread sends the area data once per area, then each query.
  The test is `app/e2e/jog.spec.ts`, which checks that the planner stays responsive while loops load.

## The score adds cost for sun, big roads, unmarked crossings and streets already run

- J-S1. A lower score is better. One exported constant holds every weight, with a comment for each.
  The test is `score.test.ts::weights_documented`.
- J-S2. By day, metres in the sun at the arrival time add cost. In the dark, shade adds no cost. The test is
  `score.test.ts::shade`.
- J-S3. A side switch at a junction without a marked crossing or signals costs more beside a bigger road. Across a
  secondary road or larger, a route with that switch scores worse than a route with a marked crossing or signals.
  The test is `score.test.ts::crossings`.
- J-S4. Metres on a sidewalk beside a primary or trunk road cost more than metres beside a residential street.
  The test is `score.test.ts::road_class`.
- J-S5. In an area with `lit_share` of 0.30 or more (13 of 67 areas, counted in graph metres), in the dark,
  metres tagged `lit=no` cost the most, untagged metres cost a third as much, and lit metres cost nothing. The
  score treats untagged metres not as dark but as unknown. By OSM way length 8 areas pass 30%, and
  in those almost every light tag has a lit value (yes, 24/7, automatic or sunset-sunrise). So a full cost on
  untagged metres favors streets not for their light but for their tags. Elsewhere light adds no cost. The test is
  `score.test.ts::light`.
- J-S6. Metres on a street key in the runner's history cost more. In the dark the extra cost is half the daylight
  cost, so at night the score prefers new streets less strongly. The test is `score.test.ts::history`.
- J-S7. Park, water and sight edges cost less, but never less than their length. The test is
  `score.test.ts::sights`.
- J-S8. Turns per km add a small cost. The test is `score.test.ts::turns`.

## The run panel shows a card per loop, the loop on the map, and its steps

- J-U1. A card per loop shows distance, minutes at the chosen pace, shade share (or "Shade does not apply" in the
  dark), crossings by type, sights passed by name, and the share of new streets. The test is `card.test.ts`.
- J-U2. The map draws the chosen loop with direction arrows and a mark at each full km. The test is `jog.spec.ts`.
- J-U3. Steps reuse the router's step text, including the Filipino and Taglish lines, with minutes at the pace.
  The test is `card.test.ts::steps`.
- J-U4. The inputs are the start (the phone's location or a place), distance chips for 3, 5 and 10 km plus
  custom, and the time (now or a slot). The other inputs are the pace and a "Prefer new streets" switch, on by
  default. With the switch off, history adds no cost. The tests are `jog.spec.ts` and `score.test.ts::history`.
- J-U6. On a phone (narrower than 768 px), once loops show, the form folds into one summary line (start, distance,
  pace) with an Edit button. The run panel then takes at most 45% of the screen height. The map then fits the loop
  to at least half of the map above the panel. Edit opens the form again and keeps the loops until a new search.
  The test is `app/e2e/jog-phone.spec.ts`.
- J-U8. In Run a loop, the hour picker adds 4:00 to 5:30 AM and 7:00 to 9:00 PM, every 30 minutes, to the shade
  slots. On today's date, the picker hides every time before the current minute, extra times and shade slots
  alike. If the runner picks a dark
  time, that time sets the loop's departure minute. The walking modes keep only the shade slots. The test is
  `app/e2e/jog-times.spec.ts`.
- J-U7. For a sight name with several OSM values separated by `;`, the app shows the first non-empty value,
  trimmed. The test is `sight-names.test.ts`.
- J-U5. The jog UI has its own components (`JogPanel.tsx`, `JogCards.tsx`, `JogLayer` in the map), so the
  first-trip and features tasks keep their files. Review check.

## Run history stays on the phone, and no network request carries it

- J-H1. "Mark as run" stores the loop's street keys in IndexedDB on the phone. Each key has points at most 25 m
  apart along the edge, rounded to 5 decimals. The test is `history.test.ts`.
- J-H2. An edge counts as run before when its street key matches and its midpoint lies within 30 m of a stored
  point. The test is `history.test.ts` ("marks the same sidewalk after a rebuild").
- J-H3. "Clear history" deletes every run. "Export" downloads the runs as a JSON file. The test is `jog.spec.ts`.
- J-H4. No network request carries history. No URL, header or body holds a stored way id. The test is
  `jog.spec.ts`.
- J-H5. After "Mark as run", the next search for the same start and distance returns loops with fewer shared
  street metres. The tests are `jog.spec.ts` and `loops.test.ts::history_loses`.
- J-H6. On the first "Mark as run", the app asks the browser to keep its storage (`navigator.storage.persist()`).
  Safari can delete a site's stored data after 7 days of Safari use without a visit, except for Home Screen apps
  (WebKit, "Full Third-Party Cookie Blocking and More", 2020-03-24, webkit.org/blog/10218). So in Safari outside a
  Home Screen app, the history panel says "Safari can delete saved runs if you skip this site for a week. Add it to
  your Home Screen to keep them." Review check.

## The card says when shade does not apply and what the map data lacks

- J-N1. When any leg of a loop falls in the dark, the card says "Shade does not apply before sunrise or after
  sunset." The test is `card.test.ts::dark`.
- J-N2. In the dark, the card shows mapped-lit metres. Where the area maps little lighting, the card says "Street
  lights are not mapped on most streets here." The test is `card.test.ts::light_unknown`.
- J-N4. A loop is dark at every minute before sunrise or from sunset on, whatever the shade slot. The app reads
  sunrise and sunset for the date from the manifest. From April to September, 06:00 is 9 to 34 minutes after
  sunrise in Manila. The range comes from pvlib's SPA sunrise for 2026, the method of `pipeline/shade/shade.py`.
  The test is `dark-minutes.test.ts`.
- J-N3. If a loop reaches a park outside its opening hours, the loop gets a warning that names the park, for
  example "Track 30th may be closed when you reach it." The test is `park-hours.test.ts`.
- J-C1. Wherever the app uses the word safe, it limits the claim to traffic safety with the line "Safety here
  means traffic: crossings and road size. We have no crime data." The test is `card.test.ts::safety_copy`.
- J-C2. In an area that grades thin for sights, the card says "Few sights are mapped here." The test is
  `card.test.ts::thin_sights`.
- J-C3. No link holds the coordinates of a start taken from the phone's location. The test is `jog.spec.ts`.

## Tests on real areas check loops at four running spots and a median search of 400 ms or less

- J-R1. For qc-north, a 2.3 km search from the UP Diliman Academic Oval returns a loop with 60% or more of its
  metres within 30 m of the Oval ring. That loop's length is within 10% of the target. The test is
  `real-loops.test.ts`.
- J-R2. For manila, a 3 km search from Rizal Park returns a loop with 1 km or more inside the park. The test is
  `real-loops.test.ts`.
- J-R3. For pasay-moa, a 5 km search from SM by the Bay returns a loop with 1 km or more on Sunset Esplanade
  (way 4403625).
- J-R4. For manila, a 5 km search from Manila Baywalk returns a loop with 500 m or more on ways 653905852 or
  923242630.
- J-R5. For metro-core, 5 km searches from five fixed starts return three loops each time. The median `elapsedMs`
  is 400 or less on the development laptop, so a phone four times slower stays near 1.6 s. The test is
  `real-loops.test.ts::speed`.
- J-R6. If the area files are missing, real-data tests skip. They never pin a date.

## The product choices on 2026-10-24 set one finder for day and night, loops only, and no GPS in the history

1. One loop finder serves day and night. Shade counts by day, and light and crossings count in the dark. A
   daylight-only tool serves about one run in five, because most Philippine races and club runs start before
   sunrise or after sunset.
2. Every card shows mapped-lit metres. Light changes the score only in areas that tag 30% or more of their
   walkable metres (13 of 67 areas on 2026-10-24). An untagged street is not dark but unknown.
3. The entry point is a "Run a loop" chip beside Shaded and Sheltered in the planner. Tapping it replaces the
   destination box with distance chips.
4. "Mark as run" stores the planned loop only, never GPS.
5. The default distance is 5 km. The default pace is 7 min/km, a starting value rather than a measured average.
6. The first version makes loops only, with no out and back.
7. Areas with few mapped sights drop sights from the score and say "Few sights are mapped here."
8. The app copy is the four lines in J-N1, J-N2, J-C1 and J-C2.

## The acceptance tests depend on these exact names

The tests in `app/src/lib/jog/__tests__/` and `app/e2e/jog.spec.ts` import and click these names.

- `aStar(data, spec, s, t, k, opts?)`, with `opts` = `{ extra?, entry?: { edge, context? }, junctionExtra?, mPerMin? }`.
  `extra` and `junctionExtra` are per-edge Float32Arrays. `extra` holds the cost per metre, and `junctionExtra`
  holds the metres added to an unmarked side change into the edge.
- `findLoops(data, jog, query)` and `measureLoop(data, jog, { edges, nodes }, query)` in `loops.ts`.
- `JogQuery` has `start`, `targetM`, `dateIdx`, `bucketIdx`, `departMin`, `paceMinPerKm`, and optional `history`,
  `preferNew` (default true), `seed`, `budgetMs` (default 1,500) and `now` (a clock in ms).
- `JogResult` has `state` (ok, no_loop or outside), `loops`, `notes`, `elapsedMs`, `searches`, `budgetHit` and
  `dark`.
- `Loop` has `edgeIds`, `nodes`, `length_m`, `minutes`, `dark`, `shade_pct` (null in the dark), `crossings`
  (`signals`, `marked`, `unmarked`, `unmarkedBig`), `lit_m`, `unlit_m`, `unknownLit_m`, `sights` (names),
  `new_pct` (null with no history), `shared_m`, `repeat_pct`, `turnsPerKm`, `score`, `steps`, `kmMarks` (one per
  full km before the end) and `warnings`.
- `parseJog(raw, edgeCount)` and `sightGrade(jog, data)` in `attrs.ts`. The grade is sights per km2 of the graph
  box times 0.5. A grade of 3 or more is rich, 1 or more is some, and less is thin.
- `streetsOf(data, edges)` and `historyMask(data, runs)` in `history.ts`. `RunRecord` is `{ id, area, date,
  length_m, streets }`.
- `JOG_WEIGHTS` in `score.ts`, `JOG_COPY` and `loopFacts(loop, { litShare, grade })` in `copy.ts`. The card
  lines include `<n> km`, `<n> min`, `Shade <n>%` by day, `<a> of <b> km mapped as lit` in the dark where the
  area maps light, `<n>% new streets` with a history, and crossings as `<n> with signals`, `<n> marked` and `<n> without a marked crossing`.
  Without a jog file, a note says "Street data for sights, light and road size did
  not load."
- The IndexedDB database is `ucph-jog`, with the object store `runs`. The worker file is `jogWorker.ts`.
- The test ids are `mode-run`, `jog-panel`, `jog-start-input`, `jog-use-location`, `jog-km-3`, `jog-km-5`,
  `jog-km-10`, `jog-km-custom`, `jog-prefer-new`, `jog-card` (with `data-length-m`, `data-new-pct`,
  `data-shared-m`, `data-loop-key`), `jog-mark-run`, `jog-again`, `jog-history-count`, `jog-export`, `jog-clear`.
  The map element `map` carries `data-jog-km-marks` and `data-jog-arrows`.
