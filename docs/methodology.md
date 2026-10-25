# undercover.ph casts shadows on every sidewalk every 30 minutes and routes over them in the browser

The data file formats are in [data-contract.md](data-contract.md). The build steps and their counts are in `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

## 1. The walk network comes from OpenStreetMap with strict access rules

- The source is the Geofabrik Philippines extract of 2026-10-20, clipped to Metro Manila and to one box per region outside it.
- `app/public/data/areas.json` lists the 67 walking areas: 14 across Metro Manila and 53 in 44 other regions. Each area joins one or more district boxes around a busy centre. Its walk network covers each box plus 500 m on each side.
- Each area routes on its own network. Where two areas overlap, a trip across the seam routes in the area whose network holds both ends.
- Every `footway`, `path`, `steps`, `corridor`, and walkable road becomes an edge between two nodes.
- Roads of tertiary class and above get a separate edge for each sidewalk. The pipeline offsets each sidewalk line from the road centre and keeps it outside building footprints.
- An edge with an unchecked access rule (a gate, an entrance, a private passage) stays out of routes by default. The user can turn such paths on, and the app then draws them dashed.
- Bollards, height bars and raised curbs do not count as an access rule. Walkers pass all three.
- A gate or other node rule closes only the stretch of way between the two junctions around it. The rest of that way stays walkable, so a public road stays open up to a village gate. A stretch through a closed node, such as a gate tagged `access=private`, is left out of the graph.
- Each area keeps every way with a node inside its graph boxes. If a walkable way outside the boxes joins two separate parts of the area's walk network within 300 m, it stays. A bridge in the gap between two districts is one case.
- Mall and building passages with published opening hours enter routes only while they are open.

## 2. Building heights come from OpenStreetMap first, then Google's 2023 estimates

The pipeline gives each building one height from the first of these sources that has one.

1. The OpenStreetMap `height` tag.
2. The OpenStreetMap `building:levels` tag times 3.74 m, the median measured on Makati buildings that carry both tags.
3. The median of the Google Open Buildings 2.5D Temporal raster (2023) inside the footprint. Google caps heights at 100 m, so a tower over 100 m gets its full height only from an OpenStreetMap tag.
4. A default of 7.5 m (two levels). A default that is too tall invents shade, so it errs low.

Each `building:part` keeps its own height and base. A tower part does not raise its podium.

Only buildings with an outline cast shade. Outlines come from OpenStreetMap first. Where it has none, Google Open Buildings v3 adds
an outline traced from 50 cm imagery. A Google outline goes in only when two Google sources agree: its confidence reaches the
80%-precision cutoff Google gives for its S2 cell, and the 2023 height raster sees a building of 2.5 m or more inside it. It must not
overlap an OpenStreetMap building by 10% of its area or more. Its height is the raster median, with no default, so a wrong outline
never gets an invented height. `pipeline/tools/footprint_cover.py` measures the share of Google's building area that has an outline.
On 2026-10-23 the share was 64% to 78% in Metro Manila areas and 41% to 72% in the other regions, with a median of 55%. With
OpenStreetMap alone, the other regions had 12% to 70%, with a median of 42%. The README table gives each area's share, and the About
page names each area under half.

## 3. Tree canopy comes from a canopy height raster with pixels of about 1 m

- The source is Meta and WRI High Resolution Canopy Height Maps, about 1.19 m pixels, imagery from about 2018 to 2020.
- The model treats each crown as solid. The lowest quarter of each tree counts as open trunk space.

## 4. Shade is a ray cast toward the sun from every 5 m of every sidewalk

1. The pipeline computes the sun's position (pvlib, NREL SPA) for each half hour from 06:00 to 18:30 Manila time on 7 calendar days.
2. It places a sample every 5 m along each edge, at 1.5 m above the ground. Footbridge samples start at a 6 m deck.
3. From each sample it steps toward the sun in 1 m steps. At each step it checks whether a building or a tree crown blocks the ray.
4. Each edge stores the share of its length in building shadow and in tree shadow, for each half hour.
5. The engine writes no map overlays. The browser draws the ground shadows on the map from `buildings.pmtiles` and `trees.pmtiles`.

Roofed walkways, underpasses, and indoor passages count as fully covered.

## 5. The router finds three routes and keeps the recommended one only when it is at most 20% longer and cuts sun by at least 15%

The search runs in the browser, so no server of this project sees a start or end point. The map tile server sees the map area on screen.

- Cost of an edge = length x (1 + k x sun exposure). Exposure is 0 under a roof and the sunlit share elsewhere.
- The shortest route uses k = 0.
- The most covered route uses k = 8, lowered while the detour exceeds 50%.
- The recommended route starts at k = 2 and lowers k until the detour is 20% or less. The app shows it only if it cuts sun exposure by at least 15%. If it does not, the most covered route takes its place when it meets both limits.
- The reported numbers use the shade at the time the walker reaches each edge. The time comes from the departure time and a walking speed of 1.1 m/s.
- A route moves to the other side of a road free at a mapped crossing or a traffic signal. At a junction with no mapped crossing the move adds 60 x (1 + k) m of cost. That is 60 m on the shortest route and 540 m at k = 8, and the step shows a warning. Mid-block the router forbids it.
- The router tells the two sidewalks apart from each sidewalk's side of its OpenStreetMap way and the direction walked. Each sidewalk stays on the same hand of the walker along the road, round bends and corners.
- When the sun is 3 degrees or less above the horizon, the app says that shade does not apply.
- Rain mode counts only roofed, underground, and indoor edges as covered.

## 6. Weather and the PAGASA advisory cover the whole metro, and the app makes no flood claim

- Open-Meteo gives the hourly temperature, feels-like temperature, rain chance, and UV index.
- The PAGASA thunderstorm advisory shows only during the 2 hours it covers.
- No public source gives live street flooding for Metro Manila, so the app makes no flood claim.

## 7. Five known limits

- Nobody checked the modelled shade on the street yet.
- OpenStreetMap maps few covered walkways, so sheltered routes undercount real cover. The README gives the sheltered length across all areas.
- Where OpenStreetMap has no sidewalk data, the pipeline assumes a sidewalk on both sides of larger roads. A step such as "walk on the south side" can point to a sidewalk that does not exist.
- Awnings and arcades that OpenStreetMap does not map add shade that the model cannot see.
- The data covers 7 days. A scheduled job moves the window each day.

## 8. Run a loop searches nearby waypoints and keeps distinct closed paths

The [numbered run specification](../app/src/lib/jog/SPEC.md) records the agreed requirements and defaults.

The runner selects a start, a distance and a departure time. Defaults are 5 km and 7 min/km; these are
product defaults. Runs can start from 4 AM to 9 PM, in half-hour steps. Times before 6 AM and after 6:30 PM
use the nearest shade slot while keeping the selected departure minute. Walking keeps only the shade slots.
Two waypoints in different directions form a candidate. Three A* legs connect the start,
the waypoints and the start again. Each leg carries the incoming sidewalk state, so a waypoint cannot
create a mid-block crossing. A penalty on corridors used by earlier legs discourages retracing a street.
A smaller penalty on corridors in the current choices directs later searches toward other streets.
These search penalties do not change the measured facts or reported score of a returned loop.
A corridor is the unordered pair of end nodes, shared by both sidewalks of a block.
An edge is excluded if even the shortest trip from the start, along that edge and back exceeds the
distance tolerance. Each leg gets weighted distance bounds from its destination, including used-street
penalties. This calculation stops upon reaching the leg's start and clips farther distances at that cost.
These bounds reduce A* expansion without changing its cost or optimum. Hours and sidewalk legality
remain part of each leg's search.

The search adjusts waypoint distance when a candidate misses the requested length. Returned loops stay
within 10% of that length. Any two loops share at most 30% of their corridor metres. Each loop repeats at
most 10%, excluding a required stem from a dead-end start. A disconnected path with no circuit gives a
message instead of an invented connection. The search returns up to three choices and reports fewer when
the network or time budget cannot supply three. A search stops early after 90 further leg searches add no
choice or score improvement. Other loops changes the seed and uses the current history. A location start
snaps to the nearest node in the largest walkable component, within the existing 150 m snap limit.

Lower cost favours shade, smaller roads, marked crossings, mapped parks and water, mapped sights where
enough exist, and streets the runner has not saved before. Turns add a small cost. Discounts cannot reduce
an edge's cost below its length. Weights live in `app/src/lib/jog/score.ts`; they are routing preferences,
not measured probabilities of injury. Each leg searches with its arrival slot. Card shade and step minutes
use the runner's arrival time at each edge and the chosen pace. Opening hours must hold at entry and exit.
Loops avoid parks while they are closed, using the park's cited hours matched by its OSM way or relation URL.
A start with every way out inside a closed park gives no loop and names the park and its next opening time
when the hours provide one. Measuring a path that reaches a closed park gives a warning with the park's name.

Darkness follows the date's sunrise and sunset at each arrival minute: before sunrise and from sunset on,
the run is dark regardless of its shade slot. A slot with the sun at 3 degrees or lower still counts as dark.
Missing or malformed sunrise and sunset times leave the slot rule in force.
Any dark part of a run removes the shade percentage and shows
"Shade does not apply before sunrise or after sunset." Light affects cost only where at least 30% of
walkable metres have a light tag. There, `lit=no` adds three times the cost of unknown light, while mapped
lit metres add none. Familiar streets cost half as much extra in the dark as by day. Every dark card reports
mapped-lit metres when the street data loaded; poorly mapped areas say "Street lights are not mapped on most streets here."
If street data failed to load, the card reports that failure and omits claims about mapped-light coverage.
Light tags cover few areas and do not confirm that lamps work or that a street feels safe.

The sight grade uses mapped sights per square kilometre of the graph box times 0.5 square kilometres.
Three or more gives rich, one or more gives some, and less than one gives thin. Thin areas omit sight
discounts from loop selection and say "Few sights are mapped here." Named sights actually passed still
appear on the card. The path measurement helper can score a known linked sight separately; loop selection
applies the area grade.

Safety here means traffic: crossings and road size. We have no crime data. The score does not measure
crime, harassment, pavement condition, live traffic, working lights or a runner's personal security.
Street mapping and modelled shade need checks on the ground. A stored run records the planned path only.
