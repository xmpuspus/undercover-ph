"""Sun altitude, azimuth and shadow length for Manila.

Standard library only. Run: python3 -I sun_geometry.py OUT_DIR
Uses the NOAA general solar position equations (Spencer-style series).
Accuracy is about 0.1 degree, enough for shadow-length planning.
Cross-check with pvlib if installed: python3 -I sun_geometry.py OUT_DIR --pvlib
"""

import csv
import math
import sys
from datetime import date

LAT = 14.58
LON = 121.0
UTC_OFFSET = 8.0
DATES = [
    ("21 Mar", date(2026, 3, 21)),
    ("1 May", date(2026, 5, 1)),
    ("21 Jun", date(2026, 6, 21)),
    ("15 Aug", date(2026, 8, 15)),
    ("21 Sep", date(2026, 9, 21)),
    ("21 Dec", date(2026, 12, 21)),
]
HOURS = [7, 9, 12, 15, 17]
BUILDING_M = 30.0
TREE_M = 10.0


def sun_position(day, hour):
    doy = day.timetuple().tm_yday
    g = 2 * math.pi / 365 * (doy - 1 + (hour - 12) / 24)
    eot = 229.18 * (
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
    # true solar time in minutes
    tst = hour * 60 + eot + 4 * LON - 60 * UTC_OFFSET
    ha = math.radians(tst / 4 - 180)
    lat = math.radians(LAT)
    cos_zen = math.sin(lat) * math.sin(decl) + math.cos(lat) * math.cos(decl) * math.cos(ha)
    zen = math.acos(max(-1.0, min(1.0, cos_zen)))
    alt = 90 - math.degrees(zen)
    x = -math.cos(decl) * math.sin(ha)
    y = math.sin(decl) * math.cos(lat) - math.cos(decl) * math.cos(ha) * math.sin(lat)
    az = math.degrees(math.atan2(x, y)) % 360
    return alt, az, math.degrees(decl), eot


def shadow_len(height, alt):
    return height / math.tan(math.radians(alt)) if alt > 0.5 else float("inf")


def main():
    out_dir = sys.argv[1]
    rows = []
    for label, d in DATES:
        for h in HOURS:
            alt, az, decl, eot = sun_position(d, h)
            rows.append(
                {
                    "date": label,
                    "local_hour": f"{h:02d}:00",
                    "decl_deg": round(decl, 2),
                    "eot_min": round(eot, 2),
                    "alt_deg": round(alt, 1),
                    "az_deg": round(az, 1),
                    "shadow_30m_bldg_m": round(shadow_len(BUILDING_M, alt), 1),
                    "shadow_10m_tree_m": round(shadow_len(TREE_M, alt), 1),
                }
            )
    path = f"{out_dir}/sun_geometry.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    md = ["| Date | Hour | Alt (deg) | Az (deg) | 30 m building shadow (m) | 10 m tree shadow (m) |", "|---|---|---|---|---|---|"]
    for r in rows:
        md.append(
            f"| {r['date']} | {r['local_hour']} | {r['alt_deg']} | {r['az_deg']} | "
            f"{r['shadow_30m_bldg_m']} | {r['shadow_10m_tree_m']} |"
        )
    with open(f"{out_dir}/sun_geometry.md", "w") as f:
        f.write("\n".join(md) + "\n")
    print("\n".join(md))

    if "--pvlib" in sys.argv:
        import pandas as pd
        import pvlib

        for label, d in DATES:
            t = pd.date_range(f"{d} 07:00", f"{d} 17:00", freq="2h", tz="Etc/GMT-8")
            sp = pvlib.solarposition.get_solarposition(t, LAT, LON)
            print(label, sp[["apparent_elevation", "azimuth"]].round(1).to_dict("list"))


if __name__ == "__main__":
    main()
