# Singapore Undercover uses a four-step map-first flow with three labelled routes

We checked the live site with a scripted browser (agent-browser) on 2026-10-21 at about 23:50 Singapore time, at a viewport of 1440 x 900. The screenshots are in this folder.

## The flow runs from landing to destination search, trip setup, and results

1. Landing (`01-landing-1440.png`)
   - Full-screen 3D Mapbox map, tilted, dark night style over Marina Bay.
   - A black top banner says "This is a prototype, available for testing and feedback purposes only..." with "Learn More" and a close X.
   - One frosted-glass card sits in the centre. It holds the title "Stay Undercover", one sentence of body text, and the question "Which route would you like to search?"
   - Two equal buttons with icons read "Shaded" (sun icon) and "Sheltered" (rain icon).
2. Destination search (`02-shaded-step1-1440.png`, `03-search-typed-1440.png`)
   - Card moves to the bottom left, about 384 px wide.
   - A segmented toggle offers "Shaded routes" and "Sheltered routes".
   - A search box with a pin icon reads "Find shaded routes to..."
   - A list of suggested places shows Marina Bay Sands, Orchard Road, Sentosa Island, and Gardens by the Bay. Each has an address line.
   - When the user types, the panel grows to full height. It shows a back arrow, a clear X, and results with a name and an address.
   - A footer pill holds Privacy, Terms of Use, and Feedback.
3. Trip setup (`04-after-pick-1440.png`)
   - The top left has a date chip ("Today", calendar icon) and an hour chip ("11pm").
   - Date chip opens Today, Tomorrow, and one more day. The hour chip opens a row of 24 hour pills across the top.
   - The bottom-left card has "Start from" (target icon) and "End at" (pin icon), joined by a dotted line.
   - The hour list for today shows only hours still ahead.
4. Results (`07-routes-1440.png` at 11 PM, `11-routes-4pm-1440.png` at 4 PM tomorrow)
   - A weather chip shows "37.8 C, Partly cloudy" and "UV Index: 4" under the date chips.
   - Two small segmented controls above the card switch between Walking and Cycling, and between "Stay cool" (sun) and "Stay dry" (rain).
   - The card shows a green-dot "Recommended" pill and then "86% shaded | 14 min | 0.9km". Below them are the start and end rows and a full-width blue "Navigate" button.
   - On the map, the recommended route is a thick blue line. Sunny parts of it turn yellow. The other two routes are grey.
   - Each route has a callout bubble on the map, "86% shaded / Recommended", "49% shaded / Shortest", and "92% shaded / Most shaded". A thin leader line joins bubble and route.
   - The basemap switches to a light day style at 4 PM and draws grey building shadows on the ground.
   - From Lazada One to Bugis Junction at 4 PM, the routes are "Recommended" 86%, "Shortest" 49%, and "Most shaded" 92%. Recommended takes 14 min, 0.9 km.

## The page uses Jost, blue-600, and white or frosted cards

- The body font is a geometric sans with rounded forms (Jost or similar). The title uses a heavier display weight.
- The primary blue is about #2563EB, for buttons, active chips, and the route. Yellow marks sun exposure. Grey marks alternate routes.
- Cards are white or frosted glass, with a large radius (about 16 px), a soft shadow, and generous padding.
- Chips are white pills with a 1 px border. The active chip has blue text.
- The map uses the Mapbox Standard style with 3D buildings and POI icons. The time of day sets a light or dark style.

## Seven weak points, led by a "100% shaded" result at night

- At 11 PM all three routes collapse into one, labelled "100% shaded". The app gives no night message. At night there is no sun, so the "100% shaded" label carries no information.
- The weather chip read "33.5 C, Cloudy" at 11 PM, then "34.5 C" for tomorrow. It gives no source or time.
- The hour chip did nothing for "today" late at night. The user must find the date chip first.
- "100% shaded" has no split, so the user cannot see roof versus building versus tree shade.
- The route card has no step list, no landmarks, and no stairs or opening-hours flags.
- The card shows no minutes in sun. A percentage hides the absolute exposure on a long route.
- The map callouts overlap other labels and run off-screen at the top edge.

## For one 4 PM trip, rain mode recommends a 56% sheltered route, and the Singapore server receives every trip

- In rain mode ("Stay dry", `12-rain-mode-4pm-1440.png`), Recommended is 56% sheltered (15 min, 1.0 km) and Shortest is 20%. A Most sheltered route is the third choice.
- The UV chip becomes "15% chance of rain". Exposed parts of the route stay yellow. The bubbles use an umbrella icon.
- The stack is Next.js with tRPC. The page calls `/api/trpc/geocoding.searchPlaces?input={"json":{"query":...}}` and `/api/trpc/navigation.findRoutes`.
- So the Singapore server computes each route and receives every trip. The page sends Datadog RUM (real-user monitoring) data and logs, plus Mapbox map sessions.
- The font is Jost 300 to 600. Body text is rgb(15, 23, 42), slate-900. Button blue is rgb(37, 99, 235), blue-600. The Navigate button is 44 px tall, with radius 16 px.
- The PWA setup has `manifest.json` and `mobile-web-app-capable=yes`. Its description is "Find shaded routes for your walks and bike rides".

## Navigate mode lists 16 steps for one 1.0 km route, many 4 to 15 m long, with no landmarks

- In navigate mode (`13-navigate-1440.png`, `14-all-steps-1440.png`), a turn card shows distance, instruction, and time ("34m | Head northwest on path | 1 min").
- "Show all steps" lists 16 steps for 1.0 km. Many are 4 m to 15 m long, and most read "onto path".
- The steps carry no landmark, no cover type, no stairs flag, and no photo.
- On a phone at 390 x 844 (`15-route-390.png`), a tilted 3D map follows the route, with 3D trees.
- A white turn card sits at the top. A bottom sheet shows "Recommended | 56% sheltered | 15 min | 1.0km", "Lazada One -> Bugis Junction", and "Show all steps". A round X closes it.
- Rain mode draws animated rain streaks over the map.

## The Manila version keeps the four-step flow and adds minutes in sun, landmark steps, and opening hours

Keep the four-step flow, the frosted centre card on landing, the bottom-left card on desktop, and the bottom sheet on phones. Keep the three routes with map bubbles, yellow sun segments, the date and hour chips, the weather chip, Jost, and blue-600.

Add these items.

- Minutes in sun next to the percent, and a split into roof, building, and tree cover.
- Merged landmark steps ("Take the elevated walkway past Glorietta 4"), with cover type and a stairs flag on each step.
- Opening hours on mall and building passages, with a "closes at" warning.
- A night state. After sunset, say that shade does not apply and offer the lit, open route.
- Routing in the browser, so no server receives the trip. No third-party usage tracking.
- English plus Taglish helper strings.
- A data-date and method link on every route card.
