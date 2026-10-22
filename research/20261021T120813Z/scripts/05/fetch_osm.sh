#!/bin/zsh
# Fetch walkable OSM ways for two pilot-size samples and NCR-wide counts.
# Tries public Overpass mirrors in order, with backoff. Output goes to raw/05.
B=research/20261021T120813Z/raw/05
UA="undercover-ph-research/1.0 (routing graph sizing)"
MIRRORS=(https://overpass.kumi.systems/api/interpreter https://overpass.private.coffee/api/interpreter https://overpass-api.de/api/interpreter)
# Same walk filter as osmnx network_type="walk".
WALK='["highway"]["area"!~"yes"]["highway"!~"abandoned|bus_guideway|construction|cycleway|motor|no|planned|platform|proposed|raceway|razed"]["foot"!~"no"]["service"!~"private"]'

fetch() {
  local name=$1 q=$2 wait m code
  print -r -- "$q" > $B/osm_${name}_query.txt
  for wait in 0 30 90; do
    for m in $MIRRORS; do
      sleep $wait
      code=$(curl -sS -A "$UA" -m 300 -o $B/osm_${name}.json -w '%{http_code}' --data-urlencode "data=$q" $m)
      print -r -- "$name $(date -u +%FT%TZ) $m http=$code bytes=$(wc -c < $B/osm_${name}.json)" >> $B/fetch_log.txt
      if [[ $code == 200 ]] && head -c 400 $B/osm_${name}.json | grep -q '"elements"'; then
        return 0
      fi
    done
  done
  return 1
}

sample() {
  fetch $1 "[out:json][timeout:180];way${WALK}($2)->.w;.w out body qt;node(w.w);out skel qt;"
}

sample makati_cbd "14.548,121.012,14.562,121.032"
sleep 10
sample sampaloc "14.600,120.985,14.614,121.005"
sleep 10
fetch ncr_count "[out:json][timeout:300];area[\"ISO3166-2\"=\"PH-00\"]->.a;way${WALK}(area.a)->.w;.w out count;node(w.w);out count;"
