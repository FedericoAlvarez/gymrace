// GymRace — import CSV data and serve results.
// Usage:
//
//	go run . import   — download CSVs and populate gymrace.db
//	go run . serve    — start HTTP server on :5001
package main

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

// ── Race config ───────────────────────────────────────────────────────────────

type RaceConfig struct {
	ID         string
	Name       string
	Subtitle   string
	Location   string
	DataURL    string
	DetailURL  string
	DataFile   string
	DetailFile string
}

var races = []RaceConfig{
	{
		ID:         "amsterdam-2026",
		Name:       "GymRace Amsterdam",
		Subtitle:   "February 2026",
		Location:   "Amsterdam",
		DataURL:    "https://live.ultimate.dk/uploads/results/2026/02_gymrace_amsterdam/data.csv",
		DetailURL:  "https://live.ultimate.dk/uploads/results/2026/02_gymrace_amsterdam/data2.csv",
		DataFile:   "data/amsterdam-data.csv",
		DetailFile: "data/amsterdam-data2.csv",
	},
	{
		ID:         "utrecht-2025",
		Name:       "GymRace Utrecht",
		Subtitle:   "October 2025",
		Location:   "Utrecht",
		DataURL:    "https://live.ultimate.dk/uploads/2025/fitness/gymrace_october/overall/data.csv",
		DetailURL:  "https://live.ultimate.dk/uploads/2025/fitness/gymrace_october/overall/data2.csv",
		DataFile:   "data/utrecht-data.csv",
		DetailFile: "data/utrecht-data2.csv",
	},
}

const dbFile = "data/gymrace.db"

// ── Entry point ───────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: gymrace <import|serve>")
		os.Exit(1)
	}
	switch os.Args[1] {
	case "import":
		runImport()
	case "serve":
		runServe()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

// ── Import ────────────────────────────────────────────────────────────────────

func runImport() {
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	_, err = db.Exec(`
		DROP TABLE IF EXISTS races;
		DROP TABLE IF EXISTS participants;
		DROP TABLE IF EXISTS details;

		CREATE TABLE races (
			id       TEXT PRIMARY KEY,
			name     TEXT,
			subtitle TEXT,
			location TEXT
		);

		CREATE TABLE participants (
			race_id TEXT,
			bib     TEXT,
			race    TEXT,
			pos     TEXT,
			pos_cat TEXT,
			name    TEXT,
			country TEXT,
			cat     TEXT,
			spl1    TEXT,
			spl3    TEXT,
			fin     TEXT,
			time    TEXT,
			PRIMARY KEY (race_id, bib)
		);

		CREATE TABLE details (
			race_id   TEXT,
			id        TEXT,
			order_num INTEGER,
			name      TEXT,
			remark    TEXT,
			status    TEXT,
			race_pos  TEXT,
			gen_pos   TEXT,
			cat_pos   TEXT,
			PRIMARY KEY (race_id, id, order_num, name)
		);

		CREATE INDEX idx_participants_name ON participants(name);
		CREATE INDEX idx_details_id ON details(race_id, id);
	`)
	if err != nil {
		log.Fatalf("create schema: %v", err)
	}

	for _, race := range races {
		fmt.Printf("\n=== %s (%s) ===\n", race.Name, race.Subtitle)

		if _, err := db.Exec("INSERT INTO races VALUES (?,?,?,?)",
			race.ID, race.Name, race.Subtitle, race.Location); err != nil {
			log.Fatalf("insert race: %v", err)
		}

		download(race.DataURL, race.DataFile)
		download(race.DetailURL, race.DetailFile)

		importParticipants(db, race)
		importDetails(db, race)
	}

	fmt.Printf("\nDone → %s\n", dbFile)
}

func download(url, dest string) {
	if _, err := os.Stat(dest); err == nil {
		fmt.Printf("  %s already exists, skipping download\n", dest)
		return
	}
	fmt.Printf("  Downloading %s …\n", url)
	resp, err := http.Get(url) //nolint:noctx
	if err != nil {
		log.Fatalf("download %s: %v", url, err)
	}
	defer resp.Body.Close()
	f, err := os.Create(dest)
	if err != nil {
		log.Fatalf("create %s: %v", dest, err)
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		log.Fatalf("write %s: %v", dest, err)
	}
}

func csvReader(path string) (*csv.Reader, *os.File) {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open %s: %v", path, err)
	}
	r := csv.NewReader(f)
	r.Comma = ';'
	r.LazyQuotes = true
	return r, f
}

func importParticipants(db *sql.DB, race RaceConfig) {
	fmt.Println("  Importing participants…")
	r, f := csvReader(race.DataFile)
	defer f.Close()

	header, err := r.Read()
	if err != nil {
		log.Fatalf("read header: %v", err)
	}
	idx := headerIndex(header)

	tx, _ := db.Begin()
	stmt, _ := tx.Prepare("INSERT OR REPLACE INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
	count := 0
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("read csv: %v", err)
		}
		_, err = stmt.Exec(
			race.ID,
			col(row, idx, "Bib"),
			col(row, idx, "Select"),
			col(row, idx, "Pos"),
			col(row, idx, "PosCat"),
			col(row, idx, "Name"),
			col(row, idx, "Country"),
			col(row, idx, "Cat"),
			col(row, idx, "Spl1"),
			col(row, idx, "Spl3"),
			col(row, idx, "Fin"),
			col(row, idx, "Time"),
		)
		if err != nil {
			log.Fatalf("insert participant: %v", err)
		}
		count++
	}
	stmt.Close()
	tx.Commit()
	fmt.Printf("  %d participants\n", count)
}

func importDetails(db *sql.DB, race RaceConfig) {
	fmt.Println("  Importing details…")
	r, f := csvReader(race.DetailFile)
	defer f.Close()

	header, err := r.Read()
	if err != nil {
		log.Fatalf("read header: %v", err)
	}
	idx := headerIndex(header)

	tx, _ := db.Begin()
	stmt, _ := tx.Prepare("INSERT OR IGNORE INTO details VALUES (?,?,?,?,?,?,?,?,?)")
	imported, skipped := 0, 0
	for {
		row, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("read csv: %v", err)
		}
		orderStr := col(row, idx, "Order")
		order, _ := strconv.Atoi(orderStr)
		res, err := stmt.Exec(
			race.ID,
			col(row, idx, "Id"),
			order,
			col(row, idx, "Name"),
			col(row, idx, "Remark"),
			col(row, idx, "Status"),
			col(row, idx, "RacePos"),
			col(row, idx, "GenPos"),
			col(row, idx, "CatPos"),
		)
		if err != nil {
			log.Fatalf("insert detail: %v", err)
		}
		if n, _ := res.RowsAffected(); n == 0 {
			skipped++
		} else {
			imported++
		}
	}
	stmt.Close()
	tx.Commit()
	fmt.Printf("  %d detail rows (%d duplicates skipped)\n", imported, skipped)
}

func headerIndex(header []string) map[string]int {
	m := make(map[string]int, len(header))
	for i, h := range header {
		m[strings.TrimSpace(h)] = i
	}
	return m
}

func col(row []string, idx map[string]int, name string) string {
	i, ok := idx[name]
	if !ok || i >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[i])
}

// ── Serve ─────────────────────────────────────────────────────────────────────

var db *sql.DB

func runServe() {
	if _, err := os.Stat(dbFile); os.IsNotExist(err) {
		log.Fatal("ERROR: gymrace.db not found. Run 'gymrace import' first.")
	}
	var err error
	db, err = sql.Open("sqlite", dbFile)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("getwd: %v", err)
	}
	dir := filepath.Join(cwd, "frontend")

	fs := http.FileServer(http.Dir(dir))

	mux := http.NewServeMux()

	// API routes (registered before catch-all)
	mux.HandleFunc("GET /api/races", apiRaces)
	mux.HandleFunc("GET /api/results/{race_id}", apiResults)
	mux.HandleFunc("GET /api/participant/{race_id}/{bib}", apiParticipant)
	mux.HandleFunc("GET /api/detail/{race_id}/{bib}", apiDetail)
	mux.HandleFunc("GET /api/search", apiSearch)

	// Named HTML page routes
	mux.HandleFunc("GET /race/{race_id}", serveHTML(dir, "race.html"))
	mux.HandleFunc("GET /participant", serveHTML(dir, "participant.html"))
	mux.HandleFunc("GET /compare", serveHTML(dir, "compare.html"))

	// Catch-all: serve index.html for "/" and static files for everything else
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})

	log.Println("Starting server at http://localhost:5001")
	if err := http.ListenAndServe(":5001", mux); err != nil {
		log.Fatal(err)
	}
}

func serveHTML(dir, file string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(dir, file))
	}
}

func jsonResponse(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode: %v", err)
	}
}

func apiRaces(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT r.id, r.name, r.subtitle, r.location, COUNT(p.bib) AS count
		FROM races r
		LEFT JOIN participants p ON p.race_id = r.id
		GROUP BY r.id, r.name, r.subtitle, r.location
	`)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	type Race struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Subtitle string `json:"subtitle"`
		Location string `json:"location"`
		Count    int    `json:"count"`
	}
	var result []Race
	for rows.Next() {
		var race Race
		if err := rows.Scan(&race.ID, &race.Name, &race.Subtitle, &race.Location, &race.Count); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result = append(result, race)
	}
	jsonResponse(w, result)
}

func apiResults(w http.ResponseWriter, r *http.Request) {
	raceID := r.PathValue("race_id")
	rows, err := db.Query(
		`SELECT race_id, bib, race, pos, pos_cat, name, country, cat, spl1, spl3, fin, time
		 FROM participants WHERE race_id=? ORDER BY CAST(pos AS INTEGER)`,
		raceID,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	type Participant struct {
		RaceID string `json:"race_id"`
		Bib    string `json:"bib"`
		Race   string `json:"race"`
		Pos    string `json:"pos"`
		PosCat string `json:"pos_cat"`
		Name   string `json:"name"`
		Country string `json:"country"`
		Cat    string `json:"cat"`
		Spl1   string `json:"spl1"`
		Spl3   string `json:"spl3"`
		Fin    string `json:"fin"`
		Time   string `json:"time"`
	}

	var result []Participant
	for rows.Next() {
		var p Participant
		if err := rows.Scan(&p.RaceID, &p.Bib, &p.Race, &p.Pos, &p.PosCat, &p.Name, &p.Country, &p.Cat, &p.Spl1, &p.Spl3, &p.Fin, &p.Time); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result = append(result, p)
	}
	if result == nil {
		http.NotFound(w, r)
		return
	}
	jsonResponse(w, result)
}

func apiParticipant(w http.ResponseWriter, r *http.Request) {
	raceID := r.PathValue("race_id")
	bib := r.PathValue("bib")

	type Participant struct {
		RaceID  string `json:"race_id"`
		Bib     string `json:"bib"`
		Race    string `json:"race"`
		Pos     string `json:"pos"`
		PosCat  string `json:"pos_cat"`
		Name    string `json:"name"`
		Country string `json:"country"`
		Cat     string `json:"cat"`
		Spl1    string `json:"spl1"`
		Spl3    string `json:"spl3"`
		Fin     string `json:"fin"`
		Time    string `json:"time"`
	}

	var p Participant
	err := db.QueryRow(
		`SELECT race_id, bib, race, pos, pos_cat, name, country, cat, spl1, spl3, fin, time
		 FROM participants WHERE race_id=? AND bib=?`,
		raceID, bib,
	).Scan(&p.RaceID, &p.Bib, &p.Race, &p.Pos, &p.PosCat, &p.Name, &p.Country, &p.Cat, &p.Spl1, &p.Spl3, &p.Fin, &p.Time)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	jsonResponse(w, p)
}

func apiDetail(w http.ResponseWriter, r *http.Request) {
	raceID := r.PathValue("race_id")
	bib := r.PathValue("bib")
	rows, err := db.Query(
		`SELECT race_id, id, order_num, name, remark, status, race_pos, gen_pos, cat_pos
		 FROM details WHERE race_id=? AND id=? ORDER BY order_num`,
		raceID, bib,
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	type Detail struct {
		RaceID   string `json:"race_id"`
		ID       string `json:"id"`
		OrderNum int    `json:"order_num"`
		Name     string `json:"name"`
		Remark   string `json:"remark"`
		Status   string `json:"status"`
		RacePos  string `json:"race_pos"`
		GenPos   string `json:"gen_pos"`
		CatPos   string `json:"cat_pos"`
	}

	var result []Detail
	for rows.Next() {
		var d Detail
		if err := rows.Scan(&d.RaceID, &d.ID, &d.OrderNum, &d.Name, &d.Remark, &d.Status, &d.RacePos, &d.GenPos, &d.CatPos); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result = append(result, d)
	}
	if result == nil {
		http.NotFound(w, r)
		return
	}
	jsonResponse(w, result)
}

func apiSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		jsonResponse(w, []any{})
		return
	}
	rows, err := db.Query(
		`SELECT p.race_id, p.bib, p.race, p.pos, p.pos_cat, p.name, p.country, p.cat,
		        p.spl1, p.spl3, p.fin, p.time,
		        r.name AS race_name, r.subtitle AS race_subtitle
		 FROM participants p
		 JOIN races r ON p.race_id = r.id
		 WHERE p.name LIKE ?
		 ORDER BY p.race_id, CAST(p.pos AS INTEGER)
		 LIMIT 100`,
		"%"+q+"%",
	)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer rows.Close()

	type SearchResult struct {
		RaceID      string `json:"race_id"`
		Bib         string `json:"bib"`
		Race        string `json:"race"`
		Pos         string `json:"pos"`
		PosCat      string `json:"pos_cat"`
		Name        string `json:"name"`
		Country     string `json:"country"`
		Cat         string `json:"cat"`
		Spl1        string `json:"spl1"`
		Spl3        string `json:"spl3"`
		Fin         string `json:"fin"`
		Time        string `json:"time"`
		RaceName    string `json:"race_name"`
		RaceSubtitle string `json:"race_subtitle"`
	}

	var result []SearchResult
	for rows.Next() {
		var s SearchResult
		if err := rows.Scan(&s.RaceID, &s.Bib, &s.Race, &s.Pos, &s.PosCat, &s.Name, &s.Country, &s.Cat,
			&s.Spl1, &s.Spl3, &s.Fin, &s.Time, &s.RaceName, &s.RaceSubtitle); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		result = append(result, s)
	}
	if result == nil {
		result = []SearchResult{}
	}
	jsonResponse(w, result)
}
