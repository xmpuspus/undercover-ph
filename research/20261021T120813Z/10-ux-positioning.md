# A landmark-first web page with a shelter mode fits Metro Manila and stays defensible against Google

Written 2026-10-21. Labels: [VERIFIED] means the page was read. [UNVERIFIED] means a search snippet, recall, or a gap.
Money figures use pesos. No number here comes from the author.

## Summary

- Recommended format: landmark-first list with a small map. Show the percent covered for each route.
- Ship a mobile web page (PWA later). Do not ship a native app first.
- Defensible position: covered and sheltered routes through private malls, with opening hours and local landmarks.
- Google has not shipped "Prefer shade" as of the latest coverage found (2026-08-28). [VERIFIED]

## 1. Walkers in Metro Manila are many, and safety changes their route

### Who walks and why

- MUCEP data show walking at 30.7% of Metro Manila trips, with a data-quality caveat. [VERIFIED in 06, TSSP 2022, p. 23]
- Move As One figures: about 77.5% of travel time is walking. Only 5% of roads are pedestrian-safe. [VERIFIED, Tribune 2025-08-01]
- Those figures are advocacy figures. The Tribune page gives no method. Treat them as context, not as a measured rate.
- Commute legs to MRT, LRT, bus, and jeepney stops are the main demand. [UNVERIFIED: no leg-length source found]
- Office lunch walks (Makati, BGC, Ortigas) are a likely second use. [UNVERIFIED: no survey found]
- Students: a FEU-led audit of the Manila U-Belt ran 8 p.m. to 9:30 p.m. with 60 students. [VERIFIED, Interaksyon 2019]
- That audit credited arcade walkways and frequent crossings for good walk scores. [VERIFIED]
- Heat and flood pressure is real. See 06: 38.8 C record (2024-04-27) and pedestrians in floodwater on Taft (2026-09-09). [VERIFIED in 06]

### Safety concerns that change route choice

- SafetiPin audited 5,839 records in Manila and Quezon City, July to November 2016. [VERIFIED]
- Its overall Metro Manila score was 3.2 of 5. Security rated below average. Lighting rated above average overall. [VERIFIED]
- In low-scoring UP Diliman spots, auditors wrote that the footpath was "broken and obstructed". [VERIFIED]
- A Tribune column (2026-09-11) says the same study found poor lighting and no security at half of locations. [UNVERIFIED: snippet only]
- That column conflicts with the SafetiPin page on lighting. Use the SafetiPin page as the primary source.
- The audit is ten years old. It is not current evidence for any one street.
- Footbridges: critics say they lengthen walks, take pedestrians off the street, and exclude people who cannot climb stairs. [UNVERIFIED: Manila Times opinion snippet]
- MMDA says it built the EDSA-Kamuning footbridge partly to reduce theft in a dim area. [UNVERIFIED: snippet]
- Pedestrian crashes were the most fatal road incident type in 2024, mostly 6 p.m. to 6 a.m. [UNVERIFIED: Tribune snippet citing MMDA]
- A Quiapo footbridge slip injury (2025-06-07) shows wet stairs matter in rain. [UNVERIFIED: snippet]
- No source measured sidewalk obstruction rates. [UNVERIFIED gap]

Design effect: add a "night" check and a "stairs" flag. Let the user avoid footbridges and underpasses.

## 2. Android dominates, data is cheap, and a web page should ship first

- Android was 86.53% and iOS 13.47% of Philippine mobile web traffic, September 2026. [VERIFIED, StatCounter]
- StatCounter measures web visits, not devices sold. Other views show 85.56% to 88.23% Android. [UNVERIFIED: snippets]
- Prepaid data fell from 21.50 to 7.07 pesos per GB. [VERIFIED, TelecomLead]
- The page does not name the period or confirm DICT as the price source. [VERIFIED gap]
- Median mobile download speed: 59.64 Mbps at end of 2025 (Ookla, via DataReportal). [VERIFIED]
- The TelecomLead page gives 43.80 Mbps for Q1 2026 from DICT. The two figures differ. Cite neither as a floor.
- 98.0 million internet users, 83.8% penetration, end of 2025. [VERIFIED, DataReportal]
- Transsion led shipments with 33% in Q2 2026. Xiaomi 22%, Samsung 16% (Omdia). [VERIFIED]
- Omdia shows buyers moving to higher price bands, but only for the region. [VERIFIED]
- I found no Philippine share of low-end or low-storage phones. [UNVERIFIED gap]
- I found no Philippine PWA versus native study. [UNVERIFIED gap]

Recommendation for release 1: a mobile web page. Reasons:

1. Singapore's 2026 tool is a web page. About 95% of its users chose the recommended route. [VERIFIED]
2. A web link spreads through chat apps without an install.
3. Android share is high, so test on mid-range Android Chrome first.
4. A PWA install prompt adds offline map tiles later. This is a design choice, not a finding.

Keep the first page light. Budget: one map style, no 3D, vector tiles only. [design rule]

## 3. Use English labels with Filipino place words, and test Taglish copy

- Sakay.ph UI is English. Filipino appears only in user posts. [VERIFIED, via r.jina.ai]
- NOAH UI is English: "Know Your Hazards", "Check Weather Updates". [VERIFIED]
- PAGASA and MMDA pages in the weather audit use English. [VERIFIED in 07]
- A localization vendor says Taglish is a normal register and pure Filipino can sound stiff. [UNVERIFIED: vendor view]
- I found no PH civic-app study that compares English, Filipino, and Taglish UI. [UNVERIFIED gap]

Decision: ship English plus short Taglish helper text. Offer a Filipino toggle only after user tests.

### Ten UI strings (product copy, exempt from STE)

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

### What the references show

- Singapore 2025 [VERIFIED]: all testers wanted geo-tracking. All liked landmark directions and photos. Orientation at start was critical.
- Singapore 2026 [VERIFIED]: three routes, a percent shaded per route, and a recommended default.
- Cool Walks Barcelona: user sets start, end, time of day, and sun level. It reports the percent exposed. [UNVERIFIED: news snippets]
- Cool Walks has a "vampire mode" and shows fountains and shelter spots. [UNVERIFIED: snippet]
- ASU Cool Routes: a website for phones, one campus, an app planned for 2027. [VERIFIED, azfamily]
- ASU picks the coolest path by mean radiant temperature. [VERIFIED]
- HeiGIT: web app, openrouteservice, shade from surface models, over 80 German cities. [UNVERIFIED: snippets]
- I found no ShadeMap route feature. Shadowmap shows sun and shadow layers. [UNVERIFIED: snippets]
- I could not see the map or list layout of Cool Walks, ASU, or HeiGIT. [UNVERIFIED gap]

### Format choice

- Map-first fails indoors. GPS is rarely available inside buildings. [UNVERIFIED: Google indoor-map coverage, 2011 to 2018]
- Landmark-first works without a position fix. The user confirms each landmark by sight.
- Use a list of steps with a landmark photo or name, plus a small map for context.
- Example step: "Exit Ayala MRT, take the stairs to the elevated walkway toward SM Makati." [template]
- Show a "you are here" button that the user taps. Do not rely on GPS inside malls.

## 5. Shelter routes need hours, access rules, and a closed-passage rule

- I found no posted hours for Makati covered walkways or underpasses. [UNVERIFIED gap]
- The Ayala MRT concourse is reachable only from the southbound entrance and the SM Makati bridgeway. [VERIFIED, Wikipedia]
- The same page says a walkway links the station to SM Makati and One Ayala. [VERIFIED]
- I did not find whether the walkway is inside the fare-paid area. [UNVERIFIED gap]
- Cubao to LRT-2 passes through a mall, and the LRT-2 side needs a fare tap. [UNVERIFIED: transfer guide snippet]
- Mall bag checks are private house rules, not a national rule. [UNVERIFIED: legal commentary snippet]
- A 2024 school guide lists Bonifacio Central Square hours as 11 a.m. to 9:30 p.m. [UNVERIFIED: secondhand]
- No source gave BGC covered walkway hours. [UNVERIFIED gap]

### Rule for a passage that closes at 10 PM

1. Store an opening-hours field per segment: open, close, and a confidence tag.
2. Before the close time, route through it and show "Closes at 10 PM".
3. From 30 minutes before close, warn and show the open alternative.
4. After close, remove it from the graph and say so on the route card.
5. If hours are unknown, mark "Hours not confirmed". Do not hide the segment. Lower the shelter score.
6. Add a "report: closed" button. Do not promise live status without field reports.

Mirror the flood rule from flood-status-ph: never claim a state the data cannot prove. [from 00]

## 6. Google can copy sun routing, not Manila's covered network

### Status of the Google toggle

- Android Authority found "Prefer shade" in Google Maps 25.45.02.826664481 in November 2025. [VERIFIED via r.jina.ai]
- The toggle did not work for the reviewer. Google gave no method. [VERIFIED]
- A report of 2026-08-28 says Google has not launched or confirmed it. [VERIFIED, Techloy]
- Searches for October 2026 found no launch. [UNVERIFIED: absence]
- Competitors already shipped. Geuneullo (Korea, July 2026) and Yandex Green Routes in Tashkent (August 2026). [VERIFIED, Techloy]
- Google added Gemini to walking directions in January 2026. It names landmarks and answers questions. [UNVERIFIED: snippets]
- No source says Google routes by rain shelter or covered walkways. [UNVERIFIED absence]

### What Google can do

- Use Street View LiDAR, building heights, and tree data at city scale. [UNVERIFIED: speculation in reports]
- Show minutes in sun. The app strings suggest this. [VERIFIED]

### What Google cannot easily do in Manila

- Know which private mall passages are open at 10 PM. The owners are MaCEA, Ayala, and others. [from 06]
- Add rain shelter as a first-class route cost.
- Rank routes by percent covered across footbridges and elevated walkways.
- Give landmark steps in Taglish. [UNVERIFIED: inference]
- Sakay shows the local-app gap is real. It covers transit legs but no covered walkways. [from 06]
- Google data quality for Manila pedestrian paths is unmeasured. [UNVERIFIED gap]

### Defensible position (three sentences)

This project routes by cover from sun and rain, not by sun alone. It uses the covered walkways, footbridges, and mall passages of Metro Manila, with opening hours and local landmark steps. Google would need private owner data and field work in each district to match it.

Risk: if Google ships rain-aware routing, this position weakens. Watch Google release notes monthly.

## 7. Three shareable artifacts for a portfolio post

All numbers are templates. Fill them only from this project's routing output.

1. Route card pair. "Shortest walk from [Ayala MRT] to [Greenbelt] is [X]% covered. A [N]% longer walk is [Y]% covered."
   - Visual: two routes on a dark map with a percent bar for each.
2. Rain-mode GIF. A walk from [MRT stop] to [office] under a mock "rain" switch. The route changes from [A] to [B].
   - Visual: 6-second screen capture of the real tool.
3. Coverage map of a pilot district. Share of walkable street length that is covered, by block, for [Makati CBD].
   - Visual: choropleth with one headline number [Z]% and the method line.

Best first post: option 1. It matches the Singapore example and needs one routing run.

## 8. Six more name options

Checks: GitHub repo search and one web search. No domain was registered. Domain fetches failed. [UNVERIFIED: domains]

| Name | Meaning | GitHub check | Note |
|---|---|---|---|
| Habong | A cover over you, a canopy | 4 repos, none a router | Distinct, short |
| Kanlong | Shelter, refuge | 2 repos, none a router | Fits rain mode |
| Anino | Shadow | 0 repos for "anino map" | Common word, likely taken as a brand |
| Kubol | Small hut or booth | 383 repos, mostly noise | Search noise from Kubernetes names |
| Lakad Lilim | Walk in shade | 0 repos | Two words, clear meaning |
| Silungan | A place of shelter | 4 repos, one is a Baguio center system | Weaker, name in public use |

- "Takip" was dropped. It means "tracking" in Turkish and gives 14,285 repo hits. [VERIFIED]
- "Bubong" was avoided. It is the name of a sibling tool in the ghost-watts project. [from memory of local assets]
- The web search found no app named Habong, Kanlong, Kubol, or Anino in the Philippines. [UNVERIFIED: weak search]
- Shortlist: Habong, Kanlong, Lakad Lilim.

## Top 3 interface rules

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
