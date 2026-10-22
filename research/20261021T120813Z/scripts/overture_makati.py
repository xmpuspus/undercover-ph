import duckdb, json, sys
R = "research/20261021T120813Z/raw/02/"
rel = sys.argv[1]
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
src = f"s3://overturemaps-us-west-2/release/{rel}/theme=buildings/type=building/*"
boxes = {"makati": (14.548, 121.012, 14.562, 121.032), "bgc": (14.545, 121.040, 14.560, 121.058),
         "ortigas": (14.578, 121.053, 14.592, 121.067), "upd": (14.647, 121.055, 14.664, 121.075)}
out = {"release": rel}
for k, (s, w, n, e) in boxes.items():
    where = f"bbox.xmin>={w} AND bbox.xmax<={e} AND bbox.ymin>={s} AND bbox.ymax<={n}"
    q = f"""SELECT count(*) n, count(height) h, count(num_floors) f,
      count(CASE WHEN height IS NOT NULL OR num_floors IS NOT NULL THEN 1 END) either,
      max(height) hmax, median(height) hmed FROM read_parquet('{src}', hive_partitioning=1) WHERE {where}"""
    r = con.execute(q).fetchall()[0]
    q2 = f"""SELECT sources[1].dataset ds, count(*) n, count(height) h FROM read_parquet('{src}', hive_partitioning=1) WHERE {where} GROUP BY 1 ORDER BY 2 DESC"""
    out[k] = {"n": r[0], "height": r[1], "num_floors": r[2], "either": r[3], "hmax": r[4], "hmed": r[5],
              "by_source": con.execute(q2).fetchall()}
    print(k, out[k], flush=True)
    if k == "makati":
        con.execute(f"""COPY (SELECT id, height, num_floors, class, subtype, names.primary AS name, sources[1].dataset AS ds,
          sources[1].update_time AS ut, ST_AsText(geometry) wkt FROM read_parquet('{src}', hive_partitioning=1) WHERE {where})
          TO '{R}overture_makati_{rel}.csv' (HEADER)""")
json.dump(out, open(R + f"overture_stats_{rel}.json", "w"), indent=1, default=str)
