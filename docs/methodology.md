# undercover.ph casts shadows on every sidewalk every 30 minutes and routes over them in the browser

This page explains how the app turns map data into a shaded or sheltered route. The data file formats are in [data-contract.md](data-contract.md). The build steps and their counts are in `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

## 1. The walk network comes from OpenStreetMap with strict access rules

- Source: the Geofabrik Philippines extract of 2026-10-20, clipped to Metro Manila.
- Areas: 13 walking areas across Metro Manila, listed in `app/public/data/areas.json`. Each area joins one or more district boxes around a busy centre. Its walk network covers each box plus 500 m on each side.
- Each area routes on its own network. Where two areas overlap, a trip across the seam routes in the area whose network holds both ends.
- Every footway, path, steps, corridor, and walkable road becomes an edge between two nodes.
- Roads of tertiary class and above get a separate edge for each sidewalk. The pipeline offsets each sidewalk line from the road centre and keeps it outside building footprints.
- An edge with an unchecked access rule (a gate, an entrance, a private passage) stays out of routes by default. The user can turn such paths on, and the app then draws them dashed.
- Mall and building passages with published opening hours enter routes only while they are open.

## 2. Building heights come from OpenStreetMap first, then Google's 2023 estimates

The pipeline gives each building one height, in this order:

1. The OpenStreetMap `height` tag.
2. The OpenStreetMap `building:levels` tag times 3.74 m, the median measured on Makati buildings that carry both tags.
3. The median of the Google Open Buildings 2.5D Temporal raster (2023) inside the footprint. Google caps heights at 100 m, so OSM supplies the tower heights.
4. A default of 7.5 m (two levels). A default that is too tall invents shade, so it errs low.

Each `building:part` keeps its own height and base. A tower part does not raise its podium.

## 3. Tree canopy comes from a canopy height raster with pixels of about 1 m

- Source: Meta and WRI High Resolution Canopy Height Maps, about 1.19 m pixels, imagery from about 2018 to 2020.
- The model treats each crown as solid. The lowest quarter of each tree counts as open trunk space.

## 4. Shade is a ray cast toward the sun from every 5 m of every sidewalk

1. The pipeline computes the sun's position (pvlib, NREL SPA) for each half hour from 06:00 to 18:30 Manila time on 7 calendar days.
2. It places a sample every 5 m along each edge, at 1.5 m above the ground. Footbridge samples start at a 6 m deck.
3. From each sample it steps toward the sun in 1 m steps and checks whether a building or a tree crown blocks the ray.
4. Each edge stores the share of its length in building shadow and in tree shadow, for each half hour.
5. A separate pass renders the ground shadows at 2 m per pixel as map overlays.

Roofed walkways, underpasses, and indoor passages count as fully covered.

## 5. The router finds three routes and keeps the recommended one only when it helps

The search runs in the browser, so no server sees a start or end point.

- Cost of an edge = length x (1 + k x sun exposure). Exposure is 0 under a roof and the sunlit share elsewhere.
- **Shortest:** k = 0.
- **Most covered:** k = 8, lowered while the detour exceeds 50%.
- **Recommended:** start at k = 2 and lower k until the detour is 20% or less. The app shows it only if it cuts sun exposure by at least 15%. If it does not, the most covered route takes its place when it meets both limits.
- The reported numbers use the shade at the time the walker reaches each edge, from the departure time and a walking speed of 1.1 m/s.
- A route moves to the other side of a road only at a mapped crossing or a traffic signal. At an unmarked junction the move costs 60 m and shows a warning. Mid-block the router forbids it.
- When the sun is 3 degrees or less above the horizon, the app says that shade does not apply.
- Rain mode counts only roofed, underground, and indoor edges as covered.

## 6. Weather and advisories are context, never a claim about a street

- Open-Meteo gives the hourly temperature, feels-like temperature, rain chance, and UV index.
- The PAGASA thunderstorm advisory shows only during the 2 hours it covers.
- No public source gives live street flooding for Metro Manila, so the app makes no flood claim.

## 7. Limits

- Nobody has checked the modelled shade on the street yet.
- OpenStreetMap maps few covered walkways in Makati, so sheltered routes undercount real cover.
- Where OpenStreetMap has no sidewalk data, the pipeline assumes a sidewalk on both sides of larger roads. A step such as "walk on the south side" can point to a sidewalk that does not exist.
- Awnings and arcades that OpenStreetMap does not map add shade that the model cannot see.
- The data covers 7 days. A scheduled job moves the window each day.
