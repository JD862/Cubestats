'use strict';
/* World Cube Association results: download, in-comp / out-of-comp views and comparison. Uses helpers from app.js at call time. */
const WCA = (() => {
  const API = 'https://www.worldcubeassociation.org/api/v0/persons/';
  const EVENTS = {
    333: '3x3x3', 222: '2x2x2', 444: '4x4x4', 555: '5x5x5', 666: '6x6x6', 777: '7x7x7', '333bf': '3x3 blindfolded', '333oh': '3x3 one-handed',
    clock: 'Clock', minx: 'Megaminx', pyram: 'Pyraminx', skewb: 'Skewb', sq1: 'Square-1', '444bf': '4x4 blindfolded', '555bf': '5x5 blindfolded',
    '333ft': '3x3 with feet', magic: 'Magic', mmagic: 'Master Magic',
  };
  const NOT_TIMES = new Set(['333fm', '333mbf', '333mbo']); // results are moves or points, not times
  const ROUNDS = { h: 'Qualification', 0: 'Qualification', 1: 'Round 1', d: 'Round 1', 2: 'Round 2', e: 'Round 2', 3: 'Round 3', g: 'Round 3', b: 'B final', f: 'Final', c: 'Final' };
  const ORDER = ['h', '0', '1', 'd', '2', 'e', '3', 'g', 'b', 'f', 'c'];
  let data = null; // { id, name, events: { [event]: { rounds, solves } } }

  const day = (s, time) => (s ? new Date(`${s}T${time}`).getTime() : null);
  const official = v => (v > 0 ? v * 10 : v === 0 ? NaN : Infinity); // centiseconds to ms, 0 = none, negative = DNF/DNS

  function build(results, competitions) {
    if (!Array.isArray(results) || !results.some(r => r && r.event_id && Array.isArray(r.attempts))) throw new Error('this is not a WCA results file');
    const comps = new Map((competitions || []).map(c => [c.id, c])), events = {}, left = new Set();
    const rows = results.filter(r => r && r.event_id && Array.isArray(r.attempts)).map((r, i) => {
      const c = comps.get(r.competition_id);
      return { r, i, start: day(c?.start_date, '00:00:00'), end: day(c?.end_date, '12:00:00'), comp: c?.short_name || c?.name || String(r.competition_id) };
    });
    rows.sort((a, b) => (a.end ?? 0) - (b.end ?? 0) || (a.r.competition_id === b.r.competition_id ? ORDER.indexOf(a.r.round_type_id) - ORDER.indexOf(b.r.round_type_id) : a.i - b.i));
    for (const { r, start, end, comp } of rows) {
      if (NOT_TIMES.has(r.event_id)) { left.add(r.event_id); continue; }
      const ev = (events[r.event_id] ||= { rounds: [], solves: [] }), k = ev.rounds.length;
      ev.rounds.push({ id: String(r.competition_id), comp, start, date: end, round: ROUNDS[r.round_type_id] || String(r.round_type_id), avg: official(r.average), best: official(r.best), pos: r.pos });
      for (const a of r.attempts) {
        if (a === 0 || a === -2) continue; // no attempt, or DNS
        ev.solves.push({ t: a > 0 ? a * 10 : 0, pen: a > 0 ? '' : 'DNF', date: end == null ? null : end + ev.solves.length, src: 'wca', r: k });
      }
    }
    const p = results.find(r => r?.wca_id) || {};
    return { id: String(p.wca_id || ''), name: String(p.name || 'WCA'), events, left: left.size };
  }
  async function getJSON(url) {
    let res;
    try { res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }); } catch { throw new Error('could not reach the WCA website; check your connection'); }
    if (res.status === 404) throw new Error('no WCA profile has that ID');
    if (!res.ok) throw new Error(`the WCA website answered with error ${res.status}`);
    return res.json();
  }
  async function download(id) {
    const [results, comps] = await Promise.all([getJSON(`${API}${id}/results`), getJSON(`${API}${id}/competitions`)]);
    if (!results.length) throw new Error('this profile has no results yet');
    return build(results, comps);
  }
  const total = () => (data ? Object.values(data.events).reduce((a, e) => a + e.solves.length, 0) : 0);
  async function use(d) {
    data = d;
    const ok = await setKV('wca', d).then(() => true, () => false);
    const practice = linked() || sessions[+$('session').value] || sessions[0];
    fillSessions(practice ? sessions.indexOf(practice) : firstEvent());
    say(`Imported ${total().toLocaleString()} WCA solves for ${d.name}.` + (d.left ? ' Fewest moves and multi-blind are left out because they are not times.' : '') +
      (sessions.length ? ' Choose a "WCA event" to compare with the selected session.' : '') + (ok ? '' : ' ' + SAVE_FAILED));
  }

  const eventIds = () => (data ? [...Object.keys(EVENTS), ...Object.keys(data.events)].filter((e, i, a) => a.indexOf(e) === i && data.events[e]) : []);
  const eventName = e => EVENTS[e] || e;
  const firstEvent = () => { const ids = eventIds(); return ids.length ? 'wca:' + (ids.includes('333') ? '333' : ids[0]) : ''; };
  const isWca = v => String(v).startsWith('wca:');
  const eventOf = v => data?.events[v.slice(4)];
  const linked = () => { const v = $('session').value; return v === '' || isWca(v) ? null : sessions[+v]; };

  function addOptions(select) {
    if (!data) return;
    const g = document.createElement('optgroup');
    g.label = `WCA results – ${data.name}`;
    for (const e of eventIds()) g.append(new Option(`${eventName(e)} (${data.events[e].solves.length.toLocaleString()})`, 'wca:' + e));
    select.append(g);
  }
  // Shows or hides the two WCA filters for the selected session.
  function syncFilters() {
    const s = linked(), on = !!(data && s);
    const ids = eventIds();
    if (on && s.wca && !ids.includes(s.wca)) ids.push(s.wca); // set in the session manager, no WCA results for it
    $('wcaevent').replaceChildren(new Option('None', ''), ...ids.map(e => new Option(eventName(e), e)));
    $('wcaevent').value = on && s.wca ? s.wca : '';
    $('linkbox').hidden = !on;
    $('showbox').hidden = !on || !data.events[s.wca];
  }
  function link() {
    const s = linked();
    if (!s) return;
    s.wca = $('wcaevent').value;
    save().then(ok => { if (!ok) say(SAVE_FAILED); });
  }
  // Solves for the current selection, given the practice solves of the selected session.
  function solvesFor(v, practice) {
    if (isWca(v)) return eventOf(v)?.solves ?? [];
    const ev = data?.events[linked()?.wca], show = $('show').value;
    if (!ev || show === 'out') return practice;
    if (show === 'in') return ev.solves;
    const all = ev.solves.concat(practice);
    return all.every(s => s.date != null) ? all.sort((a, b) => a.date - b.date) : all;
  }

  /* ---------- views ---------- */
  function table(head, rows) {
    const t = el('table'), tr = (cells, tag) => { const r = el('tr'); r.append(...cells.map(c => el(tag, c))); return r; };
    t.append(tr(head, 'th'), ...rows.map(r => tr(r, 'td')));
    const box = el('div', null, 'scroll');
    box.append(t);
    return box;
  }
  const signed = (a, b, digits) => (Number.isFinite(a) && Number.isFinite(b) ? (a > b ? '+' : a < b ? '−' : '') + format(Math.abs(a - b), digits) : '–');

  function renderInto(box, solves, toMs, sizes, dnfMode, digits) {
    box.replaceChildren();
    const v = $('session').value, ev = isWca(v) ? eventOf(v) : data?.events[linked()?.wca];
    if (!ev) return null;
    const inC = solves.filter(s => s.src === 'wca'), out = solves.filter(s => s.src !== 'wca');
    if (!inC.length) return null;
    const fmt = x => format(x, digits), used = [...new Set(inC.map(s => s.r))].map(k => ev.rounds[k]);
    let best = Infinity;
    for (const r of used) if (r.avg < best) best = r.avg;
    const both = out.length > 0;

    const stats = list => {
      const t = list.map(toMs), s = Stats.summary(t), dnf = list.filter(x => x.pen === 'DNF').length, o = {
        Solves: s.n.toLocaleString(), 'Best single': s.best, 'Average (5% trimmed)': s.average, Median: s.median, 'Std. deviation': s.sd,
        'DNF rate': `${(s.n ? 100 * dnf / s.n : 0).toFixed(1)}%`,
      };
      for (const n of sizes) o[`Best average of ${n}`] = Stats.records(Stats.rolling(t, n, dnfMode)).best;
      return o;
    };
    if (both) {
      const a = stats(out), b = stats(inC), c = stats(solves), show = x => (typeof x === 'string' ? x : fmt(x));
      const rows = Object.keys(a).map(k => [k, show(a[k]), show(b[k]), show(c[k]), typeof a[k] === 'string' ? '' : signed(b[k], a[k], digits)]);
      const c1 = el('section', null, 'card');
      c1.append(el('h2', 'In comp and out of comp'), table(['', 'Out of comp', 'In comp', 'Both', 'In comp vs out'], rows));
      box.append(c1);
    }

    const c2 = el('section', null, 'card'), comps = new Set(used.map(r => r.id)).size;
    c2.append(el('h2', 'WCA competitions'));
    c2.append(el('p', `${comps.toLocaleString()} competitions, ${used.length.toLocaleString()} rounds. Best official average: ${fmt(best)}.`, 'note'));
    const practice = linked() ? linked().solves.filter(s => s.date != null && s.pen !== 'DNF').sort((a, b) => a.date - b.date) : [];
    const dates = practice.map(s => s.date);
    const at = x => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] < x) lo = m + 1; else hi = m; } return lo; };
    const before = r => { // practice average over the 30 days before a competition
      if (r.start == null) return NaN;
      const part = practice.slice(at(r.start - 30 * 864e5), at(r.start));
      return part.length ? Stats.summary(part.map(toMs)).average : NaN;
    };
    const cache = new Map(), withPractice = practice.length > 0;
    const rows = used.slice().reverse().map(r => {
      if (!cache.has(r.id)) cache.set(r.id, withPractice ? before(r) : NaN);
      const p = cache.get(r.id);
      return [r.comp, r.date == null ? '–' : dayKey(new Date(r.date)), r.round, r.pos ? '#' + r.pos : '–', fmt(r.best), fmt(r.avg), ...(withPractice ? [fmt(p), signed(r.avg, p, digits)] : [])];
    });
    const t = table(['Competition', 'Date', 'Round', 'Place', 'Single', 'Official average', ...(withPractice ? ['Practice, 30 days before', 'Comp vs practice'] : [])], rows);
    t.classList.add('tall');
    c2.append(t);
    box.append(c2);
    return both ? { out: out.map(toMs), in: inC.map(toMs) } : null;
  }

  // Share of solves per time bucket, practice beside competition.
  function compareChart(a, b) {
    const ok = [a, b].map(l => l.filter(Number.isFinite)), all = ok[0].concat(ok[1]).sort((x, y) => x - y);
    let bins = [], max = 1;
    if (ok[0].length && ok[1].length) {
      const p98 = all[Math.floor((all.length - 1) * 0.98)], raw = Math.max((p98 - all[0]) / 14, 10), mag = 10 ** Math.floor(Math.log10(raw));
      const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= raw), base = Math.floor(all[0] / step), last = Math.floor(p98 / step);
      const f = k => format(k * step, step < 100 ? 2 : step < 1000 ? 1 : 0);
      for (let k = base; k <= last + 1; k++) bins.push({ label: k > last ? 'slower' : f(k), tip: k > last ? `${f(k)} or slower` : `${f(k)} to ${f(k + 1)}`, v: [0, 0] });
      ok.forEach((l, i) => { for (const t of l) bins[Math.min(Math.floor(t / step) - base, bins.length - 1)].v[i] += 100 / l.length; });
      max = Math.max(...bins.flatMap(x => x.v));
    }
    const n = bins.length, pct = v => v.toFixed(1) + '%';
    return {
      count: n,
      index: (px, w) => Math.max(0, Math.min(n - 1, Math.floor((px - L) / (w - L - R) * n))),
      tip: i => ({ title: bins[i].tip, rows: [['--s1', 'of out-of-comp solves', pct(bins[i].v[0])], ['--s2', 'of in-comp solves', pct(bins[i].v[1])]] }),
      draw(hover) {
        const { g, w, h, pw, ph } = setup(this);
        if (!n) return noData(g, w, h);
        const y = v => T + (1 - v / (max * 1.05)) * ph, bw = pw / n, half = Math.max(1, (bw - 6) / 2);
        yAxis(g, w, y, ticks(0, max, 4, true).out, v => v + '%');
        bins.forEach((b, i) => b.v.forEach((v, k) => {
          if (!v) return;
          const H = T + ph - y(v), r = Math.max(0, Math.min(4, half / 2, H));
          g.globalAlpha = hover == null || hover === i ? 1 : 0.55;
          g.fillStyle = css(k ? '--s2' : '--s1');
          g.beginPath(); g.roundRect(L + i * bw + 2 + k * (half + 2), y(v), half, H, [r, r, 0, 0]); g.fill();
        }));
        g.globalAlpha = 1;
        g.fillStyle = css('--ink2');
        g.textAlign = 'center';
        const every = Math.ceil(n / Math.max(1, Math.floor(pw / 60)));
        for (let i = 0; i < n; i += every) g.fillText(bins[i].label, L + (i + 0.5) * bw, h - 10);
      },
    };
  }

  async function removeAll() {
    if (!(await ask(`Remove all WCA results for ${data.name} from Cubestats? You can download them again.`, 'Remove'))) return;
    data = null;
    const ok = await setKV('wca', null).then(() => true, () => false);
    fillSessions(0);
    say(ok ? '' : SAVE_FAILED);
  }
  function init() {
    $('wcaopen').onclick = () => { $('wcaid').value = data?.id || ''; $('wcaerr').textContent = ''; $('wcadlg').showModal(); $('wcaid').focus(); };
    $('wcacancel').onclick = () => $('wcadlg').close();
    $('wcaform').onsubmit = async e => {
      e.preventDefault();
      const id = $('wcaid').value.trim().toUpperCase();
      if (!/^\d{4}[A-Z]{4}\d{2}$/.test(id)) { $('wcaerr').textContent = 'A WCA ID looks like 2009ABCD01.'; return; }
      $('wcago').disabled = true;
      $('wcaerr').textContent = 'Downloading…';
      try { const d = await download(id); $('wcadlg').close(); await use(d); } catch (err) { $('wcaerr').textContent = 'Import failed: ' + err.message + '.'; }
      $('wcago').disabled = false;
    };
  }
  return { build, use, init, addOptions, syncFilters, link, solvesFor, renderInto, compareChart, removeAll, isWca, firstEvent, eventName, allEvents: () => [...new Set([...Object.keys(EVENTS), ...eventIds()])], has: () => !!data, load: d => { data = d || null; },
    roundOf: (s, v) => (s.src === 'wca' ? (isWca(v) ? eventOf(v) : data?.events[linked()?.wca])?.rounds[s.r] : null) };
})();
