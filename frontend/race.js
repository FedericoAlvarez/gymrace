// ── State ────────────────────────────────────────────────────────────────────
const raceId = location.pathname.split('/race/')[1];
if (!raceId) { location.href = '/'; throw new Error(); }

let allRows = [];
let filteredRows = [];
let comparedBibs = new Set();
let sortCol = 'pos';
let sortDir = 1;

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

function timeToSeconds(t) {
  if (!t || t === '-' || t === '') return Infinity;
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1];
}

function medal(pos) {
  if (pos === '1') return '🥇 ';
  if (pos === '2') return '🥈 ';
  if (pos === '3') return '🥉 ';
  return '';
}

function statusBadge(fin) {
  if (!fin || fin === 'Finish') return '<span class="td-finish">✓ Finish</span>';
  if (fin === 'DNF') return '<span class="td-dnf">DNF</span>';
  if (fin === 'DSQ') return '<span class="td-dsq">DSQ</span>';
  return `<span>${fin}</span>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load race info + results ──────────────────────────────────────────────────
Promise.all([
  fetch('/api/races').then(r => r.json()),
  fetch(`/api/results/${raceId}`).then(r => { if (!r.ok) throw new Error('Race not found'); return r.json(); }),
]).then(([races, data]) => {
  const raceInfo = races.find(r => r.id === raceId);
  if (raceInfo) {
    document.getElementById('race-title-accent').textContent = raceInfo.location;
    document.getElementById('race-subtitle').textContent = raceInfo.subtitle;
    document.title = `${raceInfo.name} ${raceInfo.subtitle} — Results`;
  }
  allRows = data;
  applyFilters();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('results-table').style.display = '';
}).catch(err => {
  document.getElementById('loading').textContent = 'Failed to load: ' + err.message;
});

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() {
  const q      = document.getElementById('search').value.trim().toLowerCase();
  const race   = document.getElementById('filter-race').value;
  const status = document.getElementById('filter-status').value;

  filteredRows = allRows.filter(r => {
    if (q && !r.name.toLowerCase().includes(q)) return false;
    if (race && r.race !== race) return false;
    if (status) {
      const fin = r.fin || 'Finish';
      if (fin !== status) return false;
    }
    return true;
  });

  sortRows();
  renderTable();
  document.getElementById('result-count').textContent =
    filteredRows.length === allRows.length
      ? `${allRows.length} participants`
      : `${filteredRows.length} of ${allRows.length}`;
}

function sortRows() {
  const timeCols = new Set(['spl1', 'spl3', 'time']);
  const numCols  = new Set(['pos', 'pos_cat']);
  filteredRows.sort((a, b) => {
    const av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
    if (timeCols.has(sortCol)) return (timeToSeconds(av) - timeToSeconds(bv)) * sortDir;
    if (numCols.has(sortCol)) return ((parseInt(av) || Infinity) - (parseInt(bv) || Infinity)) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });
}

// ── Render table ──────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  const table = document.getElementById('results-table');

  if (!filteredRows.length) {
    tbody.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = '';
    return;
  }
  table.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = filteredRows.map(r => {
    const slotIdx  = compareSlots.indexOf(r.bib);
    const selected = slotIdx !== -1;
    const bothFull = compareSlots[0] && compareSlots[1];
    const disabled = !selected && bothFull;
    const split1   = r.spl1 && r.spl1 !== '-' ? r.spl1 : '—';
    const split2   = r.spl3 && r.spl3 !== '-' ? r.spl3 : '—';
    const slotLabel = selected ? `${slotIdx + 1} ✓` : '+ Compare';

    return `<tr class="${selected ? 'compared' : ''}" data-bib="${esc(r.bib)}">
      <td class="td-pos td-pos-bold">${medal(r.pos)}${r.pos || '—'}</td>
      <td class="td-pos">${r.pos_cat || '—'}</td>
      <td class="td-name"><a class="name-link" href="/participant?bib=${encodeURIComponent(r.bib)}&race=${raceId}">${esc(r.name)}</a></td>
      <td><span class="flag">${countryFlag(r.country)}</span></td>
      <td class="td-race">${RACE_LABELS[r.race] || r.race}</td>
      <td class="td-split">${split1}</td>
      <td class="td-split">${split2}</td>
      <td class="td-time">${r.time || '—'}</td>
      <td>${statusBadge(r.fin)}</td>
      <td><button class="btn-compare ${selected ? 'active' : ''}" data-bib="${esc(r.bib)}" ${disabled ? 'disabled' : ''}>${slotLabel}</button></td>
    </tr>`;
  }).join('');
}

// ── Compare (max 2) ───────────────────────────────────────────────────────────
// comparedBibs is a Set but we treat it as ordered pair — use array for slots
let compareSlots = [null, null]; // [bib, bib]

document.getElementById('tbody').addEventListener('click', e => {
  const btn = e.target.closest('.btn-compare');
  if (!btn) return;
  const bib = btn.dataset.bib;

  const slotIdx = compareSlots.indexOf(bib);
  if (slotIdx !== -1) {
    // Already selected — deselect
    compareSlots[slotIdx] = null;
  } else {
    // Find first empty slot
    const empty = compareSlots.indexOf(null);
    if (empty === -1) return; // both slots full, ignore
    compareSlots[empty] = bib;
  }

  renderTable();
  updateCompareBar();
});

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const filled = compareSlots.filter(Boolean);

  if (!filled.length) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');

  for (let i = 0; i < 2; i++) {
    const slot = document.getElementById(`cbar-slot-${i}`);
    const bib  = compareSlots[i];
    if (bib) {
      const p = allRows.find(r => r.bib === bib);
      slot.innerHTML = `
        <span class="cbar-flag">${countryFlag(p?.country || '')}</span>
        <span class="cbar-name">${esc(p?.name || bib)}</span>
        <button class="cbar-remove" data-bib="${esc(bib)}">✕</button>`;
      slot.classList.add('filled');
    } else {
      slot.innerHTML = `<span class="cbar-label">Select a participant</span>`;
      slot.classList.remove('filled');
    }
  }

  const canCompare = compareSlots[0] && compareSlots[1];
  const goBtn = document.getElementById('btn-go-compare');
  if (canCompare) {
    goBtn.href = `/compare?bib1=${encodeURIComponent(compareSlots[0])}&race1=${raceId}&bib2=${encodeURIComponent(compareSlots[1])}&race2=${raceId}`;
    goBtn.classList.add('ready');
  } else {
    goBtn.removeAttribute('href');
    goBtn.classList.remove('ready');
  }
}

// Remove from slot on ✕ click
document.getElementById('compare-bar').addEventListener('click', e => {
  const btn = e.target.closest('.cbar-remove');
  if (!btn) return;
  const bib = btn.dataset.bib;
  const idx = compareSlots.indexOf(bib);
  if (idx !== -1) compareSlots[idx] = null;
  renderTable();
  updateCompareBar();
});

document.getElementById('btn-clear-compare').addEventListener('click', () => {
  compareSlots = [null, null];
  renderTable();
  updateCompareBar();
});

document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('filter-race').addEventListener('change', applyFilters);
document.getElementById('filter-status').addEventListener('change', applyFilters);

document.querySelector('thead').addEventListener('click', e => {
  const th = e.target.closest('th[data-col]');
  if (!th) return;
  const col = th.dataset.col;
  sortDir = sortCol === col ? sortDir * -1 : 1;
  sortCol = col;
  document.querySelectorAll('thead th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
  th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
  sortRows(); renderTable();
});
