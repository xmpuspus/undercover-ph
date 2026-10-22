import json, subprocess, sys, time, os, datetime
RAW = sys.argv[1]
URL = "https://overpass-api.de/api/interpreter"
UA = "undercover-ph-research/0.1"
D = {
 "makati": (14.548,121.012,14.562,121.032),
 "bgc": (14.545,121.040,14.560,121.058),
 "ortigas": (14.578,121.053,14.592,121.067),
 "updiliman": (14.647,121.055,14.664,121.075),
 "manila": (14.575,120.970,14.595,120.990),
 "cubao": (14.615,121.048,14.625,121.060),
}
NCR = (14.35, 120.90, 14.80, 121.15)


def bb(b):
    return ",".join(str(x) for x in b)


def run(num, name, q, timeout=150):
    qf = f"{RAW}/{num:02d}-{name}-query.txt"
    rf = f"{RAW}/{num:02d}-{name}-response.json"
    if os.path.exists(rf) and os.path.getsize(rf) > 0:
        print("skip", rf)
        return
    open(qf, "w").write(q)
    for attempt in range(3):
        t = datetime.datetime.now(datetime.timezone.utc).isoformat()
        p = subprocess.run(
            ["curl", "-sS", "-m", str(timeout), "-A", UA, "--data-urlencode", f"data@{qf}",
             "-o", rf, "-w", "%{http_code}|%{content_type}|%{size_download}|%{num_redirects}", URL],
            capture_output=True, text=True)
        meta = p.stdout.strip()
        open(f"{RAW}/{num:02d}-{name}-meta.txt", "w").write(
            f"retrieved_utc={t}\nstatus|ctype|bytes|redirects={meta}\nstderr={p.stderr.strip()}\nattempt={attempt+1}\n")
        print(num, name, meta, p.stderr.strip()[:100], flush=True)
        if meta.startswith("200|application/json"):
            break
        time.sleep(30)
    time.sleep(10)


which = sys.argv[2] if len(sys.argv) > 2 else "districts"
if which == "districts":
    n = 1
    for k, b in D.items():
        q = (f'[out:json][timeout:120];\n(\n way["highway"]({bb(b)});\n node["highway"="crossing"]({bb(b)});\n'
             f' nwr["highway"="elevator"]({bb(b)});\n);\nout meta geom({bb(b)});\n')
        run(n, k + "-network", q)
        n += 1
    for k, b in D.items():
        q = (f'[out:json][timeout:60];\n(\n nwr["name"]["tourism"]({bb(b)});\n'
             f' nwr["name"]["amenity"~"university|hospital|place_of_worship"]({bb(b)});\n'
             f' nwr["name"]["shop"="mall"]({bb(b)});\n nwr["name"]["railway"="station"]({bb(b)});\n'
             f' nwr["name"]["historic"]({bb(b)});\n);\nout tags center 300;\n')
        run(n, k + "-landmarks", q, 90)
        n += 1
