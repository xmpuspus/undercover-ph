#!/bin/zsh
# Polite Overpass fetch: one query per bbox, 20 s gap, tags only (Makati also gets geometry).
B=research/20261021T120813Z/raw/02
UA="undercover-ph-research/1.0 (building height readiness audit)"
run() { name=$1; bbox=$2; mode=$3
  q="[out:json][timeout:90];nwr[\"building\"]($bbox);out $mode;"
  echo "$q" > $B/overpass_${name}_query.txt
  curl -sS -A "$UA" -m 120 -D $B/overpass_${name}_headers.txt -o $B/overpass_${name}.json --data-urlencode "data=$q" https://overpass-api.de/api/interpreter
  echo "$name $(date -u +%FT%TZ) $(head -1 $B/overpass_${name}_headers.txt) $(wc -c < $B/overpass_${name}.json)"
  sleep 20; }
run makati "14.548,121.012,14.562,121.032" "tags geom"
run bgc "14.545,121.040,14.560,121.058" "tags"
run ortigas "14.578,121.053,14.592,121.067" "tags"
run upd "14.647,121.055,14.664,121.075" "tags"
curl -sS -A "$UA" https://overpass-api.de/api/status > $B/overpass_status.txt
