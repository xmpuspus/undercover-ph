# A timed pilot survey must measure collection yield and the remaining field effort

A correction of 2026-10-21 marks 1.4 km per hour, about 17 field hours and session counts below as unmeasured planning estimates. Historic stock totals can overlap. A four-hour session is not an accepted heat-safety limit. Re-estimate after a timed, deduplicated survey. Ten sun points cannot prove launch accuracy. Use the [expanded access and field validation gates](../../docs/research-corrections.md).

The access date for all web sources is 2026-10-21. The label [VERIFIED] means that I read the source or ran the call. The label [UNVERIFIED] means search text, memory, or my own reasoning.

## About 17 modelled field hours cover the CBD, and field visits must record hours and gates

- The modelled yield is 1.4 km per hour walked, photographed, and tagged, with a range of 1.1 to 2.0. See section 6.
- A full CBD pass needs about 17 field hours. One person needs 5 Saturdays. Four people need 2.
- The Mapillary count needs a token. Tiles and the Graph API both refuse anonymous calls. See section 1.
- In the open imagery check, Panoramax has 5 local collections with 614 images, all from 2 March 2024. KartaView has none.
- Imagery cannot settle opening hours or gates. Field visits must record both.
- The OSM wiki was offline on 21 October 2026, so tag rules rest on taginfo and memory. See the blockers section.

## 1. Free street imagery in Makati CBD is thin and needs a token to count

### Mapillary refuses anonymous calls, so the CBD count needs a token

- Vector tiles returned HTTP 403 with no token for tile 14/13699/7522, which covers the CBD centre. [VERIFIED] (raw/09/mly_tiles)
- The Graph API images call returned error 190, "Invalid OAuth 2.0 Access Token". [VERIFIED] (raw/09/mly_tiles)
- The Mapillary web map page loads a script app. It gives no count to a plain HTTP client. [VERIFIED]
- The 2025 Mapillary Philippines blog gives no image counts and does not name Makati. [VERIFIED] https://blog.mapillary.com/update/2025/02/26/harnessing-mapillary-for-open-mapping-in-the-philippines
- So I cannot give an image or sequence count for the CBD box. I did not use any borrowed token.

Steps for the owner to get a free token with a personal account. Do not use a work account. [UNVERIFIED], taken from the Mapillary docs summary and a community thread.

1. Sign in at https://www.mapillary.com with a personal login.
2. Open https://www.mapillary.com/dashboard/developers.
3. Choose Register application. Enter any name and description. Leave the callback URL empty or use a placeholder.
4. Grant read access only.
5. Copy the Client Token from the application list.
6. Count with the tile call. Replace XXX with the token. The image layer is at zoom 14.

`https://tiles.mapillary.com/maps/vtp/mly1_public/2/14/{x}/{y}?access_token=XXX`

- The CBD box fits in one or two zoom 14 tiles. Tiles 13699/7522 and its neighbour cover it. [VERIFIED] by tile math.
- Decode each tile with a vector tile reader. Count points in layer `image` and distinct `sequence_id` values.
- The docs limit tiles to 50,000 per day. The images endpoint takes a box under 0.01 degrees square. [VERIFIED] The CBD box is 0.02 by 0.014, so split it.

### KartaView returned 0 CBD photos, and Panoramax has at most 614 from one day in 2024

- KartaView `api.openstreetcam.org/2.0/photo` works without a token. The radius limit is 500 m. [VERIFIED]
- I queried five points that cover the CBD, at radius 500 m. Every query returned 0 photos. [VERIFIED] (raw/09/kartaview/grid.json)
- A control query in Berlin returned photos, so the endpoint works. [VERIFIED]
- The old "Restricted access!" error came from a different endpoint. Use the 2.0 photo call.
- Panoramax `api.panoramax.xyz/api/collections?bbox=...` works without a token. [VERIFIED]
- It lists 5 local collections, 614 images in total, all dated 2 March 2024, all GoPro. Image counts come from collection metadata. [VERIFIED] (raw/09/panoramax)
- One collection extends north to latitude 14.574, so the true in-box count is a little lower.
- Six more collections span the whole world. I ignored them. [VERIFIED]

### Imagery can show a roof or a gate, but it cannot show opening hours or shade at an hour

- It can show whether a roof or canopy exists at the photo date. It can show a gate, a door, or a sign. [UNVERIFIED]
- It cannot show opening hours, security checks, closed-off areas, or work since the photo date.
- It cannot show shade at a given hour. A roof is a fixed fact. Tree and building shade changes with the sun.
- As a project rule, imagery can set `covered=yes` only when the photo is under two years old. Otherwise the field visit decides.
- The 2024 Panoramax photos cover only strips of the CBD. They show no underpass interiors. Check each case.

## 2. A phone with Vespucci and a photo app can tag every cover type

### StreetComplete has no footway cover quest, so use Vespucci or Go Map!! for tags

- StreetComplete has a `covered` quest only for picnic tables, barbecues, bike parking, and motorcycle parking. [VERIFIED] (raw/09/sc, source file `AddAmenityCover.kt` and the quest tree)
- It has no quest for covered footways. Its sidewalk quest asks whether a road has a sidewalk. [VERIFIED]
- Every Door says it is "the best mobile editor for adding shops and amenities". Its README mentions amenity and micromapping modes only. [VERIFIED]
- I found no footway preset or cover quest in the Every Door file tree. It does not suit line features. [UNVERIFIED]
- Vespucci (Android) edits ways and tags with full control. Go Map!! does the same on iOS. OsmAnd edits points and notes but is weak for ways. [UNVERIFIED]
- Use Vespucci or Go Map!! for tags. Use OsmAnd or any GPX logger for the track. Use the phone camera for photos.

### Tag cover with `covered=yes`, which has 1,032,845 uses worldwide

Counts below are global usage from taginfo. [VERIFIED] (raw/09/ci)

| Tag | What it means | Global count |
|---|---|---|
| `covered=yes` | Roof or canopy over the way | 1,032,845 |
| `covered=arcade` | Open arcade along a building | 5,899 |
| `covered=colonnade` | Columns with a roof above | 5,350 |
| `covered=partial` | Part of the way is covered | 3,304 |
| `covered=no` | Open to sky, where cover is expected | 1,387,945 |
| `tunnel=building_passage` | Passage through a building | wiki lists it |
| `highway=corridor` | Hallway inside a building | wiki lists it |

Rules for each feature. Tag meanings from memory and taginfo descriptions. [UNVERIFIED] until the wiki returns.

1. Covered sidewalk beside a road. Keep `highway=footway` and `footway=sidewalk`. Add `covered=yes`.
2. Covered walkway not beside a road. Use `highway=footway` and `covered=yes`.
3. Elevated walkway. Add `bridge=yes`, `layer=1`, and `covered=yes` if roofed. Add `level` only when stairs or malls link levels.
4. Underpass. Add `tunnel=yes`, `layer=-1`, and `highway=footway`.
5. Mall or building hallway. Use `highway=corridor` with `level=*`, or `indoor=corridor` for mapped interiors. The project router needs one choice. Pick `highway=corridor`.
6. Passage through a building at ground level. Use `tunnel=building_passage`.
7. Hours. Add `opening_hours=*` on the way or on its entrance node. Add `access=customers` or `access=private` where it applies. Add `barrier=gate` on gate nodes.
8. Source. Add `source=survey` in the changeset. Do not add it on each way.

- Existing OSM data uses `bridge=covered` on 4 CBD footway ways and `bridge=viaduct` on 10 more. These are odd values. Review them during the walk. [VERIFIED] (raw/05/osm_makati_cbd.json)
- The OSM extract has 148 untyped footways and 134 `footway=sidewalk` ways in the CBD. Few carry `covered`. [VERIFIED]

### Take 2 photos per covered segment and 1 of each gate, sign, and roof

- Take 2 photos per covered segment. One at each end, aimed along the way.
- Take 1 photo of each gate, door, and hours sign. Include the sign text in the frame.
- Take 1 upward photo at the mid point, to show the roof type.
- Shoot at normal width. Hold the phone at chest height. Do not shoot faces. Shoot while walking away from crowds.
- Upload the same photos to Mapillary as sequences. This gives the project its own open imagery. Blur faces and plates first. The Mapillary app blurs them. [UNVERIFIED]

### Record one GPX track per route at a 1 second interval

- Record one continuous GPX track per route. Use a 1 second interval.
- Mark a waypoint at each cover start, cover end, gate, stair, and lift.
- Under decks and in underpasses the GPS drifts. Mark a waypoint at each entrance and exit. Do not trust the track between them.
- Name each file with date, route code, and mapper initials. Example `20261031_R1_xp.gpx`.

## 3. OSM edits for an app must follow the organised editing and import rules

- The OSMF Board approved the Organised Editing Guidelines in November 2018. [VERIFIED] (by search text) https://osmfoundation.org/wiki/Organised_Editing_Guidelines
- They cover groups of mappers working in a coordinated way. They are not a policy. The community disputes whether one-person teams are in scope. [VERIFIED] (by search text)
- Treat the project as in scope, because a crew of volunteers is a coordinated edit.
- Create a wiki page named `Organised Editing/Activities/<name>` and list it. [VERIFIED] (by search text)
- Tell the local community before the first edit. If you are unsure, ask them. [VERIFIED] (by search text)
- Write a clear changeset comment on every upload. Example "Add covered walkway tags in Makati CBD from survey". Set `source=survey`. [UNVERIFIED]
- Use one named account for each person. Never share an account. [UNVERIFIED]
- Do not import the MaCEA numbers or any partner dataset without a plan. Import rules need an import plan on the wiki. [VERIFIED] (by search text) https://wiki.openstreetmap.org/wiki/Import/Guidelines
- The plan covers licence compatibility with ODbL, conflation, mapping of attributes, revert steps, and quality checks. [VERIFIED] (by search text)
- Post the plan to `imports@openstreetmap.org`, `talk-ph`, and the local group. [VERIFIED] (by search text)
- A partner list of walkways counts as a tip. Walk it and map what you see. That process is not an import but survey mapping.
- Do not copy from Google Maps or any closed map. [UNVERIFIED]

### OSM Philippines uses Telegram, Facebook, the talk-ph list, and the forum

From the osm-community-index repository files for the Philippines. [VERIFIED] (raw/09/ci)

- Telegram group "OpenStreetMap Philippines", handle `osmph`.
- Facebook group "OpenStreetMap Philippines", https://www.facebook.com/groups/osmph
- Facebook page "OSMPH".
- Mailing list `talk-ph`.
- The Slack channel is defunct. A 2020 proposal removed it. [VERIFIED] (by search text)
- The OSM Community Forum has a Philippines tag. [VERIFIED] (by search text)

## 4. A short sun test checks a shade model against the street

No published field protocol checks a shade map against a street at one hour. I found two partial anchors.

- ASU's MaRTy cart measures mean radiant temperature with three net radiometers in six directions. It costs far too much for this project. [VERIFIED] (by search text)
- A Phoenix study checked a model of sky view and radiant flux against mobile transect measurements. Middel, Lukasczyk, Maciejewski, Urban Planning 2(1), 2017. https://doi.org/10.17645/up.v2i1.855 [VERIFIED] (by search text)
- Crank et al. compared MaRTy to Kestrel readings and to Rayman and ENVI-met models in an arid city. [VERIFIED] (by search text, poster only)
- CoolWalks Barcelona is a modelling study. I found no field validation of its shade maps. [VERIFIED] (by search text) https://arxiv.org/pdf/2405.01225
- A Hong Kong abstract reports that Street View sky view factors matched hemispherical photos with R squared above 0.95. [VERIFIED] (by search text) Not tested in Manila.

### Short protocol, 10 sample points, one hour

Pick 10 points on the shade map. Use 5 predicted shaded and 5 predicted sunny. Pick a clear day. Use a time when the model predicts clear contrast, such as 10:00 or 15:00.

1. Note date, time to the minute, and point ID.
2. Take a photo of the sky straight up. Use the phone fisheye clip-on if you have one. Keep the phone level.
3. Take a photo of the ground and the sun side of the street.
4. Read pavement temperature with a handheld infrared thermometer, about USD 20. Aim at the same pavement spot, within 30 seconds of the photo. [UNVERIFIED]
5. Record the call "sun", "partial", or "shade" by eye.
6. Compare with the model's call. Report the agreement rate and the list of misses.

- A NASA classroom lesson uses the same IR comparison of sun and shade. [VERIFIED] (by search text) https://mynasadata.larc.nasa.gov/mini-lessonactivity/mini-urban-heat-island
- An FHWA report warns that your own shadow changes the reading. Stand to the side of the spot. [VERIFIED] (by search text)
- A black-globe thermometer adds radiant load. Use it only if you can buy and calibrate one. Skip it for version 1. [UNVERIFIED]
- Do not measure on a day with rain or heavy cloud. Pass-fail needs full sun.
- Surface temperature is not felt temperature. Use it not as a comfort score but as a check on shade.

## 5. Volunteers exist, but I found no active Makati-specific group

- UP Resilience Institute YouthMappers (UPRIYM) started in 2018. The source is the OSM wiki Philippines/YouthMappers, as quoted in search text. The community index lists its Facebook page. [VERIFIED]
- JPCS at Far Eastern University Institute of Technology, a YouthMappers chapter. Contact in the community index is `jpcsfeutech@outlook.com`. [VERIFIED]
- JPCS at National University, accepted March 2020 per a talk-ph post. [VERIFIED] (by search text)
- A regional ambassador diary counts 12 Philippine YouthMappers chapters. I did not find the full list. [VERIFIED] (by search text)
- The Mapillary 2025 blog names OSM Philippines, UPRIYM, UP Industrial Engineering, Tiklop Society, Firefly Brigade, and Bike Scouts Philippines. [VERIFIED]
- The Bike Scouts and Tiklop groups ride and fold bikes in Metro Manila. They are natural recruits for imagery capture. [UNVERIFIED]
- HOT Philippines ran a full-day mapathon on 15 February 2020 and mapped Quezon City with UPRI in 2020. [VERIFIED] (by search text)
- I found no 2025 or 2026 HOT Philippines event in Manila. [VERIFIED] (by search text)
- MapRoulette builds challenges from GeoJSON or an Overpass query. Keep a challenge under a couple of thousand objects. [VERIFIED] (by search text) https://learn.maproulette.org/en-US/documentation/creating-a-challenge/
- Use MapRoulette for desk checks, for example "does this footway have a roof in the photo". Do not use it for walking.
- I contacted no one. Outreach is for the project owner to decide.

## 6. A yield model gives about 1.4 km per hour and 17 field hours for the CBD

I found no published km per hour figure for walking surveys. The model below is my reasoning. [UNVERIFIED]

### The model takes 4.2 minutes per 100 m, or 1.43 km/h (`scripts/09/yield.py`)

1. Walk 100 m in a dense CBD at 3 km/h. That takes 2.0 minutes.
2. Take 2 photos. Allow 0.5 minutes.
3. Enter tags in the app. Allow 1.0 minute.
4. Total 3.5 minutes. Add 20 percent for crossings, gates, and GPS waits. Result 4.2 minutes.
5. Speed is 6.0 divided by 4.2, which is 1.43 km/h.

| Case | Tag entry per 100 m | Result |
|---|---|---|
| Fast, tag later from notes | 0 minutes | 2.0 km/h |
| Central | 1 minute | 1.4 km/h |
| Slow, tag on site | 2 minutes | 1.1 km/h |

- A 4 hour session yields 5.7 km at the central rate. Four hours is the heat limit for one morning. [UNVERIFIED]

### The gap between the 8 km claimed by MaCEA and TopGear and the 2.27 km of OSM cover tags is at most 5.7 km

- MaCEA claims 4 km covered and 2 km elevated. [VERIFIED] (for the claims, see raw/03/web_notes.md) TopGear (2025) cites a 2 km underpass network. [UNVERIFIED] The total is 8 km. The classes can overlap, so 8 km is an upper bound.
- OSM tags 2.274 km as cover or tunnel. [VERIFIED] (raw/03/makati_union_stats.txt)
- The upper bound of the gap is 8.0 minus 2.27, which is 5.7 km.
- OSM has 2.092 km of pedestrian bridges. Only 0.121 km carry a cover tag. The elevated claim of 2 km matches the geometry. The ways exist, but most carry no cover tag. [VERIFIED]
- The CBD has 30.82 km of `footway`, `steps`, `corridor`, and `path` ways in the extract. Excluding 4.56 km of crossings leaves 26.26 km. [VERIFIED] (raw/09/cbd_ped_km.txt)

### The model gives 17.0 field hours, or 5 Saturdays for one person

| Phase | Distance | Rate | Hours |
|---|---|---|---|
| 1. Verify the claimed 8 km plus 40 percent connectors | 11.2 km | 1.43 km/h | 7.8 |
| 2. Fast scan of the other ped ways, photos at cover only | 18.3 km | 2.0 km/h | 9.1 |
| Total | 29.5 km | | 17.0 |

- 26.26 minus 8.0 gives 18.3 km for phase 2.
- With 4 field hours per Saturday, 17.0 hours gives 4.2 sessions for one person. That is 5 Saturdays.
- Two people need 3 Saturdays. Four people need 2 Saturdays.
- Add about 0.5 desk hours for each field hour, for upload and checks. That is about 8 more hours.
- The five-Saturday figure ignores a weekday visit. Add one weekday hour sample for opening hours (see section 7).
- For comparison, the 2025 Singapore team hand-mapped 30 Orchard Road routes. The team found this faster than waiting for stakeholder data. [VERIFIED] from the project's starting notes.

## 7. One Saturday plan for Makati covers five routes from 07:30 to 11:30

Start at 07:30 at Ayala MRT station. Finish by 11:30. Work in pairs if you have volunteers. Each pair takes one route.

| Route | Path | Record |
|---|---|---|
| R1 | Ayala MRT station, Ayala Center Pedestrian Link Bridge, Glorietta, Greenbelt | Roof state of each bridge piece, `bridge`, `layer`, stairs, lifts, mall door hours |
| R2 | Ayala Triangle, Ayala Avenue sidewalks, One Ayala link | Sidewalk covers, gates, hours of any building passage |
| R3 | De la Rosa elevated walkway, 1,110 m, both phases | Cover on each span, stairs, lift status, exits. Two walkers, one per half |
| R4 | Legazpi Village and Salcedo Village sidewalks, Paseo de Roxas, Legazpi Street | Fast scan, photo only where a roof starts or ends |
| R5 | The 8 underpasses, starting with Legazpi (1995) and Paseo-Villar (2019 to 2021) | Entrances, `layer=-1`, shop frontages, door hours, flooding signs |

- The 1,110 m length, the 795 m first phase, and the 8 underpasses come from Wikipedia as read in raw/03/web_notes.md. [VERIFIED]
- Mall hours from a Feb 2026 guide. Glorietta 10:00 to 21:00 or 22:00. Greenbelt 11:00 to 22:00. Check the signs, because hours change. [VERIFIED]
- Saturday offices are shut. Passages inside office buildings can be shut too. Record "closed Saturday" and return on one weekday at 09:00 to read the weekday state. [UNVERIFIED]
- One walker takes the shade check in section 4 on R3 at 10:00 for 10 points.

### Each field record holds the route, way id, cover, gate, hours, and photos

- Route code, date, time, mapper initials.
- Way id from the base map, or "new".
- Cover state. Cover type. Layer or level.
- Gate yes or no. Hours text from the sign. Access.
- Photo file names. Waypoint number.

### A GeoJSON overlay lets the router use survey data the same day

1. Export the GPX files and a CSV of the per-feature records.
2. Snap each GPX to the nearest OSM ways with a map matcher. Join the CSV on way id. Flag any way with no match for a human check.
3. Write the result as a GeoJSON overlay with `way_id`, `covered`, `layer`, `hours`, `access`, `photo`, and `surveyed_on`. Version it in the project.
4. The router merges the overlay onto its OSM graph at build time. A surveyed value takes priority over an OSM value. The app can use the data the same day.
5. Upload the same tags to OSM through Vespucci after the community notice in section 3. Rebuild the graph from a fresh extract and drop overlay rows that OSM now matches.
6. Keep `surveyed_on` on every row. Treat a row older than 12 months as stale. [UNVERIFIED]

## Four blockers are still open, led by the Mapillary token and the OSM wiki outage

- Mapillary needs a token from the owner. Section 1 gives the steps. Without it, the CBD image count stays unknown.
- The OSM wiki returned HTTP 503 all day on 21 October 2026. A forum post confirms the outage. [VERIFIED] I could not read `Key:covered`, the Organised Editing page, or the Philippines channels page. Tag rules above carry [UNVERIFIED] where they rely on memory. Recheck them when the wiki returns.
- No published mapping speed exists. The 1.4 km per hour figure is a model. A pilot walk of R3 gives a measured number in 2 hours.
- I could not confirm volunteer counts or group activity in 2026. I did no outreach.

## Files

- The scripts in `scripts/09` are `kartaview_probe.py`, `panoramax_count.py`, `cbd_ped_km.py`, and `yield.py`.
- The raw outputs in `raw/09` are `mly_tiles`, `kartaview`, `panoramax`, `sc`, `ci`, `cbd_ped_km.txt`, and `yield.txt`.
