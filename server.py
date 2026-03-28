#!/usr/bin/env python3.9
"""
GymRace results server.
Run: python3.9 server.py
Then open: http://localhost:5001
"""
import sqlite3, os
from flask import Flask, jsonify, send_from_directory, abort, request

app = Flask(__name__, static_folder='.')
DB = os.path.join(os.path.dirname(__file__), 'gymrace.db')

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

# ── Static pages ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/race/<race_id>')
def race(race_id):
    return send_from_directory('.', 'race.html')

@app.route('/compare')
def compare():
    return send_from_directory('.', 'compare.html')

@app.route('/participant')
def participant():
    return send_from_directory('.', 'participant.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

# ── API ───────────────────────────────────────────────────────────────────────

@app.route('/api/races')
def races():
    conn = get_db()
    rows = conn.execute('SELECT id, name, subtitle, location FROM races').fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        conn2 = get_db()
        d['count'] = conn2.execute(
            'SELECT COUNT(*) FROM participants WHERE race_id=?', (d['id'],)
        ).fetchone()[0]
        conn2.close()
        result.append(d)
    return jsonify(result)

@app.route('/api/results/<race_id>')
def results(race_id):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM participants WHERE race_id=? ORDER BY CAST(pos AS INTEGER)',
        (race_id,)
    ).fetchall()
    conn.close()
    if not rows:
        abort(404)
    return jsonify([dict(r) for r in rows])

@app.route('/api/detail/<race_id>/<path:bib>')
def detail(race_id, bib):
    conn = get_db()
    rows = conn.execute(
        'SELECT * FROM details WHERE race_id=? AND id=? ORDER BY order_num',
        (race_id, bib)
    ).fetchall()
    conn.close()
    if not rows:
        abort(404)
    return jsonify([dict(r) for r in rows])

@app.route('/api/search')
def search():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify([])
    conn = get_db()
    rows = conn.execute(
        '''SELECT p.*, r.name AS race_name, r.subtitle AS race_subtitle
           FROM participants p
           JOIN races r ON p.race_id = r.id
           WHERE p.name LIKE ?
           ORDER BY p.race_id, CAST(p.pos AS INTEGER)
           LIMIT 100''',
        (f'%{q}%',)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

if __name__ == '__main__':
    if not os.path.exists(DB):
        print('ERROR: gymrace.db not found. Run import_data.py first.')
        raise SystemExit(1)
    print('Starting server at http://localhost:5001')
    app.run(port=5001, debug=False)
