'use strict';
const $ = id => document.getElementById(id);
const { format } = Stats;
let sessions = [], view = null, plots = [], digits = 2;

/* ---------- storage (IndexedDB has no 5 MB cap) ---------- */
const db = new Promise((ok, no) => {
  const r = indexedDB.open('cubestats', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => ok(r.result);
  r.onerror = () => no(r.error);
});
db.catch(() => {});
const getKV = async k => {
  const d = await db;
  return new Promise((ok, no) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
};
const setKV = async (k, v) => {
  Sync.begin(k);
  try {
    const d = await db;
    await new Promise((ok, no) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = t.onabort = () => no(t.error); });
  } finally { Sync.end(k); }
};
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
const say = m => { $('msg').textContent = m; };
const save = () => setKV('sessions', sessions).then(() => true, () => false);
const SAVE_FAILED = 'This browser could not save the data for next time.';
const FIELDS = ['sizes', 'dnfmode', 'dnf', 'plus', 'show'];
const saveSettings = () => setKV('settings', Object.fromEntries(FIELDS.map(f => [f, $(f).value]))).catch(() => {});

/* ---------- data ---------- */
function addSessions(list) {
  let n = 0;
  for (const s of list) {
    if (!s.solves.length) continue;
    let name = s.name, i = 2;
    while (sessions.some(o => o.name === name)) name = `${s.name} (${i++})`;
    sessions.push({ id: newId(), name, solves: s.solves });
    n += s.solves.length;
  }
  return n;
}
async function importAll(sources) { // [{ name, read }]
  const notes = [], first = sessions.length;
  let count = 0, wcaData = null;
  for (const src of sources) {
    try {
      const r = await src.read();
      if (r.wca) { wcaData = r.wca; continue; }
      const n = addSessions(r.sessions);
      if (!n) throw new Error('no times found');
      count += n;
      if (r.skipped) notes.push(`${src.name}: ${r.skipped} unreadable entries skipped`);
    } catch (e) { notes.push(`${src.name}: ${e.message}`); }
  }
  if (count) { fillSessions(first); if (!(await save())) notes.push(SAVE_FAILED); }
  if (wcaData) { await WCA.use(wcaData); if (!count && !notes.length) return; }
  say([wcaData ? 'Imported WCA results.' : '', count ? `Imported ${count.toLocaleString()} solves.` : '', ...notes].filter(Boolean).join(' · '));
}
const importFiles = files => importAll(files.map(f => ({ name: f.name, read: () => Import.fromFile(f) })));

function fillOptions(sel) {
  $('session').replaceChildren(...sessions.map((s, i) => new Option(`${s.name} (${s.solves.length.toLocaleString()})`, i)));
  WCA.addOptions($('session'));
  const any = !!sessions.length || WCA.has();
  if (any) $('session').value = !sessions.length && !WCA.isWca(sel) ? WCA.firstEvent() : String(sel);
  $('empty').hidden = any;
  $('main').hidden = !any;
  $('remove').disabled = $('export').disabled = !any;
  $('manage').disabled = !sessions.length;
  WCA.syncFilters();
}
function fillSessions(sel) {
  fillOptions(sel);
  if ($('preset').value === 'custom') $('preset').value = 'all';
  resetRange();
  render();
}
function current() {
  const v = $('session').value;
  return WCA.solvesFor(v, WCA.isWca(v) ? [] : sessions[+v]?.solves ?? []);
}
function resetRange() {
  const n = current().length, p = $('preset').value;
  if (p === 'custom') return;
  $('to').value = n;
  $('from').value = p === 'all' ? Math.min(1, n) : Math.max(1, n - p + 1);
}
const parseSizes = () => [...new Set(($('sizes').value.match(/\d+/g) || []).map(Number).filter(n => n > 1))].sort((a, b) => a - b);

/* ---------- average sizes dropdown (state lives in the hidden #sizes field) ---------- */
const COMMON_SIZES = [5, 12, 50, 100, 200, 500, 1000, 2000];
function fillSizes() {
  const on = parseSizes(), shown = [...new Set([...COMMON_SIZES, ...on])].sort((a, b) => a - b);
  $('sizelist').replaceChildren(...shown.map(n => {
    const l = el('label'), c = el('input');
    c.type = 'checkbox';
    c.value = n;
    c.checked = on.includes(n);
    l.append(c, n.toLocaleString());
    return l;
  }));
  $('sizesum').textContent = on.length ? on.join(', ') : 'None';
}
function setSizes(list) {
  $('sizes').value = list.join(', ');
  $('sizesum').textContent = parseSizes().join(', ') || 'None';
  render();
  saveSettings();
}
function addSize() {
  const n = Number($('custom').value);
  if (!Number.isInteger(n) || n < 2) return;
  $('custom').value = '';
  setSizes([...parseSizes(), n]);
  fillSizes();
}

/* ---------- rendering ---------- */
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const keyFor = color => { const k = el('i', null, 'key'); k.style.background = `var(${color})`; return k; };

function render() {
  if (!sessions.length && !WCA.has()) return;
  const all = current();
  const lo = Math.max(1, Math.floor(+$('from').value) || 1), hi = Math.min(all.length, Math.floor(+$('to').value) || all.length);
  $('dnfbox').hidden = $('dnfmode').value !== 'time';
  const solves = all.slice(lo - 1, hi), dnfMode = $('dnfmode').value, dnf = dnfMode === 'time' ? $('dnf').value : '', plus = $('plus').value === 'add' ? 2000 : 0;
  const toMs = s => (s.pen === 'DNF' ? (dnf === '' ? Infinity : +dnf * 1000) : s.t + (s.pen === '+?' ? plus : 0));
  const times = solves.map(toMs);
  digits = solves.some(s => s.t % 10) ? 3 : 2;
  const sum = Stats.summary(times), fmt = v => format(v, digits);
  const dnfs = solves.filter(s => s.pen === 'DNF').length;
  $('tiles').replaceChildren(...[
    ['Solves', sum.n.toLocaleString()], ['Best', fmt(sum.best)], ['Worst', fmt(sum.worst)], ['Average (5% trimmed)', fmt(sum.average)], ['Median', fmt(sum.median)],
    ['Std. deviation', fmt(sum.sd)], ['DNFs', `${dnfs.toLocaleString()} (${sum.n ? (100 * dnfs / sum.n).toFixed(1) : 0}%)`],
  ].map(([k, v]) => { const d = el('div'); d.append(el('b', v), el('span', k)); return d; }));

  const rows = [], series = [];
  const push = (label, vals) => {
    const rec = Stats.records(vals), last = rec.at.at(-1);
    rows.push([label, fmt(vals.length ? vals[vals.length - 1] : NaN), fmt(rec.best), last == null ? '–' : '#' + (lo + last), String(Math.max(0, rec.at.length - 1))]);
    series.push({ label, vals, rec });
  };
  push('Single', Float64Array.from(times));
  for (const n of parseSizes()) push(`Average of ${n}`, Stats.rolling(times, n, dnfMode));
  const tr = (cells, tag) => { const r = el('tr'); r.append(...cells.map(c => el(tag, c))); return r; };
  $('table').replaceChildren(tr(['', 'Current', 'Best', 'Set at solve', 'Times improved'], 'th'), ...rows.map(r => tr(r, 'td')));
  view = { lo, solves, series };

  const pair = WCA.renderInto($('wca'), solves, toMs, parseSizes(), dnfMode, digits);
  $('charts').replaceChildren();
  plots = [];
  if (pair) card('Distribution, in comp and out of comp', WCA.compareChart(pair.out, pair.in), [['--s1', 'Out of comp'], ['--s2', 'In comp']]);
  for (const s of series) card(s.label, lineChart(s, lo), [['--s1', s.label], ['--s2', 'Best so far']]);
  card('Distribution', barChart(histogram(times)));
  const days = activity(solves);
  if (days.length) card('Solves per day', barChart(days));
  draw();
}
function card(title, plot, legend) {
  const c = el('section', null, 'card'), cv = el('canvas');
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', title + ' chart');
  c.append(el('h2', title));
  if (legend) {
    const l = el('div', null, 'legend');
    for (const [color, name] of legend) { const s = el('span'); s.append(keyFor(color), name); l.append(s); }
    c.append(l);
  }
  c.append(cv);
  $('charts').append(c);
  plot.cv = cv;
  plots.push(plot);
  bind(plot);
}
function histogram(times) {
  const ok = times.filter(t => t !== Infinity).sort((a, b) => a - b);
  if (!ok.length) return [];
  const p99 = ok[Math.floor((ok.length - 1) * 0.99)], raw = Math.max((p99 - ok[0]) / 24, 10), mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw);
  const base = Math.floor(ok[0] / step), last = Math.floor(p99 / step), bins = new Array(last - base + 1).fill(0);
  let over = 0;
  for (const t of ok) { const i = Math.floor(t / step) - base; if (i < bins.length) bins[i]++; else over++; }
  const f = v => format(v * step, step < 100 ? 2 : step < 1000 ? 1 : 0);
  const out = bins.map((n, i) => ({ n, label: f(base + i), tip: `${f(base + i)} to ${f(base + i + 1)}` }));
  if (over) out.push({ n: over, label: 'slower', tip: `${f(last + 1)} or slower` });
  return out;
}
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function activity(solves) {
  const m = new Map();
  let min = Infinity, max = -Infinity;
  for (const s of solves) {
    if (s.date == null) continue;
    const k = dayKey(new Date(s.date));
    m.set(k, (m.get(k) || 0) + 1);
    min = Math.min(min, s.date);
    max = Math.max(max, s.date);
  }
  if (!m.size || max - min > 864e5 * 36525) return []; // a span over a century means bad dates
  const out = [], d = new Date(min), end = dayKey(new Date(max));
  d.setHours(12, 0, 0, 0);
  for (;;) {
    const k = dayKey(d);
    out.push({ n: m.get(k) || 0, label: k, tip: k });
    if (k >= end) return out;
    d.setDate(d.getDate() + 1);
  }
}

/* ---------- charts ---------- */
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const L = 62, R = 12, T = 12, B = 26;
function ticks(lo, hi, count, integer) {
  const raw = (hi - lo) / count || 1, mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw * 0.999);
  if (integer) step = Math.max(1, Math.round(step));
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return { out, step };
}
function setup(p) {
  const w = p.cv.clientWidth, h = p.cv.clientHeight, r = devicePixelRatio || 1;
  p.cv.width = w * r;
  p.cv.height = h * r;
  const g = p.cv.getContext('2d');
  g.scale(r, r);
  g.font = '12px system-ui,sans-serif';
  g.lineJoin = 'round';
  return { g, w, h, pw: w - L - R, ph: h - T - B };
}
function yAxis(g, w, y, values, fmt) {
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.lineWidth = 1;
  g.strokeStyle = css('--line');
  g.fillStyle = css('--ink2');
  for (const v of values) {
    g.beginPath(); g.moveTo(L, y(v)); g.lineTo(w - R, y(v)); g.stroke();
    g.fillText(fmt(v), L - 8, y(v));
  }
}
function noData(g, w, h) {
  g.fillStyle = css('--ink2');
  g.textAlign = 'center';
  g.fillText('Not enough solves in this range', w / 2, h / 2);
}

function lineChart(s, lo) {
  const n = s.vals.length;
  let min = Infinity, max = -Infinity;
  for (const v of s.vals) if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  const pad = (max - min) * 0.06 || max * 0.05 || 100;
  min = Math.max(0, min - pad);
  max += pad;
  // Min and max of each pixel bucket, so long histories draw fast without losing peaks.
  function path(g, a, x, y, color, width, step, pw) {
    g.strokeStyle = g.fillStyle = color;
    g.lineWidth = width;
    g.beginPath();
    let pen = false, prev = 0;
    const to = (i, v) => {
      if (!pen) g.moveTo(x(i), y(v));
      else { if (step) g.lineTo(x(i), y(prev)); g.lineTo(x(i), y(v)); }
      pen = true;
      prev = v;
    };
    const bucket = Math.max(1, Math.floor(n / Math.max(1, pw)));
    for (let i = 0; i < n; i += bucket) {
      let mn = Infinity, mx = -Infinity, mi = i, xi = i;
      for (let j = i; j < Math.min(n, i + bucket); j++) {
        const v = a[j];
        if (!Number.isFinite(v)) continue;
        if (v < mn) { mn = v; mi = j; }
        if (v > mx) { mx = v; xi = j; }
      }
      if (mn === Infinity) { pen = false; continue; }
      if (!pen) g.fillRect(x(mi) - width / 2, y(mn) - width / 2, width, width); // isolated points stay visible
      if (mi === xi) to(mi, mn);
      else if (mi < xi) { to(mi, mn); to(xi, mx); } else { to(xi, mx); to(mi, mn); }
    }
    g.stroke();
  }
  return {
    zoom: true, count: n,
    index: (px, w) => Math.max(0, Math.min(n - 1, Math.round((px - L) / (w - L - R) * (n - 1)))),
    solve: i => lo + i,
    tip: i => ({ title: 'Solve #' + (lo + i), rows: [['--s1', s.label, format(s.vals[i], digits)], ['--s2', 'Best so far', format(s.rec.line[i], digits)]] }),
    draw(hover, drag) {
      const { g, w, h, pw, ph } = setup(this);
      if (!Number.isFinite(max)) return noData(g, w, h);
      const x = i => L + (n > 1 ? i / (n - 1) : 0.5) * pw, y = v => T + (max - v) / (max - min) * ph;
      const yt = ticks(min, max, 5);
      yAxis(g, w, y, yt.out, v => format(v, yt.step < 100 ? 2 : yt.step < 1000 ? 1 : 0));
      g.textAlign = 'center';
      for (const v of ticks(lo, lo + n - 1, Math.max(2, pw / 110), true).out) g.fillText(v.toLocaleString(), Math.min(w - R - 14, x(v - lo)), h - 10);
      path(g, s.vals, x, y, css('--s1'), n > 400 ? 1 : 2, false, pw);
      path(g, s.rec.line, x, y, css('--s2'), 2, true, pw);
      if (drag) {
        g.fillStyle = css('--s1') + '33';
        g.fillRect(Math.min(...drag), T, Math.abs(drag[1] - drag[0]), ph);
      } else if (hover != null) {
        g.strokeStyle = css('--ink2'); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x(hover), T); g.lineTo(x(hover), T + ph); g.stroke();
        for (const [a, c] of [[s.vals, '--s1'], [s.rec.line, '--s2']]) {
          if (!Number.isFinite(a[hover])) continue;
          g.fillStyle = css(c); g.strokeStyle = css('--surface'); g.lineWidth = 2;
          g.beginPath(); g.arc(x(hover), y(a[hover]), 5, 0, 7); g.fill(); g.stroke();
        }
      }
    },
  };
}
function barChart(bars) {
  const n = bars.length, max = bars.reduce((a, b) => Math.max(a, b.n), 1);
  return {
    count: n,
    index: (px, w) => Math.max(0, Math.min(n - 1, Math.floor((px - L) / (w - L - R) * n))),
    tip: i => ({ title: bars[i].tip, rows: [['--s1', 'solves', bars[i].n.toLocaleString()]] }),
    draw(hover) {
      const { g, w, h, pw, ph } = setup(this);
      if (!n) return noData(g, w, h);
      const y = v => T + (1 - v / (max * 1.05)) * ph, bw = pw / n, gap = bw > 6 ? 2 : 0;
      yAxis(g, w, y, ticks(0, max, 4, true).out, v => v.toLocaleString());
      g.fillStyle = css('--s1');
      bars.forEach((b, i) => {
        if (!b.n) return;
        const W = Math.max(1, bw - gap), H = T + ph - y(b.n), r = Math.min(4, W / 2, H);
        g.globalAlpha = hover == null || hover === i ? 1 : 0.55;
        g.beginPath(); g.roundRect(L + i * bw + gap / 2, y(b.n), W, H, [r, r, 0, 0]); g.fill();
      });
      g.globalAlpha = 1;
      g.fillStyle = css('--ink2');
      g.textAlign = 'center';
      const every = Math.ceil(n / Math.max(1, Math.floor(pw / 90)));
      for (let i = 0; i < n; i += every) {
        const half = g.measureText(bars[i].label).width / 2;
        g.fillText(bars[i].label, Math.max(L - 8 + half, Math.min(w - half, L + (i + 0.5) * bw)), h - 10);
      }
    },
  };
}
function bind(p) {
  let start = null;
  const cv = p.cv, px = e => Math.max(L, Math.min(cv.clientWidth - R, e.clientX - cv.getBoundingClientRect().left));
  const dragging = e => start != null && Math.abs(px(e) - start) > 5;
  cv.onpointerdown = e => { if (p.zoom && e.pointerType === 'mouse' && e.button === 0) { start = px(e); cv.setPointerCapture(e.pointerId); } };
  cv.onpointermove = e => {
    if (!p.count) return;
    const i = p.index(px(e), cv.clientWidth), t = p.tip(i), tip = $('tip');
    p.draw(i, dragging(e) ? [start, px(e)] : null);
    tip.replaceChildren(el('div', t.title), ...t.rows.map(([c, name, v]) => { const d = el('div'); d.append(keyFor(c), el('b', v), ' ' + name); return d; }));
    tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, e.clientX + 14)) + 'px';
    tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
  };
  cv.onpointerup = e => {
    if (start == null) return;
    const far = dragging(e), a = p.index(start, cv.clientWidth), b = p.index(px(e), cv.clientWidth);
    start = null;
    if (!far || a === b) return;
    $('preset').value = 'custom';
    $('from').value = p.solve(Math.min(a, b));
    $('to').value = p.solve(Math.max(a, b));
    $('tip').hidden = true;
    render();
  };
  cv.onpointercancel = () => { start = null; };
  cv.onpointerleave = () => { $('tip').hidden = true; p.draw(); };
  if (p.zoom) cv.ondblclick = () => { $('preset').value = 'all'; $('tip').hidden = true; resetRange(); render(); };
}
const draw = () => plots.forEach(p => { if (p.cv.clientWidth) p.draw(); });

/* ---------- events ---------- */
$('open').onclick = () => $('file').click();
$('file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; importFiles(f); };
$('paste').onclick = () => { $('ptext').value = ''; $('dlg').returnValue = ''; $('dlg').showModal(); $('ptext').focus(); };
$('cancel').onclick = () => $('dlg').close('');
$('dlg').onclose = () => {
  if ($('dlg').returnValue !== 'ok') return;
  const name = $('pname').value.trim() || 'Pasted', text = $('ptext').value;
  importAll([{ name, read: async () => Import.fromText(text, name) }]);
};
// In-app replacement for confirm(), which some embedded browsers silently suppress.
function ask(text, yes, no = 'Cancel') {
  return new Promise(done => {
    const d = $('ask');
    $('asktext').textContent = text;
    $('askyes').textContent = yes;
    $('askno').textContent = no;
    d.returnValue = '';
    $('askyes').onclick = () => d.close('yes');
    $('askno').onclick = () => d.close('');
    d.onclose = () => done(d.returnValue === 'yes');
    d.showModal();
    $('askno').focus();
  });
}
$('remove').onclick = async () => {
  const v = $('session').value;
  if (WCA.isWca(v)) return WCA.removeAll();
  if (!(await ask(`Remove "${sessions[+v].name}" from Cubestats? Your original files are not touched.`, 'Remove'))) return;
  sessions.splice(+v, 1);
  fillSessions(0);
  say((await save()) ? '' : SAVE_FAILED);
};
$('export').onclick = () => {
  const cell = v => (Number.isNaN(v) ? '' : v === Infinity ? 'DNF' : (v / 1000).toFixed(3));
  const v = $('session').value, q = s => `"${s.replace(/"/g, '""')}"`, wca = view.solves.some(s => s.src === 'wca');
  const where = s => { const r = WCA.roundOf(s, v); return [r ? 'In comp' : 'Out of comp', r ? q(r.comp) : '']; };
  const lines = [['No.', 'Date', ...(wca ? ['Source', 'Competition'] : []), ...view.series.map(s => s.label)].join(',')];
  view.solves.forEach((s, i) => lines.push([view.lo + i, s.date == null ? '' : new Date(s.date).toISOString(), ...(wca ? where(s) : []), ...view.series.map(r => cell(r.vals[i]))].join(',')));
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'cubestats.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('filters').onsubmit = e => e.preventDefault();
$('sizelist').onchange = e => {
  e.stopPropagation();
  setSizes([...$('sizelist').querySelectorAll(':checked')].map(c => +c.value));
};
$('custom').onchange = e => e.stopPropagation();
$('custom').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addSize(); } };
$('addsize').onclick = addSize;
addEventListener('pointerdown', e => { if (!$('sizemenu').contains(e.target)) $('sizemenu').open = false; });
$('sizemenu').onkeydown = e => { if (e.key === 'Escape') { $('sizemenu').open = false; $('sizesum').focus(); } };
$('filters').onchange = e => {
  const id = e.target.id;
  if (id === 'from' || id === 'to') $('preset').value = 'custom';
  if (id === 'session' && $('preset').value === 'custom') $('preset').value = 'all';
  if (id === 'wcaevent') WCA.link();
  if (id === 'wcaevent' || id === 'show') { if ($('preset').value === 'custom') $('preset').value = 'all'; }
  if (id === 'session' || id === 'wcaevent') WCA.syncFilters();
  resetRange();
  render();
  saveSettings();
};
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('over'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('over'); });
addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('over');
  if (e.dataTransfer.files.length) importFiles([...e.dataTransfer.files]);
});
new ResizeObserver(draw).observe(document.body);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
WCA.init();
(async () => {
  $('sizes').value = '5, 12, 50, 100';
  try {
    const s = await getKV('settings');
    if (s) for (const f of FIELDS) if (s[f] != null) $(f).value = s[f];
    sessions = ((await getKV('sessions')) || []).map(s => (s.id ? s : { ...s, id: newId() })); // ids let devices recognise the same session
    WCA.load(await getKV('wca'));
  } catch { say('This browser cannot save data between visits.'); }
  fillSizes();
  fillSessions(0);
  if (sessions.length) await save(); // keeps newly given ids
  Sync.loaded();
})();
