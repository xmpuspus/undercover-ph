# Contributing to undercover.ph

This repo welcomes four kinds of help, in this order of value.

1. **Covered walkway and access corrections.** If a route sends you through a closed gate, a passage that does not exist, or a walkway that is not covered, open an issue with the place, the time, and a photo if you have one. The best fix goes into OpenStreetMap itself, so every map gains. Tag covered walkways with `covered=yes`, elevated walkways with `bridge=yes` and `layer=1`, and underpasses with `tunnel=yes` and `layer=-1`.
2. **Field checks of the shade model.** Stand at a point the app calls shaded or sunny at a known half hour and take a photo straight up and one along the street. Open an issue with the photos, the place, the date, and the time.
3. **Opening hours** for mall and building passages, with a public source.
4. **Code fixes** in `app/` (router and interface) or `pipeline/` (data build).

## Set up

```bash
git clone https://github.com/xmpuspus/undercover-ph
cd undercover-ph/app
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # router unit tests
pnpm build        # type check and production build
pnpm e2e          # one browser flow, Ayala MRT Station to Greenbelt
```

The data build needs Python 3.12 or later. See `pipeline/NOTES.md` and `pipeline/shade/NOTES.md`.

```bash
python3 -m venv pipeline/shade/.venv
pipeline/shade/.venv/bin/pip install -r pipeline/shade/requirements.txt
pipeline/shade/.venv/bin/python -m pytest pipeline/shade/test_shade.py -q
```

## Rules for changes

- Every number in the README, the docs, or the app comes from the pipeline output. Do not type a figure by hand.
- Keep the router's access rules strict. A path enters routes only when the data shows the public can use it.
- Do not add analytics, trackers, or anything that stores a user's start or end point.
- Plain writing: short sentences, no em-dashes.

## Corrections and security

Open an issue for data corrections. For a security problem, use GitHub's private vulnerability reporting on this repo instead of a public issue.
