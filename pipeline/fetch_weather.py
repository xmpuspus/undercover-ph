"""Fetch the Makati hourly forecast (Open-Meteo) and the PAGASA NCR advisory for the app.

Writes weather.json, advisory.json and READY.weather to UCPH_DATA (default app/public/data).
The forecast point is the centre of the area's pilot box, read from its manifest.json.
With UCPH_ADVISORY_FROM set, the advisory is copied from that file, so many areas share one fetch.
`fetch_weather.py --advisory-to PATH` fetches only the advisory and writes it to PATH.
A failed fetch writes {"status": "unavailable"} so the app shows no invented number.
curl does the HTTP work because Python's SSL store on this Mac fails on some hosts.
"""

import html
import os
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(os.environ.get("UCPH_DATA") or Path(__file__).resolve().parents[1] / "app" / "public" / "data")
MANILA = timezone(timedelta(hours=8))


def _manifest():
    try:
        return json.loads((OUT / "manifest.json").read_text())
    except (OSError, ValueError):
        return {}


_M = _manifest()
START = datetime.fromisoformat(os.environ.get("UCPH_START_DATE") or (_M.get("dates") or ["2026-10-21"])[0]).date()
END = START + timedelta(days=6)
_W, _S, _E, _N = _M.get("pilot_bbox") or (121.012, 14.548, 121.032, 14.562)
LAT, LON = round((_S + _N) / 2, 6), round((_W + _E) / 2, 6)  # 14.555, 121.022 for Makati CBD
NCR_CITIES = [
    "Caloocan", "Las Piñas", "Las Pinas", "Makati", "Malabon", "Mandaluyong", "Manila", "Marikina",
    "Muntinlupa", "Navotas", "Parañaque", "Paranaque", "Pasay", "Pasig", "Pateros", "Quezon City",
    "San Juan", "Taguig", "Valenzuela",
]
ADVISORY_URL = "https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd"
FORECAST_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LAT}&longitude={LON}"
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,uv_index,weather_code"
    f"&timezone=Asia%2FManila&start_date={START}&end_date={END}"
)


def now():
    return datetime.now(MANILA).isoformat(timespec="seconds")


def curl(url, timeout=30):
    r = subprocess.run(
        ["curl", "-sS", "-L", "--max-time", str(timeout), "-A", "Mozilla/5.0 (undercover-ph prototype)", url],
        capture_output=True, timeout=timeout + 5,
    )
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode(errors="replace").strip() or f"curl exit {r.returncode}")
    return r.stdout.decode("utf-8", errors="replace")


def weather():
    try:
        d = json.loads(curl(FORECAST_URL))
        h = d["hourly"]
        keys = ["time", "temperature_2m", "apparent_temperature", "precipitation_probability", "uv_index", "weather_code"]
        return {
            "status": "ok",
            "source": "Open-Meteo forecast API (CC BY 4.0)",
            "source_url": FORECAST_URL,
            "fetched_at": now(),
            "lat": LAT,
            "lon": LON,
            "timezone": d.get("timezone"),
            "units": d.get("hourly_units"),
            "hourly": {k: h[k] for k in keys},
        }
    except Exception as e:  # any fetch or parse failure is reported, never filled in
        return {"status": "unavailable", "fetched_at": now(), "reason": str(e)[:300]}


def advisory():
    try:
        page = curl(ADVISORY_URL)
        text = html.unescape(re.sub(r"<[^>]+>", " ", page))
        text = re.sub(r"\s+", " ", text)
        m = re.search(r"(Thunderstorm Advisory No\.\s*\d+.*?)(?:Thunderstorm Watch|Heavy Rainfall|Rainfall Advisory|Regional Forecast|$)", text)
        warning = re.search(r"(As of today, there is no Heavy Rainfall Warning[^.]*\.)", text)
        if not m:
            return {
                "status": "ok", "source_url": ADVISORY_URL, "fetched_at": now(), "issued_at": None,
                "text": None, "cities": [], "heavy_rainfall": warning.group(1) if warning else None,
                "note": "No thunderstorm advisory text found on the page at fetch time.",
            }
        block = m.group(1)[:1200].strip()
        issued = re.search(r"Issued at:?\s*([0-9]{1,2}:[0-9]{2}\s*[AP]M,?\s*[0-9]{1,2}\s+\w+\s+[0-9]{4})", block)
        cities = sorted({c for c in NCR_CITIES if c in block})
        return {
            "status": "ok", "source_url": ADVISORY_URL, "fetched_at": now(),
            "issued_at": issued.group(1) if issued else None, "text": block, "cities": cities,
            "heavy_rainfall": warning.group(1) if warning else None,
        }
    except Exception as e:
        return {"status": "unavailable", "fetched_at": now(), "reason": str(e)[:300]}


def shared_advisory():
    src = os.environ.get("UCPH_ADVISORY_FROM")
    if not src:
        return advisory()
    try:
        return json.loads(Path(src).read_text())
    except (OSError, ValueError) as e:
        return {"status": "unavailable", "fetched_at": now(), "reason": f"shared advisory unreadable: {e}"[:300]}


def main():
    if sys.argv[1:2] == ["--advisory-to"]:
        a = advisory()
        Path(sys.argv[2]).write_text(json.dumps(a, ensure_ascii=False, indent=1))
        print(json.dumps({"advisory": a["status"], "issued_at": a.get("issued_at"), "cities": a.get("cities")}))
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    w, a = weather(), shared_advisory()
    (OUT / "weather.json").write_text(json.dumps(w, ensure_ascii=False, indent=1))
    (OUT / "advisory.json").write_text(json.dumps(a, ensure_ascii=False, indent=1))
    (OUT / "READY.weather").write_text(f"{now()} weather={w['status']} advisory={a['status']}\n")
    print(json.dumps({"weather": w["status"], "hours": len(w.get("hourly", {}).get("time", [])),
                      "advisory": a["status"], "issued_at": a.get("issued_at"), "cities": a.get("cities")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
