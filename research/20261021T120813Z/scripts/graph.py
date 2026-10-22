import sys, json, time, datetime, logging
import osmnx as ox
import networkx as nx

RAW = sys.argv[1]
OUT = sys.argv[2]
D = {
 "makati": (14.548,121.012,14.562,121.032), "bgc": (14.545,121.040,14.560,121.058),
 "ortigas": (14.578,121.053,14.592,121.067), "updiliman": (14.647,121.055,14.664,121.075),
 "manila": (14.575,120.970,14.595,120.990), "cubao": (14.615,121.048,14.625,121.060),
}
ox.settings.use_cache = True
ox.settings.cache_folder = f"{RAW}/osmnx_cache"
ox.settings.requests_timeout = 180
ox.settings.overpass_url = "https://overpass-api.de/api"
ox.settings.requests_headers = {"User-Agent": "undercover-ph-research/0.1"}
ox.settings.log_console = False
ox.settings.log_file = True
ox.settings.logs_folder = f"{RAW}/osmnx_logs"
res = {}
for k, (s, w, n, e) in D.items():
    t0 = datetime.datetime.now(datetime.timezone.utc).isoformat()
    G = ox.graph_from_bbox((w, s, e, n), network_type="walk", simplify=True, retain_all=True, truncate_by_edge=False)
    U = ox.convert.to_undirected(G)
    comps_w = sorted(nx.weakly_connected_components(G), key=len, reverse=True)
    comps_s = sorted(nx.strongly_connected_components(G), key=len, reverse=True)
    lc = comps_w[0]
    sub = U.subgraph(lc)
    r = {
        "retrieved_utc": t0,
        "nodes": G.number_of_nodes(), "edges_directed": G.number_of_edges(),
        "edges_undirected": U.number_of_edges(),
        "edge_km_undirected": round(sum(d.get("length", 0) for _, _, d in U.edges(data=True)) / 1000, 3),
        "edge_km_directed_sum": round(sum(d.get("length", 0) for _, _, d in G.edges(data=True)) / 1000, 3),
        "components_weak": len(comps_w),
        "lcc_weak_node_share": round(len(lc) / G.number_of_nodes(), 4),
        "lcc_weak_edge_km_share": round(sum(d.get("length", 0) for _, _, d in sub.edges(data=True)) / 1000 /
                                         max(1e-9, sum(d.get("length", 0) for _, _, d in U.edges(data=True)) / 1000), 4),
        "lcc_strong_node_share": round(len(comps_s[0]) / G.number_of_nodes(), 4),
        "component_sizes_top5": [len(c) for c in comps_w[:5]],
    }
    res[k] = r
    print(k, json.dumps(r), flush=True)
    json.dump(res, open(OUT, "w"), indent=1)
    time.sleep(10)
