# Singapore Undercover uses a four-step map-first flow with three labelled routes

Checked live with agent-browser on 2026-10-21 at about 23:50 Singapore time, viewport 1440 x 900. Screenshots in this folder.

## Flow, step by step

1. Landing (`01-landing-1440.png`)
   - Full-screen 3D Mapbox map, tilted, dark night style over Marina Bay.
   - Black top banner: "This is a prototype, available for testing and feedback purposes only..." with "Learn More" and a close X.
   - One frosted-glass card in the centre: title "Stay Undercover", one sentence of body text, and the question "Which route would you like to search?"
   - Two equal buttons with icons: "Shaded" (sun icon) and "Sheltered" (rain icon).
2. Destination search (`02-shaded-step1-1440.png`, `03-search-typed-1440.png`)
   - Card moves to the bottom left, about 384 px wide.
   - Segmented toggle: "Shaded routes" and "Sheltered routes".
   - Search box with a pin icon: "Find shaded routes to..."
   - Suggested places list: Marina Bay Sands, Orchard Road, Sentosa Island, Gardens by the Bay, each with an address line.
   - On typing, the panel grows to full height with a back arrow, a clear X, and results with a name and an address.
   - Footer pill: Privacy, Terms of Use, Feedback.
3. Trip setup (`04-after-pick-1440.png`)
   - Top-left chips: a date chip ("Today", calendar icon) and an hour chip ("11pm").
   - Date chip opens Today, Tomorrow, and one more day. The hour chip opens a row of 24 hour pills across the top.
   - Bottom-left card: "Start from" (target icon) and "End at" (pin icon), joined by a dotted line.
   - The hour list for today shows only hours still ahead.
4. Results (`07-routes-1440.png` at 11 PM, `11-routes-4pm-1440.png` at 4 PM tomorrow)
   - Weather chip "37.8 C, Partly cloudy" and "UV Index: 4" under the date chips.
   - Two small segmented controls above the card: Walking or Cycling, and "Stay cool" (sun) or "Stay dry" (rain).
   - Card: a green-dot "Recommended" pill, then "86% shaded | 14 min | 0.9km", the start and end rows, and a full-width blue "Navigate" button.
   - Map: the recommended route is a thick blue line. Sunny parts of it turn yellow. The other two routes are grey.
   - Each route has a callout bubble on the map: "86% shaded / Recommended", "49% shaded / Shortest", "92% shaded / Most shaded". A thin leader line joins bubble and route.
   - The basemap switches to a light day style at 4 PM and draws grey building shadows on the ground.
   - Lazada One to Bugis Junction, 4 PM: Recommended 86%, Shortest 49%, Most shaded 92%. Recommended takes 14 min, 0.9 km.

## Visual language

- Font: a geometric sans with rounded forms (Jost or similar) for body, a heavier display weight for the title.
- Colours: primary blue about #2563EB for buttons, active chips, and the route. Yellow for sun exposure. Grey for alternate routes.
- Cards: white or frosted glass, large radius (about 16 px), soft shadow, generous padding.
- Chips: white pills with a 1 px border. The active chip has blue text.
- Map: Mapbox Standard style with 3D buildings and POI icons. Time of day drives light or dark.

## Weak points to beat

- At 11 PM all three routes collapse into one, labelled "100% shaded". The app gives no night message. Night is not shade.
- The weather chip read "33.5 C, Cloudy" at 11 PM, then "34.5 C" for tomorrow. It gives no source or time.
- The hour chip did nothing for "today" late at night. The user must find the date chip first.
- "100% shaded" with no split: the user cannot see roof versus building versus tree shade.
- No step list, no landmarks, no stairs or opening-hours flags on the route card.
- No minutes in sun. A percentage hides the absolute exposure on a long route.
- The map callouts overlap other labels and run off-screen at the top edge.
- The desktop card is the only layout. The phone layout is not checked yet.

## Rain mode and the stack behind the page

- Rain mode ("Stay dry", `12-rain-mode-4pm-1440.png`): Recommended 56% sheltered (15 min, 1.0 km), Shortest 20%, plus a Most sheltered route.
- The UV chip becomes "15% chance of rain". Exposed parts of the route stay yellow. The bubbles use an umbrella icon.
- Stack: Next.js with tRPC. Calls: `/api/trpc/geocoding.searchPlaces?input={"json":{"query":...}}` and `/api/trpc/navigation.findRoutes`.
- So Singapore routes on its server and sees every trip. It also sends Datadog RUM and logs, and Mapbox map sessions.
- Font: Jost 300 to 600. Body text rgb(15, 23, 42), slate-900. Button blue rgb(37, 99, 235), blue-600. Navigate button 44 px tall, radius 16 px.
- PWA: `manifest.json`, `mobile-web-app-capable=yes`. Description: "Find shaded routes for your walks and bike rides".

## Navigate mode and the phone layout

- Navigate (`13-navigate-1440.png`, `14-all-steps-1440.png`): a turn card shows distance, instruction, and time ("34m | Head northwest on path | 1 min").
- "Show all steps" lists 16 steps for 1.0 km. Many are 4 m to 15 m long, and most read "onto path".
- The steps carry no landmark, no cover type, no stairs flag, and no photo.
- Phone, 390 x 844 (`15-route-390.png`): a tilted 3D map follows the route, with 3D trees.
- A white turn card sits at the top. A bottom sheet shows "Recommended | 56% sheltered | 15 min | 1.0km", "Lazada One -> Bugis Junction", and "Show all steps". A round X closes it.
- Rain mode draws animated rain streaks over the map.

## What the Manila version keeps, and what it adds

Keep: the four-step flow, the frosted centre card on landing, the bottom-left card on desktop and the bottom sheet on phones. Keep the three routes with map bubbles, yellow sun segments, the date and hour chips, the weather chip, Jost, and blue-600.

Add:
- Minutes in sun next to the percent, and a split into roof, building, and tree cover.
- Merged landmark steps ("Take the elevated walkway past Glorietta 4"), with cover type and a stairs flag on each step.
- Opening hours on mall and building passages, with a "closes at" warning.
- A night state: after sunset, say that shade does not apply and offer the lit, open route.
- Routing in the browser, so no server sees the trip. No third-party usage tracking.
- English plus Taglish helper strings.
- A data-date and method link on every route card.
