# Check the shade model on the street with a field sheet

The shade model has never been checked on the street. Imagery decides only 1 of 16 covered-walkway checks. A field
check gives the first measured agreement between the model and what a walker sees. The kit is
`pipeline/tools/field_kit.py`, and it uses only the Python standard library.

## Make a sheet for the walk day

1. Pick an area and a neighbourhood that one person can walk, for example `metro-core` and `makati-cbd`.
   The neighbourhood ids are in `app/public/data/areas.json`.
2. Pick the walk date. It must be one of the area's 7 shade dates in `app/public/data/areas/<id>/manifest.json`.
3. Make the sheet:

   ```sh
   python3 -I pipeline/tools/field_kit.py make metro-core 2026-10-24 --hood makati-cbd --n 30 --covered 10
   ```

   This writes `field/metro-core-makati-cbd-2026-10-24.csv` and a `.geojson` with the same points.
   The points are at least 120 m apart. They spread across the model's noon shade, so sunny and shaded
   walkways both get checked. Covered walkways are a separate set.
4. Open the `.geojson` in a phone map app, for example Organic Maps or Google My Maps, to find each point.

## Record what you see

- Visit each point at 08:00, 12:00 and 16:00, within 15 minutes of the hour.
- Stand on the side of the street that the `side` column names. `centre` means a footway with no side.
- In `obs_0800`, `obs_1200` and `obs_1600`, write `sun`, `shade` or `partial`. Partial means part of the walkway width is in shadow.
- In `obs_covered`, write `yes` when a roof, awning or deck covers the walkway, else `no`.
- Leave a cell blank when you did not see it. Cloud cover that hides all shadows counts as not seen.
- Take one photo per point and visit, facing along the walkway. Put the file name in `photo`.

## Score the sheet

```sh
python3 -I pipeline/tools/field_kit.py score field/metro-core-makati-cbd-2026-10-24.csv
```

The model says shade at 60% or more of the edge in shadow, sun at 40% or less, and partial between.
The score gives, per time slot, the points seen, the exact agreements, the near misses (partial on one side),
the confusion counts and the ids of the misses. For covered walkways it gives precision and recall.
It writes the same numbers to `<sheet>.score.json`.

Commit the filled sheet, the score and the photos under `docs/field-checks/<area>-<date>/`.
Blank sheets in `field/` stay out of git.
