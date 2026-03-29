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

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtTime(t) { return t && t !== '-' ? t : '—'; }

// ── Load data ─────────────────────────────────────────────────────────────────
const params  = new URLSearchParams(location.search);
const bib     = params.get('bib');
const raceId  = params.get('race');
if (!bib || !raceId) { document.getElementById('loading').textContent = 'Missing participant or race.'; throw new Error(); }

Promise.all([
  fetch(`/api/detail/${raceId}/${encodeURIComponent(bib)}`).then(r => r.ok ? r.json() : Promise.reject('Detail not found')),
  fetch(`/api/participant/${raceId}/${encodeURIComponent(bib)}`).then(r => r.ok ? r.json() : Promise.reject('Participant not found')),
]).then(([details, participant]) => {
  render(participant, details);
  document.title = `${participant.name} — GymRace Amsterdam 2026`;
  document.getElementById('back-link').href = `/race/${raceId}`;
  document.getElementById('loading').style.display = 'none';
  document.getElementById('page').style.display = '';
}).catch(err => {
  document.getElementById('loading').textContent = 'Error: ' + err;
});

// ── Render ────────────────────────────────────────────────────────────────────
function render(p, details) {
  const summary   = details.find(r => r.order_num === 0);
  const segments  = details.filter(r => r.order_num >= 1).sort((a,b) => a.order_num - b.order_num);
  const totWorkout= details.find(r => r.order_num === -3);
  const totRun    = details.find(r => r.order_num === -4);

  // Fall back to summing segments when metadata rows are absent (e.g. Utrecht)
  const isRun = s => /\brun\b|\bsprint\b/i.test(s.name) && !/^to /i.test(s.name);
  const isTrans = s => /^to /i.test(s.name);
  const isWorkout = s => !isRun(s) && !isTrans(s);
  const sumSecs = segs => segs.reduce((a, s) => a + (timeToSeconds(s.remark) ?? 0), 0);
  const fmtSecs = n => { const h=String(Math.floor(n/3600)).padStart(2,'0'), m=String(Math.floor(n%3600/60)).padStart(2,'0'), s=String(n%60).padStart(2,'0'); return `${h}:${m}:${s}`; };
  const workoutTime = totWorkout?.remark || (sumSecs(segments.filter(s => !isRun(s) && !isTrans(s))) ? fmtSecs(sumSecs(segments.filter(s => !isRun(s) && !isTrans(s)))) : null);
  const runTime     = totRun?.remark     || (sumSecs(segments.filter(isRun)) ? fmtSecs(sumSecs(segments.filter(isRun))) : null);
  const penTime   = details.find(r => r.order_num === -1);
  const penReason = details.find(r => r.order_num === -2);

  // Hero
  document.getElementById('hero-flag').textContent = countryFlag(p.country);
  document.getElementById('hero-name').textContent = p.name;

  const statusHtml = p.fin === 'Finish' || !p.fin
    ? '<span class="td-finish">✓ Finished</span>'
    : p.fin === 'DNF' ? '<span class="td-dnf">DNF</span>'
    : p.fin === 'DSQ' ? '<span class="td-dsq">DSQ</span>'
    : `<span>${esc(p.fin)}</span>`;

  document.getElementById('hero-meta').innerHTML = `
    <span class="td-race">${RACE_LABELS[p.race] || p.race}</span>
    ${statusHtml}`;

  // Parse overall positions from summary row
  const [, racePosStr] = (summary?.race_pos || '').split('|');
  const [, genPosStr]  = (summary?.gen_pos  || '').split('|');
  const [, catPosStr]  = (summary?.cat_pos  || '').split('|');

  document.getElementById('overview-stats').innerHTML = `
    <div class="stat-box">
      <div class="stat-val">${esc(p.pos) || '—'}</div>
      <div class="stat-lbl">Position</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${esc(racePosStr) || '—'}</div>
      <div class="stat-lbl">Overall</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${esc(genPosStr) || '—'}</div>
      <div class="stat-lbl">Gender</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${esc(catPosStr) || '—'}</div>
      <div class="stat-lbl">Category</div>
    </div>
    ${workoutTime ? `<div class="stat-box"><div class="stat-val">${esc(workoutTime)}</div><div class="stat-lbl">Workouts</div></div>` : ''}
    ${runTime     ? `<div class="stat-box"><div class="stat-val">${esc(runTime)}</div><div class="stat-lbl">Running</div></div>` : ''}
    <div class="stat-box stat-box-total">
      <div class="stat-val">${fmtTime(p.time)}</div>
      <div class="stat-lbl">Total time</div>
    </div>`;

  // Penalty
  const penBanner = document.getElementById('penalty-banner');
  if (penTime?.remark && penTime.remark !== '-') {
    penBanner.innerHTML = `<div class="penalty-banner">⚠ Penalty: ${esc(penTime.remark)}${penReason?.name ? ' — ' + esc(penReason.name) : ''}</div>`;
  }

  // Classify segments
  const runs     = segments.filter(isRun);
  const workouts = segments.filter(isWorkout);

  renderTotalTab(segments);
  renderRunsTab(runs);
  renderWorkoutsTab(workouts);
  renderSplitsTab(segments, details);
}

// ── Tab: Total ────────────────────────────────────────────────────────────────
function renderTotalTab(segments) {
  document.getElementById('tab-total').innerHTML = segmentTable(segments, 'All');
}

// ── Tab: Runs ─────────────────────────────────────────────────────────────────
function renderRunsTab(runs) {
  if (!runs.length) {
    document.getElementById('tab-runs').innerHTML = '<p class="tab-empty">No run segments found.</p>';
    return;
  }
  document.getElementById('tab-runs').innerHTML = segmentTable(runs, 'Run');
}

// ── Tab: Workouts ─────────────────────────────────────────────────────────────
function renderWorkoutsTab(workouts) {
  if (!workouts.length) {
    document.getElementById('tab-workouts').innerHTML = '<p class="tab-empty">No workout segments found.</p>';
    return;
  }
  document.getElementById('tab-workouts').innerHTML = segmentTable(workouts, 'Workout');
}

// ── Tab: Splits ───────────────────────────────────────────────────────────────
function renderSplitsTab(segments, allDetails) {
  // Full raw table including metadata rows
  const meta = allDetails.filter(r => r.order_num < 0).sort((a,b) => a.order_num - b.order_num);

  let html = `
    <h3 class="detail-section-title">Metadata</h3>
    <table class="splits-table">
      <thead><tr><th>Field</th><th>Value</th><th>Ranking</th></tr></thead>
      <tbody>`;

  for (const r of meta) {
    html += `<tr>
      <td class="seg-name">${esc(r.name)}</td>
      <td class="seg-time">${fmtTime(r.remark)}</td>
      <td class="seg-rank">${r.status || '—'}</td>
    </tr>`;
  }

  html += `</tbody></table>
    <h3 class="detail-section-title" style="margin-top:20px">All segments</h3>
    <table class="splits-table">
      <thead><tr><th>#</th><th>Segment</th><th>Time</th><th>Rank</th><th>Cumulative label</th><th>Cumulative time</th><th>Cum. rank</th></tr></thead>
      <tbody>`;

  for (const r of segments) {
    html += `<tr>
      <td class="seg-num">${r.order_num}</td>
      <td class="seg-name">${esc(r.name)}</td>
      <td class="seg-time">${fmtTime(r.remark)}</td>
      <td class="seg-rank">${r.status ? '#' + esc(r.status) : '—'}</td>
      <td class="seg-label">${esc(r.race_pos)}</td>
      <td class="seg-time">${fmtTime(r.gen_pos)}</td>
      <td class="seg-rank">${r.cat_pos ? '#' + esc(r.cat_pos) : '—'}</td>
    </tr>`;
  }

  html += `</tbody></table>`;
  document.getElementById('tab-splits').innerHTML = html;
}

// ── Segment bar table (shared by Total, Runs, Workouts tabs) ─────────────────
function segmentTable(segments, type) {
  if (!segments.length) return '<p class="tab-empty">No data.</p>';

  const times = segments.map(s => timeToSeconds(s.remark)).filter(t => t !== Infinity);
  const maxT = Math.max(...times) || 1;
  const total = times.reduce((a, b) => a + b, 0);

  const isRunSeg   = s => /run|sprint/i.test(s.name) && !/^to /i.test(s.name);
  const isTrans    = s => /^to /i.test(s.name);

  let html = `
    <table class="segment-table">
      <thead>
        <tr>
          <th>Segment</th>
          <th>Time</th>
          <th>Rank</th>
          <th colspan="2">Visual</th>
          <th>Cumulative time</th>
          <th>Cum. rank</th>
        </tr>
      </thead>
      <tbody>`;

  for (const s of segments) {
    const secs = timeToSeconds(s.remark);
    const pct  = secs === Infinity ? 0 : Math.round((secs / maxT) * 100);
    const colorClass = isTrans(s) ? 'bar-transition' : isRunSeg(s) ? 'bar-run' : 'bar-workout';
    const pctOfTotal = total > 0 && secs !== Infinity ? ((secs / total) * 100).toFixed(1) : '';

    html += `<tr class="${isTrans(s) ? 'row-transition' : ''}">
      <td class="seg-name">${esc(s.name)}</td>
      <td class="seg-time">${fmtTime(s.remark)}</td>
      <td class="seg-rank">${s.status ? '#' + esc(s.status) : '—'}</td>
      <td class="seg-bar-cell">
        <div class="seg-bar-wrap">
          <div class="seg-bar ${colorClass}" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="seg-pct">${pctOfTotal ? pctOfTotal + '%' : ''}</td>
      <td class="seg-time">${fmtTime(s.gen_pos)}</td>
      <td class="seg-rank">${s.cat_pos ? '#' + esc(s.cat_pos) : '—'}</td>
    </tr>`;
  }

  // Totals row
  if (total > 0) {
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    html += `<tr class="row-total">
      <td><strong>Total</strong></td>
      <td class="seg-time"><strong>${hh}:${mm}:${ss}</strong></td>
      <td colspan="5"></td>
    </tr>`;
  }

  html += `</tbody></table>`;
  return html;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});
