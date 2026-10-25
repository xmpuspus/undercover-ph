# Walkable city centres outside Metro Manila, ranked by walkable length and places

149 districts in 52 cities. Every number comes from the Geofabrik philippines-261020.osm.pbf (md5 941dd405ba4f1c028ca874cde38ea200). Rerun with `pipeline/regions/scout/extract.py`, then `score.py build`, then `gen_md.py`.

## How the numbers were made

- Each box is 0.020 deg wide by 0.016 deg high (about 2.2 km by 1.8 km), with edges on a 0.002 deg grid. The 16 Metro Manila districts range from 0.014 to 0.03 deg per side. The graph area is the box plus 500 m.
- `walk_km` is the length of way segments that pass `static_public_walkable` (access_policy and pedestrian_access). It leaves out ways that touch a blocked node. The same test runs in build_graph.py. The test includes roads, so a rural road grid scores high. For that reason the score counts places as well.
- `places` counts named nodes and closed ways that `build_places.category()` accepts, before the 150 m dedupe and the 80 m snap. So the counts are higher than in the final places.json.
- `buildings` counts closed building ways only. The script `extract.py` does not read building relations, so the counts are a little low. The `height_tag_share` column is the share of buildings with a parseable `height` or `building:levels`.
- `covered_km` is the length of pedestrian-class ways with covered=yes/arcade/colonnade/roof, indoor, corridor or building passage (bits 0 and 2 of build_graph.py).
- Segments, buildings and places count when their midpoint, centroid or point lies inside the box.
- Window score = walk_km + places / 6. A district needs at least 25 km walkable, 60 places, and at most 25% overlap with another district. Rank = half walk_km and half places, each divided by the best value in the list.
- `utm_epsg` is 32650 west of 120 E (Palawan) and 32651 for 120 E to 126 E. Every other city is 32651.
- `s2_l4_cell` is the level-4 S2 cell token for the box centre. Google Open Buildings v3 ships one file per level-4 cell. The research notes in research/20261021T120813Z/ do not name an S2 cell, so `s2cell.py` computed the tokens. A test checked `s2cell.py` against s2sphere on 5,000 random points. Before you download a file, check its token against the Open Buildings file list.
- On the existing districts, the same code gives walk_km 26.98 to 248.87 (median 92) and places 65 to 1380 (median 277). The candidate boxes fall in the same range. `scout/reference_districts.json` holds these values.

## All districts, best first

| Rank | District | City | Walk km | Places | Buildings | Height tags | Covered km | UTM | S2 L4 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | baguio-downtown | Baguio | 122.03 | 851 | 6352 | 3.8% | 4.345 | 32651 | 339 |
| 2 | davao-city-downtown | Davao City | 99.25 | 643 | 5790 | 2.7% | 0.293 | 32651 | 32f |
| 3 | baguio-university-belt | Baguio | 94.01 | 602 | 9652 | 1.1% | 3.595 | 32651 | 339 |
| 4 | baguio-mall-transit-hub | Baguio | 85.34 | 555 | 8212 | 1.4% | 4.107 | 32651 | 339 |
| 5 | cebu-city-downtown | Cebu City | 95.74 | 483 | 4300 | 3.1% | 1.328 | 32651 | 33b |
| 6 | dasmarinas-downtown | Dasmarinas | 128.83 | 225 | 19339 | 0.9% | 1.803 | 32651 | 339 |
| 7 | iloilo-city-downtown | Iloilo City | 93.9 | 424 | 4574 | 1.9% | 1.14 | 32651 | 33b |
| 8 | cebu-city-university-belt | Cebu City | 91.35 | 437 | 4674 | 12.5% | 1.261 | 32651 | 33b |
| 9 | batangas-city-downtown | Batangas City | 70.98 | 554 | 7423 | 17.6% | 0.588 | 32651 | 33b |
| 10 | davao-city-university-belt | Davao City | 90.43 | 404 | 5671 | 2.2% | 0.184 | 32651 | 32f |
| 11 | cebu-city-mall-transit-hub | Cebu City | 70.93 | 511 | 5851 | 0.3% | 0.252 | 32651 | 33b |
| 12 | cagayan-de-oro-downtown | Cagayan de Oro | 82.05 | 436 | 6485 | 2.1% | 0.745 | 32651 | 32f |
| 13 | iloilo-city-university-belt | Iloilo City | 105.96 | 228 | 3209 | 2.4% | 1.77 | 32651 | 33b |
| 14 | dumaguete-downtown | Dumaguete | 73.92 | 402 | 1930 | 7.6% | 0.514 | 32651 | 33b |
| 15 | davao-city-mall-transit-hub | Davao City | 79.65 | 363 | 3738 | 3.0% | 0.485 | 32651 | 32f |
| 16 | zamboanga-city-downtown | Zamboanga City | 80.16 | 343 | 2162 | 11.9% | 0.258 | 32651 | 325 |
| 17 | san-pablo-downtown | San Pablo | 69.92 | 397 | 4065 | 17.2% | 0.193 | 32651 | 33b |
| 18 | angeles-downtown | Angeles and Clark | 91.76 | 249 | 13261 | 3.6% | 0.254 | 32651 | 339 |
| 19 | angeles-university-belt | Angeles and Clark | 96.49 | 216 | 15077 | 0.4% | 0.245 | 32651 | 339 |
| 20 | bacolod-downtown | Bacolod | 79.07 | 329 | 596 | 32.6% | 0.206 | 32651 | 33b |
| 21 | lipa-downtown | Lipa | 87.87 | 264 | 10825 | 2.8% | 2.716 | 32651 | 33b |
| 22 | san-fernando-pampanga-downtown | San Fernando (Pampanga) | 84.59 | 279 | 12816 | 0.7% | 0.062 | 32651 | 339 |
| 23 | mandaue-downtown | Mandaue | 80.81 | 293 | 1572 | 8.9% | 1.361 | 32651 | 33b |
| 24 | los-banos-downtown | Los Banos | 76.88 | 310 | 2127 | 19.6% | 0.864 | 32651 | 33b |
| 25 | tacloban-downtown | Tacloban | 58.36 | 432 | 5779 | 1.9% | 2.628 | 32651 | 331 |
| 26 | naga-downtown | Naga | 73.14 | 314 | 6298 | 1.3% | 0.006 | 32651 | 33b |
| 27 | dasmarinas-university-belt | Dasmarinas | 88.42 | 211 | 7784 | 2.6% | 2.141 | 32651 | 339 |
| 28 | batangas-city-university-belt | Batangas City | 61.1 | 385 | 6194 | 13.6% | 1.05 | 32651 | 33b |
| 29 | general-santos-downtown | General Santos | 87.66 | 203 | 5334 | 1.0% | 0.833 | 32651 | 32f |
| 30 | iloilo-city-mall-transit-hub | Iloilo City | 80.44 | 229 | 2551 | 0.8% | 0.684 | 32651 | 33b |
| 31 | angeles-mall-transit-hub | Angeles and Clark | 71.65 | 282 | 8524 | 5.6% | 0.301 | 32651 | 339 |
| 32 | koronadal-downtown | Koronadal | 82.99 | 200 | 5735 | 2.0% | 0.454 | 32651 | 32f |
| 33 | tarlac-city-downtown | Tarlac City | 79.8 | 220 | 6389 | 0.2% | 0.091 | 32651 | 339 |
| 34 | cagayan-de-oro-university-belt | Cagayan de Oro | 73.49 | 259 | 8060 | 0.9% | 0.0 | 32651 | 32f |
| 35 | santa-rosa-downtown | Santa Rosa and Nuvali | 78.83 | 219 | 1839 | 1.6% | 0.0 | 32651 | 339 |
| 36 | talisay-negros-downtown | Talisay (Negros Occidental) | 84.07 | 181 | 774 | 4.5% | 0.819 | 32651 | 33b |
| 37 | san-fernando-pampanga-university-belt | San Fernando (Pampanga) | 75.67 | 231 | 8665 | 0.6% | 0.0 | 32651 | 339 |
| 38 | antipolo-downtown | Antipolo | 68.8 | 250 | 6292 | 0.1% | 0.027 | 32651 | 339 |
| 39 | legazpi-downtown | Legazpi | 67.91 | 254 | 8054 | 0.2% | 0.0 | 32651 | 33b |
| 40 | mandaue-university-belt | Mandaue | 80.56 | 169 | 1271 | 1.4% | 0.799 | 32651 | 33b |
| 41 | butuan-downtown | Butuan | 74.08 | 206 | 5470 | 0.8% | 0.0 | 32651 | 331 |
| 42 | baliwag-downtown | Baliwag | 73.08 | 211 | 411 | 8.5% | 0.915 | 32651 | 339 |
| 43 | cabanatuan-downtown | Cabanatuan | 74.46 | 201 | 740 | 0.7% | 0.0 | 32651 | 339 |
| 44 | zamboanga-city-university-belt | Zamboanga City | 74.69 | 196 | 1142 | 13.1% | 0.008 | 32651 | 325 |
| 45 | kalibo-downtown | Kalibo | 75.96 | 180 | 5325 | 1.0% | 0.368 | 32651 | 33b |
| 46 | zamboanga-city-mall-transit-hub | Zamboanga City | 62.23 | 268 | 1153 | 11.0% | 0.049 | 32651 | 325 |
| 47 | calamba-downtown | Calamba | 74.27 | 183 | 2358 | 2.8% | 0.0 | 32651 | 33b |
| 48 | pagadian-downtown | Pagadian | 74.08 | 182 | 8668 | 0.1% | 0.0 | 32651 | 325 |
| 49 | dipolog-downtown | Dipolog | 59.72 | 275 | 10745 | 5.1% | 0.076 | 32651 | 325 |
| 50 | legazpi-university-belt | Legazpi | 72.06 | 191 | 8033 | 0.3% | 0.0 | 32651 | 33b |
| 51 | santa-rosa-university-belt (thin) | Santa Rosa and Nuvali | 90.25 | 70 | 2573 | 0.7% | 0.014 | 32651 | 339 |
| 52 | lucena-downtown | Lucena | 78.02 | 141 | 2045 | 0.6% | 0.496 | 32651 | 33b |
| 53 | malolos-downtown | Malolos | 68.0 | 207 | 2441 | 5.1% | 0.166 | 32651 | 339 |
| 54 | tagum-downtown | Tagum | 72.97 | 174 | 6099 | 0.4% | 0.0 | 32651 | 32f |
| 55 | dasmarinas-mall-transit-hub | Dasmarinas | 73.34 | 166 | 5961 | 4.1% | 1.57 | 32651 | 339 |
| 56 | bacolod-university-belt | Bacolod | 70.1 | 186 | 400 | 29.2% | 0.025 | 32651 | 33b |
| 57 | tarlac-city-university-belt (thin) | Tarlac City | 85.4 | 78 | 6388 | 0.1% | 0.091 | 32651 | 339 |
| 58 | balanga-downtown | Balanga | 71.58 | 167 | 7502 | 0.1% | 0.015 | 32651 | 339 |
| 59 | general-santos-university-belt | General Santos | 76.76 | 132 | 5904 | 0.6% | 0.385 | 32651 | 32f |
| 60 | santa-rosa-mall-transit-hub | Santa Rosa and Nuvali | 81.46 | 100 | 1504 | 1.3% | 1.723 | 32651 | 339 |
| 61 | bacolod-mall-transit-hub | Bacolod | 75.2 | 141 | 405 | 11.9% | 0.011 | 32651 | 33b |
| 62 | digos-downtown | Digos | 76.38 | 133 | 945 | 1.9% | 0.0 | 32651 | 32f |
| 63 | san-fernando-pampanga-mall-transit-hub | San Fernando (Pampanga) | 61.3 | 232 | 9538 | 0.4% | 0.0 | 32651 | 339 |
| 64 | mandaue-mall-transit-hub | Mandaue | 77.47 | 125 | 1018 | 2.8% | 2.361 | 32651 | 33b |
| 65 | laoag-downtown | Laoag | 69.27 | 178 | 6252 | 1.1% | 0.0 | 32651 | 339 |
| 66 | batangas-city-mall-transit-hub | Batangas City | 55.97 | 265 | 5697 | 10.1% | 0.0 | 32651 | 33b |
| 67 | lipa-university-belt | Lipa | 67.95 | 172 | 7867 | 4.0% | 0.499 | 32651 | 33b |
| 68 | cagayan-de-oro-mall-transit-hub | Cagayan de Oro | 65.27 | 189 | 8196 | 0.8% | 0.0 | 32651 | 32f |
| 69 | lapu-lapu-downtown | Lapu-Lapu | 74.66 | 122 | 828 | 1.8% | 1.509 | 32651 | 33b |
| 70 | iligan-downtown | Iligan | 66.79 | 173 | 3501 | 0.3% | 0.067 | 32651 | 325 |
| 71 | los-banos-university-belt | Los Banos | 56.02 | 238 | 3780 | 16.0% | 0.494 | 32651 | 33b |
| 72 | dumaguete-university-belt | Dumaguete | 67.1 | 162 | 839 | 5.5% | 0.077 | 32651 | 33b |
| 73 | lucena-university-belt | Lucena | 72.09 | 128 | 1783 | 0.7% | 0.029 | 32651 | 33b |
| 74 | cabanatuan-university-belt | Cabanatuan | 71.3 | 132 | 477 | 2.1% | 0.0 | 32651 | 339 |
| 75 | tarlac-city-mall-transit-hub | Tarlac City | 68.42 | 151 | 5985 | 0.2% | 0.0 | 32651 | 339 |
| 76 | tuguegarao-downtown | Tuguegarao | 61.93 | 191 | 8356 | 0.2% | 0.0 | 32651 | 339 |
| 77 | naga-university-belt | Naga | 62.81 | 184 | 4235 | 0.9% | 0.0 | 32651 | 33b |
| 78 | calapan-downtown | Calapan | 63.0 | 182 | 2987 | 6.1% | 0.0 | 32651 | 33b |
| 79 | iligan-university-belt | Iligan | 65.07 | 164 | 427 | 4.2% | 0.067 | 32651 | 325 |
| 80 | dumaguete-mall-transit-hub | Dumaguete | 55.68 | 226 | 1916 | 3.1% | 0.405 | 32651 | 33b |
| 81 | olongapo-downtown | Olongapo and Subic | 67.72 | 146 | 5141 | 0.4% | 0.447 | 32651 | 339 |
| 82 | roxas-city-downtown | Roxas City | 68.21 | 141 | 4176 | 0.5% | 0.0 | 32651 | 33b |
| 83 | puerto-princesa-downtown | Puerto Princesa | 56.62 | 214 | 3196 | 0.3% | 0.0 | 32650 | 33b |
| 84 | tagbilaran-downtown | Tagbilaran | 61.69 | 180 | 3192 | 2.7% | 0.0 | 32651 | 33b |
| 85 | malolos-university-belt (thin) | Malolos | 77.78 | 64 | 1505 | 1.9% | 0.0 | 32651 | 339 |
| 86 | san-pablo-university-belt | San Pablo | 57.63 | 197 | 2185 | 12.0% | 0.064 | 32651 | 33b |
| 87 | cotabato-city-university-belt | Cotabato City | 68.0 | 127 | 2822 | 0.3% | 0.0 | 32651 | 325 |
| 88 | cotabato-city-downtown | Cotabato City | 63.93 | 153 | 4153 | 0.4% | 0.188 | 32651 | 325 |
| 89 | vigan-downtown | Vigan | 50.43 | 239 | 4291 | 0.7% | 0.0 | 32651 | 339 |
| 90 | ormoc-downtown | Ormoc | 61.39 | 166 | 3647 | 0.6% | 0.486 | 32651 | 331 |
| 91 | lipa-mall-transit-hub | Lipa | 65.99 | 135 | 5186 | 3.2% | 0.463 | 32651 | 33b |
| 92 | general-santos-mall-transit-hub (thin) | General Santos | 76.19 | 60 | 4953 | 0.1% | 0.387 | 32651 | 32f |
| 93 | los-banos-mall-transit-hub | Los Banos | 53.41 | 210 | 672 | 20.4% | 0.799 | 32651 | 33b |
| 94 | tagum-mall-transit-hub | Tagum | 72.73 | 81 | 6295 | 0.2% | 0.0 | 32651 | 32f |
| 95 | tagum-university-belt | Tagum | 65.02 | 129 | 4561 | 0.4% | 0.0 | 32651 | 32f |
| 96 | calamba-university-belt | Calamba | 63.44 | 130 | 1067 | 2.6% | 0.252 | 32651 | 33b |
| 97 | surigao-downtown | Surigao | 59.02 | 146 | 2970 | 0.9% | 0.007 | 32651 | 331 |
| 98 | digos-university-belt (thin) | Digos | 70.28 | 69 | 1242 | 0.6% | 0.0 | 32651 | 32f |
| 99 | legazpi-mall-transit-hub | Legazpi | 47.87 | 213 | 5399 | 0.5% | 0.0 | 32651 | 33b |
| 100 | antipolo-university-belt | Antipolo | 64.21 | 104 | 6929 | 0.1% | 0.092 | 32651 | 339 |
| 101 | koronadal-mall-transit-hub | Koronadal | 63.98 | 105 | 5054 | 1.8% | 0.159 | 32651 | 32f |
| 102 | lapu-lapu-university-belt | Lapu-Lapu | 62.26 | 116 | 1221 | 0.7% | 0.562 | 32651 | 33b |
| 103 | koronadal-university-belt | Koronadal | 64.78 | 99 | 4409 | 0.8% | 0.33 | 32651 | 32f |
| 104 | calamba-mall-transit-hub (thin) | Calamba | 70.44 | 60 | 676 | 1.3% | 0.0 | 32651 | 33b |
| 105 | dagupan-downtown | Dagupan | 50.77 | 188 | 1498 | 1.5% | 0.106 | 32651 | 339 |
| 106 | tacloban-university-belt | Tacloban | 59.11 | 122 | 8788 | 0.2% | 0.315 | 32651 | 331 |
| 107 | lapu-lapu-mall-transit-hub | Lapu-Lapu | 55.61 | 145 | 451 | 6.4% | 0.286 | 32651 | 33b |
| 108 | roxas-city-university-belt (thin) | Roxas City | 65.05 | 73 | 2820 | 0.5% | 0.0 | 32651 | 33b |
| 109 | butuan-mall-transit-hub (thin) | Butuan | 65.23 | 70 | 4083 | 0.2% | 0.0 | 32651 | 331 |
| 110 | naga-mall-transit-hub | Naga | 57.91 | 117 | 2882 | 0.9% | 0.0 | 32651 | 33b |
| 111 | tacloban-mall-transit-hub (thin) | Tacloban | 29.52 | 299 | 2374 | 2.8% | 0.504 | 32651 | 331 |
| 112 | balanga-university-belt | Balanga | 59.34 | 101 | 4210 | 1.4% | 0.194 | 32651 | 339 |
| 113 | butuan-university-belt | Butuan | 52.91 | 134 | 6513 | 0.3% | 0.0 | 32651 | 331 |
| 114 | cabanatuan-mall-transit-hub | Cabanatuan | 53.29 | 116 | 547 | 2.9% | 0.0 | 32651 | 339 |
| 115 | san-pablo-mall-transit-hub (thin) | San Pablo | 39.47 | 207 | 1965 | 19.8% | 0.0 | 32651 | 33b |
| 116 | lucena-mall-transit-hub (thin) | Lucena | 60.08 | 70 | 574 | 1.9% | 0.496 | 32651 | 33b |
| 117 | digos-mall-transit-hub | Digos | 58.22 | 80 | 582 | 2.1% | 0.0 | 32651 | 32f |
| 118 | baliwag-university-belt | Baliwag | 56.49 | 88 | 240 | 5.0% | 0.41 | 32651 | 339 |
| 119 | olongapo-university-belt | Olongapo and Subic | 53.31 | 105 | 7672 | 0.2% | 0.217 | 32651 | 339 |
| 120 | puerto-princesa-university-belt (thin) | Puerto Princesa | 58.57 | 69 | 3426 | 0.3% | 0.0 | 32650 | 33b |
| 121 | antipolo-mall-transit-hub | Antipolo | 51.37 | 116 | 2564 | 0.5% | 0.171 | 32651 | 339 |
| 122 | malolos-mall-transit-hub | Malolos | 50.43 | 115 | 1658 | 1.1% | 0.166 | 32651 | 339 |
| 123 | baliwag-mall-transit-hub (thin) | Baliwag | 55.83 | 71 | 160 | 9.4% | 0.915 | 32651 | 339 |
| 124 | iligan-mall-transit-hub | Iligan | 52.18 | 89 | 394 | 3.0% | 0.0 | 32651 | 325 |
| 125 | ormoc-university-belt (thin) | Ormoc | 55.53 | 61 | 3618 | 0.1% | 0.0 | 32651 | 331 |
| 126 | kalibo-university-belt | Kalibo | 45.02 | 126 | 4726 | 1.2% | 0.0 | 32651 | 33b |
| 127 | tuguegarao-university-belt | Tuguegarao | 49.71 | 95 | 5846 | 0.2% | 0.0 | 32651 | 339 |
| 128 | tagbilaran-mall-transit-hub (thin) | Tagbilaran | 53.04 | 72 | 1616 | 2.2% | 0.0 | 32651 | 33b |
| 129 | balanga-mall-transit-hub (thin) | Balanga | 52.61 | 71 | 3490 | 0.1% | 0.015 | 32651 | 339 |
| 130 | tagaytay-downtown | Tagaytay | 47.22 | 103 | 1669 | 2.3% | 0.522 | 32651 | 33b |
| 131 | laoag-university-belt (thin) | Laoag | 49.49 | 73 | 2730 | 0.5% | 0.0 | 32651 | 339 |
| 132 | vigan-mall-transit-hub (thin) | Vigan | 44.85 | 98 | 2975 | 0.2% | 0.0 | 32651 | 339 |
| 133 | tagaytay-mall-transit-hub (thin) | Tagaytay | 40.59 | 125 | 1712 | 1.2% | 0.036 | 32651 | 33b |
| 134 | tagbilaran-university-belt (thin) | Tagbilaran | 42.27 | 107 | 2607 | 0.3% | 0.003 | 32651 | 33b |
| 135 | laoag-mall-transit-hub (thin) | Laoag | 42.0 | 90 | 3686 | 0.6% | 0.0 | 32651 | 339 |
| 136 | cotabato-city-mall-transit-hub (thin) | Cotabato City | 41.99 | 80 | 807 | 0.6% | 0.0 | 32651 | 325 |
| 137 | dipolog-university-belt (thin) | Dipolog | 26.9 | 175 | 3851 | 7.5% | 0.058 | 32651 | 325 |
| 138 | dipolog-mall-transit-hub (thin) | Dipolog | 34.36 | 123 | 5580 | 4.7% | 0.076 | 32651 | 325 |
| 139 | pagadian-university-belt (thin) | Pagadian | 42.37 | 62 | 5355 | 0.1% | 0.0 | 32651 | 325 |
| 140 | olongapo-mall-transit-hub (thin) | Olongapo and Subic | 41.32 | 61 | 6395 | 0.2% | 0.04 | 32651 | 339 |
| 141 | puerto-princesa-mall-transit-hub (thin) | Puerto Princesa | 37.91 | 78 | 3279 | 0.2% | 0.0 | 32650 | 33b |
| 142 | dagupan-university-belt (thin) | Dagupan | 31.44 | 116 | 551 | 3.4% | 0.12 | 32651 | 339 |
| 143 | dagupan-mall-transit-hub (thin) | Dagupan | 38.5 | 65 | 297 | 3.0% | 0.056 | 32651 | 339 |
| 144 | ormoc-mall-transit-hub (thin) | Ormoc | 31.7 | 98 | 2003 | 0.2% | 0.164 | 32651 | 331 |
| 145 | calapan-university-belt (thin) | Calapan | 30.74 | 101 | 1800 | 6.4% | 0.338 | 32651 | 33b |
| 146 | tuguegarao-mall-transit-hub (thin) | Tuguegarao | 27.36 | 119 | 2532 | 0.5% | 0.0 | 32651 | 339 |
| 147 | talisay-negros-university-belt (thin) | Talisay (Negros Occidental) | 29.85 | 102 | 219 | 9.6% | 0.819 | 32651 | 33b |
| 148 | pagadian-mall-transit-hub (thin) | Pagadian | 29.38 | 103 | 4504 | 0.2% | 0.0 | 32651 | 325 |
| 149 | vigan-university-belt (thin) | Vigan | 33.62 | 63 | 2944 | 0.5% | 0.0 | 32651 | 339 |

## What to build first, city by city

- **Baguio** (Benguet, CAR). Build first: baguio-downtown (rank 1, 122.03 km, 851 places), baguio-university-belt (rank 3, 94.01 km, 602 places), baguio-mall-transit-hub (rank 4, 85.34 km, 555 places). Note: has covered walkways (baguio-downtown, 4.345 km).
- **Davao City** (Davao del Sur, Davao). Build first: davao-city-downtown (rank 2, 99.25 km, 643 places), davao-city-university-belt (rank 10, 90.43 km, 404 places), davao-city-mall-transit-hub (rank 15, 79.65 km, 363 places). 
- **Cebu City** (Cebu, Central Visayas). Build first: cebu-city-downtown (rank 5, 95.74 km, 483 places), cebu-city-university-belt (rank 8, 91.35 km, 437 places), cebu-city-mall-transit-hub (rank 11, 70.93 km, 511 places). Note: height tags on 12.5% of buildings in cebu-city-university-belt.
- **Dasmarinas** (Cavite, CALABARZON). Build first: dasmarinas-downtown (rank 6, 128.83 km, 225 places), dasmarinas-university-belt (rank 27, 88.42 km, 211 places), dasmarinas-mall-transit-hub (rank 55, 73.34 km, 166 places). Note: has covered walkways (dasmarinas-university-belt, 2.141 km).
- **Iloilo City** (Iloilo, Western Visayas). Build first: iloilo-city-downtown (rank 7, 93.9 km, 424 places), iloilo-city-university-belt (rank 13, 105.96 km, 228 places), iloilo-city-mall-transit-hub (rank 30, 80.44 km, 229 places). 
- **Batangas City** (Batangas, CALABARZON). Build first: batangas-city-downtown (rank 9, 70.98 km, 554 places), batangas-city-university-belt (rank 28, 61.1 km, 385 places), batangas-city-mall-transit-hub (rank 66, 55.97 km, 265 places). Note: height tags on 17.6% of buildings in batangas-city-downtown.
- **Cagayan de Oro** (Misamis Oriental, Northern Mindanao). Build first: cagayan-de-oro-downtown (rank 12, 82.05 km, 436 places), cagayan-de-oro-university-belt (rank 34, 73.49 km, 259 places), cagayan-de-oro-mall-transit-hub (rank 68, 65.27 km, 189 places). 
- **Dumaguete** (Negros Oriental, Negros Island Region). Build first: dumaguete-downtown (rank 14, 73.92 km, 402 places), dumaguete-university-belt (rank 72, 67.1 km, 162 places), dumaguete-mall-transit-hub (rank 80, 55.68 km, 226 places). Note: few mapped footprints in dumaguete-university-belt (839 buildings), so shade will lean on Google Open Buildings and the default height.
- **Zamboanga City** (Zamboanga del Sur, Zamboanga Peninsula). Build first: zamboanga-city-downtown (rank 16, 80.16 km, 343 places), zamboanga-city-university-belt (rank 44, 74.69 km, 196 places), zamboanga-city-mall-transit-hub (rank 46, 62.23 km, 268 places). Note: few mapped footprints in zamboanga-city-university-belt, zamboanga-city-mall-transit-hub (1142 to 1153 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers; height tags on 13.1% of buildings in zamboanga-city-university-belt.
- **San Pablo** (Laguna, CALABARZON). Build first: san-pablo-downtown (rank 17, 69.92 km, 397 places), san-pablo-university-belt (rank 86, 57.63 km, 197 places). Skip for now: san-pablo-mall-transit-hub (only 39.47 km walkable). Note: no mapped covered walkways, so only building shade helps walkers; height tags on 19.8% of buildings in san-pablo-mall-transit-hub.
- **Angeles and Clark** (Pampanga, Central Luzon). Build first: angeles-downtown (rank 18, 91.76 km, 249 places), angeles-university-belt (rank 19, 96.49 km, 216 places), angeles-mall-transit-hub (rank 31, 71.65 km, 282 places). 
- **Bacolod** (Negros Occidental, Negros Island Region). Build first: bacolod-downtown (rank 20, 79.07 km, 329 places), bacolod-university-belt (rank 56, 70.1 km, 186 places), bacolod-mall-transit-hub (rank 61, 75.2 km, 141 places). Note: few mapped footprints in bacolod-downtown, bacolod-university-belt, bacolod-mall-transit-hub (400 to 596 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers; height tags on 32.6% of buildings in bacolod-downtown.
- **Lipa** (Batangas, CALABARZON). Build first: lipa-downtown (rank 21, 87.87 km, 264 places), lipa-university-belt (rank 67, 67.95 km, 172 places), lipa-mall-transit-hub (rank 91, 65.99 km, 135 places). Note: has covered walkways (lipa-downtown, 2.716 km).
- **San Fernando (Pampanga)** (Pampanga, Central Luzon). Build first: san-fernando-pampanga-downtown (rank 22, 84.59 km, 279 places), san-fernando-pampanga-university-belt (rank 37, 75.67 km, 231 places), san-fernando-pampanga-mall-transit-hub (rank 63, 61.3 km, 232 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Mandaue** (Cebu, Central Visayas). Build first: mandaue-downtown (rank 23, 80.81 km, 293 places), mandaue-university-belt (rank 40, 80.56 km, 169 places), mandaue-mall-transit-hub (rank 64, 77.47 km, 125 places). Note: few mapped footprints in mandaue-university-belt, mandaue-mall-transit-hub (1018 to 1271 buildings), so shade will lean on Google Open Buildings and the default height; has covered walkways (mandaue-mall-transit-hub, 2.361 km).
- **Los Banos** (Laguna, CALABARZON). Build first: los-banos-downtown (rank 24, 76.88 km, 310 places), los-banos-university-belt (rank 71, 56.02 km, 238 places), los-banos-mall-transit-hub (rank 93, 53.41 km, 210 places). Note: few mapped footprints in los-banos-mall-transit-hub (672 buildings), so shade will lean on Google Open Buildings and the default height; height tags on 20.4% of buildings in los-banos-mall-transit-hub.
- **Tacloban** (Leyte, Eastern Visayas). Build first: tacloban-downtown (rank 25, 58.36 km, 432 places), tacloban-university-belt (rank 106, 59.11 km, 122 places). Skip for now: tacloban-mall-transit-hub (only 29.52 km walkable). Note: has covered walkways (tacloban-downtown, 2.628 km).
- **Naga** (Camarines Sur, Bicol). Build first: naga-downtown (rank 26, 73.14 km, 314 places), naga-university-belt (rank 77, 62.81 km, 184 places), naga-mall-transit-hub (rank 110, 57.91 km, 117 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **General Santos** (South Cotabato, SOCCSKSARGEN). Build first: general-santos-downtown (rank 29, 87.66 km, 203 places), general-santos-university-belt (rank 59, 76.76 km, 132 places). Skip for now: general-santos-mall-transit-hub (only 60 named places). 
- **Koronadal** (South Cotabato, SOCCSKSARGEN). Build first: koronadal-downtown (rank 32, 82.99 km, 200 places), koronadal-mall-transit-hub (rank 101, 63.98 km, 105 places), koronadal-university-belt (rank 103, 64.78 km, 99 places). 
- **Tarlac City** (Tarlac, Central Luzon). Build first: tarlac-city-downtown (rank 33, 79.8 km, 220 places), tarlac-city-mall-transit-hub (rank 75, 68.42 km, 151 places). Skip for now: tarlac-city-university-belt (only 78 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Santa Rosa and Nuvali** (Laguna, CALABARZON). Build first: santa-rosa-downtown (rank 35, 78.83 km, 219 places), santa-rosa-mall-transit-hub (rank 60, 81.46 km, 100 places). Skip for now: santa-rosa-university-belt (only 70 named places). 
- **Talisay (Negros Occidental)** (Negros Occidental, Negros Island Region). Build first: talisay-negros-downtown (rank 36, 84.07 km, 181 places). Skip for now: talisay-negros-university-belt (only 29.85 km walkable). Note: few mapped footprints in talisay-negros-downtown (774 buildings), so shade will lean on Google Open Buildings and the default height.
- **Antipolo** (Rizal, CALABARZON). Build first: antipolo-downtown (rank 38, 68.8 km, 250 places), antipolo-university-belt (rank 100, 64.21 km, 104 places), antipolo-mall-transit-hub (rank 121, 51.37 km, 116 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Legazpi** (Albay, Bicol). Build first: legazpi-downtown (rank 39, 67.91 km, 254 places), legazpi-university-belt (rank 50, 72.06 km, 191 places), legazpi-mall-transit-hub (rank 99, 47.87 km, 213 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Butuan** (Agusan del Norte, Caraga). Build first: butuan-downtown (rank 41, 74.08 km, 206 places), butuan-university-belt (rank 113, 52.91 km, 134 places). Skip for now: butuan-mall-transit-hub (only 70 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Baliwag** (Bulacan, Central Luzon). Build first: baliwag-downtown (rank 42, 73.08 km, 211 places), baliwag-university-belt (rank 118, 56.49 km, 88 places). Skip for now: baliwag-mall-transit-hub (only 71 named places). Note: few mapped footprints in baliwag-downtown, baliwag-university-belt (240 to 411 buildings), so shade will lean on Google Open Buildings and the default height.
- **Cabanatuan** (Nueva Ecija, Central Luzon). Build first: cabanatuan-downtown (rank 43, 74.46 km, 201 places), cabanatuan-university-belt (rank 74, 71.3 km, 132 places), cabanatuan-mall-transit-hub (rank 114, 53.29 km, 116 places). Note: few mapped footprints in cabanatuan-downtown, cabanatuan-university-belt, cabanatuan-mall-transit-hub (477 to 740 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers.
- **Kalibo** (Aklan, Western Visayas). Build first: kalibo-downtown (rank 45, 75.96 km, 180 places), kalibo-university-belt (rank 126, 45.02 km, 126 places). 
- **Calamba** (Laguna, CALABARZON). Build first: calamba-downtown (rank 47, 74.27 km, 183 places), calamba-university-belt (rank 96, 63.44 km, 130 places). Skip for now: calamba-mall-transit-hub (only 60 named places). Note: few mapped footprints in calamba-university-belt (1067 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers.
- **Pagadian** (Zamboanga del Sur, Zamboanga Peninsula). Build first: pagadian-downtown (rank 48, 74.08 km, 182 places). Skip for now: pagadian-university-belt (only 42.37 km walkable, only 62 named places); pagadian-mall-transit-hub (only 29.38 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Dipolog** (Zamboanga del Norte, Zamboanga Peninsula). Build first: dipolog-downtown (rank 49, 59.72 km, 275 places). Skip for now: dipolog-university-belt (only 26.9 km walkable); dipolog-mall-transit-hub (only 34.36 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Lucena** (Quezon, CALABARZON). Build first: lucena-downtown (rank 52, 78.02 km, 141 places), lucena-university-belt (rank 73, 72.09 km, 128 places). Skip for now: lucena-mall-transit-hub (only 70 named places). 
- **Malolos** (Bulacan, Central Luzon). Build first: malolos-downtown (rank 53, 68.0 km, 207 places), malolos-mall-transit-hub (rank 122, 50.43 km, 115 places). Skip for now: malolos-university-belt (only 64 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Tagum** (Davao del Norte, Davao). Build first: tagum-downtown (rank 54, 72.97 km, 174 places), tagum-mall-transit-hub (rank 94, 72.73 km, 81 places), tagum-university-belt (rank 95, 65.02 km, 129 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Balanga** (Bataan, Central Luzon). Build first: balanga-downtown (rank 58, 71.58 km, 167 places), balanga-university-belt (rank 112, 59.34 km, 101 places). Skip for now: balanga-mall-transit-hub (only 71 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Digos** (Davao del Sur, Davao). Build first: digos-downtown (rank 62, 76.38 km, 133 places), digos-mall-transit-hub (rank 117, 58.22 km, 80 places). Skip for now: digos-university-belt (only 69 named places). Note: few mapped footprints in digos-downtown, digos-mall-transit-hub (582 to 945 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers.
- **Laoag** (Ilocos Norte, Ilocos). Build first: laoag-downtown (rank 65, 69.27 km, 178 places). Skip for now: laoag-university-belt (only 73 named places); laoag-mall-transit-hub (only 42.0 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Lapu-Lapu** (Cebu, Central Visayas). Build first: lapu-lapu-downtown (rank 69, 74.66 km, 122 places), lapu-lapu-university-belt (rank 102, 62.26 km, 116 places), lapu-lapu-mall-transit-hub (rank 107, 55.61 km, 145 places). Note: few mapped footprints in lapu-lapu-downtown, lapu-lapu-university-belt, lapu-lapu-mall-transit-hub (451 to 1221 buildings), so shade will lean on Google Open Buildings and the default height.
- **Iligan** (Lanao del Norte, Northern Mindanao). Build first: iligan-downtown (rank 70, 66.79 km, 173 places), iligan-university-belt (rank 79, 65.07 km, 164 places), iligan-mall-transit-hub (rank 124, 52.18 km, 89 places). Note: few mapped footprints in iligan-university-belt, iligan-mall-transit-hub (394 to 427 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers.
- **Tuguegarao** (Cagayan, Cagayan Valley). Build first: tuguegarao-downtown (rank 76, 61.93 km, 191 places), tuguegarao-university-belt (rank 127, 49.71 km, 95 places). Skip for now: tuguegarao-mall-transit-hub (only 27.36 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Calapan** (Oriental Mindoro, MIMAROPA). Build first: calapan-downtown (rank 78, 63.0 km, 182 places). Skip for now: calapan-university-belt (only 30.74 km walkable). 
- **Olongapo and Subic** (Zambales, Central Luzon). Build first: olongapo-downtown (rank 81, 67.72 km, 146 places), olongapo-university-belt (rank 119, 53.31 km, 105 places). Skip for now: olongapo-mall-transit-hub (only 41.32 km walkable, only 61 named places). 
- **Roxas City** (Capiz, Western Visayas). Build first: roxas-city-downtown (rank 82, 68.21 km, 141 places). Skip for now: roxas-city-university-belt (only 73 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Puerto Princesa** (Palawan, MIMAROPA). Build first: puerto-princesa-downtown (rank 83, 56.62 km, 214 places). Skip for now: puerto-princesa-university-belt (only 69 named places); puerto-princesa-mall-transit-hub (only 37.91 km walkable, only 78 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Tagbilaran** (Bohol, Central Visayas). Build first: tagbilaran-downtown (rank 84, 61.69 km, 180 places). Skip for now: tagbilaran-mall-transit-hub (only 72 named places); tagbilaran-university-belt (only 42.27 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Cotabato City** (Maguindanao del Norte, BARMM). Build first: cotabato-city-university-belt (rank 87, 68.0 km, 127 places), cotabato-city-downtown (rank 88, 63.93 km, 153 places). Skip for now: cotabato-city-mall-transit-hub (only 41.99 km walkable). Note: no mapped covered walkways, so only building shade helps walkers.
- **Vigan** (Ilocos Sur, Ilocos). Build first: vigan-downtown (rank 89, 50.43 km, 239 places). Skip for now: vigan-mall-transit-hub (only 44.85 km walkable); vigan-university-belt (only 33.62 km walkable, only 63 named places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Ormoc** (Leyte, Eastern Visayas). Build first: ormoc-downtown (rank 90, 61.39 km, 166 places). Skip for now: ormoc-university-belt (only 61 named places); ormoc-mall-transit-hub (only 31.7 km walkable). 
- **Surigao** (Surigao del Norte, Caraga). Build first: surigao-downtown (rank 97, 59.02 km, 146 places). Note: no mapped covered walkways, so only building shade helps walkers.
- **Dagupan** (Pangasinan, Ilocos). Build first: dagupan-downtown (rank 105, 50.77 km, 188 places). Skip for now: dagupan-university-belt (only 31.44 km walkable); dagupan-mall-transit-hub (only 38.5 km walkable, only 65 named places). Note: few mapped footprints in dagupan-downtown (1498 buildings), so shade will lean on Google Open Buildings and the default height; no mapped covered walkways, so only building shade helps walkers.
- **Tagaytay** (Cavite, CALABARZON). Build first: tagaytay-downtown (rank 130, 47.22 km, 103 places). Skip for now: tagaytay-mall-transit-hub (only 40.59 km walkable). 

## Joint entries and name checks

- Clark's own best box scores 71.8 km and 248 places, bbox [120.57, 15.162, 120.59, 15.178]. It overlaps angeles-mall-transit-hub (SM City Clark), so Clark got no separate district. Build that district to cover Clark.
- Subic's own best box scores 59.64 km and 131 places, bbox [120.266, 14.818, 120.286, 14.834]. It sits on olongapo-downtown (Subic Bay side), so Subic got no separate district.
- Nuvali's own best box scores 55.31 km and 62 places, bbox [121.046, 14.234, 121.066, 14.25]. OSM has its roads but few named places. Skip it.
- santa-rosa-downtown lies on the Santa Rosa and Biñan border (Biñan malls and colleges). Check the name before the app shows it.
- Mandaue and Lapu-Lapu share the Cebu metro. The script `score.py` chose their boxes after Cebu City, so none overlaps a Cebu district by more than 25%.
- The national scan added 14 cities that were not on the request list. Each had a box with 100+ places. They are Talisay (Negros Occidental), Dasmarinas, Tarlac City, Los Banos, San Pablo, Lucena, Pagadian, Digos, Baliwag, Kalibo, Tagum, Balanga, Calapan and Dipolog. They have the same measures as the listed cities. Dasmarinas ranks 6th.

## Cities dropped

- No city on the list lost all of its districts. Each has at least one box with 25 km walkable and 60 places.
- The table marks each district skipped as thin (under 45 km walkable or under 80 places).
