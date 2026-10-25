# A landmark-first web page with a shelter mode suits Metro Manila, and no source shows Google routing by rain shelter

Written 2026-10-21. The label [VERIFIED] means that I read the page. The label [UNVERIFIED] means a search snippet, recall, or a gap.
Money figures use pesos. No number here comes from the author.

## The recommended release is a landmark-first mobile web page

- Use a landmark-first list with a small map. Show the percent covered for each route.
- Ship a mobile web page (PWA later). Do not ship a native app first.
- Covered and sheltered routes through private malls, with opening hours and local landmarks, are the defensible position.
- Google has not shipped "Prefer shade" as of the latest coverage found (2026-08-28). [VERIFIED]

## 1. Walking was 30.7% of Metro Manila trips in 2012 to 2014 MUCEP data, and the route needs night and stairs flags

### Commute legs to transit stops are the likely main use, but no survey measures it

- MUCEP data show walking at 30.7% of Metro Manila trips, with a warning on data quality. [VERIFIED] (in 06, TSSP 2022, p. 23)
- Move As One figures say that walking takes about 77.5% of travel time. Only 5% of roads are pedestrian-safe. [VERIFIED] (Tribune 2025-08-01)
- Those figures are advocacy figures. The Tribune page gives no method. Treat them not as a measured rate but as context.
- Commute legs to MRT, LRT, bus, and jeepney stops are the main demand. [UNVERIFIED] (no leg-length source found)
- Office lunch walks (Makati, BGC, Ortigas) are a likely second use. [UNVERIFIED] (no survey found)
- For students, a FEU-led audit of the Manila U-Belt ran 8 p.m. to 9:30 p.m. with 60 students. [VERIFIED] (Interaksyon 2019)
- That audit credited arcade walkways and frequent crossings for good walk scores. [VERIFIED]
- Report 06 records heat and flood events, a 38.8 C record (2024-04-27) and pedestrians in floodwater on Taft (2026-09-09). [VERIFIED] (in 06)

### SafetiPin's 2016 audit of Manila and Quezon City scored 3.2 of 5, with security below average

- SafetiPin audited 5,839 records in Manila and Quezon City, July to November 2016. [VERIFIED]
- Its overall Metro Manila score was 3.2 of 5. Security rated below average. Lighting rated above average overall. [VERIFIED]
- In low-scoring UP Diliman spots, auditors wrote that the footpath was "broken and obstructed". [VERIFIED]
- A Tribune column (2026-09-11) says the same study found poor lighting and no security at half of locations. [UNVERIFIED] (snippet only)
- That column conflicts with the SafetiPin page on lighting. Use the SafetiPin page as the primary source.
- The audit is ten years old. It is not current evidence for any one street.
- Critics say that footbridges lengthen walks, take pedestrians off the street, and exclude people who cannot climb stairs. [UNVERIFIED] (Manila Times opinion snippet)
- MMDA says it built the EDSA-Kamuning footbridge partly to reduce theft in a dim area. [UNVERIFIED] (snippet)
- Pedestrian crashes were the most fatal road incident type in 2024, mostly 6 p.m. to 6 a.m. [UNVERIFIED] (Tribune snippet citing MMDA)
- A Quiapo footbridge slip injury (2025-06-07) shows wet stairs matter in rain. [UNVERIFIED] (snippet)
- No source measured sidewalk obstruction rates. [UNVERIFIED gap]

For the design, add a "night" check and a "stairs" flag. Let the user avoid footbridges and underpasses.

## 2. Android had 86.53% of Philippine mobile web traffic in September 2026, and prepaid data fell to 7.07 pesos per GB

- Android was 86.53% and iOS 13.47% of Philippine mobile web traffic, September 2026. [VERIFIED] (StatCounter)
- StatCounter measures web visits. It does not count devices sold. Other views show 85.56% to 88.23% Android. [UNVERIFIED] (snippets)
- Prepaid data fell from 21.50 to 7.07 pesos per GB. [VERIFIED] (TelecomLead)
- The page does not name the period or confirm DICT as the price source. [VERIFIED] (gap)
- The median mobile download speed was 59.64 Mbps at end of 2025 (Ookla, via DataReportal). [VERIFIED]
- The TelecomLead page gives 43.80 Mbps for Q1 2026 from DICT. The two figures differ. Cite neither as a floor.
- The Philippines had 98.0 million internet users, 83.8% penetration, at end of 2025. [VERIFIED] (DataReportal)
- Transsion led shipments with 33% in Q2 2026. Xiaomi 22%, Samsung 16% (Omdia). [VERIFIED]
- Omdia shows buyers moving to higher price bands, but only for the region. [VERIFIED]
- I found no Philippine share of low-end or low-storage phones. [UNVERIFIED gap]
- I found no Philippine PWA versus native study. [UNVERIFIED gap]

For release 1, ship a mobile web page, for these four reasons.

1. Singapore's 2026 tool is a web page. About 95% of its users chose the recommended route. [VERIFIED]
2. A web link spreads through chat apps without an install.
3. Android share is high, so test on mid-range Android Chrome first.
4. A PWA install prompt adds offline map tiles later (a design choice with no source).

Keep the first page light, with one map style, no 3D, and vector tiles only. [design rule]

## 3. Use English labels with Filipino place words, and test Taglish copy

- Sakay.ph UI is English. Filipino appears only in user posts. [VERIFIED] (via r.jina.ai)
- NOAH UI is English, for example "Know Your Hazards" and "Check Weather Updates". [VERIFIED]
- PAGASA and MMDA pages in the weather audit use English. [VERIFIED] (in 07)
- A localization vendor says Taglish is a normal register and pure Filipino can sound stiff. [UNVERIFIED] (vendor view)
- I found no PH civic-app study that compares English, Filipino, and Taglish UI. [UNVERIFIED gap]

Ship English plus short Taglish helper text. Offer a Filipino toggle only after user tests.

### Ten proposed UI strings in English and Taglish

| Action | English | Taglish |
|---|---|---|
| Mode: shade | Shaded | Malilim |
| Mode: shelter | Sheltered | May bubong |
| Rain mode label | Rain mode: covered walks first | Umuulan: sa may bubong muna |
| Start point | Where are you now? | Nasaan ka ngayon? |
| Destination | Where to? | Saan ka papunta? |
| Recommended route | Recommended: 80% covered | Rekomendado: 80% may takip |
| Shortest route | Shortest | Pinakamaikli |
| Closes soon | Closes at 10 PM | Sarado ng 10 PM |
| Stairs warning | Has stairs | May hagdan |
| Night warning | Dim at night | Madilim pag gabi |

Check "Malilim" and "May bubong" with five Manila walkers before use. [open test]

## 4. Landmark-first fits mall-to-mall routes where GPS fails

### Singapore testers liked landmark directions, Singapore shows a percent shaded, and news snippets say Cool Walks shows a percent exposed

- In Singapore 2025, all testers wanted geo-tracking. All liked landmark directions and photos. Orientation at start was critical. [VERIFIED]
- Singapore 2026 shows three routes, a percent shaded per route, and a recommended default. [VERIFIED]
- In Cool Walks Barcelona, the user sets start, end, time of day, and sun level. The tool reports the percent exposed. [UNVERIFIED] (news snippets)
- Cool Walks has a "vampire mode" and shows fountains and shelter spots. [UNVERIFIED] (snippet)
- ASU Cool Routes is a website for phones on one campus, with an app planned for 2027. [VERIFIED] (azfamily)
- ASU picks the coolest path by mean radiant temperature. [VERIFIED]
- HeiGIT is a web app on openrouteservice, with shade from surface models, in over 80 German cities. [UNVERIFIED] (snippets)
- I found no ShadeMap route feature. Shadowmap shows sun and shadow layers. [UNVERIFIED] (snippets)
- I could not see the map or list layout of Cool Walks, ASU, or HeiGIT. [UNVERIFIED gap]

### Use a landmark step list with a small map, because GPS fails indoors

- Map-first fails indoors. GPS is rarely available inside buildings. [UNVERIFIED] (Google indoor-map coverage, 2011 to 2018)
- Landmark-first works without a position fix. The user confirms each landmark by sight.
- Use a list of steps with a landmark photo or name, plus a small map for context.
- An example step is "Exit Ayala MRT, take the stairs to the elevated walkway toward SM Makati." [template]
- Show a "you are here" button that the user taps. Do not rely on GPS inside malls.

## 5. Shelter routes need hours, access rules, and a closed-passage rule

- I found no posted hours for Makati covered walkways or underpasses. [UNVERIFIED gap]
- The Ayala MRT concourse is reachable only from the southbound entrance and the SM Makati bridgeway. [VERIFIED] (Wikipedia)
- The same page says a walkway links the station to SM Makati and One Ayala. [VERIFIED]
- I did not find whether the walkway is inside the fare-paid area. [UNVERIFIED gap]
- Cubao to LRT-2 passes through a mall, and the LRT-2 side needs a fare tap. [UNVERIFIED] (transfer guide snippet)
- Mall bag checks are private house rules. No national rule sets them. [UNVERIFIED] (legal commentary snippet)
- A 2024 school guide lists Bonifacio Central Square hours as 11 a.m. to 9:30 p.m. [UNVERIFIED] (secondhand)
- No source gave BGC covered walkway hours. [UNVERIFIED gap]

### Rule for a passage that closes at 10 PM

1. Store an opening-hours field per segment, with open, close, and a confidence tag.
2. Before the close time, route through it and show "Closes at 10 PM".
3. From 30 minutes before close, warn and show the open alternative.
4. After close, remove it from the graph and say so on the route card.
5. If hours are unknown, mark "Hours not confirmed". Do not hide the segment. Lower the shelter score.
6. Add a "report: closed" button. Do not promise live status without field reports.

Use the flood rule from flood-status-ph. Never claim a state that the data cannot prove. [from 00]

## 6. Google can probably copy sun routing, but Manila's covered network needs private owner data

### Google had not launched "Prefer shade" as of 2026-08-28

- Android Authority found "Prefer shade" in Google Maps 25.45.02.826664481 in November 2025. [VERIFIED] (via r.jina.ai)
- The toggle did not work for the reviewer. Google gave no method. [VERIFIED]
- A report of 2026-08-28 says Google has not launched or confirmed it. [VERIFIED] (Techloy)
- Searches for October 2026 found no launch. [UNVERIFIED] (absence)
- Competitors already shipped, Geuneullo (Korea, July 2026) and Yandex Green Routes in Tashkent (August 2026). [VERIFIED] (Techloy)
- Google added Gemini to walking directions in January 2026. It names landmarks and answers questions. [UNVERIFIED] (snippets)
- No source says Google routes by rain shelter or covered walkways. [UNVERIFIED absence]

### Google can probably model sun at city scale and show minutes in sun

- Use Street View LiDAR, building heights, and tree data at city scale. [UNVERIFIED] (speculation in reports)
- Show minutes in sun. The app strings suggest this. [VERIFIED]

### Private passage hours and rain shelter are hard for Google to add in Manila

- Know which private mall passages are open at 10 PM. The owners are MaCEA, Ayala, and others. [from 06]
- Add rain shelter as a core route cost.
- Rank routes by percent covered across footbridges and elevated walkways.
- Give landmark steps in Taglish. [UNVERIFIED] (inference)
- Sakay covers transit legs but no covered walkways. [from 06]
- No source measures Google data quality for Manila pedestrian paths. [UNVERIFIED gap]

### The defensible position is cover from sun and rain on Manila's covered walkways

This project routes by cover from both sun and rain. It uses the covered walkways, footbridges, and mall passages of Metro Manila, with opening hours and local landmark steps. Google would need private owner data and field work in each district to match it.

If Google ships rain-aware routing, this position weakens. Watch Google release notes monthly.

## 7. Of three shareable artifacts, the route card pair is the best first post

All numbers are templates. Fill them only from this project's routing output.

1. Route card pair. "Shortest walk from [Ayala MRT] to [Greenbelt] is [X]% covered. A [N]% longer walk is [Y]% covered."
   - The visual is two routes on a dark map with a percent bar for each.
2. Rain-mode GIF. A walk from [MRT stop] to [office] under a mock "rain" switch. The route changes from [A] to [B].
   - The visual is a 6-second screen capture of the real tool.
3. Coverage map of a pilot district. It shows the share of walkable street length with cover, by block, for [Makati CBD].
   - The visual is a choropleth with one headline number [Z]% and the method line.

The best first post is the route card pair. It matches the Singapore example and needs one routing run.

## 8. Habong, Kanlong, and Lakad Lilim lead six new name options

The checks were a GitHub repo search and one web search. I registered no domain. Domain fetches failed. [UNVERIFIED] (domains)

| Name | Meaning | GitHub check | Note |
|---|---|---|---|
| Habong | A cover over you, a canopy | 4 repos, none a router | Distinct, short |
| Kanlong | Shelter, refuge | 2 repos, none a router | Fits rain mode |
| Anino | Shadow | 0 repos for "anino map" | Common word, likely taken as a brand |
| Kubol | Small hut or booth | 383 repos, mostly noise | Search noise from Kubernetes names |
| Lakad Lilim | Walk in shade | 0 repos | Two words, clear meaning |
| Silungan | A place of shelter | 4 repos, one is a Baguio center system | Weaker, name in public use |

- I dropped "Takip". It means "tracking" in Turkish and gives 14,285 repo hits. [VERIFIED]
- I avoided "Bubong". It is the name of a sibling tool in the ghost-watts project. [from memory of local assets]
- The web search found no app named Habong, Kanlong, Kubol, or Anino in the Philippines. [UNVERIFIED] (weak search)
- The shortlist is Habong, Kanlong, and Lakad Lilim.

## Three interface rules are percent covered, landmark steps, and segment flags

1. Show three routes with a percent covered each, and preselect the recommended one.
2. Give landmark steps with photos. Let the user tap "I am here" instead of trusting GPS.
3. Show opening hours, stairs, and night flags on each segment. Never claim live flood status.

## Open questions [UNVERIFIED gaps]

- Share of low-end or low-storage Philippine phones. No source found.
- PWA versus native evidence for the Philippines. No source found.
- Posted hours for MaCEA walkways, BGC walkways, and MRT paid-area rules.
- Sidewalk obstruction rates and current night-safety data after 2016.
- Layout of Cool Walks, ASU, and HeiGIT screens.
- Whether Google ships "Prefer shade" after 2026-08-28.
- Domain status for all six name options.
- Whether Taglish copy tests better than English with Manila walkers.
