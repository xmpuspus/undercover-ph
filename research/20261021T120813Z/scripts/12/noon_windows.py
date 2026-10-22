"""Days in 2026 when Manila's solar-noon altitude exceeds a threshold.
A 30 m building shades a sidewalk 4 m from its facade only while the sun is below atan(30/4) = 82.4 deg.
NOAA declination series, latitude 14.58 N."""
import math, datetime as dt
LAT = 14.58
def decl(doy):
    g = 2 * math.pi / 365 * (doy - 1)
    d = (0.006918 - 0.399912*math.cos(g) + 0.070257*math.sin(g) - 0.006758*math.cos(2*g)
         + 0.000907*math.sin(2*g) - 0.002697*math.cos(3*g) + 0.00148*math.sin(3*g))
    return math.degrees(d)
for thr, label in [(82.4, "30 m building, 4 m offset"), (78.7, "20 m building, 4 m offset"), (85.0, "noon sun within 5 deg of zenith")]:
    days = [dt.date(2026,1,1)+dt.timedelta(n) for n in range(365) if 90-abs(LAT-decl(n+1)) > thr]
    runs, start = [], days[0]
    for a, b in zip(days, days[1:] + [None]):
        if b is None or (b - a).days > 1:
            runs.append((start, a)); start = b
    print(f"{label}: noon alt > {thr} deg on {len(days)} days:", "; ".join(f"{s:%d %b} to {e:%d %b} ({(e-s).days+1} d)" for s, e in runs))
