"""Summarise sun_drift.txt into per-bucket change numbers for the time-handling section.

Usage: python3 -I drift_summary.py <sun_drift.txt>
"""

import sys


def parse(path):
    rows, day = {}, None
    for line in open(path):
        p = line.split()
        if len(p) == 1 and p[0][:4] == "2026":
            day = p[0]
            rows[day] = []
        elif day and len(p) == 7 and ":" in p[0]:
            t, e, a, s, de, da, ds = p
            rows[day].append((t, float(e), float(a), float(s), float(de), float(da), float(ds)))
    return rows


def main(path):
    rows = parse(path)
    for day, rs in rows.items():
        by_t = {r[0]: r for r in rs}
        mid = [r for r in rs if "09:00" <= r[0] <= "15:00"]
        low = [r for r in rs if r[0] < "09:00" or r[0] > "15:00"]
        max_daz = max(mid, key=lambda r: abs(r[5]))
        print(f"{day}")
        for t in ("07:00", "08:00", "12:00", "16:00", "17:00"):
            if t in by_t:
                r = by_t[t]
                print(f"  {t} elev {r[1]:.1f} d_elev/30min {r[4]:+.1f}  az {r[2]:.0f} d_az/30min {r[5]:+.1f}  shadow20m {r[3]:.1f} m d_shadow/30min {r[6]:+.1f} m")
        print(f"  09-15h: max |d_az|/30min {abs(max_daz[5]):.1f} deg at {max_daz[0]}, max |d_shadow| {max(abs(r[6]) for r in mid):.1f} m")
        fin = [abs(r[6]) for r in low if r[6] == r[6]]
        print(f"  before 09 / after 15: |d_shadow|/30min range {min(fin):.1f} to {max(fin):.1f} m")


if __name__ == "__main__":
    main(sys.argv[1])
