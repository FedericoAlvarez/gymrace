# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
make import   # Download CSVs from live.ultimate.dk and populate data/gymrace.db (run once)
make start    # Kill any running instance and start the server at http://localhost:5001
make stop     # Stop the running server
make build    # Compile standalone binary ./gymrace
make clean    # Remove binary and all data files
```

There are no tests.

## Architecture

**Single Go file backend** (`main.go`) with two subcommands:
- `import` — downloads CSVs from the official results site and populates a local SQLite database
- `serve` — starts an HTTP server that serves static frontend files and a JSON API

**SQLite schema** (`data/gymrace.db`):
- `races` — one row per event (id, name, subtitle, location)
- `participants` — one row per participant per race, keyed by `(race_id, bib)`; holds overall position, category, and three time splits (`spl1`, `spl3`, `fin`, `time`)
- `details` — segment-level split data, one row per segment per participant, keyed by `(race_id, id, order_num, name)`; `id` matches `bib` in participants

**API → Frontend mapping:**
| API route | Frontend page |
|---|---|
| `GET /api/races` | `index.js` — home page race cards |
| `GET /api/results/{race_id}` | `race.js` — full results table |
| `GET /api/participant/{race_id}/{bib}` | `participant.js` — overview stats |
| `GET /api/detail/{race_id}/{bib}` | `participant.js` — segment charts |
| `GET /api/search?q=` | `index.js` — global cross-race search |

**Frontend** is plain HTML + vanilla JS (no framework, no build step). Each page is a separate `.html`/`.js` pair. State shared between pages (e.g. compare selections) is passed via `localStorage` and URL query params (`?race_id=&bib=`).

**Adding a new race edition:** add a `RaceConfig` entry to the `races` slice in `main.go`, then re-run `make import`.

**Data files** (`data/*.csv`, `data/*.db`) are not committed — only `data/.gitkeep` is tracked.
