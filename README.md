# undercover.ph

[![CI](https://github.com/xmpuspus/undercover-ph/actions/workflows/ci.yml/badge.svg)](https://github.com/xmpuspus/undercover-ph/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Data: ODbL](https://img.shields.io/badge/data-ODbL%201.0-blue.svg)](LICENSE)
[![Status: prototype](https://img.shields.io/badge/status-prototype-orange.svg)](#limits-and-the-honest-not-yet)

> Walking routes in Makati CBD that keep you in the shade on sunny days, or under a roof when it rains. A Philippine take on Singapore's [Undercover](https://undercover.gov.sg/) prototype, built on open data. Every route runs in your browser, so no server sees where you start or where you go.

[![A walk from Ayala MRT Station to Greenbelt on undercover.ph: the landing card, the Shaded choice, the destination and start search, tomorrow at 3 PM, three routes on the 3D map with their shaded share, and the route card with minutes in sun and the roof, building, and tree split](docs/demo/hero.gif)](https://undercover.ph)

<sub>Real recording of the app (via `app/scripts/demo-record.mjs`). Ayala MRT Station to Greenbelt, leaving at 3 PM: the recommended walk is 1,406 m, 87% covered, with 2.6 minutes in sun. The shortest walk is 1,230 m, 71% covered, with 5.3 minutes in sun.</sub>

Try it at **[undercover.ph](https://undercover.ph)**: pick Shaded or Sheltered, choose where you start and where you go, and pick the half hour you leave.

## Walk on the sun's side of the street

The shady sidewalk is the one on the same side as the sun. The buildings on that side stand between you and the sun, so their shadow falls across their own sidewalk first.

The model shows this across Makati. It compares the two sidewalks of 941 road segments. On 22 October 2026 at 14:00, the sidewalk on the sun's side has more building shade on 435 segments, the far side on 61. The rest differ by 5 points or less. On the 674 segments where OpenStreetMap maps both sidewalks, the count is 338 to 53.

The season flips which side that is at noon. From 1 May to 14 August the noon sun stands north of Makati, so the north sidewalk of an east-west street is the shady one. The rest of the year it is the south sidewalk. The full analysis is in [docs/sun-direction.md](docs/sun-direction.md).

[![The shadow layer on undercover.ph moving through one day: building and tree shadows swing from west at 8 AM to east at 4 PM while the sun chip turns and the route updates](docs/demo/sun-direction.gif)](https://undercover.ph)

<sub>Real recording of the shadow layer and the play button. The map draws the same ground shadows that the router scores, one image for each half hour.</sub>

## What a route shows

Like Singapore's version, the app returns three walks: the shortest, the most covered, and a recommended walk that cuts sun without a long detour. On top of that it shows:

- **Minutes in sun** next to the share covered. A long walk at 80% shade can expose you longer than a short walk at 50%.
- **Where the cover comes from:** roof, building shade, or tree shade.
- **The sun's direction**, with the model's ground shadows on the map for the half hour you pick.
- **Steps that say which sidewalk to use**, with landmarks, stairs, footbridges, underpasses, and closing times.
- **A night state.** After sunset the app says that shade does not apply.
- **Rain mode**, which counts only roofed, underground, and indoor paths as covered.
- **A step-free option**, English with Taglish helper text, and the data date on every route card.

<table>
<tr>
<td width="40%"><a href="https://undercover.ph"><img src="docs/demo/steps-phone.gif" alt="undercover.ph on a phone: the route card, the step list with sidewalk-side badges, landmarks, and stairs flags, then the Navigate view with a turn card"></a></td>
<td width="60%"><a href="https://undercover.ph"><img src="docs/demo/rain.gif" alt="undercover.ph in rain mode: the walk changes to use covered walkways and an underpass, and the card switches to the sheltered share"></a></td>
</tr>
<tr>
<td><sub>Steps and Navigate on a phone.</sub></td>
<td><sub>Rain mode prefers roofed, underground, and indoor paths.</sub></td>
</tr>
</table>

## What is in this repo

- **`app/`**: the web app (Vite, React, TypeScript, MapLibre GL). The router lives in `app/src/lib/router/`: a custom A* search with access, opening-hours, side-of-street, and night rules, covered by 40 unit tests.
- **`pipeline/`**: the data build. It reads OpenStreetMap, assigns building heights, builds the walk graph, and fetches weather and the PAGASA advisory.
- **`pipeline/shade/`**: the shade engine. It casts rays toward the sun from every 5 m of every sidewalk, each half hour. It also renders the ground shadow images.
- **`docs/`**: the [method](docs/methodology.md), the [sun-direction analysis](docs/sun-direction.md), the [data contract](docs/data-contract.md), the [design](docs/design.md), and the [research corrections](docs/research-corrections.md).
- **`research/`**: the research reports behind the design, and a teardown of Singapore's interface.
- **`tests/`**: access-policy tests for the walk graph.

## What this is not

- **Not a heat or safety guarantee.** Shade lowers sun exposure. It does not make a walk safe in extreme heat.
- **Not measured shade.** The app models shade from building heights and tree data. Nobody checked it on the street yet.
- **Not live street conditions.** No public source gives live street flooding or closures for Metro Manila. The app makes no such claim.
- **Not wheelchair routing advice.** The step-free option avoids mapped steps only. Ramps and lifts are not yet mapped well.
- **Not a government service.** It is an independent project. No government agency in the Philippines or Singapore runs it.

## Privacy

The router runs in your browser. Your start and end points never reach a server that this project controls. The app asks for your location only when you tap "Use my location", and it keeps nothing. It has no analytics and no trackers. One small server function reads the PAGASA thunderstorm advisory for the app, every 10 minutes at most. It gets no route, place, or location. Map tiles come from OpenFreeMap, which receives the map area you view.

## Run it locally

```bash
git clone https://github.com/xmpuspus/undercover-ph
cd undercover-ph/app
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # 67 unit tests for the router, the sky theme, and the advisory window
pnpm build          # type check and production build
pnpm e2e            # browser flow: Ayala MRT Station to Greenbelt, tomorrow at 3 PM
pnpm demo:record    # re-record the GIFs in docs/demo/ from a production build
```

The deployed site rebuilds its shade data every day. To build it yourself, see `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

## How it works

1. **Walk network:** OpenStreetMap footways, paths, and walkable roads, with a separate edge for each sidewalk of larger roads. Paths behind gates or with unchecked access stay out of routes by default.
2. **Building heights:** OpenStreetMap heights first, then Google Open Buildings 2.5D (2023) estimates. Together they give a height to 96.2% of Makati CBD buildings, 98.0% by footprint area.
3. **Tree canopy:** the Meta and WRI canopy height map, about 1 m pixels.
4. **Shade:** a ray toward the sun from every 5 m of every sidewalk, at 1.5 m high. It runs every 30 minutes from 06:00 to 18:30 for 7 days.
5. **Routes:** cost = length x (1 + k x sun exposure). The recommended route must cut sun by at least 15% within a 20% detour, or the app says no shadier walk exists.
6. **Crossings:** a route changes to the other side of a road only at a mapped crossing or a traffic signal. Before this rule, 80 of 100 random shortest routes crossed a road mid-block.

The full method, with its numbers and limits, is in [docs/methodology.md](docs/methodology.md).

## Data products

| File | What it holds |
| --- | --- |
| `app/public/data/graph.json` | Walk network: 6,274 edges, 5,586 open to routes (221.4 km), with access, crossing, and cover flags |
| `app/public/data/places.json` | 1,140 named places for search |
| `app/public/data/hours.json` | 18 opening-hours rows, each with its source |
| `app/public/data/buildings_display.geojson` | Buildings with heights for the 3D map |
| `shade.bin` and `shadows/` | Shade per edge and ground shadow images, generated at build time |
| `app/public/data/manifest.json` | Dates, sun positions, sources, and every method limit |

## Limits and the honest "not yet"

- **Cover data.** OpenStreetMap marks few covered walkways in Makati. The routable graph holds 2.23 km of sheltered path, far less than exists on the street.
- **Access.** Gates and entrances that need a field check remove 31.1 km of paths from routes.
- **Sidewalks.** Where OpenStreetMap has no sidewalk data, the pipeline assumes one on each side of larger roads. That covers 39.6 km of the 135.4 km of side-of-street paths. A step on an assumed sidewalk carries a "Sidewalk not mapped" badge.
- **Heights.** Google's heights stop at 100 m and date from 2023. OpenStreetMap supplies most tower heights.
- **Taglish copy.** A native speaker has not reviewed it yet.
- **Next:** a field walk of Makati's covered network, and a check of the shade against photos.
- **More areas:** BGC, Ortigas, Shaw and Boni, and Pasig first. Then Quezon City, Manila, Pasay, and Alabang.

## Data sources and licence

Code is MIT. Data built from OpenStreetMap is ODbL 1.0. Other layers keep their own licences. See [LICENSE](LICENSE).

| Source | Used for | Licence |
| --- | --- | --- |
| OpenStreetMap, Geofabrik extract 2026-10-20 | Walk network, places, buildings, opening hours | ODbL 1.0, © OpenStreetMap contributors |
| Google Open Buildings 2.5D Temporal (2023) | Building heights where OSM has none | CC BY 4.0 |
| Meta and WRI High Resolution Canopy Height Maps | Tree shade | CC BY 4.0, imagery © 2016 Maxar |
| Open-Meteo | Hourly weather | CC BY 4.0 |
| PAGASA | Thunderstorm advisories | Philippine government work, credited and linked |
| OpenFreeMap and OpenMapTiles | Basemap | Their terms, © OpenStreetMap contributors |

## Citation

```bibtex
@software{puspus_undercover_ph_2026,
  author = {Puspus, Xavier},
  title  = {undercover.ph: shaded and sheltered walking routes for Makati CBD},
  year   = {2026},
  url    = {https://github.com/xmpuspus/undercover-ph}
}
```

See also [CITATION.cff](CITATION.cff).

## Credits

The idea and the three-route design come from [Undercover](https://undercover.gov.sg/), a Hack for Public Good prototype by Open Government Products in Singapore. This project shares no code with it.

## Corrections

A route can send you through a closed gate, a passage that does not exist, or a walkway with no roof. If that happens, open an issue with the place and the time. A photo helps. For a security problem, use GitHub's private vulnerability reporting. See [CONTRIBUTING.md](CONTRIBUTING.md).
