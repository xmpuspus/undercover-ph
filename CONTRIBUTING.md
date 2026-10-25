# Contributing to undercover.ph

Four kinds of help are welcome, listed from the most useful to the least useful.

1. **Covered walkway and access corrections.** A route can use a closed gate, a missing passage, or a roofless walkway. If that happens, open an issue with the place and the time. If you have a photo, add it. The best fix is an edit in OpenStreetMap, so that every map built on it gets the fix. Tag covered walkways with `covered=yes`, elevated walkways with `bridge=yes` and `layer=1`, and underpasses with `tunnel=yes` and `layer=-1`.
2. **Field checks of the shade model.** Pick a point that the app marks as shaded or sunny. Stand there at one of the half-hour times that the app offers. Take one photo straight up and one along the street. Open an issue with the photos, the place, the date, and the time.
3. **Opening hours** for mall and building passages, with a public source.
4. **Code fixes** in `app/` (router and interface) or `pipeline/` (data build).

## Set up

```bash
git clone --depth 1 https://github.com/xmpuspus/undercover-ph   # --depth 1 skips old copies of the data
cd undercover-ph
python3 pipeline/data_release.py fetch --tiles --app   # map tiles and area graphs, about 180 MB (Python 3.12+)
cd app
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # unit tests: router, search, route card text, sky theme, trip links, advisory
pnpm build          # type check and production build
pnpm e2e            # browser tests on desktop and phone: trip flow, Back, links, Now, phone layout
pnpm demo:record    # re-record the walkthrough MP4, the GIFs and the share images in docs/demo/ from a production build
```

The data build needs Python 3.12 or later. See `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

```bash
python3 -m venv pipeline/shade/.venv
pipeline/shade/.venv/bin/pip install -r pipeline/shade/requirements.txt
pipeline/shade/.venv/bin/python -m pytest pipeline/shade/test_shade.py -q
```

## Rules for changes

- Every number in the README, the docs, or the app comes from the pipeline output. Do not type a figure by hand.
- Keep the router's access rules strict. The router uses a path only when the data shows that the public can use it.
- Do not add analytics, trackers, or anything that stores a user's start or end point.
- Write in plain English, with short sentences and no em-dashes.

## Corrections and security

Open an issue for data corrections. For a security problem, use GitHub's private vulnerability reporting on this repo instead of a public issue.
