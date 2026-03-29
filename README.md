# GymRace Results

A local web app to browse, search, and compare results from GymRace events.

Currently includes:
- **GymRace Amsterdam** — February 2026
- **GymRace Utrecht** — October 2025

## What it does

### Home page
- Shows a card for each race edition
- **Global search** across all races — type any participant name to see results from both events side by side, with match highlighting

### Race results page
- Full results table for a single race, sorted by position
- **Search** by participant name
- **Filter** by category (Men/Women Solo, Heavy Solo, Buddies, Heavy Buddies, Mixed) and status (Finished, DNF, DSQ)
- **Sort** by any column (position, name, splits, total time…)
- Click any **name** to open the participant's detail page

### Participant detail page
- Overview: overall position, gender and category ranking, workout time, running time, total time
- **Tabs**: Total (all segments), Runs, Workouts, Splits (raw data)
- Each tab shows a bar chart with time and ranking per segment

### Comparison page
- Select exactly **2 participants** from any race (same or different editions) using the "+ Compare" buttons
- Click **Compare →** in the bottom bar to open the comparison page
- Side-by-side view with:
  - Position, workout time, running time, total time for each participant
  - Segment-by-segment split comparison with visual bars and time differences

## Setup

### First time only — import the data

```bash
cd /Users/fede/development/claude/gymrace
go run . import
```

This downloads the CSV files from the official results website and imports everything into a local SQLite database (`gymrace.db`).

### Start the server

```bash
cd /Users/fede/development/claude/gymrace
go run . serve
```

Then open **http://localhost:5001** in your browser.

### Stop the server

Press **Ctrl+C** in the terminal where the server is running.

If you've lost track of the terminal:

```bash
lsof -ti:5001 | xargs kill -9
```

### Build a standalone binary (optional)

```bash
go build -o gymrace .
./gymrace import   # populate the database
./gymrace serve    # start the server
```

## Files

```
gymrace/
├── main.go              # Go backend — import + serve subcommands
├── go.mod / go.sum      # Go module
├── frontend/            # HTML, JS, CSS served by the web server
│   ├── index.html / index.js       — home page (race cards + global search)
│   ├── race.html / race.js         — race results page
│   ├── participant.html / participant.js — participant detail page
│   ├── compare.html / compare.js   — side-by-side comparison page
│   └── style.css                   — shared styles
└── data/                # race data (generated — not committed)
    ├── gymrace.db               — SQLite database
    ├── amsterdam-data.csv / amsterdam-data2.csv
    └── utrecht-data.csv / utrecht-data2.csv
```
