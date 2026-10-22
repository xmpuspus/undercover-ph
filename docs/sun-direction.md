# The sidewalk on the sun's side of the street is the shady one, and the season decides which side that is

Written on 2026-10-22 from the shipped Makati data (`app/public/data/`) and the shade engine run read-only for extra dates.
The scripts and output are in `research/sun-direction-20261021T165800Z/` (`side_of_street.py`, `results.json`, `noon_side.py`, `noon_side.txt`).
The shade engine models every value from building heights and tree canopy. Nobody checked the values in the field yet.

## On Legazpi Street the shady side flips between June and October

Legazpi Street in Makati runs east to west. The router gives it two sidewalk edges, one on each side.

At noon on 22 October the sun stands in the south, 64 degrees up. A building on the south side of the street blocks that sun, so its shadow falls north, across its own sidewalk first. On 21 June at noon the sun stands in the north, 81 degrees up. Then the buildings on the north side cast the shade.

The table shows that flip on Legazpi Street at noon.

| Date | Sun at noon | North sidewalk, building shade | South sidewalk, building shade |
| --- | --- | --- | --- |
| 21 June | north, 81 degrees up | 90.7% | 0.0% |
| 22 October | south, 64 degrees up | 0.0% | 5.7% |

So a walker stays on the side of the street toward the sun. The buildings on that side stand between you and the sun.

## The rule holds across the Makati graph at every hour and season tested

The test pairs the two sidewalk edges of each road segment, 941 pairs in total. For each hour it asks which sidewalk has more building shade. It skips segments where the sun shines within 15 degrees of the street's own direction, because then neither side has a sun side. Pairs within 5 points count as a tie.

The table gives the results for 22 October 2026.

| Time | Sun direction, height | Sun-side sidewalk shadier | Far-side sidewalk shadier | Within 5 points | Mean advantage of the sun side |
| --- | --- | --- | --- | --- | --- |
| 08:00 | east, 30 degrees | 339 | 80 | 379 | 13.1 points |
| 10:00 | southeast, 54 degrees | 389 | 66 | 342 | 16.1 points |
| 12:00 | south, 64 degrees | 393 | 64 | 416 | 12.6 points |
| 14:00 | southwest, 47 degrees | 435 | 61 | 327 | 17.0 points |
| 16:00 | west, 21 degrees | 263 | 35 | 406 | 9.7 points |

OpenStreetMap maps both sidewalks on 674 of the 941 pairs. The pipeline assumes the other sidewalks from the road class. On the 674 mapped pairs at 14:00, the sun-side sidewalk wins 338 to 53, with 204 ties and a mean advantage of 17.8 points. The script and output are `research/sun-direction-20261021T165800Z/mapped_pairs.py` and `mapped_pairs.txt`, run on 2026-10-22.

The same test on four other dates gives the same direction. At noon the sun-side sidewalk wins 280 to 41 on 21 March, 252 to 33 on 21 June, and 388 to 59 on 21 December.

The ties grow at the ends of the day. At 17:00 the sun is 7 degrees up, and 588 of 694 pairs tie, because long shadows cover both sidewalks.

## The street's direction matters as much as the side

When the sun shines along a street, the buildings on both sides stand beside the light. None of them stands in front of it. When the sun shines across a street, one row of buildings blocks it.

The table groups building shade on sidewalk edges on 22 October by the angle between the sun and the street.

| Time | Sun along the street (0 to 30 degrees) | Oblique (30 to 60) | Sun across the street (60 to 90) |
| --- | --- | --- | --- |
| 08:00 | 42.6% | 56.4% | 64.8% |
| 10:00 | 16.4% | 35.6% | 42.4% |
| 12:00 | 16.1% | 17.8% | 36.0% |
| 14:00 | 31.5% | 38.6% | 42.9% |

Ayala Avenue shows the effect at 08:00 in October. The avenue runs at about 124 degrees, northwest to southeast. The sun rises at about 112 degrees, so the morning light runs almost straight down the avenue. Its sidewalks get 20% to 58% building shade at 08:00, against 88% to 100% at 16:00, when the low sun crosses it from the west-southwest.

## The season flips the shady side at noon

The noon sun at Makati (14.555 N) stands north of the zenith from 1 May to 14 August, 106 days. Then noon shadows point south, and the north sidewalk of an east-west street is the shady one. For the rest of the year the noon sun stands in the south, and the south sidewalk is the shady one.

Around 1 May and 15 August the sun passes almost straight overhead. At noon on 1 May the model puts building shade at 0.7% to 1.9% of sidewalk length, whatever the street direction. A 30 m building then casts a noon shadow of about 0.1 m. In those weeks only roofs and trees shade a midday walk.

| Date | Noon sun | 30 m building noon shadow |
| --- | --- | --- |
| 21 March | south, 75.4 degrees up | 7.8 m |
| 1 May | north, 89.7 degrees up | 0.1 m |
| 21 June | north, 81.1 degrees up | 4.7 m |
| 15 August | south, 89.7 degrees up | 0.1 m |
| 22 October | south, 64.7 degrees up | 14.2 m |
| 21 December | south, 52.0 degrees up | 23.4 m |

## The shade engine, router, route card, and map all apply the sun-side rule

- The shade engine casts each ray toward the sun's direction at each half hour, so every sidewalk edge already carries its own side's shade.
- The router picks the shady side by itself, because each road has a separate edge for each sidewalk.
- A route changes sides only at a mapped crossing or signal. At an unmarked junction it pays a 60 m penalty and warns. Mid-block the router forbids a side change.
- The route card shows the sun's direction and the tip "Shade falls on the side of streets toward the sun".
- Steps name the side, for example "Walk on the south side of Ayala Avenue".
- The map shows the model's ground shadows for the chosen half hour. A play button moves them through the day.
- The router scores each edge with the shade at the time the walker reaches it.

## Limits that change how far to trust this

- The engine models every value. Building heights come from OSM and the 2023 Google 2.5D raster. Tree crowns come from 2018 to 2020 canopy data.
- The model treats tree crowns as solid. Real crowns let some light through.
- Sidewalk lines sit at an estimated offset from the road centre. Nobody surveyed the kerbs.
- Awnings, arcades, and covered walks that OSM does not map do not appear. They add shade on the street side, often on the side away from the sun.
- The engine uses one sun position for the whole pilot area at each half hour. Over 3 km the error is negligible.
