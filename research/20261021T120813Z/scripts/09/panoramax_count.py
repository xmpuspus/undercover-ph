import json, subprocess, sys
out = sys.argv[1]
url = "https://api.panoramax.xyz/api/collections?bbox=121.012,14.548,121.032,14.562&limit=100"
cols, seen = [], set()
while url and url not in seen:
    seen.add(url)
    r = subprocess.run(["curl","-s","-m","90",url],capture_output=True,text=True)
    j = json.loads(r.stdout)
    cols += j["collections"]
    url = next((l["href"] for l in j.get("links",[]) if l.get("rel")=="next"), None)
rows = []
for c in cols:
    iv = c["extent"]["temporal"]["interval"][0]
    rows.append(dict(id=c["id"], title=c.get("title"), bbox=c["extent"]["spatial"]["bbox"][0], start=iv[0], end=iv[1], items=c.get("stats:items",{}).get("count"), license=c.get("license")))
json.dump(rows, open(out,"w"), indent=1)
print(len(rows), "collections; items sum", sum(x["items"] or 0 for x in rows))
for x in sorted(rows,key=lambda x:x["start"] or "")[:3]+sorted(rows,key=lambda x:x["start"] or "")[-3:]: print(x["start"][:10], x["items"], x["title"])
