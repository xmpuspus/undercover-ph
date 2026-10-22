# Build a shade and shelter walking router for Makati CBD first, then add one district at a time

Written 2026-10-21 and updated 2026-10-22. On 2026-10-22 the app is live at https://undercover.ph for 14 walking areas across Metro Manila (see the README). The Makati-first plan below is the history of how it started. The field sprint and partner outreach are still open.

The evidence is 12 research reports in `research/20261021T120813Z/`. Each claim names its report number in brackets, for example [02].

[VERIFIED] means a person or script read the source or ran the code. [UNVERIFIED] means a snippet, recall, or estimate.

The [access and research corrections](research-corrections.md) replace the original public-network totals and qualify the shade, privacy, cost and legal claims. The rebuilt graphs explicitly declare `routing_ready: false`.

## Build a free Makati prototype that routes in the browser, and gate launch on field checks

1. Build a Makati research prototype. The bounded prior-art search found no comparable Philippine product. Demand still needs user tests [06].
2. Treat Makati CBD as the provisional pilot. Compare audited routes with Ortigas before expanding.
3. Add shade and shelter modes in v1. Show a PAGASA advisory banner in rain mode.
4. OSM plus Google 2.5D assigns a heuristic height to 1,537 of 1,598 Makati CBD outlines (96.2%). Shade accuracy remains untested [02].
5. Tree shade comes from the leaves-ph canopy raster, with pixels of about 1.19 m [00]. Singapore's 2026 project page lists trees as future work.
6. Shelter data is incomplete. OSM marks cover on 4 of 53 inventoried Makati footbridge ways [03]. Partner data and a field survey can close the gaps.
7. Route in the browser over a precomputed graph. Check hosting, tile, search and weather requests before making a trip-privacy claim [05, 08].
8. Keep the app free and keep trips out of project storage. Publish the annotated graph and field overlay under ODbL [08].
9. Before launch, pass the access and routing cases and audit route continuity. Check shade on field routes not used in development and measure phone performance.

## Singapore shows the product, but its covered-linkway dataset has no Manila equivalent

Singapore's Undercover runs on the Silverfox engine from Open Government Products. It applies any cost function to a pedestrian network. For each query it returns three routes. They are the shortest, the most shaded, and the recommended one. The recommended route is "meaningfully shadier without being unreasonably longer". In its first week, more than 300 users computed more than 750 routes, and about 95% chose the recommended route.

Its data layer has three parts.

- LTA covered-linkway data, a government dataset.
- OpenStreetMap building footprints with heights, for ray-traced shadows by hour and season.
- Underground passage networks.

The 2025 version covered Orchard Road only. The team mapped 30 routes by hand, with landmarks and photos. Its lesson was "Collecting data yourself on the ground was faster than waiting for stakeholder datasets." Testers liked landmark directions and landmark photos. They all wanted geo-tracking, and they needed help to orient at the start.

Three things transfer to Manila.

- The three-route output and the percent shaded on each route.
- One engine with many cost functions, in the order shade, rain, step-free access.
- A web page instead of a native app.

The partner search found no ready-to-use public Philippine covered-walkway layer [11]. Check what MaCEA and LGUs hold before estimating the collection work.

Manila adds a tree layer that exists today, opening hours for mall passages, stair flags for footbridges, and Taglish landmark steps.

## Makati CBD is a provisional pilot pending access and demand checks

The original ranking used an access-blind graph and subjective weights. Withdraw those scores. The corrected static candidate metrics below support a provisional Makati pilot, with route-level and demand checks still pending.

| Measure | Makati CBD | Ortigas | BGC | Source |
| --- | --- | --- | --- | --- |
| Candidate graph in largest component | 96.18% | 94.46% | 96.05% | correction, `01/pilots.json` |
| Candidate separate sidewalk km | 11.288 | 13.730 | 38.253 | correction, segment-midpoint method |
| Footpath-only graph, largest piece share of nodes | 43.1% | 81.0% | 90.1% | correction, `01/pilots.json` |
| Footpath-only graph, separate pieces | 91 | 45 | 50 | correction, `01/pilots.json` |
| Cover-tagged pedestrian ways, km | 1.477 | 2.670 | 1.019 | [03] |
| Footbridge ways with a cover tag | 4 of 53 | 7 of 55 | 2 of 28 | [03] |
| Underpass km in OSM | 0.797 | 0 | 0.094 | [03] |
| Buildings with a height, by count | 96.2% | 90.0% | 94.4% | [02] |
| Buildings with a height, by area | 98.0% | 97.6% | 97.3% | [02] |
| Public partner contact found | MaCEA | none found | none found | [11] |
| Claimed shelter stock | 2 km elevated, 4 km covered, 7 underpasses | not found | not found | [03, 11] |

The shelter rows inventory mapped structures, including restricted ones. They do not measure available public shelter. Similar total lengths between OSM and MaCEA do not show matched geometry, connectivity or access. Survey entrances, crossings, levels and hours before deciding whether missing tags or missing links dominate.

MaCEA's reported 2019 usage suggests a place to recruit walkers (`raw/03/web_notes.md`). It does not show demand for this product. A public contact address does not constitute a partnership either.

Picking Makati depends on its shelter stock, and the footpath rows show the cost. In OSM, Makati's footpaths split into 91 pieces, and the largest holds 43.1% of footpath nodes. Ortigas holds 81.0% in its largest piece. Covered walks are footpaths, so Makati needs more new links than Ortigas.

One field day on the Ayala MRT, Glorietta, Greenbelt, and Ayala Triangle spine settles the choice. Record each missing covered link as a missing tag or as missing geometry. Then apply the first rule that matches.

1. If missing geometry makes up more than half of the missing covered length, move the pilot to Ortigas.
2. If the covered walks run past the CBD box, grow the box to the walked network first.
3. If neither rule matches, keep Makati and plan the remaining field days.

## Height assignment coverage supports a shadow prototype, with accuracy still untested

OSM alone gives a height to 27.0% of Makati CBD footprints, or 54.7% by area [02]. The Google Open Buildings 2.5D raster (2023, about 4 m cells) fills almost all of the rest.

| Height source, Makati CBD (1,598 footprints) | By count | By area | Over 500 m2, by count |
| --- | --- | --- | --- |
| OSM `height`, else `building:levels` x 3.74 m | 27.0% | 54.7% | 47.4% |
| Google 2.5D zonal median | 95.4% | 97.4% | 96.9% |
| Union, OSM first | 96.2% | 98.0% | 97.2% |

These rules follow from the audit [02].

- Google caps heights at 100 m. Makati has 123 buildings that some source puts above 100 m.
- OSM tags almost all of those towers. Only 1 tall footprint has no OSM height at all.
- Cast each `building:part` using its own geometry and height. PBCom Tower reads 36 m on its outline and 258 m on its part. Do not apply 258 m to the whole podium.
- Podium outlines like that cover 25.9% of the area of buildings over 500 m2.
- Keep the last 61 footprints (2.0% of area) as unknown height until a documented estimate is available. Show the effect of unknown heights on route scores.
- Label Google heights "modelled, 2023". New towers after mid-2023 need OSM tags.
- OSM and Google agree within a median of 8.6 m on 178 matched buildings up to 100 m.

The Google median currently lacks a building-presence mask. Its 0.5 m output pixels have an effective resolution of about 4 m. Revisit the eight-pixel usability threshold, presence masking, source age and height uncertainty before treating this coverage as usable shade evidence. See the [height corrections](research-corrections.md).

Three sources are dead ends [02].

- In the Microsoft footprints, 0 of 20,000 sampled rows in the Makati quadkey carry a height.
- In LiPAD, the coverage flags read 0 for DSM, DTM, and ORTHO in every Makati, BGC, and Ortigas cell. The flag meaning is [UNVERIFIED].
- Overture heights copy OSM.

## The 111 days of overhead noon sun apply to one 30 m building and a 4 m sidewalk offset

Manila sits at 14.6 N, so the noon sun passes almost overhead twice a year. A 30 m building stops shading a sidewalk 4 m from its facade when the sun climbs above 82.4 degrees.

A rerun of the sun script finds 111 such days in 2026, from 9 April to 2 June and from 12 July to 5 September. For a 20 m building the window grows to 170 days, 30 March to 15 September. The source is `research/20261021T120813Z/raw/04/noon_windows.txt`. This corrects report 04, which estimated two to three weeks.

The 30 m and 4 m calculation does not measure Makati's route shade. At 82.4 degrees a 200 m tower still casts about 26.7 m. Actual part geometry, street orientation, sidewalks and tree crowns set shade on each route.

Three design effects follow.

- Compare buildings, trees and roofs at each route's traversal time. Measure each source's contribution in the Makati pilot.
- Morning and afternoon do not mirror each other, so the shade model keeps both [04].
- The 4 m offset simplifies the street. The pipeline casts real footprints on real sidewalk lines.

Trees come from `leaves-ph/data/meta/canopy_height_ncr.tif`. It is a Meta and WRI canopy height raster for all of NCR, with pixels of about 1.19 m, CC-BY-4.0 [00]. It dates from about 2018 to 2020. The crown polygons made from it drop trees under 5 m, but the raster keeps them. Model tree crowns with 3% light through them, the UMEP default, and tune that value in the field [04].

## Shelter data is the main build cost, because OSM marks cover on few Makati walkways

OSM holds this shelter stock in the Makati CBD box [03].

- 49 pedestrian ways with a cover tag, 1.477 km.
- 53 footbridge ways, 2.09 km. Only 4 carry a cover tag.
- 7 underpass structures, 0.797 km. None carries a name.
- 0 mall-link ways with `opening_hours`, across all 184 in Metro Manila.

MaCEA claimed about 4 km of covered walks, 2 km of elevated walks, and 7 underpasses in 2019 [03]. Report 09 adds a 2 km underpass network from a TopGear article that cites a Facebook page. That 2 km figure is [UNVERIFIED]. Dates, boundaries, definitions and possible overlap prevent these totals from establishing a current percentage mapping gap.

The corrected strict-cover graph has 41 components touching the Makati box. Its station reach calculation gives 0.544 km from Ayala node 5397307754, after a 27.6 m nearest-node snap. No survey checked that snap as a legal entrance connection. Keep these structural results internal until the survey checks missing tags, levels and access.

Four moves close the gap.

1. Email MaCEA for a segment list or map, with opening hours [11]. Offer credit and a correction channel.
2. Post a notice to OSM Philippines (`talk-ph`, the `osmph` Telegram group) before the first edit [09].
3. Walk the network on Saturdays. Tag cover, layer, bridge, tunnel, level, and opening hours [09].
4. Keep a hand-built hours table for malls and passages. OSM holds none.

Report 09 models 1.43 km per hour and about 17 field hours. No survey measured that yield. Historic shelter totals can overlap. Waits, revisits, heat, and access checks change the effort. Time the first survey, deduplicate its segment list and re-estimate the remaining work. 

Four-hour sessions are a schedule choice. This research gives no measured heat-safety limit.

The field work follows these data rules.

- Keep field edits in a local overlay file keyed by OSM way id. The overlay wins at graph build.
- Upload the same tags to OSM afterwards, so the community map gains too.
- Use Mapillary and KartaView images by eye only. Mapillary's terms ban use with route guidance [08].
- Never trace from Google Street View or Google Maps [08].
- Before you use MaCEA data, ask MaCEA in writing for permission to publish it openly under ODbL.
- If MaCEA refuses open use, use its map only to plan field walks. Put none of its rows in the graph.

### The shelter map becomes public, so the edge over Google comes from upkeep

The field tags go to OSM, and the annotated graph ships as an ODbL download [08]. So anyone, Google included, can reuse the shelter map. Secrecy cannot be the advantage.

The advantage is the work that a large map company does not do for one district.

- Walked checks of each covered link, with dates.
- Opening hours, gates, and closures, kept current through user reports.
- Taglish landmark steps with photos.
- Working contact with MaCEA, building managers, and the OSM Philippines community.

Open data helps the project too. The tags improve OSM for every app in Manila, and they give the work public credit.

## Rain mode routes under cover and warns, but never claims that a street is flooded or dry

The weather audit found no public live feed of street flooding in Metro Manila [07].

- The heat trigger is conditional. The PAGASA heat-index JSON has one NCR station, Science Garden in Quezon City.
- The rain trigger is conditional. PAGASA NCR thunderstorm advisories name cities for the next 2 hours.
- Street flood status has no usable source. NOAH serves static hazard layers, and MMDA blocks automated access.

So v1 lets the user pick the mode. The app suggests a mode from two signals.

- Open-Meteo hourly feels-like temperature for Makati.
- The PAGASA NCR thunderstorm advisory text, matched by city name, with its issue time.

Flood flags show history only. Seed them from the 17 August 2026 Makati records in `rainbank-ph` [00]. Label them "flooded here before". This follows the flood-status-ph rule, "A high river does not prove the condition of a named street."

Check Open-Meteo and RainViewer terms against the actual operator, funding and use [07]. A free price alone does not show non-commercial eligibility. Keep the source terms and any needed permission before launch.

## The app returns three routes and landmark steps, as Singapore's testers asked

Route output follows these rules.

- Show three routes on one screen, the shortest, the most covered, and the recommended one. Preselect the recommended route.
- Show travel minutes, minutes in sun, detour, percent sheltered and unknown coverage on each route.
- Split "covered" into roof, building shade, and tree shade, so the user sees why a route is cool.

Directions follow these rules [10].

- Give a list of landmark steps with photos, plus a small map for context.
- Give an "I am here" button. GPS fails inside malls and underpasses.
- An example step is "Exit Ayala MRT, take the stairs to the elevated walkway toward SM Makati."

Segment flags follow these rules [10].

- For opening hours, show "Closes at 10 PM". Warn 30 minutes before close. Drop the passage after close.
- For unknown hours on controlled passages, show "Hours not confirmed". Exclude these passages from public recommendations until a survey checks access. Treat closure as an access constraint before shade scoring.
- For stairs, flag footbridges and steps. A step-free profile avoids them.
- At night, flag underpasses and dim passages after dark.

The interface follows these rules.

- Ship a mobile web page first. Android made up 86.53% of Philippine mobile web traffic in September 2026 [10].
- Write the interface in English with short Taglish helper strings. Test both with five Manila walkers [10].
- Let the user pick "now" or a later hour, because shade depends on the hour.
- Show the data date on every route card.

## Desktop A* benchmarks support a browser prototype, with corrected-graph and phone checks pending

The proposed build precomputes shade for every edge and time bucket. Browser routing can keep explicit origin and destination values local. Hosting, tile, geocoding and weather services can still receive IP addresses, map extents or queries. Check actual requests and retention before making a privacy claim [05, 08].

The corrected centroid-based candidate graph has 2,276 nodes, 2,931 undirected edges and 91.7 km in Makati. NCR has 139,449 nodes, 176,586 undirected edges and 9,154.8 km. Makati has 833 edges needing access evaluation. NCR has 19,172. These outputs keep rule text and declare `routing_ready: false`. They do not include schedule evaluation.

This historical benchmark ran on the original access-blind graph, an Apple M5 and synthetic shade, with 100 random pairs per run [05]. Nobody reproduced these figures on the corrected graph.

| Measure | Makati CBD | Metro Manila |
| --- | --- | --- |
| Nodes / undirected edges | 2,734 / 3,578 | 222,401 / 281,696 |
| Historical candidate length | 115.1 km | 13,770 km |
| Browser-style A*, three routes, p50 | 0.16 to 0.25 ms | 0.40 to 0.63 ms |
| Browser-style A*, three routes, p95 | 0.61 to 1.29 ms | 1.92 to 2.92 ms |
| Python igraph on a server, p50 | 1.1 to 1.7 ms | 35.4 to 44.3 ms |
| Graph file without shade, brotli | 36.5 KB | 3.27 MB |
| Shade, 24 half-hours, one season, 4-bit, brotli | 18.9 KB | 1.00 MB |

Five notes apply to the measurements.

- The shade sizes use a stand-in shade field. Real shade compresses differently.
- Node.js ran the browser benchmark. A mid-range Android phone runs slower, and nobody measured it yet.
- The graph builds from the shared NCR extract in 10.4 s, with 425 MB peak memory.
- The 500,000-edge estimate lacks a consistent directed or undirected unit. Withdraw the 44% reduction claim.
- No benchmark of GraphHopper, OSRM, Valhalla, or pgRouting ran. Java was not installed.

### Proposed route cutoffs need user tests and absolute exposure comparisons

Each route minimises cost = length x (1 + k x sun exposure) [04, 05].

Apply legal access, closures and route-profile constraints first. Keep costs nonnegative. Report absolute minutes in sun. A 10-minute walk at 50% shade gives 5 minutes in sun. A 30-minute walk at 80% shade gives 6. The detour and reduction thresholds below are proposed choices.

Check frozen-bucket searches against a reference solver, and check the state model for arrival-time scoring.

- The shortest route uses k = 0.
- The most covered route uses k = 8, lowered while the detour exceeds 50%.
- The recommended route starts at k = 2. Lower k until the detour is 20% or less.
- Show the recommended route only if it cuts sun exposure by at least 15%. Otherwise say "No meaningfully shadier route."

On 20 historical Makati pairs at 08:30, the synthetic shade experiment gave a recommended route for 14 pairs. Its noon result cannot check real noon geometry. Repeat this experiment on the corrected graph and actual shade before drawing product conclusions [05].

The original shelter-weight experiment reported shares of 4.8%, 13.3% and 18.0% [05]. Restricted paths and unconfirmed hours prevent treating them as available public routes. Repeat it after access and field validation.

### Shade comes from a raster ray march per time bucket

The build has six steps [04].

1. Burn outlines and building parts into a 1 m surface using each part's geometry. A 1 m output does not increase the source height resolution.
2. Take the canopy surface from the leaves-ph raster, with roof pixels set to 0.
3. Compute sun position per bucket with pvlib (`nrel_numba`).
4. Ray-march shadows per bucket. Derive the obstacle margin from height and lowest supported sun elevation. A 200 m obstacle at 15 degrees needs about 746 m. Keep building and tree shade separate.
5. Sample each edge every 5 m at the sidewalk offset, on both sides of the street.
6. Store one 4-bit value per edge per bucket, per month.

Structures need their own shade rules, because a ground raster scores them wrong.

- For roofed, tunnel, and indoor edges, set shade from the cover flag and skip the raster.
- For footbridges without a roof, sample the raster at deck height instead of street level.
- For building passages, do not sample inside the burned footprint. Use the cover flag.
- For sidewalks on two sides, make each sidewalk its own edge, joined by crossing links. One edge value cannot hold two sides.

The area edges follow three rules.

- Build the walk graph 500 m past the pilot box. Ayala MRT sits only about 90 to 170 m inside the south edge.
- Load buildings out to the shadow margin from step 4.
- If a start or end point falls outside the pilot area, say so and offer the shortest route only.

Buckets are 30 minutes from 06:30 to 08:30 and from 15:30 to 17:30, and hourly between. Shade changes fastest at those hours. A 20 m building shadow shrinks 31 m between 07:00 and 07:30 on 20 March [05].

Compute time for Makati CBD is a few minutes. For all of NCR, report 04 estimates 2 to 10 hours on 8 cores. Nobody timed either yet [04].

### The v1 stack has six parts, and two small jobs run outside the browser

1. Pyosmium reads the Geofabrik extract to build the graph. CI rebuilds it each week.
2. The pipeline precomputes shade per edge and bucket and ships it as 4-bit arrays per month. Recompute it only when heights or edge geometry change.
3. The router is a custom A* in TypeScript, in the browser.
4. The map uses MapLibre GL JS with PMTiles, a walk overlay from tippecanoe, and a self-hosted Protomaps basemap.
5. The host is static files on GitHub Pages or Cloudflare Pages.
6. A scheduled job writes the PAGASA advisory and the Open-Meteo hour as one JSON file. A form service takes closure reports.

The browser cannot read the PAGASA advisory directly, because the text sits inside an HTML page on another site [07]. The scheduled job solves that. The report form stores the segment id and the message only, with no location trace.

Report 05 models zero hosting charges for selected static plans at 1,000 and 50,000 queries. It excludes basemap traffic and is not a live bill. Its 705 KB empty-cache load uses the old graph and synthetic shade. Measure the complete load and recheck current limits before choosing hosting.

To scale to Metro Manila, split the graph and shade into tiles. Each query fetches the tiles around its trip, about 71 to 179 KB at p95. The whole NCR graph at 4.3 MB per load breaks the GitHub Pages bandwidth limit at 50,000 loads a month [05].

### Missing mall hours and missing ramp data block the access features

- OSM has only 2 walkable ways with `opening_hours` in Makati CBD. Mall hours need the hand-built table [05].
- 14 of 20 shortest Makati routes use steps, and 2 of 20 pairs have no step-free route. A wheelchair profile needs field data on ramps and lifts first [05].

## The build reuses six sibling projects

| Sibling | What it gives | Source |
| --- | --- | --- |
| leaves-ph | 1 m canopy height raster for NCR, 242,810 tree crowns, Earth Engine init pattern | [00] |
| flood-status-ph | The rule against street flood claims, and a PAGASA river-level reader | [00] |
| rainbank-ph | 17 August 2026 Makati flood depths and 43 road observations | [00] |
| ph-civic-data-mcp | PAGASA forecast and alert tools, NASA POWER, Open-Meteo air quality | [00] |
| solar-map-ph | A CI gate that blocks private building data from release | [00] |
| landas-ph | A Next.js and Vercel stack with a Playwright demo recorder (`pnpm demo:record`) | local README |

## Licensing and privacy obligations need launch checks

Report 08 leaves legal questions open for a lawyer or the relevant agency.

1. Show "© OpenStreetMap contributors" on the map at all times, linked to the OSM copyright page.
2. Treat the cover-annotated graph as an ODbL Derivative Database. Publish it as a download with each release.
3. Credit Meta and WRI (with the Maxar line), Google Open Buildings, and each weather source.
4. Never trace, score, or store data from Google Street View or Google Maps.
5. Keep Mapillary out of the live router. Use it by eye for OSM edits only.
6. Check agency permissions and provider terms for the intended operator and funding. A free price alone does not settle them.
7. Minimise origin, destination and IP retention across the app and its providers. Check the request inventory and hosting settings. Ask for location only when the user taps.
8. Accept no photos in v1. Add the footer "Independent project. Not affiliated with any government agency."

Ask a lawyer about the ODbL status of a separate crowd-report table and NPC registration [08]. Ask PAGASA about permission to show its advisories.

## Start partner work with one email to MaCEA

| Rank | Organisation | What it holds | Public contact | Source |
| --- | --- | --- | --- | --- |
| 1 | MaCEA | Makati CBD elevated walks, covered walks, underpasses | `macea@macea.com.ph` | [11] |
| 2 | OSM Philippines, UPRI YouthMappers | Mappers who can close gaps | `talk-ph@openstreetmap.org` | [11] |
| 3 | Singapore Undercover team (OGP) | Lessons from both versions | `undercover@open.gov.sg` | [11] |
| 4 | MMDA | Footbridge list (107 in 2017, [UNVERIFIED]) | MMDA page on foi.gov.ph | [11] |
| 5 | Makati City Government | Sidewalk and underpass records | makati.gov.ph/contact-us | [11] |

No outreach happened in this research. The owner decides when to send each message.

## The roadmap moves in four steps, each with a gate

Step 0 is a desk build in Makati CBD with no field work.

- Build the walk graph, the height layer, the building and tree shadow rasters, and the edge scores.
- Use OSM shelter tags as they stand.
- Run 20 origin and destination pairs and record shortest, most covered, and recommended routes.
- The gate is to pass the [14 access and exposure cases](acceptance-cases.md). Apply original access rules before routing. Compare with a reference solver and measure on target phones. If the data cannot justify a route, return no supported route.

Step 1 is a field sprint of two to five Saturdays.

- Walk every covered, elevated, and underground segment in the CBD box. Tag it and photograph it.
- Build the hours table.
- Run the 10-point sun check with 5 predicted-shade and 5 predicted-sun points, sky photos and an infrared thermometer [09].
- Treat the 10-point check as a development exercise. The gate is to audit route continuity, entrances, legal crossings, hours, stairs and lift status. Check shade on routes not used in development. Cover morning, noon and afternoon, clear and overcast conditions, street directions and source-confidence levels. Record errors and unsupported cases separately.

Step 2 is the public v1 for Makati CBD.

- Publish the web app, the ODbL graph download, and the method page.
- Test with five Manila walkers before launch.
- The gate is that the five testers can follow the landmark steps without help.

Step 3 is growth.

- Add Ortigas next. It has the best OSM cover tags today [03].
- Then BGC, which has the most separate sidewalks [01].
- Building and tree shade can cover all of Metro Manila before shelter does. Shelter grows one walked district at a time.

## Seven risks have a planned response

| Risk | Response |
| --- | --- |
| Google ships shade routing | Compete on shelter, opening hours, stairs, and Taglish landmark steps [10] |
| Malls change hours or close links | Show hours confidence and a button to report a closed passage |
| Modelled shade is wrong | Label Google heights as modelled, run the sun check, and show data dates |
| Night routes through underpasses feel unsafe | Add a night flag and an option to avoid underpasses after dark |
| A user trusts a flood flag as live | Show flood flags as history only, with the date |
| One person cannot keep data fresh | Rebuild the graph weekly in CI and diff the shelter overlay |
| Licence breach | Publish the ODbL graph, retain source attribution and distinguish open Google Open Buildings data from restricted Maps and Street View inputs |

## The first public post waits for the pilot's own numbers after the field sprint

There are three candidates, each filled only from the tool's own output [10].

1. A route card pair, "The shortest walk from Ayala MRT to Greenbelt is [X]% covered. A [N]% longer walk is [Y]% covered."
2. A labelled geometry illustration comparing heights and offsets, followed by an actual street-shadow comparison after validation.
3. A map of the share of the CBD walk network under cover, block by block, with one headline number.

A sun-geometry illustration can show the model's inputs and limits. Any claim about Makati's actual route shade or covered reach needs real geometry, access checks and field evidence. Keep historical reach figures internal.

## Six decisions are open

1. Choose the pilot, Makati CBD with the one-day test above or Ortigas now. Ortigas has the better footpath and cover data today.
2. Domain. The owner chose the product name undercover.ph on 2026-10-22. The site went live on https://undercover.ph the same day.
3. Whether to email MaCEA and post to OSM Philippines now.
4. Whether to get a free Mapillary token with a personal account, to count street imagery in the pilot [09].
5. Free forever, or a paid tier later. A paid tier changes the weather terms and the RA 8293 position [07, 08].
6. Open data. The design publishes the shelter map through OSM and an ODbL download. Agree to that before you email MaCEA, and ask MaCEA for open-use permission.

## Evidence index

| Report | Finding |
| --- | --- |
| 00-local-assets.md | Sibling projects give canopy, flood, weather, and privacy assets |
| 01-osm-pedestrian-network.md | Original ranking withdrawn. Corrected candidate metrics are in research-corrections.md |
| 02-building-heights.md | OSM plus Google 2.5D gives heights for 96.2% of Makati CBD footprints |
| 03-sheltered-infrastructure.md | OSM marks cover on 4 of 53 Makati footbridge ways |
| 04-shadow-methods.md | Raster ray marching handles buildings and trees together |
| 05-routing-architecture.md | Historical desktop benchmark with synthetic shade. corrected graph and phone checks pending |
| 06-ph-prior-art-demand.md | Bounded search found no comparable PH router. Product demand needs testing |
| 07-weather-feeds.md | No public live street-flood feed exists for Metro Manila |
| 08-licensing-privacy.md | Source obligations and open legal questions. Free pricing gives no blanket clearance |
| 09-ground-truth-collection.md | Field methods with unmeasured effort estimates |
| 10-ux-positioning.md | A landmark-first web page with shelter mode fits Manila |
| 11-partners-data-holders.md | MaCEA is a candidate contact. No ready-to-use public walkway layer was found |
