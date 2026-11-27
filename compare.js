'use strict';
/* Charts comparing practice (out of comp) with WCA competitions (in comp). Uses the chart helpers in app.js at call time. */
const Compare = (() => {
  const OUT = '--s1', IN = '--s2', DAY = 864e5;
  const finished = l => l.filter(Number.isFinite);
  const avg = l => Stats.summary(l).average; // the 5% trimmed average used everywhere else
  const monthOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const short = s => (s.length > 14 ? s.slice(0, 13) + '…' : s);

  /* ---------- two chart shapes ---------- */
  // Lines over named points. NaN leaves a gap, or with connect the line joins the points either side of it.
  // zero: draw a line at 0 for values that can be negative.
  function lines(points, series, fmt, zero, connect) {
    const n = points.length, all = series.flatMap(s => s.vals.filter(Number.isFinite));
    let min = Math.min(...all, ...(zero ? [0] : [])), max = Math.max(...all, ...(zero ? [0] : []));
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.1 || 1;
    min = zero || min - pad < 0 ? min - pad : Math.max(0, min - pad);
    max += pad;
    return {
      count: all.length ? n : 0,
      index: (px, w) => Math.max(0, Math.min(n - 1, Math.round((px - L) / (w - L - R) * (n - 1)))),
      tip: i => ({ title: points[i].tip, rows: series.map(s => [s.color, s.name, Number.isFinite(s.vals[i]) ? fmt(s.vals[i]) : '–']) }),
      draw(hover) {
        const { g, w, h, pw, ph } = setup(this);
        if (!all.length) return noData(g, w, h);
        const x = i => L + (n > 1 ? i / (n - 1) : 0.5) * pw, y = v => T + (max - v) / (max - min) * ph;
        yAxis(g, w, y, ticks(min, max, 5).out, fmt);
        if (zero) { g.strokeStyle = css('--ink2'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(L, y(0)); g.lineTo(w - R, y(0)); g.stroke(); }
        for (const s of series) {
          g.strokeStyle = g.fillStyle = css(s.color);
          g.lineWidth = 2;
          g.beginPath();
          let pen = false;
          s.vals.forEach((v, i) => {
            if (!Number.isFinite(v)) { if (!connect) pen = false; return; }
            if (pen) g.lineTo(x(i), y(v)); else g.moveTo(x(i), y(v));
            pen = true;
          });
          g.stroke();
          if (n <= 60 || connect) s.vals.forEach((v, i) => { if (Number.isFinite(v)) { g.beginPath(); g.arc(x(i), y(v), 3, 0, 7); g.fill(); } });
        }
        if (hover != null) { g.strokeStyle = css('--ink2'); g.lineWidth = 1; g.beginPath(); g.moveTo(x(hover), T); g.lineTo(x(hover), T + ph); g.stroke(); }
        g.fillStyle = css('--ink2');
        g.textAlign = 'center';
        const every = Math.ceil(n / Math.max(1, Math.floor(pw / 90)));
        for (let i = 0; i < n; i += every) g.fillText(points[i].label, Math.max(L + 30, Math.min(w - R - 30, x(i))), h - 10);
      },
    };
  }
  // Bars side by side for each group: one bar per series.
  function bars(groups, series, fmt) {
    const n = groups.length, k = series.length, max = Math.max(...series.flatMap(s => s.vals.filter(Number.isFinite)), 0) || 1;
    return {
      count: n,
      index: (px, w) => Math.max(0, Math.min(n - 1, Math.floor((px - L) / (w - L - R) * n))),
      tip: i => ({ title: groups[i].tip, rows: series.map(s => [s.color, s.name, Number.isFinite(s.vals[i]) ? fmt(s.vals[i]) : '–']) }),
      draw(hover) {
        const { g, w, h, pw, ph } = setup(this);
        if (!n) return noData(g, w, h);
        const y = v => T + (1 - v / (max * 1.08)) * ph, bw = pw / n, gap = Math.min(16, bw * 0.2), each = Math.max(1, (bw - gap) / k - (bw > 12 ? 2 : 0));
        yAxis(g, w, y, ticks(0, max * 1.08, 4).out, fmt);
        groups.forEach((_, i) => series.forEach((s, j) => {
          const v = s.vals[i];
          if (!Number.isFinite(v) || v <= 0) return;
          const H = T + ph - y(v), r = Math.max(0, Math.min(4, each / 2, H));
          g.globalAlpha = hover == null || hover === i ? 1 : 0.55;
          g.fillStyle = css(s.color);
          g.beginPath(); g.roundRect(L + i * bw + gap / 2 + j * (each + (bw > 12 ? 2 : 0)), y(v), each, H, [r, r, 0, 0]); g.fill();
        }));
        g.globalAlpha = 1;
        g.fillStyle = css('--ink2');
        g.textAlign = 'center';
        const every = Math.ceil(n / Math.max(1, Math.floor(pw / 90)));
        for (let i = 0; i < n; i += every) g.fillText(groups[i].label, L + (i + 0.5) * bw, h - 10);
      },
    };
  }

  /* ---------- the six comparisons ---------- */
  // pair: { outSolves, inSolves, toMs, v, dnfMode, digits } from WCA.renderInto
  function cards({ outSolves, inSolves, toMs, v, dnfMode, digits }) {
    const fmt = x => format(x, digits), sec = x => format(x, 2), pct = x => `${x.toFixed(x < 10 && x % 1 ? 1 : 0)}%`;
    const outT = outSolves.map(toMs), inT = inSolves.map(toMs), outOk = finished(outT), inOk = finished(inT);
    const dated = outSolves.filter(s => s.date != null), list = [];
    const legend = [[OUT, 'Out of comp'], [IN, 'In comp']];

    // per competition: its official best average, and the practice average from the 30 days before it
    const comps = new Map();
    for (const s of inSolves) {
      const r = WCA.roundOf(s, v);
      if (!r) continue;
      const c = comps.get(r.id) || { name: r.comp, start: r.start ?? r.date, date: r.date, best: Infinity };
      if (!Number.isNaN(r.avg)) c.best = Math.min(c.best, r.avg);
      comps.set(r.id, c);
    }
    const practice = dated.map(s => ({ d: s.date, t: toMs(s) })).filter(s => Number.isFinite(s.t)).sort((a, b) => a.d - b.d);
    const at = x => { let lo = 0, hi = practice.length; while (lo < hi) { const m = (lo + hi) >> 1; if (practice[m].d < x) lo = m + 1; else hi = m; } return lo; };
    const paired = [...comps.values()].filter(c => c.start != null && Number.isFinite(c.best)).sort((a, b) => a.start - b.start).map(c => {
      const part = practice.slice(at(c.start - 30 * DAY), at(c.start)).map(s => s.t);
      return { ...c, before: part.length >= 5 ? avg(part) : NaN }; // fewer than 5 practice solves is too few to compare
    }).filter(c => Number.isFinite(c.before));

    // 1. averages over time, month by month
    if (dated.length) {
      const by = new Map(), add = (k, side, t) => { if (!by.has(k)) by.set(k, { out: [], in: [] }); by.get(k)[side].push(t); };
      for (const s of dated) if (Number.isFinite(toMs(s))) add(monthOf(s.date), 'out', toMs(s));
      for (const s of inSolves) if (s.date != null && Number.isFinite(toMs(s))) add(monthOf(s.date), 'in', toMs(s));
      const months = [...by.keys()].sort(), first = months[0], last = months.at(-1), keys = [];
      for (let d = new Date(first + '-01T12:00:00'); monthOf(d) <= last; d.setMonth(d.getMonth() + 1)) keys.push(monthOf(d));
      const vals = side => keys.map(k => (by.get(k)?.[side].length ? avg(by.get(k)[side]) : NaN));
      list.push(['Averages over time, month by month', lines(keys.map(k => ({ label: k, tip: k })), [{ name: 'Out of comp', color: OUT, vals: vals('out') }, { name: 'In comp', color: IN, vals: vals('in') }], sec, false, true), legend]); // months without solves are bridged
    }
    // 2. each competition next to the month of practice before it
    if (paired.length) {
      list.push(['Each competition vs the 30 days before', bars(paired.map(c => ({ label: short(c.name), tip: `${c.name}, ${dayKey(new Date(c.date))}` })),
        [{ name: 'Practice, 30 days before', color: OUT, vals: paired.map(c => c.before) }, { name: 'Best official average', color: IN, vals: paired.map(c => c.best) }], sec),
      [[OUT, 'Practice, 30 days before'], [IN, 'Best official average']]]);
      // 3. the gap between them; above zero is slower in competition
      list.push(['Competition gap (above the line: slower in comp)', lines(paired.map(c => ({ label: dayKey(new Date(c.date)), tip: c.name })),
        [{ name: 'Comp minus practice', color: IN, vals: paired.map(c => c.best - c.before) }], x => (x > 0 ? '+' : x < 0 ? '−' : '') + sec(Math.abs(x)), true),
      [[IN, 'Comp minus practice']]]);
    }
    // 4. consistency: spread and DNF rate, as two charts because they use different units
    const so = Stats.summary(outT), si = Stats.summary(inT);
    list.push(['Consistency: spread (standard deviation)', bars([{ label: 'Std. deviation', tip: 'Standard deviation of finished solves' }],
      [{ name: 'Out of comp', color: OUT, vals: [so.sd] }, { name: 'In comp', color: IN, vals: [si.sd] }], sec), legend]);
    list.push(['Consistency: DNF rate', bars([{ label: 'DNF rate', tip: 'Share of solves that were DNF' }],
      [{ name: 'Out of comp', color: OUT, vals: [so.n ? 100 * so.dnf / so.n : NaN] }, { name: 'In comp', color: IN, vals: [si.n ? 100 * si.dnf / si.n : NaN] }], pct), legend]);
    // 5. best and worst
    const bestOutAvg = Stats.records(Stats.rolling(outT, 5, dnfMode)).best, bestInAvg = Math.min(...[...comps.values()].map(c => c.best));
    list.push(['Best and worst', bars([{ label: 'Best single', tip: 'Best single' }, { label: 'Best average', tip: 'Best average of 5 (in comp: best official average)' }, { label: 'Worst single', tip: 'Worst finished single' }],
      [{ name: 'Out of comp', color: OUT, vals: [so.best, bestOutAvg, so.worst] }, { name: 'In comp', color: IN, vals: [si.best, Number.isFinite(bestInAvg) ? bestInAvg : NaN, si.worst] }], sec), legend]);
    // 6. how often competition solves beat each practice level
    if (outOk.length >= 10 && inT.length) {
      const sorted = [...outOk].sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(p / 100 * sorted.length))];
      const levels = [10, 25, 50, 75, 90];
      const name = p => (p === 50 ? 'your practice median' : p < 50 ? `your fastest ${p}% in practice` : `your slowest ${100 - p}% in practice`);
      list.push(['How often you beat your practice times in competition', bars(levels.map(p => ({ label: p === 50 ? 'Median' : p < 50 ? `Fastest ${p}%` : `Slowest ${100 - p}%`, tip: `Faster than ${sec(q(p))}, the cut-off for ${name(p)}` })),
        [{ name: 'of practice solves', color: OUT, vals: levels }, { name: 'of competition solves', color: IN, vals: levels.map(p => 100 * inT.filter(t => t < q(p)).length / inT.length) }], pct),
      [[OUT, 'Practice'], [IN, 'Competition']],
      'Each pair of bars is a practice time. The bars show what share of your solves beat it: practice on the left, competition on the right. An orange bar taller than the blue one means you beat that time more often in competition.']);
    }
    return list;
  }
  return { cards };
})();
