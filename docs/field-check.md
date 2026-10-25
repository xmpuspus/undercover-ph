# Check the shade model on the street with a field sheet

Nobody checked the shade model on the street yet. In an accuracy review on 2026-10-23, aerial images
settled only 1 of 16 covered-walkway checks, because the roof hides the walkway.
A field check gives the first measured agreement between the model and what a walker sees. The kit is
`pipeline/tools/field_kit.py`, and it uses only the Python standard library.

## Make a sheet for the walk day

1. Pick an area and a neighbourhood that one person can walk, for example `metro-core` and `makati-cbd`.
   The neighbourhood ids are in `app/public/data/areas.json`.
2. Pick the walk date. It must be one of the area's 7 shade dates in `app/public/data/areas/<id>/manifest.json`.
3. Make the sheet with this command.

   ```sh
   python3 -I pipeline/tools/field_kit.py make metro-core 2026-10-24 --hood makati-cbd --n 30 --covered 10
   ```

   This writes `field/metro-core-makati-cbd-2026-10-24.csv` and a `.geojson` with the same points.
   The kit picks points at least 120 m apart. It spreads them across the model's noon shade values, so the
   check covers both sunny and shaded walkways. The covered walkways are a separate set.
4. Open the `.geojson` in a phone map app, for example Organic Maps or Google My Maps, to find each point.

## Record what you see

- Visit each point at 08:00, 12:00 and 16:00, within 15 minutes of the hour.
- Stand on the side of the street that the `side` column names. `centre` means a footway with no side.
- In `obs_0800`, `obs_1200` and `obs_1600`, write `sun`, `shade` or `partial`. Partial means part of the walkway width is in shadow.
- If a roof, awning or deck covers the walkway, write `yes` in `obs_covered`. If not, write `no`.
- If you did not see the walkway at that time, leave the cell blank. Cloud cover that hides all shadows counts as not seen.
- On each visit to a point, take one photo along the walkway. Put the file name in `photo`.

## Score the sheet

```sh
python3 -I pipeline/tools/field_kit.py score field/metro-core-makati-cbd-2026-10-24.csv
```

The model counts an edge as shade at 60% or more in shadow, sun at 40% or less, and partial between those values.
For each time slot, the score gives the points seen, the exact agreements, the near misses (partial on one side),
a count for each pair of model value and seen value, and the ids of the misses. For covered walkways it gives
precision (the share of model-covered points that the walker saw covered) and recall (of the points that the walker
saw covered, the share that the model marks covered).
It writes the same numbers to `<sheet>.score.json`.

Commit the filled sheet, the score and the photos under `docs/field-checks/<area>-<date>/`.
Git ignores the blank sheets in `field/`.
