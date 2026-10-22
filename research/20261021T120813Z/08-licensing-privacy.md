# Dataset and privacy obligations need confirmation before public launch

Correction, 2026-10-21: the original blanket legal conclusion is withdrawn. Free pricing, ODbL publication and local route computation do not settle all provider terms, agency permissions or privacy obligations. Audit the operator, funding, requests and retention. Google Open Buildings has separate open terms from Maps and Street View. See [the legal and privacy corrections](../../docs/research-corrections.md). The source observations and unresolved questions below remain research inputs.

This is research, not legal advice. A Philippine lawyer must confirm the open questions at the end.
Date: 2026-10-21. Labels: [VERIFIED] means the page was read. [UNVERIFIED] means a search snippet, a secondary source, or recall.
Gaps in this run: the OSMF wiki pages returned HTTP 503. The NPC site returned HTTP 403. Liability and naming got little research.

## 1. A cover-annotated walk graph is probably an ODbL Derivative Database

- ODbL defines a Derivative Database as "a database based upon the Database". It includes any "arrangement, modification". [VERIFIED] https://opendatacommons.org/licenses/odbl/1-0/
- A graph that adds shade or cover tags to OSM ways is based upon OSM. Treat it as a Derivative Database. [UNVERIFIED] The OSMF Derivative Database guideline was unreachable.
- Section 4.4: "Any Derivative Database that You Publicly Use must be only under the terms of" ODbL. [VERIFIED]
- Section 4.6: you must offer recipients "a copy in a machine readable form". [VERIFIED]
- Section 4.2 requires a notice if you "Publicly Convey" the database or a Derivative Database. [VERIFIED]
- Section 4.3: a Produced Work does not need the 4.2 notice. It needs a notice that tells users the OSM data is in it. [VERIFIED]
- Section 4.5 limits share-alike. A Produced Work made from the database is not a Derivative Database. [VERIFIED]
- A route line or a map image is a Produced Work. [UNVERIFIED] The OSMF Produced Work guideline was unreachable.
- So the app must publish the annotated graph under ODbL if it is publicly used. Routes alone need only attribution. [UNVERIFIED reading]
- Safe design: publish the cover-annotated graph as a downloadable ODbL file on every release. Name the source OSM extract date.
- Keep non-OSM layers, such as crowd reports, in a separate table. Join them by OSM id at query time. [UNVERIFIED] Ask a lawyer before you rely on this split.

### Attribution text and placement

- OSM requires credit by "displaying our attribution notice". It also requires you to "Make clear that the data is available under the Open Database License". [VERIFIED] https://www.openstreetmap.org/copyright
- A link to the copyright page satisfies the licence statement on the web. [VERIFIED] Same page.
- Standard text is "© OpenStreetMap contributors" with a link to https://www.openstreetmap.org/copyright. [UNVERIFIED] The OSMF Attribution Guidelines were unreachable.
- Placement: show it on the map, in a corner, always visible. Do not hide it in a menu. [UNVERIFIED]
- Overture uses "© OpenStreetMap contributors, Overture Maps Foundation" for OSM-derived data. [VERIFIED] https://docs.overturemaps.org/attribution/
- OSM does not provide free tiles for third parties. Use your own tiles or a provider that allows the use. [VERIFIED] Same copyright page.

## 2. CC-BY and permissive sources mix with ODbL, but CC-BY-SA imagery needs a firewall

- Overture buildings theme: ODbL. Sources include OSM, Microsoft ("Licensed by Microsoft under the Open Database License"), Google Open Buildings (CC BY 4.0), and Esri (CC BY 4.0). [VERIFIED] https://docs.overturemaps.org/attribution/
- Microsoft's own repo says "CDLA Permissive 2.0", not ODbL. [VERIFIED] https://github.com/microsoft/GlobalMLBuildingFootprints
- CDLA Section 2.1 needs the agreement text shared with shared Data. Section 3.1 puts no limits on computed Results. [VERIFIED] https://cdla.dev/permissive-2-0/
- Take the licence from the source you download, not from the Overture summary. Record the source in the build log.
- Google Open Buildings: "CC BY-4.0" and "ODbL" v1.0. "you can pick which of the two licenses you prefer". [VERIFIED] https://sites.research.google/gr/open-buildings/
- The 2.5D Temporal licence page was not read. [UNVERIFIED]
- Meta/WRI canopy height: CC BY 4.0. Cite "Meta and World Resources Institude (WRI) - 2024. High Resolution Canopy Height Maps (CHM)." Add "Source imagery for CHM © 2016 Maxar". [VERIFIED] https://registry.opendata.aws/dataforgood-fb-forests/
- The tree crowns made from this raster carry the same attribution. Put it in the credits panel.
- CC-BY inputs can feed an ODbL graph if attribution stays. [UNVERIFIED] This is the common view, not a read text.
- CC-BY-SA (Mapillary) is not compatible with ODbL in one database. [UNVERIFIED] Recall of OSM community position.
- Mapillary images: "subject to the Creative Commons Share Alike (CC BY-SA) license". [VERIFIED] https://www.mapillary.com/terms
- Mapillary terms allow users to "develop, edit and contribute content to OpenStreetMap". [VERIFIED] Same page.
- Design rule: use Mapillary and KartaView images only to survey by eye and then edit OSM. Never copy image-derived rows into the graph by script.
- Mapillary Section 5.1 prohibits use "for or in connection with real-time navigation or route guidance". [VERIFIED] Same page.
- So the app must not call the Mapillary API from live turn-by-turn features. Do not show Mapillary images inside the router.
- Mapillary users must not "re-identify or unblur" content. Attribute with the Mapillary logo. [VERIFIED] Same page.
- KartaView terms page failed with a certificate error. [UNVERIFIED]

### Google, LiPAD, and other sources

- Google geo guidelines prohibit "Creating data from Street View images, such as digitizing or tracing". [VERIFIED] https://about.google/brand-resource-center/products-and-services/geo-guidelines/
- They also prohibit using "applications to analyze and extract information from the Street View imagery". [VERIFIED] Same page.
- Never trace from Street View or Google Maps. Never score shade from them. Never store Google routes.
- Google Routes policy: results "must be shown on a Google Map". Caching is restricted. [VERIFIED] https://developers.google.com/maps/documentation/routes/policies
- Google Maps Platform Terms Section 3.2.3 (no scraping, no caching) was not read. [UNVERIFIED]
- LiPAD flood hazard layers carry a EULA. It allows "organization's use, demonstration and educational purposes" and bars redistribution. [UNVERIFIED] Search snippet only.
- Raw LiDAR terms were not found. Email lipad@dream.upd.edu.ph before you publish any LiDAR-derived layer. [UNVERIFIED]
- Open-Meteo free tier is non-commercial. CC-BY 4.0 attribution is needed. [VERIFIED] Reported in 07-weather-feeds.md from https://open-meteo.com/en/terms
- RainViewer free tier is for personal or educational use. Credit "Weather data by RainViewer" is mandatory. [VERIFIED] Reported in 07-weather-feeds.md.

## 3. Government works carry no copyright, but "exploitation for profit" needs agency approval

- RA 8293 Section 176.1: "No copyright shall subsist in any work of the Government of the Philippines." [VERIFIED] https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html
- It continues: "prior approval of the government agency or office wherein the work is created shall be necessary" "for exploitation of such work for profit." [VERIFIED] Same page.
- The agency "may, among other things, impose as a condition the payment of royalties." [VERIFIED] Same page.
- A free, ad-free, non-profit app does not "exploit for profit". Keep it that way, or get written approval first. [UNVERIFIED reading]
- Section 185.1 treats fair use for "news reporting, teaching" and "research" as no infringement. [VERIFIED] Same page.
- PAGASA has no terms page. `/terms-of-use` gave HTTP 404. [VERIFIED] From 07-weather-feeds.md.
- Scraping PAGASA pages is not barred by a stated term. It is also not licensed. Rate-limit requests, cache, credit PAGASA, and write to PAGASA for permission. [UNVERIFIED]
- MMDA blocked automated access with a challenge page. Do not bypass it. [VERIFIED] From 07-weather-feeds.md.
- data.gov.ph: the site shows only the title "Open Data Philippines". No licence page was found. [VERIFIED]
- A portal listing says datasets are free with attribution to the agency, and per-dataset licences rule. [UNVERIFIED] Search snippet.
- PSA says its datasets use CC BY. [UNVERIFIED] Search snippet of https://openstat.psa.gov.ph/Terms
- EO 2 (2016) gives "Every Filipino shall have access to information, official records, public records". [VERIFIED] https://lawphil.net/executive/execord/eo2016/eo_2_2016.html It covers requests, not reuse licences.
- Use for LGU data: read each LGU page. Prefer a short written permission email. Keep the email in the repo.

## 4. Origin and destination queries are probably personal information, so log nothing by default

- RA 10173 Section 3(g): personal information is data from which identity is "apparent or can be reasonably and directly ascertained", alone or combined. [VERIFIED] https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html
- A start point at a home address, with an IP address, can identify a person. Treat it as personal information. [UNVERIFIED] No ruling on route queries was found.
- NPC Advisory Opinion 2017-63 reportedly treats IP address and location as personal data when they single out a person. [UNVERIFIED] Secondary summary only.
- Section 3(h) excludes people who handle data for "personal, family or household affairs". [VERIFIED] A public app is not that.
- Section 4: the Act applies "to the processing of all types of personal information". [VERIFIED]
- Section 11 sets transparency, legitimate purpose, and proportionality. Data must not be kept longer than necessary. [VERIFIED]
- Section 12(a) lists consent as one lawful basis. [VERIFIED]
- Sensitive personal information under 3(l) covers health, education, and government IDs. [VERIFIED] Do not collect any.

### Design that keeps the app low-risk

- Compute routes in the browser or on a stateless server. Do not store origin, destination, or IP.
- Turn off access-log IP storage, or truncate and delete logs within 7 days. [UNVERIFIED] The 7 days is a design choice, not a rule.
- Use no ad trackers and no analytics cookies. Use a counter that stores no IP.
- Ask for device location only when the user taps "use my location". Never keep it.
- Publish a short privacy notice that names the data, the purpose, retention, and a contact. Link it from every page.
- Do not ask for names, emails, or accounts in v1.

### NPC registration

- Secondary sources say NPC Circular 2022-04 requires registration for any controller with 250 or more employees. Also for 1,000 or more individuals' sensitive data, or likely risk to data subjects. [UNVERIFIED] The PDF returned HTTP 403 twice.
- Secondary sources also say automated decision-making or profiling systems must register in all cases. [UNVERIFIED]
- Small entities outside the thresholds may register voluntarily or file a "Sworn Declaration and Undertaking for Exemption". [UNVERIFIED] https://mondaq.com/privacy-protection/1319392/all-things-registration-national-privacy-commission-issues-new-rules-on-registration-of-data-processing-systems
- No 2025 or 2026 circular that replaces 2022-04 was found. [UNVERIFIED] Absence from search results only.
- A route scorer ranks streets. It does not decide anything about a person. This is probably not profiling. [UNVERIFIED] Ask the NPC.
- Breach rule: notify the NPC within 72 hours for serious breaches. [UNVERIFIED] Secondary source, NPC Circular 16-03. Collecting nothing leaves little to breach.

### Crowd reports and photos

- Do not accept photos in v1. Faces and plates make a photo personal information.
- If photos come later, strip EXIF location, blur faces and plates before storage, and delete the original. Moderate before publishing.
- Text reports must carry no name. Store the report location rounded to the street segment, not to the user.
- Mapillary already blurs faces and plates, and its terms bar unblurring. [VERIFIED] https://www.mapillary.com/terms
- Label reports as unverified user input. flood-status-ph shows the right rule: "A high river does not prove the condition of a named street." [VERIFIED] From 00-local-assets.md.
- Reports about public streets carry little privacy risk. Reports about a named shop or person do carry risk. Block free text with names.

## 5. Liability: nothing found, so use a clear disclaimer and avoid hazardous routing

- No PH case law or rule on navigation-app liability was researched. [UNVERIFIED]
- Comparable apps' disclaimer wording was not collected. [UNVERIFIED]
- Draft disclaimer for a lawyer to review: routes are suggestions, conditions change, the user must watch traffic, flood, and signs, and the map may be wrong.
- Show flood-prone flags as history, not live status. This matches the rule in 00-local-assets.md.
- Do not route through underpasses or low streets when a PAGASA alert is active. Warn instead.
- Say on the route screen that cover data may be out of date. Show the data date.
- Add the PH disclaimer line for analytics: "Statistical indicators derived from public data. Patterns may have legitimate explanations."

## 6. Naming: avoid "gov" and seals, and check names with IPOPHL by hand

- The Singapore original uses a gov.sg domain. A PH civic project must not use "gov.ph" or a government seal. It must not imply an agency made it. [UNVERIFIED] The PH law on flags and seals was not read.
- Add a footer line: "Independent project. Not affiliated with any government agency."
- Do not use PAGASA, MMDA, or DOST logos. Name sources in text only.
- .ph registrant rules: an adult individual or a legal entity. Names use 3 to 63 letters and digits, with no hyphens. [UNVERIFIED] Safenames summary of dotPH policy. https://www.safenames.net/domain-names/domain-name-regulations/PH
- Registrars disagree on local presence for .ph. [UNVERIFIED] Check with dotPH before purchase.
- New .ph domains need email verification or the registry suspends them. [UNVERIFIED]
- Name status from 06-ph-prior-art-demand.md: lilim.ph, silong.ph, and payong.ph show parked pages. [VERIFIED] Do not register anything.
- IPOPHL runs a public trademark search. Search each candidate in classes 9 and 42. Use the exact-match and similar-sound options. [UNVERIFIED] Recall only. The tool was not opened.
- Check the names lilim, silong, silungan, and payong. "Payong" is a common word and may be hard to protect. [UNVERIFIED]

## 7. v1 license and privacy checklist

| # | Item | Source |
|---|---|---|
| 1 | Show "© OpenStreetMap contributors" linked to openstreetmap.org/copyright, always visible on the map | openstreetmap.org/copyright [VERIFIED] |
| 2 | Publish the cover-annotated graph under ODbL with each release | ODbL 4.4 and 4.6 [VERIFIED] |
| 3 | Keep crowd data in a separate table, joined by OSM id | OSMF guidelines [UNVERIFIED] |
| 4 | Credit Meta/WRI CHM with the Maxar line, and credit Overture, Google, Esri, or Microsoft by source | AWS registry, Overture page [VERIFIED] |
| 5 | Record the licence of each building source from its own repo, not the Overture summary | Microsoft repo [VERIFIED] |
| 6 | Never trace or score from Street View or Google Maps, and never store Google routes | Google geo guidelines [VERIFIED] |
| 7 | Use Mapillary and KartaView by eye for OSM edits only, with no API in live routing | Mapillary 5.1 [VERIFIED] |
| 8 | Email LiPAD before any LiDAR-derived layer goes public | LiPAD EULA [UNVERIFIED] |
| 9 | Stay non-commercial, or buy Open-Meteo and talk to RainViewer first | 07-weather-feeds.md [VERIFIED] |
| 10 | Credit "Weather data by RainViewer" and Open-Meteo CC-BY | 07-weather-feeds.md [VERIFIED] |
| 11 | Keep the app free of ads and sales, and write to PAGASA for permission | RA 8293 s176 [VERIFIED] |
| 12 | Do not bypass the MMDA challenge page | 07-weather-feeds.md [VERIFIED] |
| 13 | Store no origin, destination, or IP. Short log retention if any | RA 10173 s3(g), s11 [VERIFIED] |
| 14 | Ask for device location only on tap | RA 10173 s12(a) [VERIFIED] |
| 15 | Publish a privacy notice with purpose, retention, and contact | RA 10173 s11 [VERIFIED] |
| 16 | No photo uploads in v1. Block names in report text | RA 10173 s3(g) [VERIFIED] |
| 17 | Check NPC Circular 2022-04 text, then file the exemption declaration if advised | NPC circular [UNVERIFIED] |
| 18 | Show a route disclaimer and data dates. Label flood flags as history | 00-local-assets.md [VERIFIED] |
| 19 | Add a "not a government site" footer and use no seal or "gov" name | Naming rules [UNVERIFIED] |
| 20 | Search IPOPHL for each name before launch. Register nothing yet | IPOPHL [UNVERIFIED] |

## Open questions for a lawyer or an agency

- Does a cover-annotated graph count as a Derivative Database under the OSMF guideline? Does a separate crowd table avoid share-alike?
- What do NPC Circular 2022-04 Section 5 and the exemption form say for a small free app? Does route scoring count as profiling?
- Does PAGASA allow scraping and display in a free app? Ask PAGASA in writing.
- Does a free app with donations or grants count as "for profit" under RA 8293 s176?
- What are the LiPAD terms for raw LiDAR and derived layers?
- What does Google Maps Platform Terms Section 3.2.3 say about derived data? Not needed if the app never uses Google data.
- Does PH law set a duty of care for navigation apps? Does any PH rule limit use of "gov" in names?
- Does the data.gov.ph portal have a licence? Open Data PH terms were not found.

## Source list

- https://opendatacommons.org/licenses/odbl/1-0/
- https://www.openstreetmap.org/copyright
- https://docs.overturemaps.org/attribution/
- https://sites.research.google/gr/open-buildings/
- https://github.com/microsoft/GlobalMLBuildingFootprints
- https://cdla.dev/permissive-2-0/
- https://registry.opendata.aws/dataforgood-fb-forests/
- https://www.mapillary.com/terms
- https://about.google/brand-resource-center/products-and-services/geo-guidelines/
- https://developers.google.com/maps/documentation/routes/policies
- https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html
- https://lawphil.net/statutes/repacts/ra2012/ra_10173_2012.html
- https://lawphil.net/executive/execord/eo2016/eo_2_2016.html
- https://mondaq.com/privacy-protection/1319392/all-things-registration-national-privacy-commission-issues-new-rules-on-registration-of-data-processing-systems
- https://www.safenames.net/domain-names/domain-name-regulations/PH
