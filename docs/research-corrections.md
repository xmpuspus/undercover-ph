# Restricted paths invalidate the original public-walking graph counts

The correction is dated 2026-10-21. The original research outputs stay in place as historical evidence. The corrected static profile is `public-through-static-v1`. New results are in [raw/access-correction-20261021](../research/20261021T120813Z/raw/access-correction-20261021/).

The three original extractors admitted `access=private`, `access=no` and `foot=private`. An audit of the actual NCR extract found 51,979 accepted ways with an explicit private or no-access rule and no positive pedestrian override. Those counts supported the original network ranking and routing benchmarks. They cannot show public through-access.

The corrected extractors share one policy. A specific `foot=yes`, `foot=designated` or `foot=permissive` can override general access restrictions. Customer-only, destination-only, permit-only and unknown access values are excluded from the public-through candidate profile. Ways touching explicitly blocked nodes are omitted in full. This conservative barrier treatment removes approach segments that a more detailed graph could keep.

A review found vehicle cover in the shelter flags as well. The profile now excludes busways and vehicle tunnels without explicit pedestrian permission. Only pedestrian-class ways receive shelter flags. A roof over a driveway does not show that an adjacent sidewalk has a roof. The revised tests reproduce this error before the fix and check pedestrian tunnels and roof tags after it.

[OSM access documentation](https://wiki.openstreetmap.org/wiki/Key:access) explains the access hierarchy. This profile still needs local defaults and field checks. Missing tags leave legal status unverified, even when a way qualifies as a structural candidate.

## Corrected structural metrics replace the access-blind totals

The pilot analyzer assigns each segment by its midpoint. These are candidate-network counts before schedule and field validation, from [01/pilots.json](../research/20261021T120813Z/raw/access-correction-20261021/01/pilots.json).

| Pilot | Candidate km | Graph nodes | Largest component nodes | Largest component share | Separate sidewalk km |
| --- | ---: | ---: | ---: | ---: | ---: |
| Makati | 90.117 | 4,349 | 4,183 | 96.18% | 11.288 |
| BGC | 130.839 | 6,001 | 5,764 | 96.05% | 38.253 |
| Ortigas | 62.762 | 3,158 | 2,983 | 94.46% | 13.730 |
| UP Diliman | 85.768 | 4,391 | 4,028 | 91.73% | 11.608 |
| Manila U-Belt | 118.790 | 6,700 | 6,182 | 92.27% | 5.703 |
| Cubao | 35.524 | 1,463 | 1,413 | 96.58% | 3.152 |

The routing extractor assigns whole ways by their mean node position. Its [05/graph_counts.json](../research/20261021T120813Z/raw/access-correction-20261021/05/graph_counts.json) has different boundary totals.

| Region | Ways | Simplified nodes | Undirected candidate edges | Directed arcs if doubled | Candidate km | Edges needing access evaluation |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Makati CBD | 1,732 | 2,265 | 2,903 | 5,806 | 90.7 | 809 |
| NCR polygon | 96,071 | 139,237 | 176,122 | 352,244 | 9,134.0 | 18,834 |

Directed arc totals describe storage duplication before direction rules are applied. A figure stated only as 500,000 edges cannot support the original claim that the graph was 44% smaller. The original latency, payload and route-choice results describe the old graph and synthetic shade on a desktop M5. They have not been reproduced on the corrected graph or a phone.

## Access rules survive extraction and still need routing code

The pilot cache now keeps access values, conditional text, opening hours and node barriers. Graph archives include original way and node identifiers. Each graph has a `graph_<region>_rules.json` sidecar and a per-edge `requires_access_evaluation` array. Indoor hallways and building passages need evaluation even when hours are missing. The map export uses the same static filter and marks unresolved rules.

The corrected graph metadata and pilot cache declare `routing_ready: false`. No schedule parser or live closure evaluator exists. A production importer must apply restrictions and arrival-time availability before comfort scoring. It must exclude unsupported controlled passages and keep separate levels, entrances, crossings and directional foot rules. Missing hours on a controlled passage need confirmation. Lowering its shade score cannot make it admissible.

The shelter report's cover-tag totals inventory mapped structures, including restricted ones. They do not measure usable public shelter. The updated shelter extraction and reach analysis are under the same correction directory, separate from the historical outputs.

## Height coverage does not measure shadow accuracy

The 96.2% headline is 1,537 of 1,598 OSM outlines receiving a height under the report's heuristic. Google fills 1,105 outlines. Its height median currently uses non-nodata pixels without a building-presence mask. Eight pixels in a 0.5 m output are not eight independent observations. The product has an effective resolution of about 4 m. [Google's temporal dataset documentation](https://sites.research.google/gr/open-buildings/temporal/) describes the resolution, confidence and 100 m height cap.

Keep this figure as heuristic assignment coverage. Check presence masking, source age and height uncertainty before using it as a shade-quality gate. Cast each `building:part` on its own geometry. Applying a tower's tallest height to its whole podium can overstate shade. Treat the remaining 61 outlines as unknown heights until a documented estimate is available.

The 111-day noon result describes a 30 m obstacle shading a point 4 m from its facade. It cannot show that Makati's building shade vanishes at lunch. At 82.4 degrees elevation a 200 m tower still casts about 26.7 m. Street orientation, actual parts, footprints and sidewalks set route shade.

Shadow extraction needs a height- and sun-dependent margin as well. The margin is `maximum relevant height / tan(minimum supported sun elevation)`. A 200 m obstacle can cast 746.410 m at 15 degrees. A fixed 150 m margin can omit an obstacle that shades a route. These are geometric calculations, without a measured Philippine error rate.

## Public recommendations need exposure, access and field evidence

Rank only admissible routes. Show travel time, minutes in sun, detour and unknown coverage separately. A 10-minute walk at 50% shade has 5 minutes in sun. A 30-minute walk at 80% shade has 6. Shade percentage alone cannot rank the second route as a better exposure outcome. The 20% detour and 15% sun-reduction cutoffs are proposed product choices that need user tests.

Build the [14 acceptance cases](acceptance-cases.md) before public navigation. Check access, hours, levels, stairs, crossings and side direction. Then check exposure arithmetic, unknown cover, distant shadows, time buckets, stale sources and historical flood flags. Compare frozen-bucket searches with a reference shortest-path solver. Arrival-time scoring needs a checked state model that keeps the timing alternatives needed for correctness.

Ten sun points can guide model development. They cannot show launch accuracy. Use routes not used in development, multiple departure times, clear and overcast conditions, different street directions, low sun and noon. Record access continuity, crossings, closed passages and stairs separately from sun classification. Report 09 models field hours and mapping speed. Measure both during a timed survey.

## Free hosting and client routing leave terms and privacy work open

The prior-art search found no comparable Philippine product in the sources searched. Demand and competitor absence are unproven. The partner search found no ready-to-use public walkway layer. Historical MaCEA stock totals have different dates, boundaries and possible overlap, so they cannot show the size of the current mapping gap.

Browser routing can keep explicit origin and destination values local. Hosting, tiles, geocoding, weather and analytics can still receive IP addresses, view extents or queries. Check a concrete request and retention inventory before making a no-trip or no-IP claim. No one checked runtime privacy.

A free price alone does not settle weather-provider non-commercial terms, government-data permissions, database licensing or privacy obligations. Check the operator, funding and actual data flows against the current terms. Google Open Buildings has its own open licence, distinct from Google Maps and Street View restrictions. No legal clearance, outreach or publication happened in this correction.

## Regression tests and local rebuilds check the extraction correction

The original code failed 33 assertions and one output-schema check. The vehicle-cover tests then reproduced ten further failures before that fix. Nine tests now pass, including 66 static access cases across all three extractors and five OSM fixture extraction checks. The fixture checks specific foot overrides, private-path exclusion, blocked gates and original conditional rules. It checks a rule-bearing node outside the pilot boundary on an included way as well. The [verification receipt](extraction-verification.json) records output checks and source hashes.

```sh
research/20261021T120813Z/scripts/05/venv/bin/python -m unittest discover -s tests -v
```

The source is the existing local NCR extract. No one measured phone performance or computed real shade. Field checks are not done.
