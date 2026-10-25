# Jog loop finder spec: three loops by day or night, scored on shade, traffic safety, new streets and sights

Requirements for Run a loop, decided on 2026-10-24. Each requirement has an id and names the test that checks
it. [The methodology](../../../../docs/methodology.md), section 8, explains the method and its data limits.

## Words used in this spec

- Loop: a walkable path that starts and ends at the same graph node.
- Leg: one A* search inside a loop, from the start to waypoint A, A to B, or B back to the start.
- Street key: an edge's OSM `way_id` plus its `side` (centre, left or right). Rebuilds keep it.
- Corridor: the unordered pair of an edge's end nodes. Both sidewalks of one block share it.
- Dark: the sun is at 3 degrees or lower at the leg's time slot, the router's existing night rule.
- Pace: minutes per km. Arrival time at an edge is departure time plus metres run divided by metres per minute.

## Data: one jog file per area (pipeline task)

- J-D1. `pipeline/districts/build_jog.py AREA_ID` writes `jog.json` beside the area's `graph.json`, from that
  graph and the area's OSM PBF. It never changes `graph.json`. Test: `test_build_jog.py::test_graph_untouched`.
- J-D2. `jog.json` has `version` 1, `graph_sha256` (sha256 of the `graph.json` bytes it read), `edges` (equal-length
  integer arrays by edge index), `sights`, `counts` and `sources`. Test: `test_build_jog.py::test_shape`.
- J-D3. `edges.road`: the OSM highway class of the edge's way, coded 0 path or footway, 1 service or living
  street, 2 residential or unclassified, 3 tertiary, 4 secondary, 5 primary, 6 trunk. Side edges carry their
  road's class. Test: `test_build_jog.py::test_tag_counts`.
- J-D4. `edges.lit`: 0 unknown, 1 lit (`lit` in yes, 24/7, automatic, sunset-sunrise), 2 not lit (`lit=no`).
  `edges.surface`: 0 unknown, 1 paved, 2 unpaved. Test: `test_tag_counts`.
- J-D5. `edges.park`: 1 when the edge midpoint lies in an area tagged `leisure=park`, `leisure=garden`,
  `leisure=nature_reserve` or `landuse=recreation_ground`.
  `edges.water`: 1 when the midpoint lies within 50 m of water, a river, a canal or the coast. Test: `test_tag_counts`.
- J-D6. `edges.sight`: index of the nearest sight within 40 m of the edge midpoint, or -1. Test: `test_tag_counts`.
- J-D7. `sights`: named OSM `historic` (not no, tomb or boundary_stone), `tourism` in artwork, museum, attraction,
  viewpoint, gallery, zoo, aquarium or theme_park, named parks, and Wikidata NHCP markers and heritage items (CC0).
  Each sight is one point (a node, or an area's representative point) with name, kind, lon, lat and source id.
  Test: `test_tag_counts`.
- J-D8. `counts.lit_share` is the lit-tagged share of walkable metres. Test: `test_tag_counts`.
- J-D9. A committed snapshot `pipeline/districts/wikidata_heritage.json` holds the markers, with the query text and
  fetch date. `build_jog.py` reads the snapshot and never the network. Test: `test_build_jog.py::test_offline`.
- J-D10. `pipeline/data_release.py` packs `jog.json` with the area's app files, and `fetch` puts it in place.
  Test: `pipeline/test_data_release.py` (extended).
- J-D11. `build.py` runs `build_jog.py` after `build_graph.py`, and `publish.py` copies `jog.json` to the app.
  Test: `test_build_jog.py::test_pipeline_wiring`.
- J-D12. `docs/data-contract.md` documents `jog.json`. Review check.
- J-D13. `edges.hours`: the index of the area's `hours.json` row for the park that holds the edge midpoint, matched
  by the row's OpenStreetMap URL (way or relation), or -1. `counts.park_hours_edges` counts the edges with a row.
  An older file without the column means -1 everywhere. Test: `test_build_jog_hours.py`.

## Engine (app task)

- J-E1. `aStar` takes an optional per-edge extra cost (non-negative, per metre), an optional entry edge and side
  context, and an optional pace for opening hours. Without them, every route stays the same as today. Tests: the
  existing router suites, plus `jog/__tests__/astar-extra.test.ts`.
- J-E2. `findLoops(data, jog, query)` in `app/src/lib/jog/loops.ts` returns up to three loops. The same query and
  seed give the same loops. Test: `loops.test.ts::deterministic`.
- J-E3. Every loop starts and ends at the start node, its edges connect, and no leg join makes a forbidden
  mid-block side switch. Test: `loops.test.ts::closes`.
- J-E4. Every returned loop is within 10% of the target length. If none is, the state is `no_loop` and a note gives
  the closest length found. Test: `loops.test.ts::length`.
- J-E5. Any two returned loops share at most 30% of their corridor metres. Test: `loops.test.ts::differ`.
- J-E6. A loop repeats at most 10% of its metres, apart from the stem from a dead-end start, unless the runner
  asks for out and back. Test: `loops.test.ts::no_out_and_back`.
- J-E7. Each leg reads shade, light and opening hours at its own time slot, from the runner's pace. Test:
  `loops.test.ts::pace_moves_slot`.
- J-E8. A start on a dead end or inside a park walks to the first junction, loops from there, and comes back the
  same way. Test: `loops.test.ts::dead_end_start`.
- J-E9. The engine stops at its time budget (default 1,500 ms) and returns the best loops found so far, with
  `elapsedMs` and `searches`. Test: `loops.test.ts::budget`.
- J-E10. "Other loops" passes a new seed and returns loops that differ from the last set. Test:
  `loops.test.ts::reseed`.
- J-E12. A loop never enters a park edge while its park is closed at the runner's arrival time, read from
  `edges.hours` and the area's `hours.json` rows. A start inside a closed park gives `no_loop` with a note that
  names the park and its opening time. An index the area's `hours.json` lacks counts as no hours.
  Test: `park-hours.test.ts`.
- J-E11. The search runs in a web worker. The main thread sends the area data once per area, then each query.
  Test: `app/e2e/jog.spec.ts` (the planner stays responsive while loops load).

## Score

- J-S1. Lower score is better. One exported constant holds every weight, with a comment for each.
  Test: `score.test.ts::weights_documented`.
- J-S2. By day, sun metres at arrival time add cost. In the dark, shade adds nothing. Test: `score.test.ts::shade`.
- J-S3. A side switch at a junction without a marked crossing or signals costs more beside a bigger road. Across a
  secondary road or larger, it loses to a route with a marked crossing or signals. Test: `score.test.ts::crossings`.
- J-S4. Metres on a sidewalk beside a primary or trunk road cost more than metres beside a residential street.
  Test: `score.test.ts::road_class`.
- J-S5. In an area with `lit_share` of 0.30 or more, in the dark, metres tagged `lit=no` cost the most, untagged
  metres cost a third as much, and lit metres cost nothing. Untagged means unknown, not dark: in the 8 mapped
  areas almost every tag says lit, so a full cost on untagged metres would reward tagging, not light. Elsewhere
  light adds no cost. Test: `score.test.ts::light`.
- J-S6. Metres on a street key in the runner's history cost more. In the dark the extra cost is half the daylight
  cost, so night loops lean less toward streets the runner does not know. Test: `score.test.ts::history`.
- J-S7. Park, water and sight edges cost less, but never less than their length. Test: `score.test.ts::sights`.
- J-S8. Turns per km add a small cost. Test: `score.test.ts::turns`.

## Loop cards

- J-U1. A card per loop shows distance, minutes at the chosen pace, shade share (or "Shade does not apply" in the
  dark), crossings by type, sights passed by name, and the share of new streets. Test: `card.test.ts`.
- J-U2. The map draws the chosen loop with direction arrows and a mark at each full km. Test: `jog.spec.ts`.
- J-U3. Steps reuse the router's step text, including the Filipino and Taglish lines, with minutes at the pace.
  Test: `card.test.ts::steps`.
- J-U4. Inputs: start (the phone's location or a place), distance chips 3, 5 and 10 km plus custom, time (now or a
  slot), pace, and a "Prefer new streets" switch, on by default. With the switch off, history adds no cost.
  Test: `jog.spec.ts` and `score.test.ts::history`.
- J-U6. On a phone (narrower than 768 px), once loops show, the form folds into one summary line (start, distance,
  pace) with an Edit button, and the run panel takes at most 45% of the screen height, so the chosen loop spans at
  least half of the map above the panel. Edit opens the form again and keeps the loops until a new search.
  Test: `app/e2e/jog-phone.spec.ts`.
- J-U8. In Run a loop the hour picker also offers 4:00 to 5:30 AM and 7:00 to 9:00 PM, every 30 minutes, after the
  shade slots' own rule for past times today. A picked dark time sets the loop's departure minute. Walking keeps only
  the shade slots. Test: `app/e2e/jog-times.spec.ts`.
- J-U7. A sight name with several OSM values separated by ";" shows its first non-empty value, trimmed.
  Test: `sight-names.test.ts`.
- J-U5. The jog UI lives in its own components (`JogPanel.tsx`, `JogCards.tsx`, `JogLayer` in the map), so the
  first-trip and features tasks keep their files. Review check.

## History on the phone

- J-H1. "Mark as run" stores the loop's street keys, each with points at most 25 m apart along the edge, rounded
  to 5 decimals, in IndexedDB on the phone. Test: `history.test.ts`.
- J-H2. An edge counts as run before when its street key matches and its midpoint lies within 30 m of a stored
  point. Test: `history.test.ts` ("marks the same sidewalk after a rebuild").
- J-H3. "Clear history" deletes every run. "Export" downloads the runs as a JSON file. Test: `jog.spec.ts`.
- J-H4. No network request carries history: no URL, header or body holds a stored way id. Test: `jog.spec.ts`.
- J-H5. After "Mark as run", the next search for the same start and distance returns loops with fewer shared
  street metres. Test: `jog.spec.ts` and `loops.test.ts::history_loses`.
- J-H6. On the first "Mark as run", the app asks the browser to keep its storage (`navigator.storage.persist()`).
  Safari can delete a site's stored data after 7 days of use without a visit, except for Home Screen apps (WebKit,
  "Full Third-Party Cookie Blocking and More", 2020-03-24, webkit.org/blog/10218). So in Safari outside a Home
  Screen app, the history panel says: "Safari can delete saved runs if you skip this site for a week. Add it to
  your Home Screen to keep them." Review check.

## Dark runs and copy

- J-N1. When any leg of a loop falls in the dark, the card says: "Shade does not apply before sunrise or after
  sunset." Test: `card.test.ts::dark`.
- J-N2. In the dark, the card shows mapped-lit metres. Where the area maps little lighting, it says: "Street lights
  are not mapped on most streets here." Test: `card.test.ts::light_unknown`.
- J-N4. A loop is dark at every minute before sunrise or from sunset on, read from the manifest's sunrise and sunset
  for the date, whatever the shade slot. From April to September 06:00 is 17 to 32 minutes after sunrise in Manila.
  Test: `dark-minutes.test.ts`.
- J-N3. A loop that reaches a park while it is closed warns with the park's name, for example "Track 30th may be
  closed when you reach it." Test: `park-hours.test.ts`.
- J-C1. Wherever the app says safe, it says traffic safety only: "Safety here means traffic: crossings and road
  size. We have no crime data." Test: `card.test.ts::safety_copy`.
- J-C2. In a thin-sights area the card says: "Few sights are mapped here." Test: `card.test.ts::thin_sights`.
- J-C3. A location start never travels in a link as coordinates. Test: `jog.spec.ts`.

## Real data and speed

- J-R1. qc-north, start on the UP Diliman Academic Oval, 2.3 km: one loop has 60% or more of its metres within
  30 m of the Oval ring, and length within 10%. Test: `real-loops.test.ts`.
- J-R2. manila, Rizal Park, 3 km: one loop runs 1 km or more inside the park. Test: `real-loops.test.ts`.
- J-R3. pasay-moa, SM by the Bay, 5 km: one loop runs 1 km or more on Sunset Esplanade (way 4403625).
- J-R4. manila, Manila Baywalk, 5 km: one loop runs 500 m or more on ways 653905852 or 923242630.
- J-R5. metro-core, 5 km from five fixed starts: three loops each time, median `elapsedMs` 400 or less on the
  development laptop, so a phone four times slower stays near 1.6 s. Test: `real-loops.test.ts::speed`.
- J-R6. Real-data tests skip when the area files are missing, and never pin a date.

## Product choices on 2026-10-24

1. One loop finder for day and night: shade counts by day, light and crossings in the dark. A daylight-only tool
   serves about one run in five, because most Philippine races and club runs start before sunrise or after sunset.
2. Light: every card shows mapped-lit metres. Light changes the score only in areas that tag 30% or more of their
   walkable metres (13 of 67 areas on 2026-10-24), because an untagged street means unknown, not dark.
3. Entry point: a "Run a loop" chip beside Shaded and Sheltered in the planner, which swaps the destination box
   for distance chips.
4. "Mark as run" stores the planned loop only, never GPS.
5. Default distance 5 km. Default pace 7 min/km, a starting value rather than a measured average.
6. Loops only in the first version, no out and back.
7. Areas with few mapped sights drop sights from the score and say "Few sights are mapped here."
8. Copy: the four lines in J-N1, J-N2, J-C1 and J-C2.

## Interfaces the acceptance tests fix

The tests in `app/src/lib/jog/__tests__/` and `app/e2e/jog.spec.ts` import and click these names.

- `aStar(data, spec, s, t, k, opts?)`, with `opts` = `{ extra?, entry?: { edge, context? }, junctionExtra?, mPerMin? }`.
  `extra` and `junctionExtra` are per-edge Float32Arrays: cost per metre, and metres added to an unmarked side
  change into the edge.
- `findLoops(data, jog, query)` and `measureLoop(data, jog, { edges, nodes }, query)` in `loops.ts`.
- `JogQuery`: `start`, `targetM`, `dateIdx`, `bucketIdx`, `departMin`, `paceMinPerKm`, and optional `history`,
  `preferNew` (default true), `seed`, `budgetMs` (default 1,500) and `now` (a clock in ms).
- `JogResult`: `state` (ok, no_loop or outside), `loops`, `notes`, `elapsedMs`, `searches`, `budgetHit`, `dark`.
- `Loop`: `edgeIds`, `nodes`, `length_m`, `minutes`, `dark`, `shade_pct` (null in the dark), `crossings`
  (`signals`, `marked`, `unmarked`, `unmarkedBig`), `lit_m`, `unlit_m`, `unknownLit_m`, `sights` (names),
  `new_pct` (null with no history), `shared_m`, `repeat_pct`, `turnsPerKm`, `score`, `steps`, `kmMarks` (one per
  full km before the end), `warnings`.
- `parseJog(raw, edgeCount)` and `sightGrade(jog, data)` in `attrs.ts`. The grade is sights per km2 of the graph
  box times 0.5: 3 or more is rich, 1 or more is some, less is thin.
- `streetsOf(data, edges)` and `historyMask(data, runs)` in `history.ts`. `RunRecord` is `{ id, area, date,
  length_m, streets }`.
- `JOG_WEIGHTS` in `score.ts`, `JOG_COPY` and `loopFacts(loop, { litShare, grade })` in `copy.ts`. The card
  lines include "<n> km", "<n> min", "Shade <n>%" by day, "<a> of <b> km mapped as lit" in the dark where light
  is mapped, "<n>% new streets" with a history, and crossings as "<n> with signals", "<n> marked" and "<n> without
  a marked crossing". Without a jog file, a note says "Street data for sights, light and road size did not load.".
- IndexedDB database `ucph-jog`, object store `runs`. The worker file is `jogWorker.ts`.
- Test ids: `mode-run`, `jog-panel`, `jog-start-input`, `jog-use-location`, `jog-km-3`, `jog-km-5`, `jog-km-10`,
  `jog-km-custom`, `jog-prefer-new`, `jog-card` (with `data-length-m`, `data-new-pct`, `data-shared-m`,
  `data-loop-key`), `jog-mark-run`, `jog-again`, `jog-history-count`, `jog-export`, `jog-clear`. The map element
  `map` carries `data-jog-km-marks` and `data-jog-arrows`.
