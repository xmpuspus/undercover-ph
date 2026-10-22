import json
import sys

raw = sys.argv[1]
out = sys.argv[2]
s = open(raw, encoding="utf-8", errors="replace").read()
i = s.find('[{"sitename"')
arr, end = json.JSONDecoder().raw_decode(s[i:])
with open(out, "w") as fh:
    json.dump(arr, fh)
print(len(arr), "stations")
ts = [d["observed_at"] for a in arr for d in a["data"]]
print("obs range", min(ts), max(ts), "records", len(ts))
print("keys", list(arr[0].keys()), list(arr[0]["data"][0].keys()))
ncr = [a for a in arr if 14.35 <= float(a["lat"]) <= 14.80 and 120.90 <= float(a["lng"]) <= 121.20]
print("in Metro Manila box", len(ncr))
for a in ncr:
    d = a["data"][-1] if a["data"] else None
    print(a["sitename"], a["lat"], a["lng"], len(a["data"]), d)
nulls = sum(1 for a in arr for d in a["data"] if d.get("heat_index") is None or d.get("temperature") in (None, ""))
print("records with null heat_index or temperature", nulls)
print("trailing:", s[i + end : i + end + 250].replace("\n", " "))
