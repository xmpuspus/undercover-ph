# Yield model. All inputs are assumptions except the OSM km values from raw/03 and raw/09/cbd_ped_km.txt.
def kmh(walk_kmh, photo_min, tag_min, overhead):
    per100 = 0.1 / walk_kmh * 60 + photo_min + tag_min  # minutes per 100 m
    per100 *= 1 + overhead
    return 6.0 / per100, per100
cases = {"fast": (3.0, 0.5, 0.0, 0.2), "central": (3.0, 0.5, 1.0, 0.2), "slow": (3.0, 0.5, 2.0, 0.2)}
for k, v in cases.items():
    r, p = kmh(*v)
    print(f"{k}: {p:.2f} min per 100 m -> {r:.2f} km/h; 4 h session = {4*r:.1f} km")
central = kmh(*cases["central"])[0]
claimed = 4 + 2 + 2
osm_union = 2.274
print("claimed cover+elevated+underpass km", claimed, "OSM cover-or-tunnel km", osm_union, "gap upper bound", round(claimed - osm_union, 2))
connectors = 0.4 * claimed
p1 = (claimed + connectors) / central
ped_total = 30.82 - 4.56
rest = ped_total - claimed
scan = kmh(3.0, 0.5, 0.0, 0.2)[0]
p2 = rest / scan
print(f"phase1 km {claimed+connectors:.1f} hours {p1:.1f}; phase2 km {rest:.1f} hours {p2:.1f}; total {p1+p2:.1f} h")
for people in (1, 2, 4):
    print(people, "people ->", round((p1 + p2) / (4 * people), 2), "Saturday sessions of 4 h")
