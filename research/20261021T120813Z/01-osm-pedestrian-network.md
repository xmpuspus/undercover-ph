# The original pilot ranking counted private and restricted ways, so it is withdrawn

A correction on 2026-10-21 replaces the counts and ranking in this report. Use [the corrected candidate metrics](../../docs/research-corrections.md). The original extractor admitted private and restricted ways, so its graph is access-blind. The historical counts and ranking below must not guide public routing. The rebuilt segment-midpoint results are in `raw/access-correction-20261021/01/pilots.json`. No one checked schedules or continuity in the field yet.

This report is from 2026-10-21. Its source is the Geofabrik Philippines extract `philippines-261020.osm.pbf` (MD5 checked, 610,963,420 bytes). The Metro Manila clip `raw/shared/ncr.osm.pbf` gives the same results.

## Network quality is usable with conditions, and the demand scores are judgment only

- The task is to choose one pilot area for a v1 shade-and-shelter walking router in Metro Manila.
- The choice needs walkable network quality, separate sidewalk mapping, covered or elevated walkways, and walking demand.
- The verdict for network quality is CONDITIONAL. The metrics are [VERIFIED]. Demand is [UNVERIFIED] judgment, because I pulled no demand data.
- The 500,000 edge figure in report 04 is partly right. The Metro Manila network section below gives the counts.

## The Geofabrik extract is the main source, and five Overpass samples come close to its footpath lengths

- For Makati, the earlier Overpass call failed with HTTP 502 and a 534-byte text body (`raw/01/01-makati-network-meta.txt`). That file holds an error message and no dataset. [VERIFIED]
- Five Overpass responses parse as JSON, with base time 2026-10-21T12:18Z. I use them only as a cross-check.
- The Geofabrik extract is the main source for all six pilots. I read it with pyosmium from `scripts/05/venv`. Zero ways had missing node locations.
- If its midpoint lies in the box, a segment counts in that pilot. This rule clips every pilot the same way.
- The walk filter copies osmnx `network_type="walk"`. It drops motorways, cycleways, `foot=no`, `service=private`, and `area=yes`.
- The scripts are `scripts/01/extract_ped.py`, `scripts/01/analyze_pilots.py`, and `scripts/01/analyze_overpass_prior.py`.
- The outputs are `raw/01/derived/pilots.json`, `pilots_clip.json`, and `overpass_prior.json`.

The Overpass cross-check compares km of footway, pedestrian, path, and steps ways. [VERIFIED]

| Pilot | Extract km | Overpass km |
|---|---|---|
| BGC | 71.0 | 72.9 |
| Ortigas | 23.8 | 24.0 |
| UP | 33.9 | 34.7 |
| Manila | 46.1 | 50.0 |
| Cubao | 5.2 | 5.3 |

## In the access-blind extract, BGC had the best value in 14 of 22 marked rows, and Ortigas had the most connected graph

All numbers are [VERIFIED] from the extract. Bold marks the best value per row where "best" is clear.

| Metric | Makati CBD | BGC | Ortigas | UP Diliman | Manila U-Belt | Cubao |
|---|---|---|---|---|---|---|
| Box area km2 | 3.351 | 3.231 | 2.345 | 4.067 | 4.787 | 1.436 |
| Walkable km, all | 113.0 | **151.5** | 96.1 | 121.0 | 145.0 | 45.3 |
| Walkable km per km2 | 33.7 | **46.9** | 41.0 | 29.8 | 30.3 | 31.5 |
| `footway` km | 27.2 | **60.1** | 21.7 | 29.3 | 37.3 | 4.9 |
| `pedestrian` km | 0.02 | **2.86** | 0.25 | 0.59 | 1.84 | 0 |
| `path` km | 0.47 | 7.20 | 0.83 | 3.37 | 6.03 | 0.04 |
| `steps` km | 0.90 | 0.85 | 1.03 | 0.57 | 0.94 | 0.32 |
| `corridor` km | 0.17 | 0.28 | 0.69 | 0 | 0.04 | 0.48 |
| `living_street` km | 0 | 0 | 0 | 0 | 0 | 0 |
| `residential` km | 21.4 | 26.2 | 7.4 | 14.1 | 10.2 | 8.5 |
| `service` km | 19.6 | 22.8 | 36.3 | 45.7 | 42.0 | 11.0 |
| `unclassified` km | 11.6 | 5.1 | 8.1 | 10.9 | 7.5 | 5.2 |
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

The table uses these definitions.

- Road km counts trunk to residential, unclassified, living_street, and service. Road shares count only roads that carry a `sidewalk`, `sidewalk:left`, `sidewalk:right`, or `sidewalk:both` key.
- The "tag or sidewalk way within 20 m" row samples every 10 m along non-service roads. It is a mapping proxy for sidewalks, and no survey stands behind it. [VERIFIED computation, proxy meaning]
- Dead ends count nodes with one neighbour. Real cul-de-sacs, private lanes, and unmapped links all count. The table cannot tell them apart.
- Edit date is the last edit of the way object. A tag edit and a geometry edit look the same. Node edits do not change it.
- Footpath ways means ways with `highway` set to `footway`, `pedestrian`, `path`, `steps`, or `corridor`.
- Wheelchair counts on nodes include only nodes on a walkable way. The counts exclude 57 shop and POI nodes with `wheelchair` in BGC and 81 in Makati.

## BGC tag counts suggest a deliberate survey (cause unverified), and Manila has the newest footpath edits but the lowest sidewalk share

- OSM maps 38.3 km of separate sidewalks in BGC. That is 3.4 times Makati and 6.7 times Manila. [VERIFIED]
- BGC has 1,402 wheelchair tags and 1,012 tactile paving tags. These counts point to a deliberate survey. [VERIFIED count, UNVERIFIED cause]
- Manila U-Belt has the second most walk km (145.0, after BGC's 151.5) and the newest edits. But it has the lowest sidewalk coverage by every measure (22% tag, 41% proxy). [VERIFIED]
- Manila and Cubao have the same median edit date, 2025-09-03. No single day dominates. The top dates hold 98 to 108 of about 2,600 ways in Manila. [VERIFIED] So the match looks like chance.
- Makati footpaths are the oldest set (median 2023-11-12). Half have a last edit before 2024. An old edit does not show that the data is wrong. [VERIFIED age, UNVERIFIED error]

## The whole Metro Manila walk network is about 564,000 directed edges

- The extract holds 1,621,809 highway ways for the Philippines. The NCR box (lat 14.35 to 14.80, lon 120.90 to 121.20) holds 227,883 walkable ways.
- The box is not the NCR boundary. It includes parts of Rizal, Cavite, Bulacan, and Laguna. So I ran a second clip to the Nominatim Metro Manila polygon (`raw/05/nominatim_ncr.json`).

| Region | Walkable km | Raw segments | Simplified edges, undirected | Directed edges (osmnx walk, both ways) |
|---|---|---|---|---|
| Metro Manila polygon | 13,767.6 | 571,634 | 281,807 | 563,614 |
| Lat/lon box from the project plan | 22,104.6 | 892,661 | 426,128 | 852,256 |

- Edges are way pieces between way ends and shared nodes. This copies osmnx simplification. [VERIFIED code, UNVERIFIED match to an osmnx run, because I did not run osmnx]
- osmnx builds walk graphs with two-way edges. So its directed count is twice the undirected count. [UNVERIFIED, from osmnx behavior as I remember it]
- Report 04 assumed 500,000 edges. If the count uses directed edges, that figure is within 13% of the polygon count. [VERIFIED]
- If the project stores the whole box, the same figure is wrong by 70%.
- Report 04 gives 72 and 192 bytes per edge. At those sizes the polygon needs 40.6 to 108.2 MB. The box needs 61.4 to 163.6 MB.
- If the store keeps one record per undirected edge, the polygon needs only 20.3 to 54.1 MB.
- The polygon graph has 568 separate connected components. The largest holds 99.0% of nodes and 99.3% of km. [VERIFIED]
- In the polygon, 3,092 ways carry `footway=crossing`. Separate sidewalks total only 281.6 km. Sidewalk mapping is thin outside the pilots. [VERIFIED]
- Across the polygon, 22.6% of road km has a sidewalk tag. BGC reaches 54%, so the pilots are not typical. [VERIFIED]

## In the withdrawn ranking, Ortigas scored highest on judgment weights, but the top three were within 0.6 points

I scored each factor from 1 (worst) to 6 (best) from the table above. I chose the weights by judgment. Completeness gets 30%, separate sidewalks 30%, cover and elevated walkways 20%, and demand 20%. The scores are opinion. The numbers behind them are [VERIFIED]. Demand scores are [UNVERIFIED].

| Rank | Pilot | Completeness | Sidewalks | Cover and elevated | Demand | Weighted score |
|---|---|---|---|---|---|---|
| 1 | Ortigas | 6 | 4 | 6 | 5 | 5.2 |
| 2 | Makati CBD | 5 | 4 | 5 | 6 | 4.9 |
| 3 | BGC | 4 | 6 | 3 | 5 | 4.6 |
| 4 | UP Diliman | 5 | 3 | 3 | 3 | 3.6 |
| 5 | Manila U-Belt | 3 | 1 | 5 | 5 | 3.2 |
| 6 | Cubao | 2 | 2 | 2 | 4 | 2.4 |

The top three are within 0.6 points. If separate sidewalks get 50% of the weight, the order becomes BGC 5.0, Ortigas 4.85, Makati 4.65. So the sidewalk weight decides the pick.

### Ortigas ranked first in the withdrawn ranking, with the most connected access-blind graph and the most cover tags

- Its largest component holds 98.7% of nodes and 98.5% of km. That node share is the highest of the six. [VERIFIED]
- In its footpath-only graph, 80% of nodes join one component. BGC reaches 75% and Makati 43%. [VERIFIED]
- It has 43 pedestrian ways with `covered=yes` (1.9 km) and 77 elevated ways. Both counts are the highest of six. [VERIFIED]
- On non-service roads, 74% of sample points have a sidewalk tag or a sidewalk way within 20 m. BGC reaches 77%. [VERIFIED proxy]
- It has 143 crossing nodes per km2, second to BGC. [VERIFIED]
- Its edits are recent. 83% of walk ways had an edit since 2024-01-01, and the median footpath edit is 2024-02-28. [VERIFIED]
- Its box is compact, at 2.345 km2. The v1 team can check it by hand. [VERIFIED]
- Its demand comes from an office centre with MRT and mall traffic. [UNVERIFIED]
- Its weak point is sidewalks. It has only 13.7 km of separate sidewalks, and 31% of road km carry a sidewalk tag. Service roads make up 36 of 69 road km. Accessibility tags are few (75 tactile paving). [VERIFIED]

### Makati CBD ranked second, with the longest footbridge set but weak footpath links

- It has the highest demand, as an office core with Ayala transit links. [UNVERIFIED]
- It has the longest footbridge set, with 23 footbridges and 1.45 km, plus 60 elevated pedestrian ways. [VERIFIED]
- Its road graph is good. One component holds 98.0% of nodes, and 70% of sample points have sidewalk evidence. [VERIFIED]
- Its weak points are 11.4 km of separate sidewalks and only 43% of footpath nodes in one component. The median footpath edit is 2023-11-12. [VERIFIED]

### BGC leads on sidewalks, crossings, and wheelchair and tactile paving tags, but its access-blind graph had the lowest node share in one component (88.6%)

- OSM has 38.3 km of separate sidewalks in BGC. That is 2.8 times Ortigas and 3.4 times Makati. [VERIFIED]
- It has the most crossings (168 per km2), wheelchair tags (1,402), and tactile paving tags (1,012). [VERIFIED]
- It has the lowest cover count of the top three (9 covered ways). Its largest component holds only 88.6% of nodes. [VERIFIED]
- If the v1 must choose the shady side of a street, pick BGC. If the v1 must join covered links and bridges, pick Ortigas.

## The ranking uses mapped data only, with no demand data and no ground check

- The largest BGC component holds only 88.6% of nodes, and 7.1% of km is outside it. A second component has 478 nodes. I did not inspect it. [VERIFIED count, UNVERIFIED cause]
- This report counts only whether covered walkways are present. Report 03 audits `covered=*` in depth. BGC has the fewest covered ways of the top three (9). So a shelter router for BGC can need a second source of cover data.
- No measured data backs the demand scores. I pulled no footfall, ridership, or census data. The ranking uses land-use judgment only.
- A sidewalk on the map does not show that people can walk on it. I did no ground check. I did not test surface, width, or obstruction.
- Pilot boxes are rectangles from the project plan. They do not follow district borders.
- Sidewalk share excludes unmapped roads. A road with no tag and no sidewalk way can still have a sidewalk.
- The extract date is 2026-10-20, so the extract has no OSM edits after that date.
- OSM data is ODbL, and report 08 covers its terms. I did not check licence use in this report. [UNVERIFIED]

## The next checks are the BGC component, Ortigas sidewalks, demand counts, and cover counts

1. Inspect the 478-node second component in BGC. Find out whether it is a closed compound or a mapping gap.
2. Check 5 Ortigas blocks on the ground or with street imagery. Compare mapped sidewalks with what exists.
3. Pull ridership or footfall counts for Ortigas, Makati CBD, and BGC to replace the demand judgment.
4. Merge the report 03 covered-walkway counts. If Ortigas cover is thin, re-rank.

## Nothing blocks the network metrics

- Overpass is not needed. The Geofabrik extract and the NCR clip gave the same numbers.
