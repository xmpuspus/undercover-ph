# Original pilot ranking used an access-blind graph and is withdrawn

Correction, 2026-10-21: use [the corrected candidate metrics](../../docs/research-corrections.md). The original extractor admitted private and restricted ways. The historical counts and ranking below must not guide public routing. The rebuilt segment-midpoint results are in `raw/access-correction-20261021/01/pilots.json`. Schedules and field continuity remain unvalidated.

Date: 2026-10-21. Source: Geofabrik Philippines extract `philippines-261020.osm.pbf` (MD5 checked, 610,963,420 bytes). Metro Manila clip `raw/shared/ncr.osm.pbf` gives identical results.

## Requested use and verdict

- Use: choose one pilot area for a v1 shade-and-shelter walking router in Metro Manila.
- Needed: walkable network quality, separate sidewalk mapping, covered or elevated walkways, and walking demand.
- Verdict for network quality: CONDITIONAL. Metrics are [VERIFIED]. Demand is [UNVERIFIED] judgment, because no demand data was pulled.
- Verdict for the 500,000 edge figure in report 04: partly right. See the NCR section.

## Sample evidence

- Makati: [VERIFIED] the earlier Overpass call failed with HTTP 502 and a 534-byte text body (`raw/01/01-makati-network-meta.txt`). Not a dataset.
- Five Overpass responses parse as JSON. Base time 2026-10-21T12:18Z. They serve only as a cross-check.
- Main source for all six pilots: the Geofabrik extract. I read it with pyosmium from `scripts/05/venv`. Zero ways had missing node locations.
- The extract holds 1,621,809 ways with a highway tag in the Philippines. The NCR box holds 227,883 walkable ways.
- Method: a segment counts in a pilot when its midpoint lies in the box. This clips every pilot the same way.
- Walk filter: copy of osmnx `network_type="walk"`. It drops motorways, cycleways, `foot=no`, `service=private`, and `area=yes`.
- Scripts: `scripts/01/extract_ped.py`, `scripts/01/analyze_pilots.py`, `scripts/01/analyze_overpass_prior.py`.
- Outputs: `raw/01/derived/pilots.json`, `pilots_clip.json`, `overpass_prior.json`.
- Overpass cross-check, footway+pedestrian+path+steps km (extract vs Overpass): BGC 71.0 vs 72.9, Ortigas 23.8 vs 24.0, UP 33.9 vs 34.7, Manila 46.1 vs 50.0, Cubao 5.2 vs 5.3. [VERIFIED]

## Per-pilot table

All numbers are [VERIFIED] from the extract. Bold marks the best value per row where "best" is clear.

| Metric | Makati CBD | BGC | Ortigas | UP Diliman | Manila U-Belt | Cubao |
|---|---|---|---|---|---|---|
| Box area km2 | 3.351 | 3.231 | 2.345 | 4.067 | 4.787 | 1.436 |
| Walkable km, all | 113.0 | **151.5** | 96.1 | 121.0 | 145.0 | 45.3 |
| Walkable km per km2 | 33.7 | **46.9** | 41.0 | 29.8 | 30.3 | 31.5 |
| footway km | 27.2 | **60.1** | 21.7 | 29.3 | 37.3 | 4.9 |
| pedestrian km | 0.02 | **2.86** | 0.25 | 0.59 | 1.84 | 0 |
| path km | 0.47 | 7.20 | 0.83 | 3.37 | 6.03 | 0.04 |
| steps km | 0.90 | 0.85 | 1.03 | 0.57 | 0.94 | 0.32 |
| corridor km | 0.17 | 0.28 | 0.69 | 0 | 0.04 | 0.48 |
| living_street km | 0 | 0 | 0 | 0 | 0 | 0 |
| residential km | 21.4 | 26.2 | 7.4 | 14.1 | 10.2 | 8.5 |
| service km | 19.6 | 22.8 | 36.3 | 45.7 | 42.0 | 11.0 |
| unclassified km | 11.6 | 5.1 | 8.1 | 10.9 | 7.5 | 5.2 |
| tertiary and above km | 31.6 | 25.2 | 16.8 | 16.4 | 39.1 | 12.4 |
| Other classes km (track, road) | 0.2 | 0.8 | 2.9 | 0.05 | 0 | 2.5 |
| Separate sidewalk km (`footway=sidewalk`) | 11.4 | **38.3** | 13.7 | 11.6 | 5.7 | 3.2 |
| Road km (all road classes) | 84.1 | 79.4 | 68.7 | 87.1 | 98.9 | 37.1 |
| Road km share with `sidewalk=*` tag | 48% | **54%** | 31% | 39% | 22% | 33% |
| Same share, service roads excluded | 62% | 74% | 62% | **76%** | 37% | 47% |
| Road points with tag or sidewalk way within 20 m | 70% | **77%** | 74% | 74% | 41% | 60% |
| Crossing nodes | 402 | **544** | 336 | 206 | 271 | 117 |
| Crossing nodes per km2 | 120 | **168** | 143 | 51 | 57 | 82 |
| `footway=crossing` ways | 247 | **350** | 123 | 40 | 118 | 37 |
| Footbridges (footway or path, `bridge=yes`), count | 23 | 16 | 24 | 26 | **29** | 4 |
| Footbridge km | **1.45** | 0.47 | 0.60 | 0.63 | 1.06 | 0.17 |
| Steps ways | 90 | 42 | 78 | 59 | **103** | 32 |
| Elevator nodes | 1 | **8** | 2 | 0 | 2 | 0 |
| `wheelchair` tags (ways + walk nodes) | 347 | **1,402** | 86 | 208 | 112 | 50 |
| `tactile_paving` tags | 184 | **1,012** | 75 | 167 | 62 | 57 |
| `kerb` tags | 340 | **721** | 69 | 160 | 83 | 32 |
| `ramp` tags (ways) | 10 | 1 | 16 | 7 | **23** | 4 |
| `incline` tags | 50 | 6 | 28 | 27 | **63** | 4 |
| Graph nodes | 5,167 | 7,398 | 4,896 | 6,106 | 8,317 | 1,888 |
| Largest component, share of nodes | 98.0% | 88.6% | **98.7%** | 97.6% | 98.4% | 96.1% |
| Largest component, km (share of km) | 110.6 (97.8%) | 140.7 (92.9%) | 94.6 (98.5%) | 118.7 (98.1%) | 143.6 (99.0%) | 42.1 (92.9%) |
| Dead ends, all (inside box, >25 m from edge) | 353 (281) | 358 (247) | 340 (267) | 395 (291) | 493 (419) | 180 (134) |
| Footpath-only graph, largest component share | 43% | 75% | **80%** | 47% | 46% | 56% |
| Median edit date, all walk ways | 2025-03-31 | 2024-06-12 | 2024-06-05 | 2024-07-25 | 2025-09-03 | 2025-09-03 |
| Share of walk ways edited since 2024-01-01 | 75% | 76% | 83% | 56% | 86% | 91% |
| Median edit date, footpath ways | 2023-11-12 | 2024-05-03 | 2024-02-28 | 2024-07-22 | 2025-10-06 | 2024-06-10 |
| Footpath ways edited since 2024-01-01 | 49% | 63% | 65% | 54% | 80% | 64% |
| Pedestrian ways with `covered=yes` (presence only) | 19 | 9 | 43 | 28 | 42 | 6 |
| Elevated pedestrian ways (`layer>=1` or bridge) | 60 | 35 | 77 | 31 | 70 | 30 |

Notes on the table:

- Road km counts trunk to residential, unclassified, living_street, and service. Road shares count only roads that carry a `sidewalk`, `sidewalk:left`, `sidewalk:right`, or `sidewalk:both` key.
- The "tag or sidewalk way within 20 m" row samples every 10 m along non-service roads. It is a proxy, not a survey. [VERIFIED computation, proxy meaning]
- Dead ends count nodes with one neighbour. Real cul-de-sacs, private lanes, and unmapped links all count. The table cannot split them.
- Edit date is the last edit of the way object. A tag edit and a geometry edit look the same. Node edits do not change it.
- Footpath ways means footway, pedestrian, path, steps, and corridor.
- Wheelchair counts on nodes include only nodes that belong to a walkable way. Shop and POI nodes with `wheelchair` are excluded: 57 in BGC and 81 in Makati.

## Why the numbers show real mapping, not tag noise

- BGC maps 38.3 km of separate sidewalks. That is 3.4 times Makati and 6.7 times Manila. [VERIFIED]
- BGC also holds 1,402 wheelchair tags and 1,012 tactile paving tags. This points to a deliberate survey. [VERIFIED count, UNVERIFIED cause]
- Manila U-Belt has the most walk km and the newest edits. It has the lowest sidewalk coverage by every measure (22% tag, 41% proxy). [VERIFIED]
- Manila and Cubao share the same median date, 2025-09-03. No single day dominates. The top dates hold 98 to 108 of about 2,600 ways in Manila. [VERIFIED] The match looks like chance.
- Makati footpaths are the oldest set (median 2023-11-12). Half were last edited before 2024. Age does not prove error. [VERIFIED age, UNVERIFIED error]

## The whole Metro Manila walk network is about 564,000 directed edges

- The extract holds 1,621,809 highway ways for the Philippines. The NCR box (lat 14.35 to 14.80, lon 120.90 to 121.20) holds 227,883 walkable ways.
- The box is not NCR. It includes parts of Rizal, Cavite, Bulacan, and Laguna. I also clipped to the Nominatim Metro Manila polygon (`raw/05/nominatim_ncr.json`).

| Region | Walkable km | Raw segments | Simplified edges, undirected | Directed edges (osmnx walk, both ways) |
|---|---|---|---|---|
| Metro Manila polygon | 13,767.6 | 571,634 | 281,807 | 563,614 |
| Lat/lon box from the project plan | 22,104.6 | 892,661 | 426,128 | 852,256 |

- Edges are way pieces between way ends and shared nodes. This copies osmnx simplification. [VERIFIED code, UNVERIFIED match to an osmnx run, because I did not run osmnx]
- osmnx builds walk graphs with two-way edges. So its directed count is twice the undirected count. [UNVERIFIED, from osmnx behavior as I remember it]
- Report 04 assumed 500,000 edges. This fits the polygon within 13% if edges are directed. [VERIFIED]
- The same figure would be wrong by 70% if the project stores the whole box.
- Storage at the 72 and 192 bytes per edge of report 04: polygon 40.6 to 108.2 MB. Box 61.4 to 163.6 MB.
- If the store keeps one record per undirected edge, the polygon needs only 20.3 to 54.1 MB.
- The polygon has 568 components. The largest holds 99.0% of nodes and 99.3% of km. [VERIFIED]
- In the polygon, 3,092 ways carry `footway=crossing`. Separate sidewalks total only 281.6 km. Sidewalk mapping is thin outside the pilots. [VERIFIED]
- Share of road km with a sidewalk tag: 22.6% across the polygon. BGC reaches 54%, so the pilots are not typical. [VERIFIED]

## Ranking

I scored each factor from 1 (worst) to 6 (best) from the table above. The weights are my judgment: completeness 30%, separate sidewalks 30%, cover and elevated walkways 20%, demand 20%. The scores are opinion. The numbers behind them are [VERIFIED]. Demand scores are [UNVERIFIED].

| Rank | Pilot | Completeness | Sidewalks | Cover and elevated | Demand | Weighted score |
|---|---|---|---|---|---|---|
| 1 | Ortigas | 6 | 4 | 6 | 5 | 5.2 |
| 2 | Makati CBD | 5 | 4 | 5 | 6 | 4.9 |
| 3 | BGC | 4 | 6 | 3 | 5 | 4.6 |
| 4 | UP Diliman | 5 | 3 | 3 | 3 | 3.6 |
| 5 | Manila U-Belt | 3 | 1 | 5 | 5 | 3.2 |
| 6 | Cubao | 2 | 2 | 2 | 4 | 2.4 |

The top three sit within 0.6 points. If separate sidewalks carry 50% of the weight, the order becomes BGC 5.0, Ortigas 4.85, Makati 4.65. Sidewalk weight decides the pick.

### Recommended pilot: Ortigas

- Cleanest graph: 98.7% of nodes and 98.5% of km sit in one component. [VERIFIED]
- Best footpath graph: 80% of footpath nodes join one component. BGC reaches 75% and Makati 43%. [VERIFIED]
- Most shelter and elevation presence: 43 pedestrian ways with `covered=yes` (1.9 km) and 77 elevated ways. Both are the highest of six. [VERIFIED]
- Sidewalk evidence: 74% of non-service road points have a tag or a sidewalk way within 20 m. BGC reaches 77%. [VERIFIED proxy]
- Dense crossings: 143 per km2, second to BGC. [VERIFIED]
- Recent edits: 83% of walk ways edited since 2024-01-01. Median footpath edit 2024-02-28. [VERIFIED]
- Compact box of 2.345 km2. A v1 can check it by hand. [VERIFIED]
- Demand: office centre with MRT and mall traffic. [UNVERIFIED]
- Weakness: only 13.7 km of separate sidewalks, and 31% of road km carry a sidewalk tag. Service roads make up 36 of 69 road km. Thin accessibility tags (75 tactile paving). [VERIFIED]

### Runner-up: Makati CBD

- Highest demand: office core with Ayala transit links. [UNVERIFIED]
- Longest footbridge set: 23 footbridges, 1.45 km. 60 elevated pedestrian ways. [VERIFIED]
- Good road graph: 98.0% of nodes in one component, 70% sidewalk evidence. [VERIFIED]
- Weakness: 11.4 km of separate sidewalks, and only 43% of footpath nodes connect. Footpath median edit is 2023-11-12. [VERIFIED]

### Where BGC wins

- BGC maps 38.3 km of separate sidewalks. That is 2.8 times Ortigas and 3.4 times Makati. [VERIFIED]
- It has the most crossings (168 per km2), wheelchair tags (1,402), and tactile paving tags (1,012). [VERIFIED]
- Its weak points are the lowest cover count of the top three (9 covered ways) and a largest component of only 88.6% of nodes. [VERIFIED]
- Pick BGC if the v1 must choose the shady side of a street. Pick Ortigas if the v1 must link covered links and bridges.

## Limits and what they change

- BGC largest component holds only 88.6% of nodes, and 7.1% of km sits outside it. A second component has 478 nodes. I did not inspect it. [VERIFIED count, UNVERIFIED cause]
- Covered walkway coverage is only a presence count here. Report 03 audits `covered=*` depth. BGC has the fewest covered ways of the top three (9). A shelter router may need another source for it.
- Demand has no denominator. I pulled no footfall, ridership, or census data. The ranking uses land-use judgment only.
- A mapped sidewalk does not prove a walkable one. I did no ground check. Surface, width, and obstruction are untested.
- Pilot boxes are rectangles from the project plan. They do not follow district borders.
- Sidewalk share excludes unmapped roads. A road with no tag and no sidewalk way may still have a sidewalk.
- The extract is dated 2026-10-20. OSM edits after that date are missing.
- Rights: OSM data is ODbL. Report 08 covers terms. I did not check licence use in this report. [UNVERIFIED]

## Smallest next evidence

1. Inspect the 478-node second component in BGC. Confirm whether it is a closed compound or a mapping gap.
2. Check 5 Ortigas blocks on the ground or with street imagery. Compare mapped sidewalks with what exists.
3. Pull ridership or footfall counts for Ortigas, Makati CBD, and BGC to replace the demand judgment.
4. Merge report 03 covered-walkway counts, then re-rank if Ortigas cover proves thin.

## Blockers

- None for the network metrics.
- Overpass is not needed. The Geofabrik extract and the NCR clip gave the same numbers.
