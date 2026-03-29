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
const params  = new URLSearchParams(location.search);
const bib1    = params.get('bib1');
const bib2    = params.get('bib2');
// Support both single `race` (same race) and separate `race1`/`race2` (cross-race)
const raceId  = params.get('race');
const race1Id = params.get('race1') || raceId;
const race2Id = params.get('race2') || raceId;

if (!bib1 || !bib2 || !race1Id || !race2Id) {
  document.getElementById('loading').textContent = 'Missing parameters.';
  throw new Error();
}

// Back link: if same race go to race page, otherwise go to index
document.getElementById('back-link').href = race1Id === race2Id ? `/race/${race1Id}` : '/';

Promise.all([
  fetch(`/api/results/${race1Id}`).then(r => r.json()),
  fetch(`/api/results/${race2Id}`).then(r => r.json()),
  fetch(`/api/detail/${race1Id}/${encodeURIComponent(bib1)}`).then(r => r.ok ? r.json() : []),
  fetch(`/api/detail/${race2Id}/${encodeURIComponent(bib2)}`).then(r => r.ok ? r.json() : []),
  fetch('/api/races').then(r => r.json()),
]).then(([all1, all2, details1, details2, races]) => {
  const p1 = all1.find(r => r.bib === bib1);
  const p2 = all2.find(r => r.bib === bib2);
  if (!p1 || !p2) throw new Error('Participant not found');

  // Subtitle: show both race names if different
  const raceInfo1 = races.find(r => r.id === race1Id);
  const raceInfo2 = races.find(r => r.id === race2Id);
  const subtitle = race1Id === race2Id
    ? (raceInfo1?.subtitle || '')
    : [raceInfo1?.subtitle, raceInfo2?.subtitle].filter(Boolean).join(' · ');
  document.getElementById('race-subtitle').textContent = subtitle;
  document.title = `${p1.name} vs ${p2.name} — GymRace`;

  // Attach race info to participants for display
  p1._raceInfo = raceInfo1;
  p2._raceInfo = raceInfo2;

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
  const pRaceId = idx === 0 ? race1Id : race2Id;
  const raceEdition = p._raceInfo ? `${p._raceInfo.name} ${p._raceInfo.subtitle}` : '';
  el.innerHTML = `
    <div class="cmp-hero-flag">${countryFlag(p.country)}</div>
    <div class="cmp-hero-name">${esc(p.name)}</div>
    <div class="cmp-hero-meta">
      <span class="td-race">${RACE_LABELS[p.race] || p.race}</span>
      ${race1Id !== race2Id ? `<span class="cmp-hero-edition">${esc(raceEdition)}</span>` : ''}
    </div>
    <a class="cmp-hero-link" href="/participant?bib=${encodeURIComponent(p.bib)}&race=${pRaceId}">View full profile →</a>`;
  el.style.borderTopColor = COLORS[idx];
}

function sumSegType(details, type) {
  const segs = details.filter(r => r.order_num >= 1);
  const total = segs
    .filter(r => segType(r.name) === type)
    .reduce((acc, r) => acc + (timeToSeconds(r.remark) ?? 0), 0);
  if (!total) return null;
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function renderStats(p1, d1, p2, d2) {
  const totWorkout1 = d1.find(r => r.order_num === -3);
  const totRun1     = d1.find(r => r.order_num === -4);
  const totWorkout2 = d2.find(r => r.order_num === -3);
  const totRun2     = d2.find(r => r.order_num === -4);

  // Fall back to summing segments when metadata rows are absent
  const workout1 = totWorkout1?.remark || sumSegType(d1, 'workout');
  const run1     = totRun1?.remark     || sumSegType(d1, 'run');
  const workout2 = totWorkout2?.remark || sumSegType(d2, 'workout');
  const run2     = totRun2?.remark     || sumSegType(d2, 'run');

  const stats = [
    { label: 'Position',      v1: p1.pos,         v2: p2.pos,         lower_is_better: true },
    { label: 'Workouts time', v1: workout1 || '—', v2: workout2 || '—', lower_is_better: true },
    { label: 'Running time',  v1: run1 || '—',    v2: run2 || '—',    lower_is_better: true },
    { label: 'Total time',    v1: p1.time || '—', v2: p2.time || '—', lower_is_better: true },
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

// ── Segment type classifier ───────────────────────────────────────────────────
function segType(name) {
  if (/^to /i.test(name)) return 'transition';
  if (/\brun\b|\bsprint\b/i.test(name)) return 'run';
  return 'workout';
}

// Align segments by type+index instead of name.
// Returns array of { s1, s2, type, label } where label is the display name.
function alignSegments(segs1, segs2) {
  const buckets2 = { run: [], workout: [], transition: [] };
  for (const s of segs2) buckets2[segType(s.name)].push(s);
  // clone so we can shift without mutating
  const q = { run: [...buckets2.run], workout: [...buckets2.workout], transition: [...buckets2.transition] };

  const pairs = [];
  for (const s1 of segs1) {
    const type = segType(s1.name);
    const s2   = q[type].shift() ?? null;
    const label = s1?.name ?? s2?.name;
    pairs.push({ s1, s2, type, label });
  }
  // Any leftover segs2 segments (e.g. if segs2 is longer)
  for (const type of ['run', 'workout', 'transition']) {
    for (const s2 of q[type]) {
      pairs.push({ s1: null, s2, type, label: s2.name });
    }
  }
  return pairs;
}

function renderSegments(p1, d1, p2, d2) {
  const segs1 = d1.filter(r => r.order_num >= 1).sort((a,b) => a.order_num - b.order_num);
  const segs2 = d2.filter(r => r.order_num >= 1).sort((a,b) => a.order_num - b.order_num);

  const pairs = alignSegments(segs1, segs2);

  // collect all segment times to scale bars
  const allSecs = [
    ...segs1.map(s => timeToSeconds(s.remark)),
    ...segs2.map(s => timeToSeconds(s.remark)),
  ].filter(t => t != null && t > 0);
  const maxSecs = Math.max(...allSecs) || 1;

  const rows = pairs.map(({ s1, s2, type, label }) => {
    const t1  = timeToSeconds(s1?.remark);
    const t2  = timeToSeconds(s2?.remark);
    const isTrans = type === 'transition';

    const faster1 = t1 != null && t2 != null && t1 < t2;
    const faster2 = t1 != null && t2 != null && t2 < t1;
    const tied    = t1 != null && t2 != null && t1 === t2;

    const bar1pct = t1 != null ? Math.round((t1 / maxSecs) * 100) : 0;
    const bar2pct = t2 != null ? Math.round((t2 / maxSecs) * 100) : 0;

    const diff = fmtDiff(t1, t2); // negative = p1 faster

    return `
      <div class="cmp-seg-row ${isTrans ? 'cmp-seg-transition' : ''}">
        <div class="cmp-seg-name">${esc(label)}</div>
        <div class="cmp-bar-wrap cmp-bar-left">
          <div class="cmp-bar" style="width:${bar1pct}%;background:${COLORS[0]};opacity:${isTrans?0.35:1}"></div>
        </div>
        <div class="cmp-seg-time cmp-t1 ${faster1 ? 'cmp-winner' : ''}">
          ${faster1 ? '<span class="cmp-crown">▲</span>' : ''} ${s1?.remark || '—'}
        </div>
        <div class="cmp-seg-diff ${faster1 ? 'diff-left' : faster2 ? 'diff-right' : 'diff-tie'}">
          ${tied ? '=' : diff}
        </div>
        <div class="cmp-seg-time cmp-t2 ${faster2 ? 'cmp-winner' : ''}">
          ${s2?.remark || '—'} ${faster2 ? '<span class="cmp-crown">▲</span>' : ''}
        </div>
        <div class="cmp-bar-wrap cmp-bar-right">
          <div class="cmp-bar" style="width:${bar2pct}%;background:${COLORS[1]};opacity:${isTrans?0.35:1}"></div>
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
      <div class="cmp-bar-wrap cmp-bar-left"></div>
      <div class="cmp-seg-time cmp-t1 ${total1 < total2 ? 'cmp-winner' : ''}">${fmt(total1)}</div>
      <div class="cmp-seg-diff ${total1 < total2 ? 'diff-left' : total2 < total1 ? 'diff-right' : 'diff-tie'}">${totalDiff}</div>
      <div class="cmp-seg-time cmp-t2 ${total2 < total1 ? 'cmp-winner' : ''}">${fmt(total2)}</div>
      <div class="cmp-bar-wrap cmp-bar-right"></div>
    </div>`;

  // Name header row
  const nameRow = `
    <div class="cmp-seg-header">
      <div class="cmp-seg-name"></div>
      <div></div>
      <div class="cmp-player-label" style="color:${COLORS[0]};text-align:right">${esc(p1.name)}</div>
      <div></div>
      <div class="cmp-player-label" style="color:${COLORS[1]};text-align:left">${esc(p2.name)}</div>
      <div></div>
    </div>`;

  document.getElementById('cmp-segments').innerHTML = nameRow + rows + totalsRow;
}
