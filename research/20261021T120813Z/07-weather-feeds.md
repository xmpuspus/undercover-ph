# Metro Manila weather feeds give city-level heat and rain signals but no live street flood status

The audit ran on 2026-10-21 from 12:11 to 12:25 UTC (8:11 to 8:25 PM Manila). The samples are in `raw/07/`. The index of every request is `raw/07/_index.txt`.

## The router needs three signals for Metro Manila streets

- A hot-day signal to switch to shade mode.
- A rain-now and rain-next-hour signal to switch to shelter mode.
- A flooded-street signal to avoid streets.

Metro Manila has 16 cities and 1 municipality. We count station coverage against that total.

## Heat and rain triggers are CONDITIONAL, and live street flood status is BLOCKED

- Shade mode trigger. CONDITIONAL. The machine-readable PAGASA heat feed has one station in Metro Manila.
- Shelter mode trigger. CONDITIONAL. PAGASA thunderstorm advisories give a 2-hour city-level signal. No live per-street rain feed passed.
- Flood street avoidance. BLOCKED for live street status. We reached no public machine feed. Hazard maps are static.

## Of 14 feed cards, 12 have a verdict, with 5 CONDITIONAL and 7 BLOCKED

### 1. The PAGASA heat index page gives its forecast only as PNG images

- The page is https://www.pagasa.dost.gov.ph/weather/heat-index.
- The fetch returned HTTP 200, `text/html`, 138274 bytes, at 2026-10-21T12:12:13Z. [VERIFIED]
- The page links PNG images and one PDF. [VERIFIED] The PNG links are `https://pubfiles.pagasa.dost.gov.ph/iaas/heat_index/HeatIndexObserved.png`, `Forecast.png`, `ForecastMap.png`, and `highestheatIndex.png`.
- Two PNG requests timed out (HTTP 000) at 12:18:09Z and 12:18:34Z. We have not seen the image content. [UNVERIFIED]
- The PDF link `https://pubfiles.pagasa.dost.gov.ph/tamss/weather/heat_index_summary.pdf` returned HTTP 404 with an HTML error page at 12:18:00Z. [VERIFIED] It is not a dataset.
- The forecast is PNG images only. The page shows 5 earlier days and 2 forecast days. [VERIFIED] The HTML has no table (0 `<table>` tags) and no JSON.
- On the update rate, the page says that the table updates "the following day". [VERIFIED]
- For terms, `/terms-of-use` returned 404 at 12:14:12Z. We found no licence. [UNVERIFIED]
- The page links a Heat Index Data Request Form for past data. [VERIFIED]
- Verdict. BLOCKED for a machine-readable forecast heat index. Use Open-Meteo `apparent_temperature` as the forecast proxy.

#### 1a. iHeatMap timed out, and the embedded station JSON has 1 Metro Manila station of 96

- The page has two iframes, `https://iheatmap.pagasa.dost.gov.ph` and `https://www.panahon.gov.ph/heat_index.html`. [VERIFIED]
- `iheatmap.pagasa.dost.gov.ph` timed out (HTTP 000) at 12:18:59Z. [UNVERIFIED]
- The launch date given for iHeatMap was 4 April 2025. No sample confirms it. [UNVERIFIED]
- `https://www.panahon.gov.ph/heat_index.html` returned HTTP 200, `text/html`, 212118 bytes, at 2026-10-21T12:19:24Z. [VERIFIED]
- This page holds a JSON array in its script. We parsed it with `parse_heat.py` and saved `raw/07/panahon_heat_stations.json`. [VERIFIED]
- The JSON fields are `sitename`, `lat`, `lng`, `data_as_of`, and `data[]` with `observed_at`, `heat_index` (integer), `temperature` (string), `humidity` (string).
- The array holds 96 stations and 1996 hourly records. `observed_at` runs from 2026-10-20 21:00:00 to 2026-10-21 20:00:00. No record has a null `heat_index` or `temperature`. [VERIFIED]
- The page does not state the timezone of `observed_at`. The latest value matches Manila local time at fetch, so it is probably Manila time. [UNVERIFIED]
- Only 1 of 96 stations lies in the Metro Manila box, 14.35 to 14.80 N and 120.90 to 121.20 E. It is Science Garden, Quezon City. Its last record, at 2026-10-21 20:00, gives heat index 37, temperature 29.81, and humidity 77.8. [VERIFIED]
- Records per station run from 1 to 24. Some stations report only a few hours. [VERIFIED]
- The JSON is not a documented API. It is in obfuscated page script, so the layout can change without notice. We found no terms. [UNVERIFIED]
- Verdict. CONDITIONAL. One station cannot show street-scale heat. Use it only to check model values.

### 2. PAGASA NCR thunderstorm advisories give a 2-hour city-level signal in free text

- The page is https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd.
- The fetch returned HTTP 200, `text/html`, 238851 bytes, at 2026-10-21T12:12:18Z. [VERIFIED]
- The page carried "Thunderstorm Advisory No. 8 #NCR_PRSD Issued at: 7:37 PM, 21 October 2026". It lists Caloocan, Quezon City, Valenzuela, and Marikina "within the next 2 hours". [VERIFIED]
- The same page says "As of today, there is no Heavy Rainfall Warning Issued." [VERIFIED]
- At fetch, the advisory was about 36 minutes old (we fetched at 8:12 PM Manila). [VERIFIED]
- The advisory is free text in HTML. The page links five PDFs on `src.panahon.gov.ph/pubfiles/prsd/national-capital-region/`, which are `regional_forecast.pdf`, `special_forecast.pdf`, `gmma_forecast.pdf`, `extended_outlook.pdf`, and `ibf.pdf`. We did not fetch the PDFs. [UNVERIFIED]
- The text has no "yellow", "orange", or "red" word. No heavy rainfall warning was active, so we could not check the colour levels. [UNVERIFIED]
- Advisory No. 7 (5:40 PM) and No. 8 (7:37 PM) came about 2 hours apart. [VERIFIED]
- The advisory names whole cities in Metro Manila and no streets. [VERIFIED]
- We found no terms (`/terms-of-use` is 404). [UNVERIFIED]
- Verdict. CONDITIONAL. The feed needs a parser for free text. The Python MCP server already reads PAGASA forecasts and alerts. Reuse it.

### 3. The PAGASA radar page shows no data link for its map

- `https://www.pagasa.dost.gov.ph/weather/radar` returned HTTP 404 at 12:12:17Z. [VERIFIED]
- `https://www.pagasa.dost.gov.ph/radar` returned HTTP 200, `text/html`, 135534 bytes at 12:20:21Z. [VERIFIED] The saved HTML has no image, tile, or data link for radar. The map loads by script.
- `https://rainx.pagasa.dost.gov.ph/` (linked from the NCR advisory page, with a rain rate legend image) timed out (HTTP 000) at 12:20:22Z. [UNVERIFIED]
- We found no update rate, coverage, or terms. [UNVERIFIED]
- Verdict. BLOCKED as a machine feed until we find the data URL behind the map.

### 4. Open-Meteo minutely_15 gives only interpolated hourly data for Manila

- For the forecast host `https://api.open-meteo.com/v1/forecast`, all 6 requests over 10 minutes timed out (HTTP 000). One retry used a second IP. Other Open-Meteo hosts responded. The request failure is [VERIFIED]. The health of the endpoint is [UNVERIFIED].
- As a substitute sample, we called `https://historical-forecast-api.open-meteo.com/v1/forecast` for Manila (14.5995, 120.9842) with `minutely_15=precipitation,temperature_2m` and date 2026-10-21. It returned HTTP 200, `application/json`, 3781 bytes, in 2.5 s, at 12:23:10Z. The file is `raw/07/om_histfc.body`. [VERIFIED]
- This host returns stored forecast values. It does not return the live forecast. [VERIFIED]
- The result has 96 steps of 15 minutes. Precipitation reads 0.1 mm at every step from 11:15 to 12:45. The hourly series reads 0.1 at 11:00 and 0.2 at 12:00. The 15-minute values look like a split of hourly values. [VERIFIED] The cause is [UNVERIFIED].
- The docs (`https://open-meteo.com/en/docs`, fetched 12:21:15Z) say "Only available in Central Europe and North America. Other regions use interpolated hourly data." The note follows the 15-minutely variable list. Manila is outside both regions. [VERIFIED]
- So minutely_15 for Manila gives no separate 15-minute rain signal. Treat it as hourly.
- The terms (`https://open-meteo.com/en/terms`, fetched 12:14:12Z) say that the free API is for non-commercial use only. The limits are under 10,000 calls per day, 5,000 per hour, and 600 per minute. The licence needs CC-BY 4.0 attribution. [VERIFIED]
- Under these terms, a public app with ads or subscriptions is commercial use. A paid plan exists at `https://open-meteo.com/en/pricing`. We did not read the price. [UNVERIFIED]
- Verdict. CONDITIONAL. The feed works for hourly temperature, apparent temperature, and humidity. It gives no nowcast (a short-range rain forecast).
- The sibling Python MCP server already uses Open-Meteo air quality. That host returned HTTP 200 here, with PM2.5 21.1 at 2026-10-21T12:00 (`raw/07/om_air.body`). [VERIFIED]

### 5. RainViewer gave 2 hours of past radar frames and no nowcast frames at fetch time

- The feed is https://api.rainviewer.com/public/weather-maps.json.
- The fetch returned HTTP 200, `application/json`, 818 bytes, at 2026-10-21T12:13:24Z, with no key. [VERIFIED]
- `generated` is 1792584623, which is 2026-10-21 12:10:23 UTC. [VERIFIED]
- The feed has 13 past radar frames, 600 seconds apart, so a 2-hour window. [VERIFIED]
- `nowcast` is empty (0 frames). `satellite.infrared` is empty. The free feed gave no next-hour frames at fetch time. [VERIFIED]
- We did not fetch a tile image. We have not checked the radar signal over Metro Manila. [UNVERIFIED]
- The docs (`https://www.rainviewer.com/api.html`, HTTP 200, 36129 bytes, 12:14:42Z) say that the refresh is every 5 minutes. Our sample frames are 10 minutes apart. [VERIFIED]
- The terms on the same page allow free personal or educational use. The feed needs no key and has no SLA (service-level agreement). The visible credit "Weather data by RainViewer" is mandatory. Commercial use needs a talk with RainViewer. [VERIFIED]
- Verdict. CONDITIONAL. The feed works for past radar frames and a rain-now check. It gives no forecast frames and has no uptime promise.

### 6. Project NOAH shows no live feed endpoint

- The site is https://noah.up.edu.ph/.
- The fetch returned HTTP 200, `text/html`, 11557 bytes, at 12:12:51Z. [VERIFIED]
- It is an Angular page shell titled "NOAH - Nationwide Operational Assessment of Hazards". `/about` returned the same 11557 bytes, so the server returns the shell for any path. [VERIFIED]
- `https://api.noah.up.edu.ph/` does not resolve (curl error 6). [VERIFIED]
- We saw no live feed endpoint. Flood hazard maps are static hazard layers. Any live data is [UNVERIFIED].
- We found no terms. [UNVERIFIED]
- Verdict. BLOCKED for live data. A static hazard layer needs a licence check first.

### 7. The MMDA site blocks automated access with a challenge page

- `https://mmda.gov.ph/`, `/index.php/flood-control`, and `/api` all returned HTTP 403 with a "Just a moment..." challenge page at 12:13:33Z, 12:13:34Z, and 12:13:35Z. [VERIFIED]
- We did not bypass the challenge. Automated access fails. [VERIFIED]
- We did not test social posts or any other API. [UNVERIFIED]
- Verdict. BLOCKED for live machine access.

### 8. Waze for Cities lists no rule for individuals and no flood report field

- `https://www.waze.com/wazeforcities` redirects to `https://www.waze.com/partners/wazeforcities` (HTTP 200, 533113 bytes, 12:13:35Z). [VERIFIED]
- The terms link redirects to `https://support.google.com/waze/announcements/12153862` (HTTP 200, 1445176 bytes). [VERIFIED]
- The program page describes alerts, traffic data, and city partners. It lists no rule for an individual and no flood report field. [VERIFIED] The page does not say whether an individual is eligible. [UNVERIFIED]
- We saw no street-flood report schema. [UNVERIFIED]
- Verdict. BLOCKED until Waze confirms an individual can join.

### 9. JAXA GSMaP needs registration, and its 0.1 degree grid is too coarse for streets

- The guide `https://sharaku.eorc.jaxa.jp/GSMaP/guide.html` returned HTTP 200, 45314 bytes, at 12:13:28Z. [VERIFIED]
- The guide gives rainfall rate in mm/hr for 60N to 60S. The grid is 0.1 degree (about 11 km), and the time step is 1 hour. [VERIFIED]
- Data files come from a password-protected FTP site. The guide says to register first. [VERIFIED] This step needs an account, so we stop here.
- The guide lists a 6-hour nowcast product (GSMaP_RNC). We did not check its area or access. [UNVERIFIED]
- In the text we read, the guide gives no latency figure for the near-real-time product. [UNVERIFIED]
- Verdict. BLOCKED for the app. A 0.1 degree grid is too coarse for streets, and access needs registration.

### 10. Himawari data came as image lists, and the audit found no numeric rain rate

- A public S3 listing of bucket `noaa-himawari9`, prefix `AHI-L2-FLDK-RainfallRate/`, returned HTTP 200 XML with `KeyCount` 0 at 12:13:28Z. That prefix holds no objects. [VERIFIED]
- The JMA page `https://www.data.jma.go.jp/mscweb/data/himawari/` (HTTP 200, 26119 bytes, 12:13:31Z) lists real-time images by region, including Southeast Asia, and "Imagery with heavy rainfall potential areas". [VERIFIED]
- The data comes as image file lists. We saw no numeric rain rate. We did not read the update rate or the terms. [UNVERIFIED]
- Verdict. BLOCKED for numeric rain, and satellite pixels are too coarse for streets.

### 11. The OpenAQ sensor API needs a key, and AirGradient timed out

- OpenAQ v3 `https://api.openaq.org/v3/locations?...` returned HTTP 401, "A valid API key must be provided". [VERIFIED] It needs an account, so we stop here.
- The AirGradient public endpoint timed out (HTTP 000) at 12:14:44Z. [UNVERIFIED]
- We could not confirm any low-cost sensor network in NCR. [UNVERIFIED]

### 12. The PAGASA flood page gives basin-level status only

- The page is https://www.pagasa.dost.gov.ph/flood. It returned HTTP 200, `text/html`, 220966 bytes, at 12:20:49Z. [VERIFIED]
- It shows basin status as text. "NCR/Pasig Marikina Laguna de Bay" read "Non-Flood Watch". A dam level table on the page carries the date "October 21,2026 08:00:00 am". [VERIFIED]
- The status names whole river basins and no streets. [VERIFIED]
- Verdict. CONDITIONAL. Use it as a city-wide flood alert flag. Do not use it for street routing.

### 13. Reuse the sibling readers for PAGASA, NASA POWER, and Open-Meteo air quality (not re-audited)

- The Python MCP server reads PAGASA forecasts and alerts, NASA POWER, and Open-Meteo air quality.
- For the PAGASA Pasig-Marikina-Tullahan water-level map, `map.do` timed out from this network at 12:13:40Z. Reuse the reader in the sibling project.

## Open-Meteo, PAGASA text, and RainViewer cover heat and rain, and no feed covers flooded streets

| Need | Primary | Fallback |
|---|---|---|
| Heat mode switch | Open-Meteo hourly `apparent_temperature` for Manila, with the Science Garden QC reading as a check | PAGASA heat index PNG forecast read by a person, or NASA POWER (sibling) |
| Shelter mode switch, next 2 hours | PAGASA NCR thunderstorm advisory text, matched by city name | Open-Meteo hourly precipitation and probability |
| Rain now | RainViewer past radar frames (credit needed) | PAGASA advisory "affecting" lines, or user tap on "it is raining" |
| Flood city alert | PAGASA flood page basin status and the sibling Pasig-Marikina-Tullahan reader | Heavy rainfall warning text on the PAGASA NCR page |
| Flooded streets | None passed. Use static NOAH hazard layers after a licence check, and avoid streets on low ground when an alert is active | User flood reports inside the app, if the project owner approves them |
| Air quality | Open-Meteo air quality (sibling) | OpenAQ, after a key is obtained |

### Two free tiers exclude commercial use, and PAGASA states no terms

- Open-Meteo free tier is non-commercial. A public app with ads or subscriptions needs a paid plan.
- RainViewer free tier is for personal or educational use. A public product needs a talk with RainViewer.
- PAGASA gave no terms of use (404). Before you scrape its pages in a public app, ask PAGASA for written permission.

### Four checks come next, and the first is the Open-Meteo call from another network

1. Run the Open-Meteo forecast call from another network. This network could not reach `api.open-meteo.com`.
2. Find the data URL behind the PAGASA radar page, or ask PAGASA.
3. Ask MMDA for a flood data feed. Its site blocked automated access.
4. Check the iHeatMap launch date and its data source. The given launch date is 4 April 2025, and no sample confirmed it.
