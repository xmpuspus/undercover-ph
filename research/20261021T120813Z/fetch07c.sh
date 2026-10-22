#!/bin/zsh
R=research/20261021T120813Z/raw/07
cd $R
fx() { n=$1; u=$2; t=$(date -u +%Y-%m-%dT%H:%M:%SZ)
 curl -sS -L --max-time 25 --max-filesize 3000000 -A "Mozilla/5.0 (research)" -D $n.hdr -o $n.body -w "$n|%{http_code}|%{content_type}|%{size_download}|%{url_effective}|$t\n" "$u" 2>&1 | tail -1 | tee -a _index.txt; }
fx pagasa_radar2 "https://www.pagasa.dost.gov.ph/radar"
fx rainx "https://rainx.pagasa.dost.gov.ph/"
fx pagasa_wxadv "https://www.pagasa.dost.gov.ph/weather/weather-advisory"
fx pagasa_flood_metro "https://www.pagasa.dost.gov.ph/flood"
fx openmeteo_min15b "https://api.open-meteo.com/v1/forecast?latitude=14.5995&longitude=120.9842&minutely_15=precipitation&forecast_days=1&timezone=Asia%2FManila"
fx openmeteo_docs "https://open-meteo.com/en/docs"
fx openmeteo_pricing "https://open-meteo.com/en/pricing"
fx noah_hazard "https://noah.up.edu.ph/about"
fx noah_ref "https://www.nababaha.com/"
fx waze_cifs "https://www.waze.com/partners/wazeforcities"
