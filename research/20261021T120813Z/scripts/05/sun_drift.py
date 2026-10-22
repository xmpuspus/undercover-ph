"""How much does the sun move during a 30-minute walk in Makati?

Uses the NOAA solar position equations (General Solar Position, NOAA GML).
Prints sun elevation, azimuth and the shadow length of a 20 m building at each
half hour, plus the change across 30 minutes, for four dates.

Usage: python3 -I sun_drift.py > ../../raw/05/derived/sun_drift.txt
"""

import math
from datetime import datetime, timedelta, timezone

LAT, LON, TZ = 14.5547, 121.0244, 8  # Makati CBD, UTC+8
BUILDING_M = 20.0
DATES = ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"]


def sun_position(local_dt):
    """Return (elevation_deg, azimuth_deg) for a local datetime at LAT, LON."""
    doy = local_dt.timetuple().tm_yday
    hour = local_dt.hour + local_dt.minute / 60
    g = 2 * math.pi / 365 * (doy - 1 + (hour - 12) / 24)
    eqtime = 229.18 * (
        0.000075
        + 0.001868 * math.cos(g)
        - 0.032077 * math.sin(g)
        - 0.014615 * math.cos(2 * g)
        - 0.040849 * math.sin(2 * g)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(g)
        + 0.070257 * math.sin(g)
        - 0.006758 * math.cos(2 * g)
        + 0.000907 * math.sin(2 * g)
        - 0.002697 * math.cos(3 * g)
        + 0.00148 * math.sin(3 * g)
    )
    time_offset = eqtime + 4 * LON - 60 * TZ
    tst = hour * 60 + time_offset
    ha = math.radians(tst / 4 - 180)
    lat = math.radians(LAT)
    cos_zen = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1.0, min(1.0, cos_zen)))
    elev = 90 - math.degrees(zen)
    az = math.degrees(
        math.atan2(
            math.sin(ha),
            math.cos(ha) * math.sin(lat) - math.tan(decl) * math.cos(lat),
        )
    )
    return elev, (az + 180) % 360


def shadow(elev):
    return BUILDING_M / math.tan(math.radians(elev)) if elev > 1 else float("inf")


def main():
    tz = timezone(timedelta(hours=TZ))
    print(f"Makati {LAT}N {LON}E, building {BUILDING_M:.0f} m. d_* = change over the next 30 min.")
    for d in DATES:
        print(f"\n{d}")
        print(" time  elev  azim  shadow_m  d_elev  d_azim  d_shadow_m")
        y, m, dd = map(int, d.split("-"))
        for h in range(6 * 2, 18 * 2):
            t0 = datetime(y, m, dd, h // 2, 30 * (h % 2), tzinfo=tz)
            t1 = t0 + timedelta(minutes=30)
            e0, a0 = sun_position(t0)
            e1, a1 = sun_position(t1)
            if e0 < 0:
                continue
            da = (a1 - a0 + 180) % 360 - 180
            s0, s1 = shadow(e0), shadow(e1)
            ds = s1 - s0 if math.isfinite(s0) and math.isfinite(s1) else float("nan")
            print(
                f" {t0:%H:%M} {e0:5.1f} {a0:5.0f} {s0:8.1f} {e1 - e0:7.1f} {da:7.1f} {ds:10.1f}"
            )


if __name__ == "__main__":
    main()
