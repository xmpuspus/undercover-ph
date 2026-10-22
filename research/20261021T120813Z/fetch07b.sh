#!/bin/zsh
R=research/20261021T120813Z/raw/07
cd $R
fx() { n=$1; u=$2; t=$(date -u +%Y-%m-%dT%H:%M:%SZ)
 curl -sS -L --max-time 25 --max-filesize 3000000 -A "Mozilla/5.0 (research)" -D $n.hdr -o $n.body -w "$n|%{http_code}|%{content_type}|%{size_download}|%{url_effective}|$t\n" "$u" 2>&1 | tail -1 | tee -a _index.txt; }
fx heat_pdf "https://pubfiles.pagasa.dost.gov.ph/tamss/weather/heat_index_summary.pdf"
fx heat_png_observed "https://pubfiles.pagasa.dost.gov.ph/iaas/heat_index/HeatIndexObserved.png"
fx heat_png_forecast "https://pubfiles.pagasa.dost.gov.ph/iaas/heat_index/Forecast.png"
fx iheatmap "https://iheatmap.pagasa.dost.gov.ph"
fx panahon_heat "https://www.panahon.gov.ph/heat_index.html"
fx panahon_home "https://www.panahon.gov.ph/"
fx pagasa_lowhigh "https://www.pagasa.dost.gov.ph/weather/low-high-temperature"
grep -i -E 'last-modified' heat_pdf.hdr heat_png_observed.hdr heat_png_forecast.hdr
file heat_pdf.body heat_png_observed.body heat_png_forecast.body
