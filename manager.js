'use strict';
/* Session manager dialog. Uses the state and helpers defined in app.js. */
let editing = null; // { s, field: 'name' | 'merge' }

const selected = () => { const v = $('session').value; return WCA.isWca(v) ? null : sessions[+v]; };
function sessionStats(s) {
  const plus = $('plus').value === 'add' ? 2000 : 0, done = [];
  for (const x of s.solves) {
    if (x.pen !== 'DNF') done.push(x.t + (x.pen === '+?' ? plus : 0));
  }
  return { done: done.length, avg: Stats.summary(done).average };
}

// Saves after a change, keeping `cur` selected (null means a WCA event is selected).
async function commitSessions(cur, refresh) {
  const v = $('session').value, sel = WCA.isWca(v) ? v : Math.max(0, sessions.indexOf(cur));
  if (refresh) fillSessions(sel); else fillOptions(sel);
  editing = null;
  if (sessions.length) drawManager(); else $('mgr').close();
  say((await save()) ? '' : SAVE_FAILED);
}
async function act(op, s) {
  if (op === 'delete') {
    if (!(await ask(`Remove "${s.name}" (${s.solves.length.toLocaleString()} solves) from Cubestats? Your original files are not touched.`, 'Remove'))) return;
    const cur = selected(), i = sessions.indexOf(s);
    sessions.splice(i, 1);
    commitSessions(cur === s ? sessions[Math.min(i, sessions.length - 1)] : cur, cur === s);
    return;
  }
  editing = { s, field: op };
  drawManager();
  const input = $('mgrtable').querySelector('.edit');
  input.focus();
  input.select?.();
}
async function mergeInto(s, target) {
  if (!(await ask(`Move all ${s.solves.length.toLocaleString()} solves from "${s.name}" into "${target.name}"? This cannot be undone here.`, 'Merge'))) return drawManager();
  const cur = selected(), all = target.solves.concat(s.solves);
  target.solves = all.every(x => x.date != null) ? all.sort((a, b) => a.date - b.date) : all;
  target.wca ||= s.wca;
  sessions.splice(sessions.indexOf(s), 1);
  commitSessions(cur === s ? target : cur, true);
}
function move(s, other) { // swap with the row shown above or below
  const cur = selected(), a = sessions.indexOf(s), b = sessions.indexOf(other);
  sessions[a] = other;
  sessions[b] = s;
  commitSessions(cur, false);
}

function eventSelect(s) {
  const sel = el('select', null, 'event'), ids = WCA.allEvents();
  if (s.wca && !ids.includes(s.wca)) ids.push(s.wca);
  sel.setAttribute('aria-label', `Event for ${s.name}`);
  sel.append(new Option('–', ''), ...ids.map(e => new Option(WCA.eventName(e), e)));
  sel.value = s.wca || '';
  sel.onchange = async () => {
    s.wca = sel.value;
    if (s === selected()) fillSessions(sessions.indexOf(s)); // redraw the page behind with the new event
    say((await save()) ? '' : SAVE_FAILED);
  };
  return sel;
}

function editor(s, field) {
  if (field === 'merge') {
    const sel = el('select', null, 'edit');
    sel.setAttribute('aria-label', `Merge ${s.name} into`);
    sel.add(new Option('Merge into…', ''));
    sessions.forEach((o, i) => { if (o !== s) sel.add(new Option(`${i + 1}-${o.name}`, i)); });
    sel.onchange = () => { editing = null; mergeInto(s, sessions[+sel.value]); };
    sel.onkeydown = e => { if (e.key === 'Escape') { e.preventDefault(); editing = null; drawManager(); } };
    return sel;
  }
  const input = el('input', null, 'edit');
  input.value = s[field] || '';
  input.setAttribute('aria-label', 'Session name');
  let finished = false;
  const finish = ok => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    if (!ok || !v || v === (s[field] || '')) { editing = null; return drawManager(); }
    s[field] = v;
    commitSessions(selected(), false);
  };
  input.onkeydown = e => {
    if (e.key !== 'Enter' && e.key !== 'Escape') return;
    e.preventDefault();
    finish(e.key === 'Enter');
  };
  input.onblur = () => finish(true);
  return input;
}

function drawManager() {
  const btn = (text, label, fn) => {
    const b = el('button', text, 'link');
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    b.onclick = fn;
    return b;
  };
  const head = el('tr');
  for (const t of ['Name', 'Event', 'solve', 'average']) head.append(el('th', t));
  head.children[3].title = 'Finished solves, without the fastest 5% and slowest 5%';
  const op = el('th', 'OP');
  op.colSpan = 3;
  head.append(op);

  const cur = selected();
  const rows = sessions.map((s, k) => {
    const st = sessionStats(s), tr = el('tr'), up = sessions[k - 1], down = sessions[k + 1];
    const cell = c => { const td = el('td'); td.append(c); tr.append(td); };
    const edit = editing?.s === s ? editing.field : null;
    if (s === cur) { tr.className = 'on'; tr.setAttribute('aria-current', 'true'); }
    cell(edit === 'name' ? editor(s, 'name')
      : btn(`${k + 1}-${s.name}${s === cur ? '*' : ''}`, null, () => { fillSessions(k); drawManager(); }));
    cell(eventSelect(s));
    cell(`${st.done.toLocaleString()}/${s.solves.length.toLocaleString()}`);
    cell(format(st.avg, 3));
    cell(up ? btn('↑', `Move ${s.name} up`, () => move(s, up)) : '');
    cell(down ? btn('↓', `Move ${s.name} down`, () => move(s, down)) : '');
    if (edit === 'merge') cell(editor(s, 'merge'));
    else {
      const menu = el('select');
      menu.setAttribute('aria-label', `Options for ${s.name}`);
      menu.append(new Option('…', ''), new Option('Rename', 'name'));
      if (sessions.length > 1) menu.add(new Option('Merge into…', 'merge'));
      menu.add(new Option('Remove', 'delete'));
      menu.onchange = () => { const v = menu.value; menu.value = ''; act(v, s); };
      cell(menu);
    }
    return tr;
  });
  $('mgrtable').replaceChildren(head, ...rows);
}

$('manage').onclick = () => { editing = null; drawManager(); $('mgr').showModal(); };
$('mgrclose').onclick = () => $('mgr').close();
$('mgr').onclick = e => { if (e.target === $('mgr')) $('mgr').close(); };
