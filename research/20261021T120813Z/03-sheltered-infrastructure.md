# OSM shelter tags inventory structures but do not establish public access

Correction, 2026-10-21: shelter inventory rows can include restricted structures. The historical 58% to 67% gap estimate cannot establish a current gap because the compared sources differ in date, boundary and possible overlap. Access-blind reach figures below are superseded by `raw/access-correction-20261021/03/covered_reach.json`. Its strict graph gives 0.544 km from Ayala node 5397307754 after an unverified 27.6 m snap. See [the access corrections and limits](../../docs/research-corrections.md).

Run date: 2026-10-21. Labels: [VERIFIED] means I ran the code or read the source. [UNVERIFIED] means a search snippet or an unchecked claim.

## Requested use and evidence base

Use: decide if OpenStreetMap (OSM) cover data can drive a sheltered-walking router v1 in six Metro Manila pilot areas. The unit is a pedestrian way and its length in km.

- Source: Geofabrik Philippines extract `philippines-261020.osm.pbf`, MD5 `941dd405ba4f1c028ca874cde38ea200` matches the Geofabrik file [VERIFIED].
- Clip: `raw/shared/ncr.osm.pbf`, made on the project side at 2026-10-21T12:44:30Z. The READY marker exists [VERIFIED].
- Reader: pyosmium 4.3.2 through `scripts/03/extract_ncr.py`. The run kept 244,931 ways and 5,206 tagged nodes from 2,084,361 ways [VERIFIED].
- Way rule: a way counts in a box if any node lies inside. The report uses the full way length. This is the Overpass bbox rule.
- Relations are not read. Shelter areas and roof areas that exist only as relations are missing. This does not change the pedestrian-way counts.
- Category rules come from `overpass_fetch_v2.py` and `union_stats.py`. Pedestrian class means `highway` is footway, pedestrian, steps, corridor, or path.
- The cover tag set is `covered` in yes, arcade, roof, or `tunnel=building_passage`, or `indoor=corridor`, or `highway=corridor`.
- Rights: OSM data is ODbL. Attribution and share-alike apply. The licence report (08) covers this.

## The extract reproduces the earlier Overpass Makati numbers exactly

All 11 Makati rows match `summary_v2_makati.csv`. Example: 49 ways and 1.477 km with a cover tag, and 53 bridge ways with 2.092 km [VERIFIED]. The two sources agree, so the Overpass geometry was not clipped. The numbers for other boxes are comparable to the Makati row.

## Per-pilot table: Ortigas has the most cover tags and Cubao the fewest

Counts are ways. Lengths are km. Full table: `raw/03/summary_v3_all_pilots.csv` [VERIFIED].

| Area | Cover-tagged ped ways | Ped bridges | Bridges with cover tag | Underpass (excl. building passage) | Building passage ways | Shelter areas / bus shelters |
|---|---|---|---|---|---|---|
| Makati CBD | 49 / 1.477 | 53 / 2.092 | 4 | 23 / 0.797 | 50 | 7 / 8 |
| BGC | 33 / 1.019 | 28 / 1.051 | 2 | 3 / 0.094 | 7 | 4 / 8 |
| Ortigas | 59 / 2.670 | 55 / 1.787 | 7 | 0 | 28 | 4 / 6 |
| UP Diliman | 31 / 1.215 | 34 / 0.913 | 1 | 0 | 4 | 33 / 38 |
| Manila U-Belt | 49 / 1.132 | 39 / 1.349 | 1 | 19 / 0.334 | 5 | 9 / 11 |
| Cubao | 7 / 0.763 | 29 / 0.534 | 1 | 0 | 44 | 0 / 2 |
| Metro Manila | 1,790 / 61.53 | 2,049 / 56.92 | 287 | 101 / 2.734 | 717 | 524 / 373 |

- The cover-tagged column already includes underpasses of type building passage and the bridges with a cover tag.
- Other rows exist in the CSV: `covered=yes`, `building=roof`, `indoor=corridor`, `highway=corridor`, and `ped+layer`.
- `covered=arcade`, `roof`, or `colonnade` is almost absent. Metro Manila has 36 ways and 1.35 km on pedestrian ways. U-Belt has none.
- No pilot has a published denominator for total covered km. A tag count shows what is mapped. It does not show what is missing.

## The Makati gap is 42 to 75 percent, and the area definition drives the range

MaCEA (2019) claims about 4 km of covered walks and about 2 km of elevated walks. The page was read earlier [VERIFIED as quoted in `web_notes.md`].

- Covered walks: OSM holds 1.477 km in the CBD box. The gap is 1 - 1.477/4 = 63 percent. If "about 4 km" means 3.5 to 4.5 km, the gap is 58 to 67 percent [VERIFIED arithmetic].
- Elevated walks: OSM holds 2.092 km of pedestrian bridge geometry. This matches the 2 km claim. Geometry gap: none.
- Cover state of those bridges is the problem. Only 4 of 53 ways (0.121 km, 5.8 percent) carry a cover tag.
- Combined claim is 6 km. If every OSM bridge is roofed, OSM shows 1.477 + 1.972 = 3.449 km, a 42 percent gap.
- If only tagged cover counts, OSM shows 1.477 km, a 75 percent gap.
- The area differs. A wider Makati box holds 4.323 km of cover-tagged ways and 4.81 km of bridges [VERIFIED]. Its corners are 14.535, 121.000 and 14.575, 121.045.
- That box is far larger than the MaCEA estate [UNVERIFIED]. With it the covered gap falls to 0 percent.
- MaCEA publishes no boundary and no route list. The gap range is 42 to 75 percent in the CBD box. A wider boundary lowers it.
- Verdict on the gap: the walkway lines exist in OSM. The roof attribute is missing for about two thirds of the claimed covered length.

## Seven underpass structures match five of the eight named Makati underpasses

Wikipedia names eight underpasses [VERIFIED, page read on 2026-10-21, copy in `raw/03/web_fetch/makati_underpasses_wikipedia.txt`]. OSM holds 23 pedestrian tunnel ways. They join into 7 structures with 797 m total [VERIFIED]. None carries a `name` tag. I matched by the names of roads within 35 m.

| OSM structure (length) | Roads nearby | Wikipedia name |
|---|---|---|
| 160 m | Ayala Ave, H.V. dela Costa, Salcedo St | Salcedo |
| 158 m | Ayala Ave, Makati Ave, Legazpi St | Legazpi or Makati Ave (one of the two) |
| 127 m | Ayala Ave, Paseo de Roxas | Paseo de Roxas |
| 110 m | Paseo de Roxas, Villar St | Paseo-Villar (way IDs are new, fits 2019-2021) |
| 93 m | Ayala Ave, Parkway Drive | No match. Possibly Apartment Ridge [UNVERIFIED] |
| 91 m | Ayala Ave, V.A. Rufino St | V.A. Rufino |
| 58 m | Paseo de Roxas, Sedeno St | Sedeno |

- Result: 5 names match with good confidence. One structure serves two names, so at least one Wikipedia underpass is missing or merged. At most 7 of 8 are present (12 percent gap by count).
- Length gap: TopGear (2025) cites a 2 km underpass network, taken from a Facebook page [UNVERIFIED]. OSM shows 0.797 km, a 60 percent gap on length.
- The two figures disagree in kind. Count gap is small. Length gap is large. The TopGear figure may include mall links. Treat 12 to 60 percent as the range.
- Lack of names matters. A router cannot say "take the Sedeno underpass" until someone adds names.
- Wikipedia lists no lengths and no hours.

## Metro Manila has about 1,150 footbridge structures and 14 percent carry a cover tag

- OSM has 2,049 pedestrian bridge ways with 56.9 km. Connected by shared nodes, they form 1,150 structures [VERIFIED].
- Cover tag share: 287 ways (14.0 percent) and 157 structures (13.7 percent). `bridge=covered` on 27 more ways would raise the way share to at most 15.3 percent.
- Bridges of 30 m or more: 479 structures, 70 with a cover tag (14.6 percent).
- Bridges of 20 m or more near a main road: 383 structures, 39 with cover (10.2 percent) [VERIFIED].
- MMDA reported 107 footbridges in 2017 and a 125th in 2021 [UNVERIFIED, search-result snippets only]. The pages that hold these figures returned HTTP 403.
- OSM counts exceed the MMDA count. OSM includes mall, MRT, private, city, and canal bridges. The figures are not like for like, so no gap percentage is valid.
- The MMDA list is the missing denominator. An FOI request for it was filed in 2019 [UNVERIFIED]. The project owner decides on outreach.
- Bridge values also include boardwalk, viaduct, and low_water_crossing. A hand filter would remove them.

## Opening hours are almost absent, so night routing through malls is unsafe

| Area | Indoor or passage ways | With opening_hours | Named mall-link ways | With opening_hours |
|---|---|---|---|---|
| Makati CBD | 78 | 0 | 12 | 0 |
| BGC | 30 | 0 | 1 | 0 |
| Ortigas | 44 | 0 | 11 | 0 |
| UP Diliman | 4 | 0 | 0 | 0 |
| Manila U-Belt | 12 | 0 | 2 | 0 |
| Cubao | 45 | 0 | 0 | 0 |
| Metro Manila | 1,342 | 3 | 184 | 0 |

- Indoor or passage means `tunnel=building_passage`, `indoor` in corridor or yes, or `highway=corridor`. Mall-link means a name that matches a mall or link word plus a cover, bridge, tunnel, or indoor tag. The name test is rough [VERIFIED code, rough rule].
- Eighteen entrance nodes in Metro Manila carry opening hours. Ortigas has two.
- Mall hours exist on the web. The Ayala Center guide dated 2026-02-24 gives Glorietta hours as Sun to Thu 10:00 to 21:00. It gives Fri to Sat 10:00 to 22:00 [VERIFIED in `web_notes.md`]. The guide warns hours may change.
- Effect: a v1 must keep its own hours table for each mall passage. OSM cannot supply one.

## Covered ways near Ayala MRT link into only 0.6 km pieces, so fragmentation is severe

Method: a graph of all walkable ways in the clip. Edges count as covered if the way is pedestrian class and carries a cover tag or `tunnel=yes`. I started from covered nodes within 60 m of the two Ayala stop positions [VERIFIED, `scripts/03/analyze2.py`].

- Strict covered-only reach: three separate covered pieces lie near the stops. They measure 0.616, 0.583, and 0.157 km. They do not join. Together 1.356 km. A person on one piece reaches 0.6 km at most.
- Headline number: 0.62 km of covered-only walking from the main platform piece. The upper bound is 1.36 km if the three pieces counted as one.
- Allow an uncovered gap: reach stays 1.356 km up to 200 m of uncovered walking. It grows to 1.52 km at 400 m and 2.06 km at 800 m.
- Upper bound: if every pedestrian bridge counts as roofed, reach is 1.49 km with no gap. It is 4.05 km at 800 m of uncovered walking.
- Makati box: strict covered ways form 17 separate pieces with 2.64 km total. The largest piece holds 23 percent. Eight pieces are shorter than 100 m.
- Cause: OSM shows no shared node where a covered way meets the next one. Some breaks are real. Some are mapping gaps. This test cannot tell them apart.
- Limit: the MRT station concourse is not in the node set I read. The station link may exist as a building polygon. A hand check is needed.
- An earlier draft that allowed road tunnels as covered gave 0.6 to 2.1 km. I dropped that rule because road tunnels carry cars.

## OSM cannot show six shelter types well

| Type | What OSM holds | How a router can model it |
|---|---|---|
| Mall interiors | `highway=corridor` and `indoor` ways, no hours | Cover edges with a time window from a hand hours table. Close the edge outside the window. |
| Building awnings and canopies on sidewalks | Almost none. Sidewalks lack cover tags or partial cover | Add a covered fraction per sidewalk edge from a field survey or street imagery. |
| Arcades on old Manila streets | `covered=arcade` has 36 ways in the city and none in U-Belt | Hand-map the arcade as `covered=arcade`. Treat as full cover at low weight. |
| Jeepney and bus sheds | 524 shelter areas and 373 bus stop shelters as points | Use as waiting points. Allow a rain stop on a route. Do not use as walk edges. |
| Partly roofed footbridges and stairs | A boolean `covered` tag, 14 percent of bridges | Add a custom partial-roof value. Give stairs with no roof zero cover. |
| MRT and LRT stations and concourses | Station nodes. Few interior ways | Model fare gate hours. MRT-3 hours differ between sources [UNVERIFIED]. |

Tree shade is a shade case, not a shelter case. Report 04 covers it.

## Verdict per pilot: yes for Ortigas only, and only with a spot check

Basis: tag density, bridge cover share, and fragmentation. No pilot has a denominator for total covered km, so "yes" means usable for a limited v1, not complete.

| Pilot | v1 ready? | What to map by hand |
|---|---|---|
| Makati CBD | No | Cover on 49 bridge ways (about 2 km). Names on 7 underpasses. Missing links between 17 covered pieces. Mall hours. |
| BGC | No | Cover state of 28 bridge ways. Shop-front canopies. No benchmark exists to size the gap. |
| Ortigas | Yes, provisional | Spot check 20 percent of 59 cover-tagged ways. Add cover to 48 bridge ways with no tag. Mall hours. |
| UP Diliman | No | Covered campus walks beyond 31 tagged ways. Shelters exist as 33 areas and 38 bus stops. |
| Manila U-Belt | No | Arcades, Lagusnilad area awnings, and cover on 38 bridges with no tag. Underpasses carry names, which helps. |
| Cubao | No | Only 7 cover-tagged ways. Mall passages are tagged as building passage but cover is unproven. |

## Open evidence and the smallest next step

- Missing denominators: covered km per pilot, MMDA footbridge list, MaCEA boundary and route list, mall hours. Each blocks a percentage claim.
- Smallest next step: check 20 random Ortigas ways and 20 Makati bridge ways in the field or in imagery. Compare each tag with reality.
- Imagery: the KartaView call returned "Restricted access!" and Mapillary needs a token. Report 09 covers ground truth.
- Files: `raw/03/summary_v3_all_pilots.csv`, `raw/03/opening_hours_counts.json`, `raw/03/footbridge_summary.json`, `raw/03/makati_underpass_structures.json`, `raw/03/covered_reach.json`, `raw/03/analyze2_out.txt`. Scripts: `scripts/03/extract_ncr.py`, `analyze.py`, `analyze2.py`.
- Note: `covered_reach.json` holds the first draft with road tunnels counted. Use `analyze2_out.txt` for reach numbers.
