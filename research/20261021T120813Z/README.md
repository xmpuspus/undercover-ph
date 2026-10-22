# Research for a Philippine shade and shelter walking router, 2026-10-21

Goal: design a Philippine version of undercover.gov.sg (GovTech OGP, Hack for Public Good 2026). The design that came out of these reports is `docs/design.md`.

## Source pages read

- https://undercover.gov.sg/ (prototype page, shaded or sheltered search)
- https://www.hack.gov.sg/2026/undercover/ (Silverfox engine, data sources, metrics)
- https://www.hack.gov.sg/2025/under-cover/ (Orchard prototype, 30 routes, T3 and Mapbox)

## Reports

| File | Question |
|---|---|
| 00-local-assets.md | Which local files and sibling projects the build can reuse |
| 01-osm-pedestrian-network.md | OSM walk network quality and pilot ranking |
| 02-building-heights.md | Footprints with heights for shadow casting |
| 03-sheltered-infrastructure.md | Covered walkways, footbridges, underpasses, gap size |
| 04-shadow-methods.md | Shadow computation and sun geometry at 14.6 N |
| 05-routing-architecture.md | Routing engine and deploy architecture |
| 06-ph-prior-art-demand.md | PH prior art, demand, news hook, names |
| 07-weather-feeds.md | Heat, rain, and flood feeds for the mode switch |
| 08-licensing-privacy.md | ODbL, dataset terms, RA 10173 |
| 09-ground-truth-collection.md | Field and street-imagery methods to close the shelter gap |
| 10-ux-positioning.md | PH user needs, direction format, threat from Google Maps |
| 11-partners-data-holders.md | Who holds covered-walkway and footbridge data, one contact each |

Corrections to these reports are in `docs/research-corrections.md`.

## Facts other documents cite

- Source extract: Geofabrik `philippines-261020.osm.pbf` (`raw/05/pbf/`). Size 610,963,420 bytes. MD5 `941dd405ba4f1c028ca874cde38ea200` matches the Geofabrik `.md5` file.
- The first download stopped at 488,689,664 bytes and was resumed on 2026-10-21. Overpass returned HTTP 502 and 000 during the first pass, so the reports read the local extract and do not query Overpass.
- The sun script `scripts/04/sun_geometry.py` was run on 2026-10-21. Its output matches the hand table in report 04 within about 0.5 degrees of altitude.
- Report 04 estimated "two to three weeks" of high noon sun around each zenith pass. `scripts/12/noon_windows.py` gives 111 days with noon altitude above 82.4 degrees: 9 Apr to 2 Jun and 12 Jul to 5 Sep. At 82.4 degrees, a 30 m building stops shading a sidewalk 4 m from its facade. Output: `raw/04/noon_windows.txt`.
- Report 02 headline, checked against `raw/02/final_union/makati.json`: 1,537 of 1,598 footprints have a usable height, 98.0% by area.
- Report 03 covered-reach numbers were checked against `raw/03/analyze2_out.txt`.
- The access-correction audit of 2026-10-21 found that the original extractors admitted `access=private` ways. Its tests passed on 2026-10-21 (`Ran 9 tests ... OK`).
- The largest-component shares in `docs/research-corrections.md` are 96.38%, 94.48%, and 96.09%. The later `raw/access-correction-20261021/01/pilots.json` (22:08) gives 96.18%, 94.46%, and 96.05%. The design uses the later file.
