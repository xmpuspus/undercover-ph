"""Print Bing quadkeys at zoom Z for lat/lon pairs. Usage: python3 -I quadkey.py Z lat,lon [lat,lon ...]"""
import math
import sys

z = int(sys.argv[1])
for p in sys.argv[2:]:
    lat, lon = map(float, p.split(","))
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    s = math.sin(math.radians(lat))
    y = int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n)
    q = "".join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1))
    print(p, q)
