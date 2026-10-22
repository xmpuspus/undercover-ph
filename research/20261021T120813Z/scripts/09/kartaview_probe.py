import json, subprocess, sys, urllib.parse
out = sys.argv[1]
pts = [(14.5535,121.0165),(14.5535,121.0275),(14.5585,121.0165),(14.5585,121.0275),(14.555,121.022)]
res = []
for lat, lng in pts:
    page, photos = 1, []
    while page <= 6:
        q = urllib.parse.urlencode(dict(lat=lat, lng=lng, radius=500, itemsPerPage=1000, page=page))
        r = subprocess.run(["curl","-s","-m","120","https://api.openstreetcam.org/2.0/photo/?"+q],capture_output=True,text=True)
        try: j = json.loads(r.stdout)
        except Exception: print("bad", r.stdout[:200]); break
        d = j.get("result",{}).get("data",[])
        photos += d
        if not j.get("result",{}).get("hasMoreData"): break
        page += 1
    seqs = {p.get("sequenceId") for p in photos}
    dates = sorted(p.get("dateAdded","") for p in photos)
    res.append(dict(lat=lat,lng=lng,photos=len(photos),sequences=len(seqs),first=dates[:1],last=dates[-1:],ids=[p["id"] for p in photos]))
    print(lat,lng,len(photos),len(seqs),dates[:1],dates[-1:],flush=True)
json.dump(res, open(out,"w"))
