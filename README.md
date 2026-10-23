# undercover.ph

[![CI](https://github.com/xmpuspus/undercover-ph/actions/workflows/ci.yml/badge.svg)](https://github.com/xmpuspus/undercover-ph/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Data: ODbL](https://img.shields.io/badge/data-ODbL%201.0-blue.svg)](LICENSE)
[![Status: prototype](https://img.shields.io/badge/status-prototype-orange.svg)](#known-limits-and-the-work-still-to-do)

> Walking routes in 67 busy city centres across the Philippines, 14 of them in Metro Manila, that keep you in the shade on sunny days, or under a roof when it rains. A Philippine take on Singapore's [Undercover](https://undercover.gov.sg/) prototype, built on open data. Every route runs in your browser, so no server that this project runs sees where you start or where you go.

[![A screen recording of undercover.ph with a caption for each step. Shaded is picked, Greenbelt is typed as the destination and Ayala MRT Station as the start, and the time is set to tomorrow at 3 PM. Two routes show on the 3D map with their shaded share. The cover bar, the play button with moving shadows, the step list, Navigate and the Sheltered mode follow. The map then zooms out to the area outlines across Metro Manila](docs/demo/walkthrough.gif)](docs/demo/walkthrough.mp4)

<sub>Real recording of the app, played 1.5 times faster. The [75-second video at 1080p](docs/demo/walkthrough.mp4) plays in real time, and a [4:5 cut of the phone layout](docs/demo/walkthrough-tall.mp4) shows the same steps on a phone. It plans a walk from Ayala MRT Station to Greenbelt for tomorrow at 3 PM. The recommended walk is 88% shaded with 2.6 minutes in sun, and the shortest walk is 72% shaded. In Sheltered mode the app picks a walk that is 25% under a roof.</sub>

Try it at **[undercover.ph](https://undercover.ph)**. Pick Shaded or Sheltered, choose where you start and where you go, and pick the half hour you leave.

The app covers 67 walking areas. 14 are in Metro Manila, from Caloocan to Alabang. 53 are in 44 other regions, from Laoag to General Santos. Each area is a downtown, business district, university belt or transit hub, and none is a whole city. A trip that starts or ends outside every area gets no route. The numbers below come from the committed data. `pipeline/tools/coverage_table.py` writes this table.

<!-- coverage:start -->
| Area | Cities | Walkable km in routes | Places | Buildings | Buildings mapped |
| --- | --- | ---: | ---: | ---: | ---: |
| Makati, BGC, Ortigas and Shaw | Makati, Mandaluyong, Pasig, Quezon City, San Juan, Taguig | 1,325 | 4,130 | 205,728 | 75% |
| Bay Area and Mall of Asia | Pasay | 250 | 524 | 30,516 | 75% |
| Cubao and Eastwood | Quezon City | 314 | 813 | 69,286 | 76% |
| North Avenue, Quezon Memorial Circle and UP Diliman | Quezon City | 501 | 1,474 | 101,426 | 74% |
| Intramuros, Ermita, Binondo and University Belt | Manila | 806 | 3,241 | 108,909 | 78% |
| Alabang and Filinvest City | Muntinlupa | 260 | 481 | 36,018 | 68% |
| Caloocan, Malabon, Navotas and Valenzuela | Caloocan, Malabon, Navotas, Valenzuela | 853 | 1,470 | 170,739 | 70% |
| Marikina Centre and Riverbanks | Marikina | 386 | 819 | 95,751 | 69% |
| Aseana, PITX and NAIA | Paranaque, Pasay | 315 | 405 | 42,153 | 73% |
| Las Pinas and Alabang-Zapote Road | Las Pinas | 274 | 515 | 71,499 | 69% |
| BF Homes and Aguirre Avenue | Paranaque | 222 | 321 | 50,216 | 64% |
| McKinley Hill, Taguig Centre, Arca South and Pateros | Pateros, Taguig | 733 | 997 | 159,375 | 65% |
| Commonwealth, Fairview and SM Fairview | Quezon City | 498 | 969 | 212,883 | 65% |
| Banawe and Quezon Avenue | Quezon City | 403 | 508 | 67,608 | 72% |
| Cebu City | Cebu City | 598 | 1,887 | 72,155 | 56% |
| Baguio centre | Baguio | 395 | 1,619 | 58,895 | 66% |
| Angeles and Clark centre | Angeles and Clark | 495 | 810 | 105,607 | 71% |
| San Fernando (Pampanga) centre | San Fernando (Pampanga) | 362 | 583 | 58,188 | 72% |
| Olongapo and Subic centre | Olongapo and Subic | 188 | 256 | 23,543 | 66% |
| Malolos centre | Malolos | 215 | 328 | 28,819 | 64% |
| Baliwag centre | Baliwag | 253 | 311 | 20,577 | 47% |
| Tarlac City centre | Tarlac City | 324 | 348 | 38,526 | 62% |
| Balanga centre | Balanga | 264 | 246 | 26,617 | 66% |
| Cabanatuan centre | Cabanatuan | 377 | 440 | 32,821 | 55% |
| Dagupan centre | Dagupan | 119 | 245 | 18,649 | 56% |
| Vigan centre | Vigan | 150 | 265 | 18,000 | 63% |
| Laoag centre | Laoag | 156 | 207 | 16,939 | 51% |
| Tuguegarao centre | Tuguegarao | 219 | 260 | 32,650 | 55% |
| Davao City centre | Davao City | 443 | 1,397 | 61,354 | 62% |
| Digos centre | Digos | 290 | 247 | 22,062 | 42% |
| Tagum centre | Tagum | 405 | 385 | 53,986 | 48% |
| Cagayan de Oro centre | Cagayan de Oro | 353 | 662 | 60,771 | 55% |
| Iligan centre | Iligan | 292 | 389 | 42,003 | 54% |
| Zamboanga City centre | Zamboanga City | 333 | 662 | 57,651 | 58% |
| Pagadian downtown | Pagadian | 154 | 234 | 25,258 | 49% |
| Dipolog downtown | Dipolog | 155 | 314 | 25,004 | 55% |
| General Santos centre | General Santos | 300 | 293 | 46,280 | 53% |
| Koronadal centre | Koronadal | 341 | 325 | 30,165 | 54% |
| Cotabato City centre | Cotabato City | 233 | 308 | 34,974 | 47% |
| Butuan centre | Butuan | 260 | 319 | 29,915 | 52% |
| Surigao downtown | Surigao | 124 | 155 | 13,649 | 41% |
| Mandaue | Mandaue | 312 | 382 | 48,536 | 61% |
| Lapu-Lapu | Lapu-Lapu | 269 | 322 | 49,605 | 51% |
| Iloilo City | Iloilo City | 513 | 1,158 | 52,926 | 63% |
| Bacolod | Bacolod | 418 | 685 | 36,699 | 55% |
| Talisay (Negros Occidental) | Talisay (Negros Occidental) | 157 | 205 | 8,800 | 50% |
| Dumaguete | Dumaguete | 306 | 685 | 30,007 | 58% |
| Tagbilaran | Tagbilaran | 179 | 282 | 17,692 | 48% |
| Tacloban downtown | Tacloban | 149 | 533 | 14,878 | 51% |
| Tacloban university belt | Tacloban | 154 | 205 | 29,518 | 45% |
| Ormoc | Ormoc | 125 | 198 | 13,099 | 42% |
| Roxas City | Roxas City | 188 | 172 | 16,478 | 52% |
| Kalibo | Kalibo | 214 | 235 | 19,854 | 55% |
| Dasmarinas centre | Dasmarinas | 554 | 725 | 104,525 | 63% |
| Tagaytay downtown | Tagaytay | 133 | 145 | 11,465 | 57% |
| Santa Rosa and Biñan centre | Santa Rosa, Biñan | 317 | 410 | 63,958 | 62% |
| Calamba centre | Calamba | 225 | 305 | 30,885 | 57% |
| Los Banos centre | Los Banos | 212 | 580 | 20,883 | 56% |
| San Pablo centre | San Pablo | 232 | 552 | 23,721 | 48% |
| Lipa centre | Lipa | 319 | 423 | 49,386 | 72% |
| Batangas City centre | Batangas City | 269 | 725 | 38,245 | 66% |
| Antipolo centre | Antipolo | 287 | 442 | 46,683 | 63% |
| Lucena centre | Lucena | 284 | 243 | 30,310 | 56% |
| Naga centre | Naga | 352 | 502 | 33,033 | 48% |
| Legazpi centre | Legazpi | 332 | 595 | 36,957 | 55% |
| Calapan downtown | Calapan | 126 | 207 | 12,160 | 60% |
| Puerto Princesa downtown | Puerto Princesa | 108 | 260 | 16,775 | 65% |
| **67 areas** | | **21,674** | **41,338** | **3,334,243** | |
<!-- coverage:end -->

## The sidewalk on the sun's side gets more building shade

The buildings on the sun's side of a street stand between you and the sun, so their shadow falls across their own sidewalk first.

The model shows this across Makati. It compares the two sidewalks of 941 road segments. On 22 October 2026 at 14:00, the sidewalk on the sun's side has more building shade on 435 segments, the far side on 61. On 327 the two sidewalks differ by 5 points or less. The test skips the other 118, where the sun shines within 15 degrees of the street's direction. On the 674 segments where OpenStreetMap maps both sidewalks, the count is 338 to 53.

The season flips which side that is at noon. From 1 May to 14 August the noon sun stands north of Makati, so the north sidewalk of an east-west street is the shady one. The rest of the year it is the south sidewalk. The full analysis is in [docs/sun-direction.md](docs/sun-direction.md).

[![The shadow layer on undercover.ph moving through one day. Building and tree shadows swing from west at 8 AM to east at 4 PM. The sun chip turns and the route updates](docs/demo/sun-direction.gif)](https://undercover.ph)

<sub>Real recording of the shadow layer and the play button in Makati. The map draws its shadows in your browser from building heights and tree crowns. They match the shade model's ground shadows on 92% to 98% of the ground in Makati. Route scores always come from the full shade model.</sub>

## Each route shows its sun minutes, cover, and sidewalk side

Like Singapore's version, the app returns three walks. They are the shortest, the most covered, and a recommended walk that is at most 20% longer than the shortest, with at least 15% less time in sun. The route card and the app add these items.

- **Minutes in sun** next to the share covered. A long walk at 80% shade can expose you longer than a short walk at 50%.
- **The source of the cover**, whether roof, building shade, or tree shade.
- **The sun's direction**, with the model's ground shadows on the map for the half hour you pick.
- **Steps that say which sidewalk to use**, with landmarks, stairs, footbridges, underpasses, and closing times.
- **A night state.** After sunset the app says that shade does not apply.
- **Rain mode**, which counts only roofed, underground, and indoor paths as covered.
- **A step-free choice.** The text is English with Taglish helper text, and every route card shows the data date.

<table>
<tr>
<td width="40%"><a href="https://undercover.ph"><img src="docs/demo/steps-phone.gif" alt="undercover.ph on a phone. The short route card sits under a large map. The step list has sidewalk-side badges, landmarks, and stairs flags. Then the Navigate view shows a turn card"></a></td>
<td width="60%"><a href="https://undercover.ph"><img src="docs/demo/rain.gif" alt="undercover.ph in rain mode. The walk changes to use covered walkways and an underpass. The card switches to the sheltered share"></a></td>
</tr>
<tr>
<td><sub>Steps and Navigate on a phone.</sub></td>
<td><sub>Rain mode prefers roofed, underground, and indoor paths.</sub></td>
</tr>
</table>

## What is in this repo

- `app/` is the web app (Vite, React, TypeScript, MapLibre GL). Its router is in `app/src/lib/router/` and is a custom A* search with access, opening-hours, side-of-street, and night rules. Unit tests cover it.
- `pipeline/` is the data build. `pipeline/districts/` builds each walking area. It reads OpenStreetMap, assigns building heights, builds the walk graph and places, and checks real routes. It fetches weather and the PAGASA advisory as well.
- `pipeline/shade/` is the shade engine. It casts rays toward the sun from every 5 m of every sidewalk, each half hour, for every area.
- `docs/` holds the [method](docs/methodology.md), the [sun-direction analysis](docs/sun-direction.md), the [data contract](docs/data-contract.md), the [design](docs/design.md), and the [research corrections](docs/research-corrections.md).
- `research/` holds the research reports behind the design and a teardown of Singapore's interface.
- `tests/` holds access-policy tests for the walk graph.

## The app does not promise heat safety, flood data, or wheelchair routing

- Shade lowers sun exposure. It does not make a walk safe in extreme heat.
- The app models shade from building heights and tree data. Nobody checked it on the street yet.
- No public source gives live street flooding or closures for Metro Manila, so the app makes no claim about them.
- The step-free choice avoids mapped steps only, and ramps and lifts are not yet mapped well. It is not wheelchair routing advice.
- It is an independent project. No government agency in the Philippines or Singapore runs it.

## Your start and end points stay in your browser

The router runs in your browser. Your start and end points never reach a server that this project controls. The app asks for your location only when you tap "Use my location", and it keeps nothing. The app has no analytics and no trackers.

The page address holds the trip after the # sign, which browsers never send to a server. A reload or a shared link reopens it. A position from "Use my location" never goes into that address. One small server function reads the PAGASA thunderstorm advisory for the app, and the CDN keeps a good answer for 10 minutes and a failed one for 1 minute. It gets no route, place, or location. Map tiles come from OpenFreeMap, which receives the map area you view.

## Run it locally

```bash
git clone --depth 1 https://github.com/xmpuspus/undercover-ph   # --depth 1 skips old copies of the data
cd undercover-ph
python3 pipeline/data_release.py fetch --tiles --app   # map tiles and area graphs, about 180 MB (Python 3.12+)
cd app
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # unit tests: router, search, route card text, sky theme, trip links, advisory
pnpm build          # type check and production build
pnpm e2e            # browser tests on desktop and phone: trip flow, Back, links, Now, phone layout
pnpm demo:record    # re-record the walkthrough MP4, the GIFs and the share images in docs/demo/ from a production build
```

The deployed site rebuilds its shade data every day. The map tiles, each area's walk graph and places, and its shade inputs are not in git. They are in a GitHub release that `pipeline/data-release.json` names, and `pipeline/data_release.py` downloads and checks them. To build the data yourself, see `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

## Each route weighs length against sun exposure from a shade model cast every 30 minutes

1. The walk network is OpenStreetMap footways, paths, and walkable roads, with a separate edge for each sidewalk of larger roads. Paths behind gates or with unchecked access stay out of routes by default.
2. Building heights come from OpenStreetMap first, then Google Open Buildings 2.5D (2023) estimates. In Makati CBD they give a height to 96.2% of buildings, 98.0% by footprint area. Each area's manifest gives its own share.
3. Tree canopy comes from the Meta and WRI canopy height map, about 1 m pixels.
4. Shade is a ray toward the sun from every 5 m of every sidewalk, at 1.5 m high. It runs every 30 minutes from 06:00 to 18:30 for 7 days.
5. Route cost = length x (1 + k x sun exposure). The recommended walk is at most 20% longer than the shortest and has at least 15% less time in sun. If no walk meets both, the app recommends the shortest.
6. A route changes to the other side of a road at a mapped crossing or a traffic signal. At a junction with no mapped crossing it can change, with a penalty and a warning. It never changes mid-block. In the routes for 2,843 place pairs, an earlier side test let 2,623 crossings happen mid-block, 1,473 of them on trunk, primary or secondary roads.

The full method, with its numbers and limits, is in [docs/methodology.md](docs/methodology.md).

## Data products

Each area keeps its files in `app/public/data/areas/<id>/`. Two files cover every area.

| File | What it holds |
| --- | --- |
| `app/public/data/areas.json` | The areas, their cities, and the boxes their walk networks cover |
| `app/public/data/places_index.json` | Every named place of every area, for search |
| `areas/<id>/graph.json` | Walk network, with access, crossing, and cover flags |
| `areas/<id>/places.json` | The area's named places |
| `areas/<id>/hours.json` | Opening-hours rows, each with its source |
| `areas/<id>/shade/<date>.bin` and `shade/lowconf.bin` | Shade per edge, one file per date, generated at build time. The app fetches only the date you pick |
| `areas/<id>/manifest.json` | Dates, sun positions, sources, and every method limit |
| `app/public/data/buildings.pmtiles` and `trees.pmtiles` | Buildings with heights and tree crowns for every area, in map tiles. The 3D map and the browser's shadows read them |

## Known limits and the work still to do

<!-- limits:start -->
- **Cover data.** OpenStreetMap marks few covered walkways. Across all areas the routable graph holds 68.0 km of sheltered path. Nobody has measured how much exists on the street.
- **Access.** Gates and entrances that need a field check remove 592 km of paths from routes.
- **Sidewalks.** Where OpenStreetMap has no sidewalk data, the pipeline assumes one on each side of larger roads. That covers 4,920 km of the 8,016 km of side-of-street paths. A step on an assumed sidewalk carries a "Sidewalk not mapped" badge.
<!-- limits:end -->
- **Heights.** Google's heights stop at 100 m and date from 2023. OpenStreetMap supplies most tower heights.
- **Building outlines.** Only buildings with an outline cast shade. Outlines come from OpenStreetMap and, where it has none, from Google Open Buildings v3. A Google outline goes in only when its confidence reaches Google's 80%-precision cutoff and Google's 2023 height raster also sees a building there. Outlines cover 64% to 78% of Google's building area in Metro Manila areas, and 41% to 72% elsewhere, with a median of 55%. The "Buildings mapped" column gives each area's share.
- **Taglish copy.** A native speaker has not reviewed it yet.
- **Next.** Compare Google's and OpenStreetMap's outlines building by building, for detail and coverage. Then walk the covered networks in the field and check the shade against photos.
- **One walk network per route.** Each area has its own walk network. A trip across the seam of two areas routes in the area whose network holds both ends. Only a start and an end that no single network holds get no route, and the app says so.
- **Map shadows.** The map draws shadows in your browser, each tree as a disc. They can differ from the shade model at tree edges.

## Data sources and licence

Code is MIT. Data built from OpenStreetMap is ODbL 1.0. Other layers keep their own licences. See [LICENSE](LICENSE).

| Source | Used for | Licence |
| --- | --- | --- |
| OpenStreetMap, Geofabrik extract 2026-10-20 | Walk network, places, buildings, opening hours | ODbL 1.0, © OpenStreetMap contributors |
| Google Open Buildings v3 | Building outlines where OSM has none | CC BY 4.0 |
| Google Open Buildings 2.5D Temporal (2023) | Building heights where OSM has none | CC BY 4.0 |
| Meta and WRI High Resolution Canopy Height Maps | Tree shade | CC BY 4.0, imagery © 2016 Maxar |
| Open-Meteo | Hourly weather | CC BY 4.0 |
| PAGASA | Thunderstorm advisories | Philippine government work, credited and linked |
| OpenFreeMap and OpenMapTiles | Basemap | Their terms, © OpenStreetMap contributors |

## Citation

```bibtex
@software{puspus_undercover_ph_2026,
  author = {Puspus, Xavier},
  title  = {undercover.ph: shaded and sheltered walking routes for Philippine cities},
  year   = {2026},
  url    = {https://github.com/xmpuspus/undercover-ph}
}
```

[CITATION.cff](CITATION.cff) holds the same entry.

## Credits

The idea and the three-route design come from [Undercover](https://undercover.gov.sg/), a Hack for Public Good prototype by Open Government Products in Singapore. This project shares no code with it.

## Report a route that is wrong

A route can send you through a closed gate, a passage that does not exist, or a walkway with no roof. If that happens, open an issue with the place and the time. A photo helps. For a security problem, use GitHub's private vulnerability reporting. See [CONTRIBUTING.md](CONTRIBUTING.md).
