const RACE_LABELS = {
  '1-M': 'Men Solo',          '1-W': 'Women Solo',
  '2-M': 'Men Heavy Solo',    '2-W': 'Women Heavy Solo',
  '3-M': 'Men Buddies',       '3-W': 'Women Buddies',
  '3-X': 'Mixed Buddies',     '4-M': 'Men Heavy Buddies',
  '4-W': 'Women Heavy Buddies','4-X': 'Mixed Heavy Buddies',
};

const COLORS = ['#e8380d', '#2563eb']; // red for p1, blue for p2

function countryFlag(code) {
  if (!code || code.length !== 2) return '';
  const o = 0x1F1E6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(code.toUpperCase().charCodeAt(0) + o, code.toUpperCase().charCodeAt(1) + o);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeToSeconds(t) {
  if (!t || t === '-' || t === '') return null;
  const p = t.split(':').map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1];
}

function fmtDiff(secA, secB) {
  // Returns diff string relative to A: negative means A is faster
  if (secA == null || secB == null) return '';
  const diff = secA - secB;
  if (diff === 0) return '=';
  const abs = Math.abs(diff);
  const mm = Math.floor(abs / 60).toString().padStart(2, '0');
  const ss = (abs % 60).toString().padStart(2, '0');
  return (diff < 0 ? '−' : '+') + `${mm}:${ss}`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const bib1   = params.get('bib1');
const bib2   = params.get('bib2');
const raceId = params.get('race');

if (!bib1 || !bib2 || !raceId) {
  document.getElementById('loading').textContent = 'Missing parameters.';
  throw new Error();
}

document.getElementById('back-link').href = `/race/${raceId}`;

Promise.all([
  fetch(`/api/results/${raceId}`).then(r => r.json()),
  fetch(`/api/detail/${raceId}/${encodeURIComponent(bib1)}`).then(r => r.ok ? r.json() : []),
  fetch(`/api/detail/${raceId}/${encodeURIComponent(bib2)}`).then(r => r.ok ? r.json() : []),
  fetch('/api/races').then(r => r.json()),
]).then(([allParticipants, details1, details2, races]) => {
  const p1 = allParticipants.find(r => r.bib === bib1);
  const p2 = allParticipants.find(r => r.bib === bib2);
  if (!p1 || !p2) throw new Error('Participant not found');

  const raceInfo = races.find(r => r.id === raceId);
  if (raceInfo) {
    document.getElementById('race-subtitle').textContent = raceInfo.subtitle;
    document.title = `${p1.name} vs ${p2.name} — GymRace`;
  }

  render(p1, details1, p2, details2);
  document.getElementById('loading').style.display = 'none';
  document.getElementById('page').style.display = '';
}).catch(err => {
  document.getElementById('loading').textContent = 'Error: ' + err.message;
});

// ── Render ────────────────────────────────────────────────────────────────────
function render(p1, d1, p2, d2) {
  renderHero(p1, 0);
  renderHero(p2, 1);
  renderStats(p1, d1, p2, d2);
  renderSegments(p1, d1, p2, d2);
}

function renderHero(p, idx) {
  const el = document.getElementById(`cmp-hero-${idx}`);
  el.innerHTML = `
    <div class="cmp-hero-flag">${countryFlag(p.country)}</div>
    <div class="cmp-hero-name">${esc(p.name)}</div>
    <div class="cmp-hero-meta">
      <span class="td-race">${RACE_LABELS[p.race] || p.race}</span>
    </div>
    <a class="cmp-hero-link" href="/participant?bib=${encodeURIComponent(p.bib)}&race=${raceId}">View full profile →</a>`;
  el.style.borderTopColor = COLORS[idx];
}

function renderStats(p1, d1, p2, d2) {
  const totWorkout1 = d1.find(r => r.order_num === -3);
  const totRun1     = d1.find(r => r.order_num === -4);
  const totWorkout2 = d2.find(r => r.order_num === -3);
  const totRun2     = d2.find(r => r.order_num === -4);

  const stats = [
    { label: 'Position',      v1: p1.pos,                    v2: p2.pos,                    lower_is_better: true },
    { label: 'Workouts time', v1: totWorkout1?.remark || '—', v2: totWorkout2?.remark || '—', lower_is_better: true },
    { label: 'Running time',  v1: totRun1?.remark || '—',    v2: totRun2?.remark || '—',    lower_is_better: true },
    { label: 'Total time',    v1: p1.time || '—',            v2: p2.time || '—',            lower_is_better: true },
  ];

  document.getElementById('cmp-stats').innerHTML = stats.map(s => {
    const sec1 = timeToSeconds(s.v1) ?? parseInt(s.v1);
    const sec2 = timeToSeconds(s.v2) ?? parseInt(s.v2);
    const win1 = s.lower_is_better ? sec1 < sec2 : sec1 > sec2;
    const win2 = s.lower_is_better ? sec2 < sec1 : sec2 > sec1;
    return `
      <div class="cmp-stat">
        <div class="cmp-stat-label">${esc(s.label)}</div>
        <div class="cmp-stat-vals">
          <span class="cmp-val ${win1 ? 'winner' : ''}" style="${win1 ? `color:${COLORS[0]}` : ''}">${esc(s.v1)}</span>
          <span class="cmp-stat-sep">·</span>
          <span class="cmp-val ${win2 ? 'winner' : ''}" style="${win2 ? `color:${COLORS[1]}` : ''}">${esc(s.v2)}</span>
        </div>
      </div>`;
  }).join('');
}

function renderSegments(p1, d1, p2, d2) {
  const segs1 = d1.filter(r => r.order_num >= 1).sort((a,b) => a.order_num - b.order_num);
  const segs2 = d2.filter(r => r.order_num >= 1).sort((a,b) => a.order_num - b.order_num);

  // Align segments by name — build unified list
  const allNames = [...new Set([...segs1.map(s => s.name), ...segs2.map(s => s.name)])];
  // preserve order from the longer list
  const refSegs = segs1.length >= segs2.length ? segs1 : segs2;
  const orderedNames = refSegs.map(s => s.name).filter(n => allNames.includes(n));
  // append any names only in the other list
  for (const n of allNames) {
    if (!orderedNames.includes(n)) orderedNames.push(n);
  }

  const byName1 = Object.fromEntries(segs1.map(s => [s.name, s]));
  const byName2 = Object.fromEntries(segs2.map(s => [s.name, s]));

  // collect all segment times to scale bars
  const allSecs = [
    ...segs1.map(s => timeToSeconds(s.remark)),
    ...segs2.map(s => timeToSeconds(s.remark)),
  ].filter(t => t != null && t > 0);
  const maxSecs = Math.max(...allSecs) || 1;

  const isTransition = name => /^to /i.test(name);

  const rows = orderedNames.map(name => {
    const s1  = byName1[name];
    const s2  = byName2[name];
    const t1  = timeToSeconds(s1?.remark);
    const t2  = timeToSeconds(s2?.remark);
    const isTrans = isTransition(name);

    const faster1 = t1 != null && t2 != null && t1 < t2;
    const faster2 = t1 != null && t2 != null && t2 < t1;
    const tied    = t1 != null && t2 != null && t1 === t2;

    const bar1pct = t1 != null ? Math.round((t1 / maxSecs) * 100) : 0;
    const bar2pct = t2 != null ? Math.round((t2 / maxSecs) * 100) : 0;

    const diff = fmtDiff(t1, t2); // negative = p1 faster

    return `
      <div class="cmp-seg-row ${isTrans ? 'cmp-seg-transition' : ''}">
        <div class="cmp-seg-name">${esc(name)}</div>

        <div class="cmp-seg-side cmp-seg-left">
          <div class="cmp-seg-time ${faster1 ? 'cmp-winner' : ''}">
            ${s1?.remark || '—'}
            ${faster1 ? '<span class="cmp-crown">▲</span>' : ''}
          </div>
          <div class="cmp-bar-wrap cmp-bar-left">
            <div class="cmp-bar" style="width:${bar1pct}%;background:${COLORS[0]};opacity:${isTrans?0.35:1}"></div>
          </div>
        </div>

        <div class="cmp-seg-diff ${faster1 ? 'diff-left' : faster2 ? 'diff-right' : 'diff-tie'}">
          ${tied ? '=' : diff}
        </div>

        <div class="cmp-seg-side cmp-seg-right">
          <div class="cmp-bar-wrap cmp-bar-right">
            <div class="cmp-bar" style="width:${bar2pct}%;background:${COLORS[1]};opacity:${isTrans?0.35:1}"></div>
          </div>
          <div class="cmp-seg-time ${faster2 ? 'cmp-winner' : ''}">
            ${faster2 ? '<span class="cmp-crown">▲</span>' : ''}
            ${s2?.remark || '—'}
          </div>
        </div>
      </div>`;
  }).join('');

  // Totals
  const total1 = segs1.reduce((s, r) => s + (timeToSeconds(r.remark) ?? 0), 0);
  const total2 = segs2.reduce((s, r) => s + (timeToSeconds(r.remark) ?? 0), 0);
  const fmt = s => { const h=String(Math.floor(s/3600)).padStart(2,'0'), m=String(Math.floor(s%3600/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0'); return `${h}:${m}:${ss}`; };
  const totalDiff = fmtDiff(total1, total2);

  const totalsRow = `
    <div class="cmp-seg-row cmp-seg-total">
      <div class="cmp-seg-name"><strong>Total (segments)</strong></div>
      <div class="cmp-seg-side cmp-seg-left">
        <div class="cmp-seg-time ${total1 < total2 ? 'cmp-winner' : ''}">${fmt(total1)}</div>
        <div class="cmp-bar-wrap cmp-bar-left"></div>
      </div>
      <div class="cmp-seg-diff ${total1 < total2 ? 'diff-left' : total2 < total1 ? 'diff-right' : 'diff-tie'}">${totalDiff}</div>
      <div class="cmp-seg-side cmp-seg-right">
        <div class="cmp-bar-wrap cmp-bar-right"></div>
        <div class="cmp-seg-time ${total2 < total1 ? 'cmp-winner' : ''}">${fmt(total2)}</div>
      </div>
    </div>`;

  // Name header row
  const nameRow = `
    <div class="cmp-seg-header">
      <div class="cmp-seg-name"></div>
      <div class="cmp-seg-side cmp-seg-left">
        <div class="cmp-player-label" style="color:${COLORS[0]}">${esc(p1.name)}</div>
      </div>
      <div class="cmp-seg-diff"></div>
      <div class="cmp-seg-side cmp-seg-right">
        <div class="cmp-player-label" style="color:${COLORS[1]}">${esc(p2.name)}</div>
      </div>
    </div>`;

  document.getElementById('cmp-segments').innerHTML = nameRow + rows + totalsRow;
}
