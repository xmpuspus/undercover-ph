#!/bin/zsh
# Fetch engine, licence, basemap and hosting docs. One empty directory per source.
B=research/20261021T120813Z/raw/05/docs
UA="undercover-ph-research/1.0 (routing architecture review)"
LOG=$B/fetch_log.txt
mkdir -p $B
get() {
  local d=$1 f=$2 url=$3 code
  mkdir -p $B/$d
  code=$(curl -sSL -A "$UA" -m 60 -o $B/$d/$f -w '%{http_code}' "$url")
  print -r -- "$(date -u +%FT%TZ) $d/$f http=$code bytes=$(wc -c < $B/$d/$f) $url" >> $LOG
}
get gh_custom_models custom-models.md https://raw.githubusercontent.com/graphhopper/graphhopper/master/docs/core/custom-models.md
get gh_import_registry ImportRegistry.java https://raw.githubusercontent.com/graphhopper/graphhopper/master/core/src/main/java/com/graphhopper/routing/util/ImportRegistry.java
get gh_profiles profiles.md https://raw.githubusercontent.com/graphhopper/graphhopper/master/docs/core/profiles.md
get valhalla_api api-reference.md https://raw.githubusercontent.com/valhalla/valhalla/master/docs/docs/api/turn-by-turn/api-reference.md
get valhalla_licence COPYING https://raw.githubusercontent.com/valhalla/valhalla/master/COPYING
get osrm_profiles profiles.md https://raw.githubusercontent.com/Project-OSRM/osrm-backend/master/docs/profiles.md
get osrm_traffic traffic.md https://raw.githubusercontent.com/Project-OSRM/osrm-backend/master/docs/traffic.md
get osrm_licence LICENSE.TXT https://raw.githubusercontent.com/Project-OSRM/osrm-backend/master/LICENSE.TXT
get pgrouting_dijkstra pgr_dijkstra.html https://docs.pgrouting.org/latest/en/pgr_dijkstra.html
get pgrouting_licence LICENSE https://raw.githubusercontent.com/pgRouting/pgrouting/main/LICENSE
get maplibre_licence LICENSE.txt https://raw.githubusercontent.com/maplibre/maplibre-gl-js/main/LICENSE.txt
get pmtiles_licence LICENSE https://raw.githubusercontent.com/protomaps/PMTiles/main/LICENSE
get protomaps_downloads downloads.html https://docs.protomaps.com/basemaps/downloads
get protomaps_basemap_licence LICENSE.md https://raw.githubusercontent.com/protomaps/basemaps/main/LICENSE.md
get protomaps_api api.html https://protomaps.com/api
get openfreemap_home index.html https://openfreemap.org/
get openfreemap_tos tos.html https://openfreemap.org/tos/
get fly_pricing pricing.html https://fly.io/docs/about/pricing/
get cf_pages_limits limits.html https://developers.cloudflare.com/pages/platform/limits/
get gh_pages_limits limits.html https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
