# OSM shelter tags list covered structures but do not show public access

A correction on 2026-10-21 changes how to read this report. Shelter inventory rows can include restricted structures. The historical 58% to 67% gap estimate does not show a current gap, because the compared sources differ in date, boundary and possible overlap.

`raw/access-correction-20261021/03/covered_reach.json` replaces the reach figures below, which ignored access tags. Its strict graph gives 0.544 km from Ayala node 5397307754 after an unchecked 27.6 m snap. See [the access corrections and limits](../../docs/research-corrections.md).

I ran this report on 2026-10-21. [VERIFIED] means I ran the code or read the source. [UNVERIFIED] means a search snippet or an unchecked claim.

## One Geofabrik extract is the evidence base, counted in pedestrian ways and km

The task is to decide if OpenStreetMap (OSM) cover data is good enough for a sheltered-walking router v1 in six Metro Manila pilot areas. The unit is a pedestrian way and its length in km.

- The source is the Geofabrik Philippines extract `philippines-261020.osm.pbf`. Its MD5 `941dd405ba4f1c028ca874cde38ea200` matches the Geofabrik file [VERIFIED].
- The clip is `raw/shared/ncr.osm.pbf`. The project made it at 2026-10-21T12:44:30Z, and its READY marker exists [VERIFIED].
- I read it with pyosmium 4.3.2 through `scripts/03/extract_ncr.py`. The run kept 244,931 ways and 5,206 tagged nodes from 2,084,361 ways [VERIFIED].
- If any node of a way lies inside a box, the way counts in that box. The report uses the full way length. Overpass uses the same bounding-box rule.
- I did not read relations. So shelter areas and roof areas that exist only as relations are missing. The pedestrian-way counts do not change.
- Category rules come from `overpass_fetch_v2.py` and `union_stats.py`. Pedestrian class means `highway` is `footway`, `pedestrian`, `steps`, `corridor`, or `path`.
- The cover tag set is `covered` in yes, arcade, roof, or `tunnel=building_passage`, or `indoor=corridor`, or `highway=corridor`.
- OSM data is ODbL, so attribution and share-alike apply. The licence report (08) covers these terms.

## The extract reproduces the earlier Overpass Makati numbers exactly

All 11 Makati rows match `summary_v2_makati.csv`. For example, both give 49 ways and 1.477 km with a cover tag, and 53 bridge ways with 2.092 km [VERIFIED]. Because the two sources agree, Overpass did not clip the geometry. So the numbers for other boxes are comparable to the Makati row.

## Ortigas has the most cover tags of the six pilots and Cubao the fewest

Counts are ways. Lengths are km. The full table is `raw/03/summary_v3_all_pilots.csv` [VERIFIED].

| Area | Cover-tagged pedestrian ways | Pedestrian bridges | Bridges with cover tag | Underpasses (no building passages) | Building passage ways | Shelter areas / bus shelters |
|---|---|---|---|---|---|---|
| Makati CBD | 49 / 1.477 | 53 / 2.092 | 4 | 23 / 0.797 | 50 | 7 / 8 |
| BGC | 33 / 1.019 | 28 / 1.051 | 2 | 3 / 0.094 | 7 | 4 / 8 |
| Ortigas | 59 / 2.670 | 55 / 1.787 | 7 | 0 | 28 | 4 / 6 |
| UP Diliman | 31 / 1.215 | 34 / 0.913 | 1 | 0 | 4 | 33 / 38 |
| Manila U-Belt | 49 / 1.132 | 39 / 1.349 | 1 | 19 / 0.334 | 5 | 9 / 11 |
| Cubao | 7 / 0.763 | 29 / 0.534 | 1 | 0 | 44 | 0 / 2 |
| Metro Manila | 1,790 / 61.53 | 2,049 / 56.92 | 287 | 101 / 2.734 | 717 | 524 / 373 |

- The cover-tagged column already includes underpasses of type building passage and the bridges with a cover tag.
- The CSV has more rows for `covered=yes`, `building=roof`, `indoor=corridor`, `highway=corridor`, and `ped+layer`.
- `covered=arcade`, `roof`, or `colonnade` is almost absent. Metro Manila has 36 ways and 1.35 km on pedestrian ways. U-Belt has none.
- No source publishes a total of covered km for any pilot. A tag count shows what OSM maps. It does not show what is missing.

## OSM had 42 to 75 percent less covered walkway in the CBD box than MaCEA's 2019 total, and a wider box closes the gap

MaCEA (Makati Commercial Estate Association, 2019) claims about 4 km of covered walks and about 2 km of elevated walks. An earlier step read the page [VERIFIED as quoted in `web_notes.md`].

- For covered walks, OSM holds 1.477 km in the CBD box. The gap is 1 minus 1.477/4, which is 63 percent. If "about 4 km" means 3.5 to 4.5 km, the gap is 58 to 67 percent [VERIFIED arithmetic].
- For elevated walks, OSM holds 2.092 km of pedestrian bridge geometry. This matches the 2 km claim, so the geometry has no gap.
- But only 4 of those 53 bridge ways (0.121 km, 5.8 percent) carry a cover tag.
- The two claims total 6 km. If every OSM bridge has a roof, OSM shows 1.477 + 1.972 = 3.449 km, a 42 percent gap.
- If only tagged cover counts, OSM shows 1.477 km, a 75 percent gap.
- The result depends on the area. A wider Makati box holds 4.323 km of cover-tagged ways and 4.81 km of bridges [VERIFIED]. Its corners are 14.535, 121.000 and 14.575, 121.045.
- That box is far larger than the MaCEA estate [UNVERIFIED]. With it the covered gap falls to 0 percent.
- MaCEA publishes no boundary and no route list. The gap range is 42 to 75 percent in the CBD box. A wider boundary lowers it.
- So the walkway lines exist in OSM. But the roof attribute is missing for about two thirds of the claimed covered length.

## Five of seven OSM underpass structures match a named Makati underpass, one fits two names, and one has no match

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

- 5 names match with good confidence. One structure fits two names, so at least one Wikipedia underpass is missing or merged. At most 7 of 8 are present (12 percent gap by count).
- TopGear (2025) cites a 2 km underpass network, taken from a Facebook page [UNVERIFIED]. OSM shows 0.797 km, a 60 percent gap on length.
- The two figures disagree. The count gap is small and the length gap is large. The TopGear figure can include mall links. Treat 12 to 60 percent as the range.
- Until someone adds names, a router cannot say "take the Sedeno underpass".
- Wikipedia lists no lengths and no hours.

## Metro Manila has about 1,150 footbridge structures and 14 percent carry a cover tag

- OSM has 2,049 pedestrian bridge ways with 56.9 km. Joined by shared nodes, they form 1,150 structures [VERIFIED].
- 287 ways (14.0 percent) and 157 structures (13.7 percent) carry a cover tag. If you count `bridge=covered` on 27 more ways, the way share rises to at most 15.3 percent.
- Of the 479 structures 30 m or longer, 70 carry a cover tag (14.6 percent).
- Of the 383 structures 20 m or longer near a main road, 39 carry cover (10.2 percent) [VERIFIED].
- MMDA reported 107 footbridges in 2017 and a 125th in 2021 [UNVERIFIED, search-result snippets only]. The pages that hold these figures returned HTTP 403.
- OSM counts exceed the MMDA count. OSM includes mall, MRT, private, city, and canal bridges. The figures are not like for like, so no gap percentage is valid.
- The MMDA list is the missing base count. Someone filed an FOI request for it in 2019 [UNVERIFIED]. The project owner decides on outreach.
- The bridge counts include ways tagged `boardwalk`, `viaduct`, and `low_water_crossing`. A hand filter can remove them.

## OSM has almost no opening hours, so the router needs its own hours table for mall passages

| Area | Indoor or passage ways | With opening_hours | Named mall-link ways | With opening_hours |
|---|---|---|---|---|
| Makati CBD | 78 | 0 | 12 | 0 |
| BGC | 30 | 0 | 1 | 0 |
| Ortigas | 44 | 0 | 11 | 0 |
| UP Diliman | 4 | 0 | 0 | 0 |
| Manila U-Belt | 12 | 0 | 2 | 0 |
| Cubao | 45 | 0 | 0 | 0 |
| Metro Manila | 1,342 | 3 | 184 | 0 |

- Indoor or passage means `tunnel=building_passage`, `indoor` in `corridor` or `yes`, or `highway=corridor`. Mall-link means a name that matches a mall or link word plus a cover, bridge, tunnel, or indoor tag. The name test is rough [VERIFIED code, rough rule].
- Eighteen entrance nodes in Metro Manila carry opening hours. Ortigas has two.
- Mall hours exist on the web. The Ayala Center guide dated 2026-02-24 gives Glorietta hours as Sun to Thu 10:00 to 21:00. It gives Fri to Sat 10:00 to 22:00 [VERIFIED in `web_notes.md`]. The guide warns that hours can change.
- So a v1 must keep its own hours table for each mall passage, because OSM cannot supply one.

## Covered ways near Ayala MRT formed three unjoined OSM pieces up to 0.616 km, and the access-corrected graph gives 0.544 km

I built a graph of all walkable ways in the clip. An edge counts as covered if its way is pedestrian class and carries a cover tag or `tunnel=yes`. I started from covered nodes within 60 m of the two Ayala stop positions [VERIFIED, `scripts/03/analyze2.py`].

- With covered edges only, three separate covered pieces lie near the stops. They measure 0.616, 0.583, and 0.157 km, and they do not join. Together they total 1.356 km. A person on one piece reaches 0.6 km at most.
- From the main platform piece, covered-only walking reaches 0.62 km. If the three pieces counted as one, the upper bound is 1.36 km.
- If the walk allows up to 200 m of uncovered walking, reach stays 1.356 km. It grows to 1.52 km at 400 m and 2.06 km at 800 m.
- As an upper bound, if every pedestrian bridge counts as roofed, reach is 1.49 km with no gap. It is 4.05 km at 800 m of uncovered walking.
- Across the Makati box, strict covered ways form 17 separate pieces with 2.64 km total. The largest piece holds 23 percent. Eight pieces are shorter than 100 m.
- Each break is a place where OSM has no shared node between one covered way and the next. Some breaks are real and some are gaps in OSM. This test cannot tell them apart.
- The MRT station concourse is not in the node set I read. The station link can exist as a building polygon. Check it by hand.
- An earlier draft that allowed road tunnels as covered gave 0.6 to 2.1 km. I dropped that rule because road tunnels carry cars.

## Five of six shelter types need hand-built data, and jeepney and bus sheds use OSM points as waiting spots

| Type | What OSM holds | How a router can model it |
|---|---|---|
| Mall interiors | `highway=corridor` and `indoor` ways, no hours | Cover edges with a time window from a hand hours table. Close the edge outside the window. |
| Building awnings and canopies on sidewalks | Almost none. Sidewalks lack cover tags or partial cover | Add a covered fraction per sidewalk edge from a field survey or street imagery. |
| Arcades on old Manila streets | `covered=arcade` has 36 ways in the city and none in U-Belt | Hand-map the arcade as `covered=arcade`. Treat as full cover at low weight. |
| Jeepney and bus sheds | 524 shelter areas and 373 bus stop shelters as points | Use as waiting points. Allow a rain stop on a route. Do not use as walk edges. |
| Partly roofed footbridges and stairs | A boolean `covered` tag, 14 percent of bridges | Add a custom partial-roof value. Give stairs with no roof zero cover. |
| MRT and LRT stations and concourses | Station nodes. Few interior ways | Model fare gate hours. MRT-3 hours differ between sources [UNVERIFIED]. |

Report 04 covers tree shade as a shade case. This report covers shelter only.

## Only Ortigas is provisionally ready for a limited v1, after a spot check, bridge cover tags, and mall hours

The verdict uses tag density, bridge cover share, and fragmentation. No pilot has a total for covered km to compare against. So "yes" means usable for a limited v1. It does not mean complete.

| Pilot | v1 ready? | What to map by hand |
|---|---|---|
| Makati CBD | No | Cover on 49 bridge ways (about 2 km). Names on 7 underpasses. Missing links between 17 covered pieces. Mall hours. |
| BGC | No | Cover state of 28 bridge ways. Shop-front canopies. No benchmark exists to size the gap. |
| Ortigas | Yes, provisional | Spot check 20 percent of 59 cover-tagged ways. Add cover to 48 bridge ways with no tag. Mall hours. |
| UP Diliman | No | Covered campus walks beyond 31 tagged ways. Shelters exist as 33 areas and 38 bus stops. |
| Manila U-Belt | No | Arcades, Lagusnilad area awnings, and cover on 38 bridges with no tag. Underpasses carry names, which helps. |
| Cubao | No | Only 7 cover-tagged ways. Mall passages are tagged as building passage but cover is unproven. |

## The smallest next step is a field check of 20 Ortigas ways and 20 Makati bridge ways

- I have no figure for four base counts. These are km of cover per pilot, the MMDA footbridge list, the MaCEA boundary and route list, and mall hours. Each one blocks a percentage claim.
- Check 20 random Ortigas ways and 20 Makati bridge ways in the field or in imagery. Compare each tag with what is on the ground.
- For imagery, the KartaView call returned "Restricted access!" and Mapillary needs a token. Report 09 covers ground truth collection.
- The output files are `raw/03/summary_v3_all_pilots.csv`, `raw/03/opening_hours_counts.json`, `raw/03/footbridge_summary.json`, `raw/03/makati_underpass_structures.json`, `raw/03/covered_reach.json`, and `raw/03/analyze2_out.txt`. The scripts are `scripts/03/extract_ncr.py`, `analyze.py`, and `analyze2.py`.
- `covered_reach.json` holds the first draft, which counted road tunnels. Use `analyze2_out.txt` for reach numbers.
