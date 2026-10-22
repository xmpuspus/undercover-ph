"""Dates in 2026 when Makati's noon sun stands north of the zenith, so noon shadows point south."""
import datetime as dt, math
LAT = 14.555
def decl(doy):
    g = 2 * math.pi / 365 * (doy - 1)
    return math.degrees(0.006918 - 0.399912*math.cos(g) + 0.070257*math.sin(g) - 0.006758*math.cos(2*g)
                        + 0.000907*math.sin(2*g) - 0.002697*math.cos(3*g) + 0.00148*math.sin(3*g))
north = [dt.date(2026,1,1)+dt.timedelta(n) for n in range(365) if decl(n+1) > LAT]
print(f"noon sun north of zenith: {north[0]:%d %b} to {north[-1]:%d %b} ({len(north)} days)")
for d in ["2026-03-21","2026-05-01","2026-06-21","2026-08-15","2026-10-22","2026-12-21"]:
    n = (dt.date.fromisoformat(d) - dt.date(2026,1,1)).days + 1
    de = decl(n); alt = 90 - abs(LAT - de)
    print(d, f"declination {de:+.1f}", f"noon altitude {alt:.1f}", "sun north" if de > LAT else "sun south", f"30 m building noon shadow {30/math.tan(math.radians(alt)):.1f} m")
