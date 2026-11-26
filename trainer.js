'use strict';
/* Alg trainer page and the sidebar that switches pages. Uses helpers from app.js and cube.js. */
const Trainer = (() => {
  const COLORS = { U: '#f2d21b', D: '#f4f4f0', F: '#1f9d4d', B: '#2a62d6', R: '#f07c1a', L: '#d0312d' };
  const GREY = '#77777a', LAST_LAYER = ['oll', 'eoll', 'cpll', 'pll', 'ort', 'cll', 'pbl'], TWO = ['ort', 'cll', 'pbl'];
  // results: { caseId: [{ t, d }] } with t in ms, or null for a miss. pool: which marks are trained.
  // groups: the group last used in each event.
  const DEFAULTS = { event: '3x3', methods: { '3x3': 'CFOP' }, groups: { '3x3': 'PLL' }, order: 'random', band: 'all', sort: 'set', learnt: [], learning: [], pool: 'marked', extra: {}, picture: true, listBand: 'all', listShow: 'all', caseGroup: 'all', listGroup: 'all', listPicture: true, results: {}, edits: {}, alt: {}, useAlt: [], custom: [] };
  let st = structuredClone(DEFAULTS);
  let cur = null, queue = [], phase = 'idle', started = 0, frame = 0, last = null, editing = null, ready = false;
  let picked = new Set(), anchor = null; // cases selected with Ctrl+click, and where a Shift+click range starts

  const store = () => ready && setKV('trainer', st).catch(() => { $('trmsg').textContent = SAVE_FAILED; });
  const methodNames = () => Object.keys(METHODS[st.event]);
  const method = () => (methodNames().includes(st.methods[st.event]) ? st.methods[st.event] : methodNames()[0]);
  const groupNames = () => [...METHODS[st.event][method()], 'Custom', 'Learnt'];
  const allCases = () => [...new Map(Object.values(ALG_EVENTS[st.event]).flat().map(c => [c.id, c])).values()]; // sets shared by methods appear once
  const group = () => (groupNames().includes(st.groups[st.event]) ? st.groups[st.event] : groupNames()[0]);
  const customCases = () => st.custom.filter(c => (c.event || '3x3') === st.event);
  const cases = () => {
    if (group() === 'Custom') return customCases();
    if (group() === 'Learnt') return [...allCases(), ...customCases()].filter(isLearnt); // every learnt case of the event
    return ALG_EVENTS[st.event][group()];
  };
  // Every case has a main alg and may have a secondary one (st.alt); useAlt lists the cases trained with the secondary.
  const mainAlg = c => st.edits[c.id] || c.alg;
  const options = c => [...new Set([...(c.alts || []), mainAlg(c), st.alt[c.id]].filter(Boolean))]; // keeps algs typed in earlier
  const usesAlt = c => !!st.alt[c.id] && st.useAlt.includes(c.id);
  const algOf = c => (usesAlt(c) ? st.alt[c.id] : mainAlg(c));
  const isLearnt = c => st.learnt.includes(c.id);
  const isLearning = c => st.learning.includes(c.id) && !isLearnt(c);
  const hasStatus = (c, show) => (show === 'learnt' ? isLearnt(c) : show === 'learning' ? isLearning(c) : show === 'new' ? !isLearnt(c) : show === 'marked' ? isLearnt(c) || isLearning(c) : true);
  const resultsOf = c => st.results[c.id] || [];
  const level = c => Cube.difficulty(algOf(c), st.event === 'OH');
  const effOf = (c, a = algOf(c)) => Cube.efficiency(a, options(c), st.event === 'OH');
  const scores = (c, a) => `difficulty ${Cube.difficulty(a, st.event === 'OH').toFixed(1)}, efficiency ${effOf(c, a).toFixed(1)}`;
  const bandOf = d => (d < 4.5 ? 'easy' : d < 6 ? 'medium' : 'hard');
  const sorted = () => st.order === 'easy' || st.order === 'hard';
  const byLevel = (a, b) => (st.order === 'hard' ? level(b) - level(a) : level(a) - level(b));
  // Other sets of the event that are trained along with the chosen one.
  const extraSets = () => (st.extra[st.event] || []).filter(g => g !== group() && g !== 'Learnt' && groupNames().includes(g));
  const extraCases = () => {
    const own = new Set(cases().map(c => c.id));
    return extraSets().flatMap(g => (g === 'Custom' ? customCases() : ALG_EVENTS[st.event][g])).filter(c => !own.has(c.id));
  };
  const groupOf = c => (group() === 'Learnt' ? c.set || 'Custom' : c.group || 'No group'); // the Learnt set is grouped by set
  const caseGroups = () => [...new Set(cases().map(groupOf))];
  const matches = (c, band, show, grp) => (grp === 'all' || groupOf(c) === grp) && (band === 'all' || bandOf(level(c)) === band) && hasStatus(c, show);
  // Cases to train: in the chosen difficulty, easiest or hardest first when that order is chosen.
  const visible = () => {
    const list = [...cases().filter(c => matches(c, st.band, st.pool, st.caseGroup)), ...extraCases().filter(c => matches(c, st.band, st.pool, 'all'))];
    return sorted() ? list.sort(byLevel) : list;
  };
  // The case list has its own filters and order; they never change what is trained.
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const SORTS = {
    name: byName, nameDesc: (a, b) => byName(b, a),
    diff: (a, b) => level(a) - level(b) || byName(a, b), diffDesc: (a, b) => level(b) - level(a) || byName(a, b),
    eff: (a, b) => effOf(a) - effOf(b) || byName(a, b), effDesc: (a, b) => effOf(b) - effOf(a) || byName(a, b),
  };
  const listed = () => {
    const list = cases().filter(c => matches(c, st.listBand, st.listShow, st.listGroup)), order = caseGroups();
    return list.sort(SORTS[st.sort] || ((a, b) => order.indexOf(groupOf(a)) - order.indexOf(groupOf(b))));
  };
  function stats(c) {
    const r = resultsOf(c), t = r.filter(x => x.t != null).map(x => x.t), s = Stats.summary(t);
    return { n: r.length, miss: r.length - t.length, avg: s.average };
  }
  // Cases on other puzzles (kind 'text') have no simulator here: no picture, and their setup is the alg read backwards.
  const isText = c => c.kind === 'text';
  const reverseAlg = a => (a.match(/\S+/g) || []).reverse().map(m => (m.endsWith("'") ? m.slice(0, -1) : m.endsWith('2') ? m : m + "'")).join(' ');
  const setupState = (c, moves) => (isText(c) ? null : Cube.apply(c.kind === 'f2l' ? Cube.maskedF2L() : c.kind === 'layer1' ? Cube.maskedLayer1() : Cube.solved(), moves || Cube.invert(Cube.parse(algOf(c)))));
  // How to draw a case: 'top', 'iso', or '' when a picture would not help.
  function view(c, state) {
    if (!state || isText(c)) return '';
    if (c.kind === 'f2l' || c.kind === 'layer1' || c.kind === 'pbl') return 'iso';
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
    const list = visible();
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
    if (isText(c)) {
      const turn = ['', 'U ', "U' "][Math.floor(Math.random() * 3)]; // Pyraminx turns are thirds
      cur = { c, text: (c.id.startsWith('L4E') ? turn : '') + reverseAlg(algOf(c)), state: null, shown: false };
      return drawCase();
    }
    const inv = Cube.invert(Cube.parse(algOf(c))), rnd = () => Math.floor(Math.random() * 4);
    let moves = inv;
    // A random angle and random U turn give many setups for one last-layer case; F2L only varies the U layer.
    if (LAST_LAYER.includes(c.kind) || (!c.kind && view(c, setupState(c)))) moves = [{ f: 'U', n: rnd() }, ...(c.kind === 'pbl' ? [{ f: 'D', n: rnd() }] : []), ...Cube.turnY(inv, rnd())];
    else if (c.kind === 'f2l' || c.kind === 'layer1') moves = [{ f: 'U', n: rnd() }, ...inv];
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

  const NO_POOL = { marked: 'Tick Learning or Learnt for the cases you want to train.', learning: 'Tick Learning for the cases you want to train.', learnt: 'Tick Learnt for the cases you want to train.' };

  /* ---------- drawing ---------- */
  const label = c => (extraSets().length && (c.set || 'Custom') !== group() ? `${c.set || 'Custom'} – ${c.name}` : c.name); // says which other set a case is from
  function drawCase() {
    $('trpic').replaceChildren();
    $('trname').textContent = '';
    $('tralg').textContent = '';
    for (const b of ['trshow', 'trskip', 'trmiss', 'trlearn', 'trlearning']) $(b).disabled = !cur;
    for (const [id, has, on, off] of [['trlearn', isLearnt, 'Learnt ✓', 'Mark learnt'], ['trlearning', isLearning, 'Learning ✓', 'Mark learning']]) {
      const yes = !!cur && has(cur.c);
      $(id).textContent = yes ? on : off;
      $(id).setAttribute('aria-pressed', yes);
    }
    if (!cur) {
      $('trsetup').textContent = (cases().length || extraCases().length) ? ([...cases(), ...extraCases()].some(c => hasStatus(c, st.pool)) ? 'No cases match the trainer’s filters.' : NO_POOL[st.pool]) : group() === 'Learnt' ? 'Mark cases as learnt and they will appear here.' : 'Add your own algs below to train them.';
      return;
    }
    $('trsetup').textContent = cur.text ?? (Cube.text(cur.moves) || '(already set up)');
    if (st.picture && view(cur.c, cur.state)) $('trpic').append(picture(cur.c, cur.state, 150));
    if (cur.c.kind === 'blind') $('trname').textContent = label(cur.c); // the letter is the prompt
    $('trshow').textContent = cur.shown ? 'Hide alg' : 'Show alg';
    if (cur.shown) { $('trname').textContent = label(cur.c); $('tralg').textContent = Cube.grouped(algOf(cur.c)); }
  }
  // An alg that opens large when clicked.
  function algButton(c, alg) {
    const b = el('button', Cube.grouped(alg), 'alg');
    b.type = 'button';
    b.setAttribute('aria-label', `${c.name}: ${alg}. Open larger`);
    b.onclick = () => openAlg(c, alg);
    return b;
  }
  // Pop-up with one alg in large type; any other alg of the case can be viewed and chosen there.
  function openAlg(c, alg) {
    if (phase === 'running') return;
    const sel = $('algpick');
    sel.replaceChildren(...options(c).map(a => new Option(`${Cube.grouped(a)}  – ${scores(c, a)}`, a)));
    sel.value = alg;
    const show = () => {
      const a = sel.value, state = setupState(c, Cube.invert(Cube.parse(a))), main = mainAlg(c), alt = st.alt[c.id], p = el('p', null, 'bigalg');
      p.append(...(Cube.grouped(a).match(/\([^)]*\)|\S+/g) || []).map(m => el('span', m)));
      $('algname').textContent = c.name;
      $('algpic').replaceChildren(...(view(c, state) ? [picture(c, state, 170)] : []));
      $('algtext').replaceChildren(p);
      const role = a === main ? 'Main alg' : a === alt ? 'Secondary alg' : 'Not chosen';
      $('algnote').textContent = `${groupOf(c)}. D${scores(c, a).slice(1)}. ${role}${a === algOf(c) ? ', training with this' : ''}.`;
      $('alguse').disabled = a === algOf(c);
      $('algalt').disabled = a === main || a === alt;
    };
    const choose = (...args) => { setAlgs(c, ...args); show(); };
    sel.onchange = show;
    $('alguse').onclick = () => { // the secondary alg stays secondary; any other one becomes the main alg
      const a = sel.value, alt = st.alt[c.id] || '';
      if (a === alt && a !== mainAlg(c)) choose(mainAlg(c), alt, true); else choose(a, alt === a ? '' : alt, false);
    };
    $('algalt').onclick = () => choose(mainAlg(c), sel.value, usesAlt(c));
    $('algpickbox').hidden = sel.options.length < 2;
    $('alguse').hidden = $('algalt').hidden = sel.options.length < 2;
    show();
    $('algdlg').showModal();
  }
  function drawLast() {
    $('trlast').hidden = !last;
    if (!last) return;
    $('trlasttext').replaceChildren(el('b', last.t == null ? 'Missed' : format(last.t)), ` ${last.name}: ${Cube.grouped(last.alg)}`);
  }
  function drawList() {
    const all = listed(), on = visible(), done = all.flatMap(c => resultsOf(c)), times = done.filter(x => x.t != null).map(x => x.t), s = Stats.summary(times);
    const set = cases();
    $('trsum').textContent = `${set.filter(isLearnt).length} of ${set.length} learnt, ${set.filter(isLearning).length} learning. Training ${on.length}, showing ${all.length}. ${done.length.toLocaleString()} attempts, average ${format(s.average)}, ${(done.length - times.length).toLocaleString()} missed.`;
    picked = new Set(all.filter(c => picked.has(c.id)).map(c => c.id)); // only listed cases can stay selected
    const head = el('tr');
    for (const h of ['Learnt', 'Learning', 'Case', 'Group', 'Algorithm', 'Diff.', 'Eff.', 'Tries', 'Avg', '']) head.append(el('th', h));
    let heading = null;
    $('trtable').replaceChildren(head, ...all.flatMap(c => {
      const extra = [];
      if (!SORTS[st.sort] && heading !== groupOf(c)) { // a heading above each case group in the default order
        heading = groupOf(c);
        const members = set.filter(x => groupOf(x) === heading), h = el('tr', null, 'trgroup'), th = el('th', `${heading} `);
        th.colSpan = 10;
        th.append(el('span', `${members.filter(isLearnt).length} of ${members.length} learnt`));
        h.append(th);
        extra.push(h);
      }
      const tr = el('tr'), cell = (...x) => { const td = el('td'); td.append(...x); tr.append(td); }, x = stats(c);
      tr.dataset.id = c.id;
      const mark = el('input');
      mark.type = 'checkbox';
      mark.checked = isLearnt(c);
      mark.setAttribute('aria-label', `${c.name} learnt`);
      mark.onchange = () => { mark.blur(); setStatus(c, mark.checked ? 'learnt' : ''); };
      cell(mark);
      const prog = el('input');
      prog.type = 'checkbox';
      prog.checked = isLearning(c);
      prog.setAttribute('aria-label', `Learning ${c.name}`);
      prog.onchange = () => { prog.blur(); setStatus(c, prog.checked ? 'learning' : ''); };
      cell(prog);
      const wrap = el('div', null, 'trcase'), state = setupState(c);
      if (st.listPicture && view(c, state)) wrap.append(picture(c, state, 36));
      wrap.append(c.name);
      cell(wrap);
      cell(el('span', groupOf(c), 'trg'));
      if (editing === c.id) {
        const err = el('div', '', 'note'), box = el('div', null, 'treditor');
        err.setAttribute('role', 'alert');
        const field = (label, control) => { const l = el('label', label); l.append(control); box.append(l); return control; };
        // Built-in cases choose from known algs or type their own; custom cases have nothing to choose from, so they are typed.
        const OWN = '(own)'; // option value for typing an alg; no real alg looks like this
        const pickAlg = (label, none, current) => {
          const typed = el('input', null, 'tredit'), wrap = el('div', null, 'trpick');
          typed.placeholder = "Type an alg, such as R U R' U'";
          typed.setAttribute('aria-label', label + ', typed');
          if (!c.kind) { typed.value = current; wrap.append(typed); return { wrap, typed, value: () => typed.value }; }
          const sel = el('select', null, 'tredit');
          sel.setAttribute('aria-label', label);
          if (none) sel.add(new Option('None', ''));
          for (const a of options(c)) sel.add(new Option(`${Cube.grouped(a)}  – ${scores(c, a)}`, a));
          sel.add(new Option('Type your own…', OWN));
          sel.value = current;
          const sync = () => { typed.hidden = sel.value !== OWN; if (!typed.hidden) typed.focus(); };
          sel.onchange = sync;
          typed.hidden = true;
          wrap.append(sel, typed);
          return { wrap, typed, value: () => (sel.value === OWN ? typed.value : sel.value) };
        };
        const mainPick = pickAlg('Main alg', false, mainAlg(c)), altPick = pickAlg('Secondary alg', true, st.alt[c.id] || '');
        field('Main alg', mainPick.wrap);
        field('Secondary alg (optional)', altPick.wrap);
        const use = field('Train with', el('select', null, 'truse'));
        use.append(new Option('Main alg', 'main'), new Option('Secondary alg', 'alt'));
        use.value = usesAlt(c) ? 'alt' : 'main';
        const save = () => { err.textContent = setAlgs(c, mainPick.value(), altPick.value(), use.value === 'alt'); };
        const close = () => { editing = null; drawList(); };
        for (const p of [mainPick, altPick]) p.typed.onkeydown = e => { if (e.key === 'Enter') save(); };
        box.onkeydown = e => { if (e.key === 'Escape') close(); };
        const bar = el('div', null, 'actions'), ok = el('button', 'Save', 'primary'), no = el('button', 'Cancel');
        ok.type = no.type = 'button';
        ok.onclick = save;
        no.onclick = close;
        bar.append(ok, no);
        box.append(err, bar);
        cell(box);
      } else {
        const lines = [algButton(c, mainAlg(c))];
        if (st.alt[c.id]) {
          lines.push(algButton(c, st.alt[c.id]));
          lines[usesAlt(c) ? 0 : 1].classList.add('unused');
          lines.forEach((b, i) => { // right-click the alg that is not in use to train with it
            const inUse = usesAlt(c) === (i === 1);
            b.title = `${i ? 'Secondary' : 'Main'} alg (${inUse ? 'training with this' : 'right-click to train with this'})`;
            b.oncontextmenu = e => {
              if (e.ctrlKey || e.metaKey) return;
              e.preventDefault();
              if (!inUse && phase === 'idle') option('swap', c);
            };
          });
        }
        cell(...lines);
      }
      const d = level(c);
      cell(d.toFixed(1));
      cell(effOf(c).toFixed(1));
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
    drawPicked();
    if (editing) $('trtable').querySelector('.tredit')?.focus();
  }
  /* ---------- several cases at once ---------- */
  function drawPicked() {
    for (const tr of $('trtable').rows) if (tr.dataset.id) { const on = picked.has(tr.dataset.id); tr.classList.toggle('picked', on); tr.setAttribute('aria-selected', on); }
    $('trbulk').hidden = !picked.size;
    $('trbulkn').textContent = `${picked.size} selected`;
  }
  function pickRow(e) {
    const id = e.target.closest('tr')?.dataset.id;
    if (!id || !(e.ctrlKey || e.metaKey || e.shiftKey) || e.target.closest('.treditor')) return;
    e.preventDefault(); // the click selects the row instead of using the checkbox, alg or menu under it
    e.stopPropagation();
    if (e.type !== 'click') return;
    if (e.shiftKey) {
      const ids = listed().map(c => c.id), a = ids.indexOf(picked.size && ids.includes(anchor) ? anchor : id), b = ids.indexOf(id);
      for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) picked.add(x);
    } else {
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      anchor = id;
    }
    drawPicked();
  }
  function bulk(op) {
    const ids = [...picked], not = list => list.filter(i => !picked.has(i));
    st.learning = not(st.learning);
    st.learnt = not(st.learnt);
    if (op !== 'none') st[op].push(...ids);
    if (group() === 'Learnt') fillCaseGroups();
    selectionChanged();
    if (phase === 'idle') drawCase();
  }
  function clearPicked() { picked.clear(); anchor = null; drawPicked(); }

  function putStatus(id, status) { // 'learning', 'learnt' or '' for neither
    for (const k of ['learning', 'learnt']) {
      st[k] = st[k].filter(i => i !== id);
      if (k === status) st[k].push(id);
    }
    if (group() === 'Learnt') fillCaseGroups();
  }
  function setStatus(c, status) {
    putStatus(c.id, status);
    selectionChanged();
    if (phase === 'idle') drawCase();
  }
  function selectionChanged() {
    queue = [];
    if (phase === 'idle' && !(cur && visible().some(c => c.id === cur.c.id))) next();
    store();
    drawList();
  }

  /* ---------- editing ---------- */
  // Problem with an alg as text, or '' when it is fine. For built-in cases it must solve that same case.
  function check(text, c) {
    let moves;
    try { moves = Cube.parse(text); } catch (e) { return e.message + '.'; }
    if (!moves.length) return 'Enter at least one move.';
    if (!c || !c.kind || isText(c)) return ''; // custom algs and other puzzles can only be checked for valid moves
    if (c.kind === 'blind') return Cube.apply(Cube.solved(), moves).join() === Cube.apply(Cube.solved(), Cube.parse(c.alg)).join() ? '' : `That alg does not do the same as the original for ${c.name}.`;
    const inv = Cube.invert(Cube.parse(c.alg));
    for (let y = 0; y < (c.kind === 'f2l' || c.kind === 'layer1' ? 1 : 4); y++) {
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
      st.learnt = st.learnt.filter(i => i !== c.id);
      st.learning = st.learning.filter(i => i !== c.id);
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
  function fillExtra() {
    const on = extraSets();
    $('trextralist').replaceChildren(...groupNames().filter(g => g !== group() && g !== 'Learnt').map(g => {
      const l = el('label'), b = el('input');
      b.type = 'checkbox';
      b.value = g;
      b.checked = on.includes(g);
      l.append(b, g);
      return l;
    }));
    $('trextrasum').textContent = on.length ? on.join(', ') : 'None';
  }
  function refresh() {
    $('trmsg').textContent = '';
    cancel();
    queue = [];
    cur = null;
    editing = null;
    picked.clear();
    anchor = null;
    $('trevent').value = st.event;
    $('trmethod').replaceChildren(...methodNames().map(m => new Option(m, m)));
    $('trmethod').value = method();
    $('trmethodbox').hidden = methodNames().length < 2;
    $('trset').replaceChildren(...groupNames().map(g => new Option(g, g)));
    $('trset').value = group();
    $('trhold').textContent = {
      Blind: 'Do this setup on a solved cube, then run the alg for the letter. Letters are Speffz; buffers are DF for edges and UBL for corners.',
      Pyraminx: 'Hold a solved Pyraminx with one corner on top and a face toward you, then do this setup. U is the top corner, L and R the front corners. Tips are left out.',
      '4x4': 'Hold a solved 4x4 with yellow on top and green in front, then do this setup. r and l turn the inner slice only; Rw and Uw turn two layers.',
      '5x5': 'Hold a solved 5x5 with yellow on top and green in front, then do this setup. r and l turn the second layer only; Rw and Uw turn two layers.',
    }[st.event] || `Hold a solved ${st.event === '2x2' ? '2x2' : 'cube'} with yellow on top and green in front, then do this setup:`;
    $('trorder').value = st.order;
    $('trband').value = st.band;
    $('trsort').value = st.sort;
    $('trpool').value = st.pool;
    $('trlistband').value = st.listBand;
    $('trlistshow').value = st.listShow;
    $('trlistpic').checked = st.listPicture;
    $('trpicture').checked = st.picture;
    fillCaseGroups();
    fillExtra();
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
    $('trmethod').onchange = () => { st.methods = { ...st.methods, [st.event]: $('trmethod').value }; $('trmethod').blur(); refresh(); store(); };
    $('trset').onchange = () => { st.groups = { ...st.groups, [st.event]: $('trset').value }; $('trset').blur(); refresh(); store(); };
    $('trorder').onchange = () => { st.order = $('trorder').value; $('trorder').blur(); queue = []; if (phase === 'idle') next(); store(); drawList(); };
    $('trband').onchange = () => { st.band = $('trband').value; $('trband').blur(); selectionChanged(); };
    $('trextralist').onchange = () => {
      st.extra = { ...st.extra, [st.event]: [...[...$('trextralist').querySelectorAll(':checked')].map(b => b.value), ...(st.extra[st.event] || []).filter(g => g === group())] };
      $('trextrasum').textContent = extraSets().join(', ') || 'None';
      selectionChanged();
    };
    addEventListener('pointerdown', e => { if (!$('trextramenu').contains(e.target)) $('trextramenu').open = false; });
    $('trextramenu').onkeydown = e => { if (e.key === 'Escape') { $('trextramenu').open = false; $('trextrasum').focus(); } };
    $('trcasegroup').onchange = () => { st.caseGroup = $('trcasegroup').value; $('trcasegroup').blur(); selectionChanged(); };
    $('trpool').onchange = () => { st.pool = $('trpool').value; $('trpool').blur(); selectionChanged(); };
    $('trlearning').onclick = () => setStatus(cur.c, isLearning(cur.c) ? '' : 'learning');
    $('trlearn').onclick = () => setStatus(cur.c, isLearnt(cur.c) ? '' : 'learnt');
    for (const [id, k] of [['trlistband', 'listBand'], ['trlistshow', 'listShow'], ['trlistgroup', 'listGroup']]) $(id).onchange = () => { st[k] = $(id).value; $(id).blur(); store(); drawList(); };
    $('trlistpic').onchange = () => { st.listPicture = $('trlistpic').checked; $('trlistpic').blur(); store(); drawList(); };
    $('trsort').onchange = () => { st.sort = $('trsort').value; $('trsort').blur(); store(); drawList(); };
    $('trpicture').onchange = () => { st.picture = $('trpicture').checked; $('trpicture').blur(); drawCase(); store(); };
    $('trall').onclick = () => { picked = new Set(listed().map(c => c.id)); drawPicked(); };
    $('trshow').onclick = () => { cur.shown = !cur.shown; drawCase(); };
    for (const t of ['mousedown', 'click']) $('trtable').addEventListener(t, pickRow, true);
    for (const b of $('trbulk').querySelectorAll('button[value]')) b.onclick = () => bulk(b.value);
    $('trbulkclear').onclick = clearPicked;
    $('tralg').onclick = () => openAlg(cur.c, algOf(cur.c));
    $('algclose').onclick = () => $('algdlg').close();
    $('algdlg').onclick = e => { if (e.target === $('algdlg')) $('algdlg').close(); };
    $('trskip').onclick = () => { cancel(); next(); };
    $('trmiss').onclick = () => { cancel(); record(null); };
    $('trundo').onclick = () => { // removes the last attempt
      st.results[last.id]?.pop();
      if (!st.results[last.id]?.length) delete st.results[last.id];
      last = null;
      drawLast();
      selectionChanged();
      if (phase === 'idle') drawCase();
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
      if (e.key === 'Escape' && picked.size && !editing) return clearPicked();
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
    delete st.off; // from before training followed the marks
    delete st.show;
    if (!ALG_EVENTS[st.event]) st.event = '3x3';
    last = null;
    refresh();
  }
  return { init, load, busy: () => phase !== 'idle' || !!editing };
})();
Trainer.init();
Sync.init();
