const RACE_LABELS = {
  '1-M': 'Men Solo',          '1-W': 'Women Solo',
  '2-M': 'Men Heavy Solo',    '2-W': 'Women Heavy Solo',
  '3-M': 'Men Buddies',       '3-W': 'Women Buddies',
  '3-X': 'Mixed Buddies',     '4-M': 'Men Heavy Buddies',
  '4-W': 'Women Heavy Buddies','4-X': 'Mixed Heavy Buddies',
};

// ── Compare state: each slot holds { bib, raceId } ───────────────────────────
let compareSlots = [null, null];

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const o = 0x1F1E6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o, code.toUpperCase().charCodeAt(1) + o);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(fin) {
  if (!fin || fin === 'Finish') return '<span class="td-finish">✓ Finish</span>';
  if (fin === 'DNF') return '<span class="td-dnf">DNF</span>';
  if (fin === 'DSQ') return '<span class="td-dsq">DSQ</span>';
  return '';
}

function highlight(text, q) {
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
}

function slotKey(bib, raceId) { return `${raceId}::${bib}`; }
function inSlot(bib, raceId) { return compareSlots.some(s => s && s.bib === bib && s.raceId === raceId); }
function slotIndex(bib, raceId) { return compareSlots.findIndex(s => s && s.bib === bib && s.raceId === raceId); }

// ── Race cards ────────────────────────────────────────────────────────────────
fetch('/api/races')
  .then(r => r.json())
  .then(races => {
    document.getElementById('race-cards').innerHTML = races.map(race => `
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
let lastQuery = '';
const input      = document.getElementById('global-search');
const clearBtn   = document.getElementById('search-clear');
const cards      = document.getElementById('race-cards');
const resultsBox = document.getElementById('search-results');

input.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = input.value.trim();
  clearBtn.style.display = q ? '' : 'none';
  if (q.length < 2) { showCards(); return; }
  lastQuery = q;
  resultsBox.innerHTML = '<div class="sr-loading">Searching…</div>';
  showResults();
  searchTimeout = setTimeout(() => doSearch(q), 200);
});

input.addEventListener('keydown', e => { if (e.key === 'Escape') clearSearch(); });
clearBtn.addEventListener('click', clearSearch);

function clearSearch() {
  input.value = '';
  clearBtn.style.display = 'none';
  lastQuery = '';
  showCards();
}

function showCards()   { cards.style.display = ''; resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; }
function showResults() { cards.style.display = 'none'; resultsBox.style.display = ''; }

function doSearch(q) {
  fetch(`/api/search?q=${encodeURIComponent(q)}`)
    .then(r => r.json())
    .then(rows => renderSearchResults(rows, q));
}

// ── Render search results ─────────────────────────────────────────────────────
function renderSearchResults(rows, q) {
  if (!rows.length) {
    resultsBox.innerHTML = `<div class="sr-empty">No participants found for "<strong>${esc(q)}</strong>"</div>`;
    return;
  }

  const byRace = {};
  for (const r of rows) {
    if (!byRace[r.race_id]) byRace[r.race_id] = { name: r.race_name, subtitle: r.race_subtitle, rows: [] };
    byRace[r.race_id].rows.push(r);
  }

  let html = `<div class="sr-meta">${rows.length === 100 ? 'Top 100' : rows.length} result${rows.length !== 1 ? 's' : ''} for "<strong>${esc(q)}</strong>"</div>`;

  for (const [raceId, group] of Object.entries(byRace)) {
    html += `
      <div class="sr-group">
        <div class="sr-group-header">
          <span class="sr-group-name">${esc(group.name)}</span>
          <span class="sr-group-sub">${esc(group.subtitle)}</span>
          <a class="sr-group-link" href="/race/${raceId}">View all →</a>
        </div>
        <table class="sr-table" data-race="${esc(raceId)}">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Name</th>
              <th>Country</th>
              <th>Category</th>
              <th>Workouts</th>
              <th>Running</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${group.rows.map(r => buildRow(r, raceId, q)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  resultsBox.innerHTML = html;
}

function buildRow(r, raceId, q) {
  const selected  = inSlot(r.bib, raceId);
  const idx       = slotIndex(r.bib, raceId);
  const bothFull  = compareSlots[0] && compareSlots[1];
  const disabled  = !selected && bothFull;
  const btnLabel  = selected ? `${idx + 1} ✓` : '+ Compare';

  return `<tr class="${selected ? 'compared' : ''}" data-bib="${esc(r.bib)}" data-race="${esc(raceId)}">
    <td class="td-pos td-pos-bold">${esc(r.pos) || '—'}</td>
    <td class="td-name">
      <a class="name-link" href="/participant?bib=${encodeURIComponent(r.bib)}&race=${raceId}">
        ${highlight(esc(r.name), q)}
      </a>
    </td>
    <td><span class="flag">${countryFlag(r.country)}</span></td>
    <td class="td-race">${RACE_LABELS[r.race] || r.race}</td>
    <td class="td-split">${r.spl1 && r.spl1 !== '-' ? r.spl1 : '—'}</td>
    <td class="td-split">${r.spl3 && r.spl3 !== '-' ? r.spl3 : '—'}</td>
    <td class="td-time">${r.time || '—'}</td>
    <td>${statusBadge(r.fin)}</td>
    <td><button class="btn-compare ${selected ? 'active' : ''}" data-bib="${esc(r.bib)}" data-race="${esc(raceId)}" ${disabled ? 'disabled' : ''}>${btnLabel}</button></td>
  </tr>`;
}

// ── Compare button clicks (delegated on results box) ─────────────────────────
resultsBox.addEventListener('click', e => {
  const btn = e.target.closest('.btn-compare');
  if (!btn) return;
  const { bib, race: raceId } = btn.dataset;

  const idx = slotIndex(bib, raceId);
  if (idx !== -1) {
    compareSlots[idx] = null;
  } else {
    const empty = compareSlots.indexOf(null);
    if (empty === -1) return;
    compareSlots[empty] = { bib, raceId };
  }

  // Re-render the results with updated compare state
  if (lastQuery.length >= 2) doSearch(lastQuery);
  updateCompareBar();
});

// ── Compare bar ───────────────────────────────────────────────────────────────
function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const filled = compareSlots.filter(Boolean);
  if (!filled.length) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');

  for (let i = 0; i < 2; i++) {
    const slot = document.getElementById(`cbar-slot-${i}`);
    const s = compareSlots[i];
    if (s) {
      slot.innerHTML = `
        <span class="cbar-flag">${''}</span>
        <span class="cbar-name">${esc(s.bib)}</span>
        <button class="cbar-remove" data-slot="${i}">✕</button>`;
      slot.classList.add('filled');
      // Resolve name async
      fetch(`/api/results/${s.raceId}`)
        .then(r => r.json())
        .then(all => {
          const p = all.find(r => r.bib === s.bib);
          if (!p) return;
          slot.innerHTML = `
            <span class="cbar-flag">${countryFlag(p.country)}</span>
            <span class="cbar-name">${esc(p.name)}</span>
            <button class="cbar-remove" data-slot="${i}">✕</button>`;
        });
    } else {
      slot.innerHTML = `<span class="cbar-label">Select a participant</span>`;
      slot.classList.remove('filled');
    }
  }

  const canCompare = compareSlots[0] && compareSlots[1];
  const goBtn = document.getElementById('btn-go-compare');
  if (canCompare) {
    const { bib: b1, raceId: r1 } = compareSlots[0];
    const { bib: b2, raceId: r2 } = compareSlots[1];
    goBtn.href = `/compare?bib1=${encodeURIComponent(b1)}&race1=${r1}&bib2=${encodeURIComponent(b2)}&race2=${r2}`;
    goBtn.classList.add('ready');
  } else {
    goBtn.removeAttribute('href');
    goBtn.classList.remove('ready');
  }
}

document.getElementById('compare-bar').addEventListener('click', e => {
  const btn = e.target.closest('.cbar-remove');
  if (!btn) return;
  compareSlots[parseInt(btn.dataset.slot)] = null;
  if (lastQuery.length >= 2) doSearch(lastQuery);
  updateCompareBar();
});

document.getElementById('btn-clear-compare').addEventListener('click', () => {
  compareSlots = [null, null];
  if (lastQuery.length >= 2) doSearch(lastQuery);
  updateCompareBar();
});
