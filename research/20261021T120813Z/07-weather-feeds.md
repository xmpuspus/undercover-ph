# Metro Manila walking router: weather feed audit

Audit time: 2026-10-21, 12:11 to 12:25 UTC (8:11 to 8:25 PM Manila). The samples are in `raw/07/`. The index of every request is `raw/07/_index.txt`.

## Requested use

The router needs three signals for Metro Manila streets.

- A hot-day signal to switch to shade mode.
- A rain-now and rain-next-hour signal to switch to shelter mode.
- A flooded-street signal to avoid streets.

Denominator for coverage: Metro Manila has 16 cities and 1 municipality. We count station coverage against that.

## Verdict by use

- Shade mode trigger: CONDITIONAL. The machine-readable PAGASA heat feed has one station in Metro Manila.
- Shelter mode trigger: CONDITIONAL. PAGASA thunderstorm advisories give a 2-hour city-level signal. No live per-street rain feed passed.
- Flood street avoidance: BLOCKED for live street status. We reached no public machine feed. Hazard maps are static.

## Feed cards

### 1. PAGASA heat index

- URL: https://www.pagasa.dost.gov.ph/weather/heat-index
- Fetch: HTTP 200, `text/html`, 138274 bytes, 2026-10-21T12:12:13Z. [VERIFIED]
- Format: the page links PNG images and one PDF. [VERIFIED] The PNG links are `https://pubfiles.pagasa.dost.gov.ph/iaas/heat_index/HeatIndexObserved.png`, `Forecast.png`, `ForecastMap.png`, and `highestheatIndex.png`.
- PNG fetch: two requests timed out (HTTP 000) at 12:18:09Z and 12:18:34Z. We have not seen the image content. [UNVERIFIED]
- The PDF link `https://pubfiles.pagasa.dost.gov.ph/tamss/weather/heat_index_summary.pdf` returned HTTP 404 with an HTML error page at 12:18:00Z. [VERIFIED] It is not a dataset.
- Forecast: PNG images only. The page shows 5 earlier days and 2 forecast days. [VERIFIED] The HTML has no table (0 `<table>` tags) and no JSON.
- Update rate: the page says the table updates "the following day". [VERIFIED]
- Terms: `/terms-of-use` returned 404 at 12:14:12Z. We found no licence. [UNVERIFIED]
- The page links a Heat Index Data Request Form for past data. [VERIFIED]
- Verdict: BLOCKED for a machine-readable forecast heat index. Use Open-Meteo `apparent_temperature` as the forecast proxy.

#### 1a. iHeatMap and the embedded station JSON

- The page has two iframes: `https://iheatmap.pagasa.dost.gov.ph` and `https://www.panahon.gov.ph/heat_index.html`. [VERIFIED]
- `iheatmap.pagasa.dost.gov.ph` timed out (HTTP 000) at 12:18:59Z. [UNVERIFIED]
- The launch date given for iHeatMap was 4 April 2025. No sample confirms it. [UNVERIFIED]
- `https://www.panahon.gov.ph/heat_index.html`: HTTP 200, `text/html`, 212118 bytes, 2026-10-21T12:19:24Z. [VERIFIED]
- This page holds a JSON array in its script. We parsed it with `parse_heat.py` and saved `raw/07/panahon_heat_stations.json`. [VERIFIED]
- Schema: `sitename`, `lat`, `lng`, `data_as_of`, and `data[]` with `observed_at`, `heat_index` (integer), `temperature` (string), `humidity` (string).
- Counts: 96 stations and 1996 hourly records. `observed_at` runs from 2026-10-20 21:00:00 to 2026-10-21 20:00:00. No record has a null `heat_index` or `temperature`. [VERIFIED]
- Timezone of `observed_at`: the page does not state it. The latest value matches Manila local time at fetch, so it is probably Manila time. [UNVERIFIED]
- Metro Manila coverage: 1 of 96 stations lies in the box 14.35 to 14.80 N, 120.90 to 121.20 E. It is Science Garden, Quezon City. Last record 2026-10-21 20:00: heat index 37, temperature 29.81, humidity 77.8. [VERIFIED]
- Records per station run from 1 to 24. Some stations report only a few hours. [VERIFIED]
- The JSON is not a documented API. It is in obfuscated page script, so the layout can change without notice. We found no terms. [UNVERIFIED]
- Verdict: CONDITIONAL. One station cannot show street-scale heat. Use it only to check model values.

### 2. PAGASA rainfall and thunderstorm advisories (NCR)

- URL: https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd
- Fetch: HTTP 200, `text/html`, 238851 bytes, 2026-10-21T12:12:18Z. [VERIFIED]
- Content: "Thunderstorm Advisory No. 8 #NCR_PRSD Issued at: 7:37 PM, 21 October 2026". It lists Caloocan, Quezon City, Valenzuela, and Marikina "within the next 2 hours". [VERIFIED]
- Same page: "As of today, there is no Heavy Rainfall Warning Issued." [VERIFIED]
- Lag at fetch: the advisory was about 36 minutes old (we fetched at 8:12 PM Manila). [VERIFIED]
- Format: free text in HTML. The page also links PDFs on `src.panahon.gov.ph/pubfiles/prsd/national-capital-region/`: `regional_forecast.pdf`, `special_forecast.pdf`, `gmma_forecast.pdf`, `extended_outlook.pdf`, and `ibf.pdf`. We did not fetch the PDFs. [UNVERIFIED]
- The text has no "yellow", "orange", or "red" word. No heavy rainfall warning was active, so we could not confirm the colour levels. [UNVERIFIED]
- Update rate: advisory No. 7 (5:40 PM) and No. 8 (7:37 PM) came about 2 hours apart. [VERIFIED]
- Coverage: city names in Metro Manila. This is city level, not street level. [VERIFIED]
- Terms: none found (`/terms-of-use` is 404). [UNVERIFIED]
- Verdict: CONDITIONAL. The feed needs a parser for free text. The Python MCP server already reads PAGASA forecasts and alerts. Reuse it.

### 3. PAGASA radar

- `https://www.pagasa.dost.gov.ph/weather/radar` returned HTTP 404 at 12:12:17Z. [VERIFIED]
- `https://www.pagasa.dost.gov.ph/radar` returned HTTP 200, `text/html`, 135534 bytes at 12:20:21Z. [VERIFIED] The saved HTML has no image, tile, or data link for radar. The map loads by script.
- `https://rainx.pagasa.dost.gov.ph/` (linked from the NCR advisory page, with a rain rate legend image) timed out (HTTP 000) at 12:20:22Z. [UNVERIFIED]
- Update rate, coverage, and terms: none found. [UNVERIFIED]
- Verdict: BLOCKED as a machine feed until we find the data URL behind the map.

### 4. Open-Meteo minutely_15

- Forecast host `https://api.open-meteo.com/v1/forecast`: 6 requests over 10 minutes all timed out (HTTP 000). One retry used a second IP. Other Open-Meteo hosts answered. The request failure is [VERIFIED]. The health of the endpoint is [UNVERIFIED].
- Substitute sample: `https://historical-forecast-api.open-meteo.com/v1/forecast` for Manila (14.5995, 120.9842), `minutely_15=precipitation,temperature_2m`, date 2026-10-21. HTTP 200, `application/json`, 3781 bytes, 2.5 s, 12:23:10Z. File: `raw/07/om_histfc.body`. [VERIFIED]
- This host returns stored forecast values. It does not return the live forecast. [VERIFIED]
- Result: 96 steps of 15 minutes. Precipitation reads 0.1 mm at every step from 11:15 to 12:45. The hourly series reads 0.1 at 11:00 and 0.2 at 12:00. The 15-minute values look like a split of hourly values. [VERIFIED] The cause is [UNVERIFIED].
- Docs (`https://open-meteo.com/en/docs`, fetched 12:21:15Z): "Only available in Central Europe and North America. Other regions use interpolated hourly data." The note follows the 15-minutely variable list. Manila is outside both regions. [VERIFIED]
- So minutely_15 for Manila gives no real 15-minute rain signal. Treat it as hourly.
- Terms (`https://open-meteo.com/en/terms`, fetched 12:14:12Z): the free API is for non-commercial use only. Limits: under 10,000 calls per day, 5,000 per hour, 600 per minute. The licence needs CC-BY 4.0 attribution. [VERIFIED]
- A public app with ads or subscriptions is not non-commercial under these terms. A paid plan exists at `https://open-meteo.com/en/pricing`. We did not read the price. [UNVERIFIED]
- Verdict: CONDITIONAL. Good for hourly temperature, apparent temperature, and humidity. It is not a nowcast.
- Sibling note: the Python MCP server already uses Open-Meteo air quality. That host answered here: HTTP 200, PM2.5 21.1 at 2026-10-21T12:00 (`raw/07/om_air.body`). [VERIFIED]

### 5. RainViewer

- URL: https://api.rainviewer.com/public/weather-maps.json
- Fetch: HTTP 200, `application/json`, 818 bytes, 2026-10-21T12:13:24Z. No key. [VERIFIED]
- `generated` is 1792584623, which is 2026-10-21 12:10:23 UTC. [VERIFIED]
- Radar frames: 13 past frames, 600 seconds apart, so a 2-hour window. [VERIFIED]
- `nowcast` is empty (0 frames). `satellite.infrared` is empty. The free feed gave no next-hour frames at fetch time. [VERIFIED]
- We did not fetch a tile image. We have not confirmed the radar signal over Metro Manila. [UNVERIFIED]
- Docs (`https://www.rainviewer.com/api.html`, HTTP 200, 36129 bytes, 12:14:42Z) say refresh is every 5 minutes. Our sample frames are 10 minutes apart. [VERIFIED]
- Terms from the same page: free for personal or educational use. No key. No SLA. Visible credit "Weather data by RainViewer" is mandatory. Commercial use needs a talk with RainViewer. [VERIFIED]
- Verdict: CONDITIONAL. Good for past radar frames and a rain-now check. It gives no forecast frames and has no uptime promise.

### 6. Project NOAH

- URL: https://noah.up.edu.ph/
- Fetch: HTTP 200, `text/html`, 11557 bytes, 12:12:51Z. [VERIFIED]
- It is an Angular page shell titled "NOAH - Nationwide Operational Assessment of Hazards". `/about` returned the same 11557 bytes, so the server returns the shell for any path. [VERIFIED]
- `https://api.noah.up.edu.ph/` does not resolve (curl error 6). [VERIFIED]
- We saw no live feed endpoint. Flood hazard maps are static hazard layers. Any live data is [UNVERIFIED].
- Terms: none found. [UNVERIFIED]
- Verdict: BLOCKED for live data. A static hazard layer needs a licence check first.

### 7. MMDA flood reports

- `https://mmda.gov.ph/`, `/index.php/flood-control`, and `/api` all returned HTTP 403 with a "Just a moment..." challenge page at 12:13:33Z, 12:13:34Z, and 12:13:35Z. [VERIFIED]
- We did not bypass the challenge. Automated access fails. [VERIFIED]
- We did not test social posts or any other API. [UNVERIFIED]
- Verdict: BLOCKED for live machine access.

### 8. Waze for Cities

- `https://www.waze.com/wazeforcities` redirects to `https://www.waze.com/partners/wazeforcities` (HTTP 200, 533113 bytes, 12:13:35Z). [VERIFIED]
- The terms link redirects to `https://support.google.com/waze/announcements/12153862` (HTTP 200, 1445176 bytes). [VERIFIED]
- The program page describes alerts, traffic data, and city partners. It lists no rule for an individual and no flood report field. [VERIFIED] Eligibility for an individual: the page does not say. [UNVERIFIED]
- We saw no street-flood report schema. [UNVERIFIED]
- Verdict: BLOCKED until Waze confirms an individual can join.

### 9. JAXA GSMaP

- `https://sharaku.eorc.jaxa.jp/GSMaP/guide.html` (HTTP 200, 45314 bytes, 12:13:28Z). [VERIFIED]
- Guide facts: rainfall rate in mm/hr, global 60N to 60S, grid 0.1 degree (about 11 km), time step 1 hour. [VERIFIED]
- Data files come from a password-protected FTP site. The guide says to register first. [VERIFIED] This needs an account, so we stop here.
- The guide lists a 6-hour nowcast product (GSMaP_RNC). We did not check its area or access. [UNVERIFIED]
- Latency of the near-real-time product: the guide does not give a figure in the text we read. [UNVERIFIED]
- Verdict: BLOCKED for the app. A 0.1 degree grid is too coarse for streets, and access needs registration.

### 10. Himawari

- Public S3 listing, bucket `noaa-himawari9`, prefix `AHI-L2-FLDK-RainfallRate/`: HTTP 200 XML with `KeyCount` 0 at 12:13:28Z. That prefix holds no objects. [VERIFIED]
- JMA page `https://www.data.jma.go.jp/mscweb/data/himawari/` (HTTP 200, 26119 bytes, 12:13:31Z) lists real-time images by region, including Southeast Asia, and "Imagery with heavy rainfall potential areas". [VERIFIED]
- Format is image file lists. We saw no numeric rain rate. Update rate and terms: not read. [UNVERIFIED]
- Verdict: BLOCKED for numeric rain. Satellite pixels are also too coarse for streets.

### 11. Sensors: OpenAQ and AirGradient

- OpenAQ v3 `https://api.openaq.org/v3/locations?...`: HTTP 401, "A valid API key must be provided". [VERIFIED] It needs an account, so we stop here.
- AirGradient public endpoint: timed out (HTTP 000) at 12:14:44Z. [UNVERIFIED]
- We confirmed no low-cost sensor network in NCR. [UNVERIFIED]

### 12. PAGASA flood information page

- URL: https://www.pagasa.dost.gov.ph/flood. HTTP 200, `text/html`, 220966 bytes, 12:20:49Z. [VERIFIED]
- It shows basin status as text. "NCR/Pasig Marikina Laguna de Bay" read "Non-Flood Watch". It also shows a dam level table dated "October 21,2026 08:00:00 am". [VERIFIED]
- Coverage: basin level, not street level. [VERIFIED]
- Verdict: CONDITIONAL. Use it as a city-wide flood alert flag, not for street routing.

### 13. Reusable sibling feeds (not re-audited)

- PAGASA forecasts and alerts, NASA POWER, and Open-Meteo air quality: the Python MCP server reads them.
- PAGASA Pasig-Marikina-Tullahan water-level map: `map.do` timed out from this network at 12:13:40Z. Reuse the sibling project's reader.

## Recommended feed stack

| Need | Primary | Fallback |
|---|---|---|
| Heat mode switch | Open-Meteo hourly `apparent_temperature` for Manila, with the Science Garden QC reading as a check | PAGASA heat index PNG forecast read by a person, or NASA POWER (sibling) |
| Shelter mode switch, next 2 hours | PAGASA NCR thunderstorm advisory text, matched by city name | Open-Meteo hourly precipitation and probability |
| Rain now | RainViewer past radar frames (credit needed) | PAGASA advisory "affecting" lines, or user tap on "it is raining" |
| Flood city alert | PAGASA flood page basin status and the sibling Pasig-Marikina-Tullahan reader | Heavy rainfall warning text on the PAGASA NCR page |
| Flooded streets | None passed. Use static NOAH hazard layers after a licence check, and avoid streets on low ground when an alert is active | User flood reports inside the app, if the project owner approves them |
| Air quality | Open-Meteo air quality (sibling) | OpenAQ, after a key is obtained |

Rights notes.

- Open-Meteo free tier is non-commercial. A public app with ads or subscriptions needs a paid plan.
- RainViewer free tier is for personal or educational use. A public product needs a talk with RainViewer.
- PAGASA gave no terms of use (404). Ask PAGASA for a written permission before scraping its pages in a public app.

Smallest next evidence.

1. Run the Open-Meteo forecast call from another network. This network could not reach `api.open-meteo.com`.
2. Find the data URL behind the PAGASA radar page, or ask PAGASA.
3. Ask MMDA for a flood data feed. Its site blocked automated access.
4. Confirm the iHeatMap launch date and its data source. The launch date given was 4 April 2025 and no sample confirmed it.
