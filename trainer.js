'use strict';
/* Alg trainer page and the sidebar that switches pages. Uses helpers from app.js and cube.js. */
const Trainer = (() => {
  const COLORS = { U: '#f2d21b', D: '#f4f4f0', F: '#1f9d4d', B: '#2a62d6', R: '#f07c1a', L: '#d0312d' };
  const GREY = '#77777a', LAST_LAYER = ['oll', 'eoll', 'cpll', 'pll', 'ort', 'cll', 'pbl'], TWO = ['ort', 'cll', 'pbl'];
  // results: { caseId: [{ t, d }] } with t in ms, or null for a miss. off: case ids left out of training.
  // groups: the group last used in each event.
  const DEFAULTS = { event: '3x3', groups: { '3x3': 'PLL' }, order: 'random', band: 'all', sort: 'set', learnt: [], show: 'all', picture: true, listBand: 'all', listShow: 'all', caseGroup: 'all', listGroup: 'all', listPicture: true, off: [], results: {}, edits: {}, alt: {}, useAlt: [], custom: [] };
  let st = structuredClone(DEFAULTS);
  let cur = null, queue = [], phase = 'idle', started = 0, frame = 0, last = null, editing = null, ready = false;

  const store = () => ready && setKV('trainer', st).catch(() => { $('trmsg').textContent = SAVE_FAILED; });
  const groupNames = () => [...Object.keys(ALG_EVENTS[st.event]), 'Custom', 'Learnt'];
  const group = () => (groupNames().includes(st.groups[st.event]) ? st.groups[st.event] : groupNames()[0]);
  const customCases = () => st.custom.filter(c => (c.event || '3x3') === st.event);
  const cases = () => {
    if (group() === 'Custom') return customCases();
    if (group() === 'Learnt') return [...Object.values(ALG_EVENTS[st.event]).flat(), ...customCases()].filter(isLearnt); // every learnt case of the event
    return ALG_EVENTS[st.event][group()];
  };
  // Every case has a main alg and may have a secondary one (st.alt); useAlt lists the cases trained with the secondary.
  const mainAlg = c => st.edits[c.id] || c.alg;
  const options = c => [...new Set([...c.alts, mainAlg(c), st.alt[c.id]].filter(Boolean))]; // keeps algs typed in earlier
  const usesAlt = c => !!st.alt[c.id] && st.useAlt.includes(c.id);
  const algOf = c => (usesAlt(c) ? st.alt[c.id] : mainAlg(c));
  const isLearnt = c => st.learnt.includes(c.id);
  const resultsOf = c => st.results[c.id] || [];
  const level = c => Cube.difficulty(algOf(c), st.event === 'OH');
  const bandOf = d => (d < 3.5 ? 'easy' : d < 5.5 ? 'medium' : 'hard');
  const sorted = () => st.order === 'easy' || st.order === 'hard';
  const byLevel = (a, b) => (st.order === 'hard' ? level(b) - level(a) : level(a) - level(b));
  const groupOf = c => (group() === 'Learnt' ? c.set || 'Custom' : c.group || 'No group'); // the Learnt set is grouped by set
  const caseGroups = () => [...new Set(cases().map(groupOf))];
  const matches = (c, band, show, grp) => (grp === 'all' || groupOf(c) === grp) && (band === 'all' || bandOf(level(c)) === band) && (show === 'all' || isLearnt(c) === (show === 'learnt'));
  // Cases to train: in the chosen difficulty, easiest or hardest first when that order is chosen.
  const visible = () => {
    const list = cases().filter(c => matches(c, st.band, st.show, st.caseGroup));
    return sorted() ? list.sort(byLevel) : list;
  };
  // The case list has its own filters and order; they never change what is trained.
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const SORTS = {
    name: byName, nameDesc: (a, b) => byName(b, a),
    diff: (a, b) => level(a) - level(b) || byName(a, b), diffDesc: (a, b) => level(b) - level(a) || byName(a, b),
  };
  const listed = () => {
    const list = cases().filter(c => matches(c, st.listBand, st.listShow, st.listGroup)), order = caseGroups();
    return list.sort(SORTS[st.sort] || ((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b))));
  };
  const active = () => visible().filter(c => !st.off.includes(c.id));
  function stats(c) {
    const r = resultsOf(c), t = r.filter(x => x.t != null).map(x => x.t), s = Stats.summary(t);
    return { n: r.length, miss: r.length - t.length, avg: s.average };
  }
  const setupState = (c, moves) => Cube.apply(c.kind === 'f2l' ? Cube.maskedF2L() : Cube.solved(), moves || Cube.invert(Cube.parse(algOf(c))));
  // How to draw a case: 'top', 'iso', or '' when a picture would not help.
  function view(c, state) {
    if (c.kind === 'f2l' || c.kind === 'pbl') return 'iso';
    if (c.kind) return c.kind === 'blind' ? '' : 'top';
    return st.event !== '2x2' && st.event !== 'Blind' && Cube.keepsF2L(state) ? 'top' : '';
  }
  function picture(c, state, size) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), two = TWO.includes(c.kind), iso = view(c, state) === 'iso';
    const add = (tag, attrs) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries({ ...attrs, stroke: '#0006', 'stroke-width': 0.03 })) e.setAttribute(k, v);
      svg.append(e);
    };
    const r = iso ? (two ? 2.1 : 3.1) : two ? 1.6 : 2.1;
    for (const [k, v] of Object.entries({ viewBox: `${-r} ${-r} ${2 * r} ${2 * r}`, width: size, height: size, role: 'img', 'aria-label': 'Picture of the case' })) svg.setAttribute(k, v);
    if (iso) {
      for (const q of Cube.isoView(state, two)) add('polygon', { points: q.pts.map(p => p.map(v => v.toFixed(3)).join()).join(' '), fill: q.f === 'X' ? GREY : COLORS[q.f] });
      return svg;
    }
    for (const q of Cube.topView(state)) {
      if (two && (!q.x || !q.y)) continue; // a 2x2 only has corners
      const corner = q.x && q.y, w = q.side === 'v' ? 0.3 : 0.94, h = q.side === 'h' ? 0.3 : 0.94, k = two ? 0.5 : 1, edge = two ? 1.22 : 1.72;
      const x = q.side === 'v' ? Math.sign(q.x) * edge : q.x * k, y = q.side === 'h' ? Math.sign(q.y) * edge : q.y * k;
      const orient = ['oll', 'eoll', 'ort'].includes(c.kind), grey = (orient && q.f !== 'U') || (c.kind === 'eoll' && corner) || (c.kind === 'cpll' && !corner);
      add('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 0.08, fill: grey ? GREY : COLORS[q.f] });
    }
    return svg;
  }

  /* ---------- choosing cases ---------- */
  function pick() {
    const list = active();
    if (!list.length) return null;
    if (st.order === 'recap' || sorted()) { // every selected case once, shuffled or by difficulty, then again
      queue = queue.filter(id => list.some(c => c.id === id));
      if (!queue.length) {
        queue = list.map(c => c.id);
        if (!sorted()) for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
      }
      const id = queue.shift();
      return list.find(c => c.id === id);
    }
    const pool = list.length > 1 && cur ? list.filter(c => c.id !== cur.c.id) : list;
    if (st.order === 'random') return pool[Math.floor(Math.random() * pool.length)];
    const avgs = pool.map(c => stats(c)), known = avgs.map(s => s.avg).filter(Number.isFinite), top = known.length ? Math.max(...known) : 1;
    // Weak cases first: new cases count as the slowest, misses add extra weight.
    const w = avgs.map(s => (Number.isFinite(s.avg) ? s.avg / top : 1) ** 2 + (s.n ? s.miss / s.n : 0) + 0.02);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    return pool[w.findIndex(x => (r -= x) < 0)] || pool.at(-1);
  }
  function next() {
    const c = pick();
    if (!c) { cur = null; return drawCase(); }
    const inv = Cube.invert(Cube.parse(algOf(c))), rnd = () => Math.floor(Math.random() * 4);
    let moves = inv;
    // A random angle and random U turn give many setups for one last-layer case; F2L only varies the U layer.
    if (LAST_LAYER.includes(c.kind) || (!c.kind && view(c, setupState(c)))) moves = [{ f: 'U', n: rnd() }, ...(c.kind === 'pbl' ? [{ f: 'D', n: rnd() }] : []), ...Cube.turnY(inv, rnd())];
    else if (c.kind === 'f2l') moves = [{ f: 'U', n: rnd() }, ...inv];
    moves = Cube.simplify(moves);
    cur = { c, moves, state: setupState(c, moves), shown: false };
    drawCase();
  }

  /* ---------- timer ---------- */
  function clock() {
    $('trtime').textContent = format(performance.now() - started, 1);
    frame = requestAnimationFrame(clock);
  }
  function press() {
    if (phase === 'running') return finish();
    if (phase !== 'idle' || !cur) return;
    phase = 'ready';
    $('trtime').textContent = '0.00';
    $('trtime').className = 'ready';
  }
  function release() {
    if (phase === 'stopped') phase = 'idle';
    if (phase !== 'ready') return;
    phase = 'running';
    $('trtime').className = '';
    started = performance.now();
    clock();
  }
  function cancel() {
    cancelAnimationFrame(frame);
    phase = 'idle';
    $('trtime').className = '';
    $('trtime').textContent = '0.00';
  }
  function finish() {
    cancelAnimationFrame(frame);
    const t = Math.round(performance.now() - started);
    phase = 'stopped';
    $('trtime').textContent = format(t);
    record(t);
  }
  function record(t) {
    const c = cur.c, id = c.id;
    (st.results[id] ||= []).push({ t, d: Date.now() });
    last = { id, name: c.name, alg: algOf(c), t };
    store();
    next();
    drawLast();
    drawList();
  }

  /* ---------- drawing ---------- */
  function drawCase() {
    $('trpic').replaceChildren();
    $('trname').textContent = '';
    $('tralg').textContent = '';
    for (const b of ['trshow', 'trskip', 'trmiss', 'trlearn']) $(b).disabled = !cur;
    $('trlearn').textContent = cur && isLearnt(cur.c) ? 'Learnt ✓' : 'Mark learnt';
    $('trlearn').setAttribute('aria-pressed', !!(cur && isLearnt(cur.c)));
    if (!cur) {
      $('trsetup').textContent = cases().length ? (visible().length ? 'Tick Train for at least one matching case below.' : 'No cases match the trainer’s filters.') : group() === 'Learnt' ? 'Mark cases as learnt and they will appear here.' : 'Add your own algs below to train them.';
      return;
    }
    $('trsetup').textContent = Cube.text(cur.moves) || '(already set up)';
    if (st.picture && view(cur.c, cur.state)) $('trpic').append(picture(cur.c, cur.state, 150));
    if (cur.c.kind === 'blind') $('trname').textContent = cur.c.name; // the letter is the prompt
    $('trshow').textContent = cur.shown ? 'Hide alg' : 'Show alg';
    if (cur.shown) { $('trname').textContent = cur.c.name; $('tralg').textContent = algOf(cur.c); }
  }
  function drawLast() {
    $('trlast').hidden = !last;
    if (!last) return;
    $('trlasttext').replaceChildren(el('b', last.t == null ? 'Missed' : format(last.t)), ` ${last.name}: ${last.alg}`);
  }
  function drawList() {
    const all = listed(), on = active(), done = all.flatMap(c => resultsOf(c)), times = done.filter(x => x.t != null).map(x => x.t), s = Stats.summary(times);
    const set = cases();
    $('trsum').textContent = `${set.filter(isLearnt).length} of ${set.length} learnt. Training ${on.length}, showing ${all.length}. ${done.length.toLocaleString()} attempts, average ${format(s.average)}, ${(done.length - times.length).toLocaleString()} missed.`;
    const head = el('tr');
    for (const h of ['Train', 'Learnt', 'Case', 'Group', 'Algorithm', 'Diff.', 'Tries', 'Avg', '']) head.append(el('th', h));
    let heading = null;
    $('trtable').replaceChildren(head, ...all.flatMap(c => {
      const extra = [];
      if (!SORTS[st.sort] && heading !== groupOf(c)) { // a heading above each case group in the default order
        heading = groupOf(c);
        const members = set.filter(x => groupOf(x) === heading), h = el('tr', null, 'trgroup'), th = el('th', `${heading} `);
        th.colSpan = 9;
        th.append(el('span', `${members.filter(isLearnt).length} of ${members.length} learnt`));
        h.append(th);
        extra.push(h);
      }
      const tr = el('tr'), cell = (...x) => { const td = el('td'); td.append(...x); tr.append(td); }, x = stats(c), box = el('input');
      box.type = 'checkbox';
      box.checked = !st.off.includes(c.id);
      box.setAttribute('aria-label', `Train ${c.name}`);
      box.onchange = () => {
        st.off = box.checked ? st.off.filter(i => i !== c.id) : [...st.off, c.id];
        box.blur();
        selectionChanged();
      };
      cell(box);
      const mark = el('input');
      mark.type = 'checkbox';
      mark.checked = isLearnt(c);
      mark.setAttribute('aria-label', `${c.name} learnt`);
      mark.onchange = () => { mark.blur(); setLearnt(c, mark.checked); };
      cell(mark);
      const wrap = el('div', null, 'trcase'), state = setupState(c);
      if (st.listPicture && view(c, state)) wrap.append(picture(c, state, 36));
      wrap.append(c.name);
      cell(wrap);
      cell(el('span', groupOf(c), 'trg'));
      if (editing === c.id) {
        const err = el('div', '', 'note'), box = el('div', null, 'treditor');
        err.setAttribute('role', 'alert');
        const field = (label, control) => { const l = el('label', label); l.append(control); box.append(l); return control; };
        // Built-in cases choose from known algs; custom cases have nothing to choose from, so they are typed.
        const pickAlg = none => {
          if (!c.kind) return el('input', null, 'tredit');
          const sel = el('select', null, 'tredit');
          if (none) sel.add(new Option('None', ''));
          for (const a of options(c)) sel.add(new Option(`${a}  (${Cube.difficulty(a, st.event === 'OH').toFixed(1)})`, a));
          return sel;
        };
        const main = field('Main alg', pickAlg(false)), alt = field('Secondary alg (optional)', pickAlg(true)), use = field('Train with', el('select', null, 'truse'));
        main.value = mainAlg(c);
        alt.value = st.alt[c.id] || '';
        use.append(new Option('Main alg', 'main'), new Option('Secondary alg', 'alt'));
        use.value = usesAlt(c) ? 'alt' : 'main';
        const save = () => { err.textContent = setAlgs(c, main.value, alt.value, use.value === 'alt'); };
        const close = () => { editing = null; drawList(); };
        for (const i of [main, alt]) i.onkeydown = e => { if (e.key === 'Enter' && i.tagName === 'INPUT') save(); };
        box.onkeydown = e => { if (e.key === 'Escape') close(); };
        const bar = el('div', null, 'actions'), ok = el('button', 'Save', 'primary'), no = el('button', 'Cancel');
        ok.type = no.type = 'button';
        ok.onclick = save;
        no.onclick = close;
        bar.append(ok, no);
        box.append(err, bar);
        cell(box);
      } else {
        const lines = [el('span', mainAlg(c), 'alg')];
        if (st.alt[c.id]) {
          lines.push(el('span', st.alt[c.id], 'alg'));
          lines[usesAlt(c) ? 0 : 1].classList.add('unused');
          lines[0].title = `Main alg${usesAlt(c) ? '' : ' (training with this)'}`;
          lines[1].title = `Secondary alg${usesAlt(c) ? ' (training with this)' : ''}`;
        }
        cell(...lines);
      }
      const d = level(c);
      cell(d.toFixed(1));
      cell(String(x.n));
      cell(format(x.avg));
      const menu = el('select');
      menu.setAttribute('aria-label', `Options for ${c.name}`);
      menu.append(new Option('…', ''), new Option('Edit algs', 'edit'));
      if (st.alt[c.id]) menu.add(new Option(usesAlt(c) ? 'Train with main alg' : 'Train with secondary alg', 'swap'));
      if (st.edits[c.id]) menu.add(new Option('Restore original main alg', 'restore'));
      if (x.n) menu.add(new Option('Clear times', 'clear'));
      if (!c.kind) menu.add(new Option('Remove', 'remove'));
      menu.onchange = () => { const v = menu.value; menu.value = ''; menu.blur(); option(v, c); };
      cell(menu);
      return [...extra, tr];
    }));
    if (editing) $('trtable').querySelector('.tredit')?.focus();
  }
  function setLearnt(c, yes) {
    st.learnt = st.learnt.filter(i => i !== c.id);
    if (yes) st.learnt.push(c.id);
    if (group() === 'Learnt') fillCaseGroups();
    selectionChanged();
    if (phase === 'idle') drawCase();
  }
  function selectionChanged() {
    queue = [];
    if (phase === 'idle' && !(cur && active().some(c => c.id === cur.c.id))) next();
    store();
    drawList();
  }

  /* ---------- editing ---------- */
  // Problem with an alg as text, or '' when it is fine. For built-in cases it must solve that same case.
  function check(text, c) {
    let moves;
    try { moves = Cube.parse(text); } catch (e) { return e.message + '.'; }
    if (!moves.length) return 'Enter at least one move.';
    if (!c || !c.kind) return '';
    if (c.kind === 'blind') return Cube.apply(Cube.solved(), moves).join() === Cube.apply(Cube.solved(), Cube.parse(c.alg)).join() ? '' : `That alg does not do the same as the original for ${c.name}.`;
    const inv = Cube.invert(Cube.parse(c.alg));
    for (let y = 0; y < (c.kind === 'f2l' ? 1 : 4); y++) {
      for (let a = 0; a < 4; a++) {
        const s = Cube.apply(Cube.solved(), [...Cube.turnY(inv, y), { f: 'U', n: a }, ...moves]);
        if (Cube.reached(c.kind, s)) return '';
      }
    }
    return `That alg does not solve ${c.name}.`;
  }
  function setAlgs(c, mainText, altText, useAlt) {
    const tidy = t => t.trim().replace(/[’‘`]/g, "'"), t = tidy(mainText), a = tidy(altText);
    const bad = check(t, c), badAlt = a ? (a === t ? 'Choose a different alg from the main one.' : check(a, c)) : useAlt ? 'Choose a secondary alg to train with it.' : '';
    if (bad) return 'Main alg: ' + bad;
    if (badAlt) return 'Secondary alg: ' + badAlt;
    if (!c.kind) c.alg = t;
    else if (t === c.alg) delete st.edits[c.id];
    else st.edits[c.id] = t;
    st.useAlt = st.useAlt.filter(i => i !== c.id);
    if (a) st.alt[c.id] = a; else delete st.alt[c.id];
    if (a && useAlt) st.useAlt.push(c.id);
    editing = null;
    if (cur?.c.id === c.id && phase === 'idle') next();
    store();
    drawList();
    return '';
  }
  async function option(op, c) {
    if (op === 'edit') { editing = c.id; return drawList(); }
    if (op === 'swap') st.useAlt = usesAlt(c) ? st.useAlt.filter(i => i !== c.id) : [...st.useAlt, c.id];
    if (op === 'restore') delete st.edits[c.id];
    if (op === 'clear') {
      if (!(await ask(`Clear all ${resultsOf(c).length} times for ${c.name}? This cannot be undone.`, 'Clear'))) return;
      delete st.results[c.id];
    }
    if (op === 'remove') {
      if (!(await ask(`Remove ${c.name} and its times? This cannot be undone.`, 'Remove'))) return;
      st.custom = st.custom.filter(x => x.id !== c.id);
      st.off = st.off.filter(i => i !== c.id);
      st.learnt = st.learnt.filter(i => i !== c.id);
      st.useAlt = st.useAlt.filter(i => i !== c.id);
      delete st.alt[c.id];
      fillCaseGroups();
      delete st.results[c.id];
    }
    if (last?.id === c.id && (op === 'clear' || op === 'remove')) { last = null; drawLast(); }
    if (cur?.c.id === c.id && op !== 'clear') next();
    store();
    drawList();
  }

  // Fills both case group menus, going back to All when a group is gone.
  function fillCaseGroups() {
    const names = caseGroups();
    for (const [id, k] of [['trcasegroup', 'caseGroup'], ['trlistgroup', 'listGroup']]) {
      if (!names.includes(st[k])) st[k] = 'all';
      $(id).replaceChildren(new Option('All', 'all'), ...names.map(n => new Option(n, n)));
      $(id).value = st[k];
    }
  }
  function refresh() {
    $('trmsg').textContent = '';
    cancel();
    queue = [];
    cur = null;
    editing = null;
    $('trevent').value = st.event;
    $('trset').replaceChildren(...groupNames().map(g => new Option(g, g)));
    $('trset').value = group();
    $('trhold').textContent = st.event === 'Blind'
      ? 'Do this setup on a solved cube, then run the alg for the letter. Letters are Speffz; buffers are DF for edges and UBL for corners.'
      : `Hold a solved ${st.event === '2x2' ? '2x2' : 'cube'} with yellow on top and green in front, then do this setup:`;
    $('trorder').value = st.order;
    $('trband').value = st.band;
    $('trsort').value = st.sort;
    $('trlearnt').value = st.show;
    $('trlistband').value = st.listBand;
    $('trlistshow').value = st.listShow;
    $('trlistpic').checked = st.listPicture;
    $('trpicture').checked = st.picture;
    fillCaseGroups();
    $('trcustom').hidden = group() !== 'Custom';
    next();
    drawLast();
    drawList();
  }

  /* ---------- pages ---------- */
  const onTrainer = () => !$('page-trainer').hidden;
  function showPage(name) {
    if (phase !== 'idle') cancel();
    for (const p of ['stats', 'trainer']) {
      $('page-' + p).hidden = p !== name;
      const b = $('nav-' + p);
      if (p === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    try { localStorage.setItem('cubestats-page', name); } catch { /* only a convenience */ }
    if (name === 'stats') draw();
  }

  async function init() {
    $('trevent').append(...Object.keys(ALG_EVENTS).map(e => new Option(e, e)));
    $('trevent').onchange = () => { st.event = $('trevent').value; $('trevent').blur(); refresh(); store(); };
    for (const p of ['stats', 'trainer']) $('nav-' + p).onclick = () => showPage(p);
    $('trset').onchange = () => { st.groups = { ...st.groups, [st.event]: $('trset').value }; $('trset').blur(); refresh(); store(); };
    $('trorder').onchange = () => { st.order = $('trorder').value; $('trorder').blur(); queue = []; if (phase === 'idle') next(); store(); drawList(); };
    $('trband').onchange = () => { st.band = $('trband').value; $('trband').blur(); selectionChanged(); };
    $('trcasegroup').onchange = () => { st.caseGroup = $('trcasegroup').value; $('trcasegroup').blur(); selectionChanged(); };
    $('trlearnt').onchange = () => { st.show = $('trlearnt').value; $('trlearnt').blur(); selectionChanged(); };
    $('trlearn').onclick = () => setLearnt(cur.c, !isLearnt(cur.c));
    for (const [id, k] of [['trlistband', 'listBand'], ['trlistshow', 'listShow'], ['trlistgroup', 'listGroup']]) $(id).onchange = () => { st[k] = $(id).value; $(id).blur(); store(); drawList(); };
    $('trlistpic').onchange = () => { st.listPicture = $('trlistpic').checked; $('trlistpic').blur(); store(); drawList(); };
    $('trsort').onchange = () => { st.sort = $('trsort').value; $('trsort').blur(); store(); drawList(); };
    $('trpicture').onchange = () => { st.picture = $('trpicture').checked; $('trpicture').blur(); drawCase(); store(); };
    $('trall').onclick = () => { const ids = listed().map(c => c.id); st.off = st.off.filter(i => !ids.includes(i)); selectionChanged(); };
    $('trnone').onclick = () => { st.off = [...new Set([...st.off, ...listed().map(c => c.id)])]; selectionChanged(); };
    $('trshow').onclick = () => { cur.shown = !cur.shown; drawCase(); };
    $('trskip').onclick = () => { cancel(); next(); };
    $('trmiss').onclick = () => { cancel(); record(null); };
    $('trundo').onclick = () => { // removes the last attempt
      st.results[last.id]?.pop();
      if (!st.results[last.id]?.length) delete st.results[last.id];
      last = null;
      store();
      drawLast();
      drawList();
    };
    $('trcustom').onsubmit = e => {
      e.preventDefault();
      const name = $('trnewname').value.trim(), alg = $('trnewalg').value.trim().replace(/[’‘`]/g, "'"), problem = name ? check(alg) : 'Enter a name.';
      $('trmsg').textContent = problem;
      if (problem) return;
      st.custom.push({ id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), event: st.event, group: $('trnewgroup').value.trim(), name, alg });
      fillCaseGroups();
      $('trnewname').value = $('trnewalg').value = '';
      if (!cur) next();
      store();
      drawList();
    };
    // Mouse clicks should not leave a button focused, or the space bar would press it again.
    $('page-trainer').addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail) b.blur(); });
    addEventListener('keydown', e => {
      if (!ready || !onTrainer() || document.querySelector('dialog[open]')) return;
      if (phase === 'running') { e.preventDefault(); if (!e.repeat) { if (e.key === 'Escape') cancel(); else press(); } return; }
      if (e.code !== 'Space' || e.target.closest('input, select, textarea, button, summary')) return;
      e.preventDefault();
      if (!e.repeat) press();
    });
    addEventListener('keyup', e => {
      if (!ready || !onTrainer()) return;
      if (phase === 'stopped') { phase = 'idle'; e.preventDefault(); }
      else if (phase === 'ready' && e.code === 'Space') { e.preventDefault(); release(); }
    });
    addEventListener('blur', () => { if (phase === 'ready' || phase === 'stopped') { if (phase === 'ready') cancel(); phase = 'idle'; } });
    const pad = $('trtime');
    pad.onpointerdown = e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); press(); };
    pad.onpointerup = release;
    pad.onpointercancel = () => { if (phase === 'ready') cancel(); else if (phase === 'stopped') phase = 'idle'; };
    addEventListener('drop', () => showPage('stats'));

    let page = 'stats';
    try { page = localStorage.getItem('cubestats-page') === 'trainer' ? 'trainer' : 'stats'; } catch { /* default page */ }
    showPage(page);
    let saved = null;
    try { saved = await getKV('trainer'); } catch { /* starts empty */ }
    ready = true;
    load(saved);
    Sync.loaded();
  }
  function load(saved) { // also used when syncing brings newer data
    st = { ...structuredClone(DEFAULTS), ...saved };
    if (!ALG_EVENTS[st.event]) st.event = '3x3';
    last = null;
    refresh();
  }
  return { init, load, busy: () => phase !== 'idle' || !!editing };
})();
Trainer.init();
Sync.init();
