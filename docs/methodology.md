# undercover.ph computes the shade on every sidewalk every 30 minutes from 06:00 to 18:30 in 67 areas and plans routes in the browser

The data file formats are in [data-contract.md](data-contract.md). The build steps and their counts are in `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

## 1. The walk network comes from OpenStreetMap with strict access rules

- The source is the Geofabrik Philippines extract of 2026-10-20, clipped to Metro Manila and to one box per region outside it.
- `app/public/data/areas.json` lists 67 walking areas. 14 are in Metro Manila, and 53 are in or around 44 cities and provinces outside Metro Manila. Each area joins one or more district boxes around a busy centre. Its walk network covers each box plus 500 m on each side.
- The router uses a separate network for each area. If a trip crosses between two overlapping areas, the router uses the area whose network holds both ends.
- Every `footway`, `path`, `steps`, `corridor`, and walkable road becomes an edge between two nodes.
- Roads of tertiary class or higher get a separate edge for each sidewalk. The pipeline offsets each sidewalk line from the road centre and keeps it outside building footprints.
- An edge with an unchecked access rule (a gate, an entrance, a private passage) stays out of routes by default. The user can allow such paths, and the app then draws them dashed.
- Bollards, height bars and raised curbs do not count as an access rule. A walker can pass all three.
- A rule on a gate or other node closes only the stretch of way between the two junctions around it. The rest of that way stays walkable, so a public road stays open up to a village gate. The pipeline leaves a stretch through a closed node, such as a gate tagged `access=private`, out of the graph.
- Each area keeps every way with a node inside its graph boxes. If a walkable way outside the boxes joins two separate parts of the area's walk network within 300 m, it stays. One example is a bridge in the gap between two districts.
- The router uses mall and building passages with published opening hours only while they are open.

## 2. Building heights come from OpenStreetMap first, then Google's 2023 estimates

The pipeline gives each building one height from the first of these sources that has one.

1. The OpenStreetMap `height` tag.
2. The OpenStreetMap `building:levels` tag times 3.74 m, the median measured on Makati buildings that carry both tags.
3. The median of the Google Open Buildings 2.5D Temporal raster (2023) inside the footprint. Google caps heights at 100 m, so a tower over 100 m gets its full height only from an OpenStreetMap tag.
4. A default of 7.5 m (two levels). A default that is too tall adds shade that does not exist, so the pipeline keeps the default low.

Each `building:part` keeps its own height and base. The height of a tower part does not apply to its podium.

The model computes shade only from buildings that have an outline. Outlines come from OpenStreetMap first. Where
OpenStreetMap has none, Google Open Buildings v3 adds an outline traced from 50 cm imagery. A Google outline goes in
only when two Google sources agree. Its confidence must reach the 80%-precision cutoff that Google gives for its S2
cell. The 2023 height raster must show a building of 2.5 m or more inside it.

A Google outline must not overlap an OpenStreetMap building by 10% of its area or more. Its height is the raster
median, with no default, so a wrong outline never gets an invented height.

`pipeline/tools/footprint_cover.py` measures the share of Google's building area that has an outline. On 2026-10-23
the share was 64% to 78% in Metro Manila areas and 41% to 72% in areas outside Metro Manila, with a median of 55%. With
OpenStreetMap alone, the areas outside Metro Manila had 12% to 70%, with a median of 42%. The README table gives each area's
share, and the About page lists each area where the share is under half.

## 3. Tree canopy comes from the Meta and WRI canopy height maps

- The source is Meta and WRI High Resolution Canopy Height Maps. Its pixels are about 1.19 m, and its imagery dates from about 2018 to 2020.
- The model treats each crown as solid. The lowest quarter of each tree counts as open trunk space.

## 4. The pipeline finds shade by casting a ray toward the sun from every 5 m of every sidewalk

1. The pipeline computes the sun's position (pvlib, NREL SPA) for each half hour from 06:00 to 18:30 Manila time on 7 calendar days.
2. It places a sample every 5 m along each edge, at 1.5 m above the ground. Footbridge samples start at a 6 m deck.
3. From each sample it steps toward the sun in 1 m steps. At each step it checks whether a building or a tree crown blocks the ray.
4. Each edge stores the share of its length in building shadow and in tree shadow, for each half hour.
5. The pipeline writes no map overlays. The browser draws the ground shadows on the map from `buildings.pmtiles` and `trees.pmtiles`.

Roofed walkways, underpasses, and indoor passages count as fully covered.

## 5. The router keeps the recommended route only when it is at most 20% longer and cuts sun exposure by at least 15%

The search runs in the browser. The app keeps the trip in the URL fragment. Browsers do not send the fragment to a server, so no start or end point reaches a server of this project. The map tile server receives the map area on screen.

- Cost of an edge = length x (1 + k x sun exposure). Exposure is 0 under a roof and the sunlit share elsewhere.
- The shortest route uses k = 0.
- The most covered route starts at k = 8. The router lowers k while the detour is more than 50%.
- The recommended route starts at k = 2. The router lowers k until the detour is 20% or less. The app shows this route only if it cuts sun exposure by at least 15%. If it does not, the app shows the most covered route instead, but only when that route meets both limits.
- The reported numbers use the shade at the time the walker reaches each edge. The time comes from the departure time and a walking speed of 1.1 m/s.
- Crossing to the other side of a road costs nothing at a mapped crossing or a traffic signal. At a junction with no mapped crossing, the crossing adds 60 x (1 + k) m of cost. That is 60 m on the shortest route and 540 m at k = 8. The app adds a warning to that step. The router does not allow a crossing in the middle of a block.
- The router separates the two sidewalks by their side of the OpenStreetMap way and by the walking direction. So the router finds which sidewalk the walker is on, even where the road bends.
- When the sun is 3 degrees or less above the horizon, the app shows a note that shade does not apply.
- Rain mode counts only roofed, underground, and indoor edges as covered.

## 6. Weather and the PAGASA advisory cover every area, and the app makes no flood claim

- Open-Meteo gives the hourly temperature, feels-like temperature, rain chance, and UV index.
- PAGASA, the national weather agency, issues thunderstorm advisories. The app shows an advisory only during the 2 hours it covers.
- No public source gives live street flooding for Metro Manila, so the app makes no flood claim.

## 7. Nobody checked the modelled shade on the street, and OpenStreetMap maps few covered walkways

- Nobody checked the modelled shade on the street yet. The [field check](field-check.md) gives the method.
- OpenStreetMap maps few covered walkways, so the app undercounts the real cover on sheltered routes. The README gives the sheltered length across all areas.
- Where OpenStreetMap has no sidewalk data, the pipeline assumes a sidewalk on both sides of larger roads. A step such as "walk on the south side" can name a sidewalk that does not exist.
- Awnings and arcades that OpenStreetMap does not map add shade that the model cannot see.
- The data covers 7 days. A scheduled job moves the 7-day window forward each day.

## 8. Run a loop builds up to three loops through two waypoints, each within 10% of the requested distance

The [numbered run specification](../app/src/lib/jog/SPEC.md) records the agreed requirements and defaults.

The runner chooses a start, a distance, a pace and a departure time. The defaults, 5 km and 7 min/km, are product
choices. Runs can start from 4 AM to 9 PM, in half-hour steps. A run that starts before 6 AM or after 6:30 PM uses
the nearest shade slot but keeps its departure minute. In walk mode, the hour picker offers only the shade slots.

Each candidate loop uses two waypoints in different directions. Three A* shortest-path searches, called legs, join
the start, the two waypoints and the start again. Each leg starts on the sidewalk where the leg before it ended, so a
waypoint cannot create a mid-block crossing.

A street segment is the unordered pair of an edge's end nodes, so both sidewalks of one block share it. A penalty on street segments that earlier legs used makes the search less likely to run a
street twice. A smaller penalty on street segments in the loops found so far directs later searches toward other
streets. These penalties apply only inside the search. They do not change the measured values or the reported score
of a returned loop.

The search skips an edge when even the shortest trip from the start, along that edge and back is longer than the
distance tolerance. For each leg, the search computes weighted distance bounds from the leg's destination, with the
used-street penalties included. A* uses these distances as its estimate. Nodes farther than the leg's start get the start's
distance. These bounds make A* expand fewer nodes but do not change its cost or its best path. Each leg's search
still applies opening hours and the rules for changing sidewalks.

When a candidate misses the requested length, the search changes the waypoint distance. Returned loops stay within
10% of that length. Any two loops share at most 30% of their street-segment metres. Each loop repeats at most 10% of
its metres. The stem that a dead-end start needs does not count toward that 10%. If the paths from the start form no
circuit, the app shows a message and does not invent a connection.

The search returns up to three loops. It returns fewer when the network or the time budget cannot give three. A
search stops early when 90 more leg searches add no new loop and no better score. The Other loops button changes the
random seed and keeps the runner's current history. A start from the phone's location moves to the nearest node in
the largest walkable component, within the router's 150 m snap limit.

The loop cost is lower for shade, smaller roads, marked crossings, mapped parks and water, and streets that are not
in the runner's saved runs. Where enough mapped sights exist, sights lower the cost as well. Turns add a small cost.
No discount makes an edge cost less than its length. The weights are in `app/src/lib/jog/score.ts`. They are not
measured probabilities of injury but routing preferences.

Each leg searches with the time slot of the runner's arrival. The shade on the card and the minutes on each step use
the runner's arrival time at each edge and the chosen pace. A path with opening hours must be open when the runner
enters it and when the runner leaves it.

The search avoids a park while it is closed. It uses the park's cited hours, which the pipeline matches to the park by
its OpenStreetMap way or relation URL. If every way out of the start is inside a closed park, the search returns no loop. Its message
gives the park's name, and the next opening time when the hours give one. A measured path that reaches a closed park
gets a warning with the park's name.

The app checks darkness at each arrival minute against the sunrise and sunset of that date. Before sunrise and from
sunset on, the run is dark, whatever its shade slot. A slot with the sun at 3 degrees or lower still counts as dark.
If the sunrise and sunset times are missing or malformed, the 3-degree slot rule still applies. If any part of a run
is dark, the card shows "Shade does not apply before sunrise or after sunset." in place of the shade percentage.

Lighting changes the cost only where at least 30% of walkable metres have a light tag. There, `lit=no` adds three
times the cost of unknown light, and metres mapped as lit add none. In the dark, a familiar street gets half the
extra cost that it gets by day.

If the street data loaded, every dark card reports the mapped-lit metres. In a poorly mapped area, the card shows
"Street lights are not mapped on most streets here." If the street data did not load, the card reports the load
error and makes no claim about mapped-light coverage. Light tags cover few areas. A light tag does not show that the
lamps work or that a street feels safe.

The sight grade is the number of mapped sights per square kilometre of the graph box, times 0.5 square kilometres.
A value of three or more gives the grade rich, one or more gives some, and less than one gives thin. In a thin area,
the loop search uses no sight discounts, and the card shows "Few sights are mapped here." Named sights that the loop
passes still appear on the card. The path measurement helper (`measureLoop`) can still score a known sight linked to
an edge, but the loop search applies the area grade.

Wherever the app mentions safety, it shows "Safety here means traffic: crossings and road size. We have no crime data."
The score does not measure crime, harassment, pavement condition, live traffic, working lights or a runner's
personal security. Street mapping and modelled shade need checks on the ground. A saved run records only the
planned path.
