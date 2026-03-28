#!/usr/bin/env python3.9
"""
Import GymRace results into SQLite.
Run once (or re-run to refresh): python3.9 import_data.py
"""
import csv
import sqlite3
import urllib.request
import os

DB = 'gymrace.db'

RACES = [
    {
        'id':         'amsterdam-2026',
        'name':       'GymRace Amsterdam',
        'subtitle':   'February 2026',
        'location':   'Amsterdam',
        'data_url':   'https://live.ultimate.dk/uploads/results/2026/02_gymrace_amsterdam/data.csv',
        'detail_url': 'https://live.ultimate.dk/uploads/results/2026/02_gymrace_amsterdam/data2.csv',
        'data_file':  'amsterdam-data.csv',
        'detail_file':'amsterdam-data2.csv',
    },
    {
        'id':         'utrecht-2025',
        'name':       'GymRace Utrecht',
        'subtitle':   'October 2025',
        'location':   'Utrecht',
        'data_url':   'https://live.ultimate.dk/uploads/2025/fitness/gymrace_october/overall/data.csv',
        'detail_url': 'https://live.ultimate.dk/uploads/2025/fitness/gymrace_october/overall/data2.csv',
        'data_file':  'utrecht-data.csv',
        'detail_file':'utrecht-data2.csv',
    },
]

def download(url, dest):
    if os.path.exists(dest):
        print(f'  {dest} already exists, skipping download')
        return
    print(f'  Downloading {url} …')
    urllib.request.urlretrieve(url, dest)

def main():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    c.executescript('''
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
    ''')

    for race in RACES:
        rid = race['id']
        print(f'\n=== {race["name"]} ({race["subtitle"]}) ===')

        # Register race
        c.execute('INSERT INTO races VALUES (?,?,?,?)',
                  (rid, race['name'], race['subtitle'], race['location']))

        # Download if needed
        download(race['data_url'],   race['data_file'])
        download(race['detail_url'], race['detail_file'])

        # Import participants
        print(f'  Importing participants…')
        with open(race['data_file'], encoding='utf-8') as f:
            rows = [
                (rid, r['Bib'], r['Select'], r['Pos'], r['PosCat'], r['Name'],
                 r['Country'], r['Cat'], r['Spl1'], r['Spl3'], r['Fin'], r['Time'])
                for r in csv.DictReader(f, delimiter=';')
            ]
        c.executemany('INSERT OR REPLACE INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', rows)
        print(f'  {len(rows)} participants')

        # Import details
        print(f'  Importing details…')
        imported = skipped = 0
        with open(race['detail_file'], encoding='utf-8') as f:
            for r in csv.DictReader(f, delimiter=';'):
                try:
                    c.execute('INSERT INTO details VALUES (?,?,?,?,?,?,?,?,?)',
                              (rid, r['Id'], int(r['Order']), r['Name'], r['Remark'],
                               r['Status'], r['RacePos'], r['GenPos'], r['CatPos']))
                    imported += 1
                except sqlite3.IntegrityError:
                    skipped += 1
        print(f'  {imported} detail rows ({skipped} duplicates skipped)')

    conn.commit()
    conn.close()
    print(f'\nDone → {DB}')

if __name__ == '__main__':
    main()
