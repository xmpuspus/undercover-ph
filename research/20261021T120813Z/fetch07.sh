#!/bin/zsh
R=research/20261021T120813Z/raw/07
UA="Mozilla/5.0 (research; undercover-ph feed audit)"
f() { n=$1; u=$2; t=$(date -u +%Y-%m-%dT%H:%M:%SZ)
 curl -sS -L --max-time 30 --max-filesize 3000000 -A "$UA" -D $R/$n.hdr -o $R/$n.body -w "$n|%{http_code}|%{content_type}|%{size_download}|%{num_redirects}|%{url_effective}|$t\n" "$u" 2>&1 | tail -1 >> $R/_index.txt; }
: > $R/_index.txt
f pagasa_heat "https://www.pagasa.dost.gov.ph/weather/heat-index"
f pagasa_heat_bagong "https://bagong.pagasa.dost.gov.ph/weather/heat-index"
f pagasa_radar "https://www.pagasa.dost.gov.ph/weather/radar"
f pagasa_rainfall_adv "https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd"
f pagasa_rainfall_adv2 "https://pubfiles.pagasa.dost.gov.ph/pagasaweb/files/rainfall-advisory/"
f noah_home "https://noah.up.edu.ph/"
f noah_api "https://api.noah.up.edu.ph/"
f openmeteo_min15 "https://api.open-meteo.com/v1/forecast?latitude=14.5995&longitude=120.9842&minutely_15=precipitation,temperature_2m,relative_humidity_2m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability&current=temperature_2m,precipitation&timezone=Asia%2FManila&forecast_days=1"
f rainviewer "https://api.rainviewer.com/public/weather-maps.json"
f gsmap_home "https://sharaku.eorc.jaxa.jp/GSMaP/index.htm"
f gsmap_guide "https://sharaku.eorc.jaxa.jp/GSMaP/guide.html"
f himawari_aws "https://noaa-himawari9.s3.amazonaws.com/?list-type=2&prefix=AHI-L2-FLDK-RainfallRate/&max-keys=3"
f jma_himawari "https://www.data.jma.go.jp/mscweb/data/himawari/"
f mmda_home "https://mmda.gov.ph/"
f mmda_flood "https://mmda.gov.ph/index.php/flood-control"
f mmda_api "https://mmda.gov.ph/api"
f waze_wfc "https://www.waze.com/wazeforcities"
f waze_wfc_terms "https://www.waze.com/legal/wfc-terms"
f pagasa_ws "https://pasig-marikina-tullahanffws.pagasa.dost.gov.ph/water/map.do"
f pagasa_stations "https://www.pagasa.dost.gov.ph/weather/weather-observation"
f pagasa_tos "https://www.pagasa.dost.gov.ph/terms-of-use"
f openmeteo_terms "https://open-meteo.com/en/terms"
f rainviewer_api_doc "https://www.rainviewer.com/api.html"
f airgradient_map "https://api.airgradient.com/public/api/v1/world/locations/measures/current"
f openaq_noauth "https://api.openaq.org/v3/locations?coordinates=14.5995,120.9842&radius=12000&limit=3"
cat $R/_index.txt
