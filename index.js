const RACE_LABELS = {
  '1-M': 'Men Solo',          '1-W': 'Women Solo',
  '2-M': 'Men Heavy Solo',    '2-W': 'Women Heavy Solo',
  '3-M': 'Men Buddies',       '3-W': 'Women Buddies',
  '3-X': 'Mixed Buddies',     '4-M': 'Men Heavy Buddies',
  '4-W': 'Women Heavy Buddies','4-X': 'Mixed Heavy Buddies',
};

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const o = 0x1F1E6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o, code.toUpperCase().charCodeAt(1) + o);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(fin) {
  if (!fin || fin === 'Finish') return '<span class="td-finish">✓</span>';
  if (fin === 'DNF') return '<span class="td-dnf">DNF</span>';
  if (fin === 'DSQ') return '<span class="td-dsq">DSQ</span>';
  return '';
}

// ── Load and render race cards ────────────────────────────────────────────────
fetch('/api/races')
  .then(r => r.json())
  .then(races => {
    const container = document.getElementById('race-cards');
    container.innerHTML = races.map(race => `
      <a class="race-card" href="/race/${race.id}">
        <div class="race-card-location">${esc(race.location)}</div>
        <div class="race-card-name">${esc(race.name)}</div>
        <div class="race-card-subtitle">${esc(race.subtitle)}</div>
        <div class="race-card-count">${race.count.toLocaleString()} participants</div>
        <div class="race-card-arrow">View results →</div>
      </a>
    `).join('');
  })
  .catch(() => {
    document.getElementById('race-cards').innerHTML = '<p style="color:var(--gray-400)">Failed to load races.</p>';
  });

// ── Global search ─────────────────────────────────────────────────────────────
let searchTimeout;
const input = document.getElementById('global-search');
const resultsBox = document.getElementById('global-results');

input.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = input.value.trim();
  if (q.length < 2) { resultsBox.style.display = 'none'; return; }
  searchTimeout = setTimeout(() => doSearch(q), 200);
});

input.addEventListener('keydown', e => {
  if (e.key === 'Escape') { resultsBox.style.display = 'none'; input.value = ''; }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.global-search-wrap')) resultsBox.style.display = 'none';
});

function doSearch(q) {
  fetch(`/api/search?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(rows => renderSearchResults(rows, q));
}

function renderSearchResults(rows, q) {
  if (!rows.length) {
    resultsBox.innerHTML = '<div class="gs-empty">No results found.</div>';
    resultsBox.style.display = '';
    return;
  }

  // Group by race
  const byRace = {};
  for (const r of rows) {
    if (!byRace[r.race_id]) byRace[r.race_id] = { name: r.race_name, subtitle: r.race_subtitle, rows: [] };
    byRace[r.race_id].rows.push(r);
  }

  let html = '';
  for (const [raceId, group] of Object.entries(byRace)) {
    html += `<div class="gs-race-header">${esc(group.name)} <span>${esc(group.subtitle)}</span></div>`;
    html += group.rows.map(r => `
      <a class="gs-row" href="/participant?bib=${encodeURIComponent(r.bib)}&race=${raceId}">
        <span class="gs-flag">${countryFlag(r.country)}</span>
        <span class="gs-name">${highlight(esc(r.name), q)}</span>
        <span class="gs-cat">${RACE_LABELS[r.race] || r.race}</span>
        <span class="gs-pos">#${esc(r.pos)}</span>
        <span class="gs-time">${r.time || '—'}</span>
        <span>${statusBadge(r.fin)}</span>
      </a>
    `).join('');
  }

  const total = rows.length;
  if (total === 100) html += `<div class="gs-more">Showing first 100 results — refine your search</div>`;

  resultsBox.innerHTML = html;
  resultsBox.style.display = '';
}

function highlight(text, q) {
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
}
