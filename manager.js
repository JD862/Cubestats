'use strict';
/* Session manager dialog. Uses the state and helpers defined in app.js. */
let editing = null; // { s, field: 'name' | 'merge' }

const selected = () => { const v = $('session').value; return WCA.isWca(v) || v.startsWith('event:') ? null : sessions[+v]; };
let chosen = new Set(), anchorId = null; // rows selected by clicking them, and where a Shift+click range starts
function sessionStats(s) {
  const plus = $('plus').value === 'add' ? 2000 : 0, done = [];
  for (const x of s.solves) {
    if (x.pen !== 'DNF') done.push(x.t + (x.pen === '+?' ? plus : 0));
  }
  return { done: done.length, avg: Stats.summary(done).average };
}

// Saves after a change, keeping `cur` selected (null means a WCA event is selected).
async function commitSessions(cur, refresh) {
  const v = $('session').value, sel = WCA.isWca(v) || v.startsWith('event:') ? v : Math.max(0, sessions.indexOf(cur));
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
    const v = $('session').value;
    if (s === selected()) fillSessions(sessions.indexOf(s)); // redraw the page behind with the new event
    else if (v.startsWith('event:')) fillSessions(v); // the full event being shown may have gained or lost this session
    else fillOptions(v); // full events in the Session menu may change
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
    tr.dataset.id = s.id;
    tr.tabIndex = 0;
    tr.onclick = e => { if (!e.target.closest('button, select, input')) choose(s.id, e); };
    tr.onmousedown = e => { if (e.shiftKey && !e.target.closest('button, select, input')) e.preventDefault(); }; // no text highlight on Shift+click
    tr.onkeydown = e => { if ((e.key === ' ' || e.key === 'Enter') && e.target === tr) { e.preventDefault(); choose(s.id, { ctrlKey: true }); } };
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
  drawChosen();
}
/* ---------- selected rows ---------- */
// Click a row to select it; Ctrl or Cmd+click adds or removes rows, Shift+click selects a range.
function choose(id, e) {
  const ids = sessions.map(s => s.id);
  if (e.shiftKey && anchorId && ids.includes(anchorId)) {
    const a = ids.indexOf(anchorId), b = ids.indexOf(id);
    for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) chosen.add(x);
  } else if (e.ctrlKey || e.metaKey) {
    if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
    anchorId = id;
  } else {
    chosen = chosen.size === 1 && chosen.has(id) ? new Set() : new Set([id]);
    anchorId = id;
  }
  drawChosen();
}
function drawChosen() {
  chosen = new Set([...chosen].filter(id => sessions.some(s => s.id === id)));
  for (const tr of $('mgrtable').rows) if (tr.dataset.id) { const on = chosen.has(tr.dataset.id); tr.classList.toggle('chosen', on); tr.setAttribute('aria-selected', on); }
  const n = chosen.size;
  $('mgrcount').textContent = n ? `${n} selected` : 'None selected'; // the bar always shows, so the window does not jump
  $('mgrcombine').disabled = n < 2;
  $('mgrremove').disabled = $('mgrdeselect').disabled = $('mgrevent').disabled = !n;
  $('mgrevent').replaceChildren(new Option('Set event…', ''), new Option('No event', '-'), ...WCA.allEvents().map(e => new Option(WCA.eventName(e), e)));
}
async function removeChosen() {
  const list = sessions.filter(s => chosen.has(s.id)), solves = list.reduce((a, s) => a + s.solves.length, 0);
  if (!(await ask(`Remove ${list.length} session${list.length > 1 ? 's' : ''} (${solves.toLocaleString()} solves) from Cubestats? Your original files are not touched.`, 'Remove'))) return;
  const cur = selected();
  sessions = sessions.filter(s => !chosen.has(s.id));
  chosen.clear();
  commitSessions(cur && sessions.includes(cur) ? cur : sessions[0], true);
}
async function setChosenEvent(id) {
  for (const s of sessions) if (chosen.has(s.id)) s.wca = id === '-' ? '' : id;
  const v = $('session').value;
  fillSessions(/^\d+$/.test(v) || v.startsWith('event:') || WCA.isWca(v) ? v : 0);
  drawManager();
  say((await save()) ? '' : SAVE_FAILED);
}
// A new session holding the solves of every picked session. The picked sessions stay as they are.
async function combine() {
  const picked = sessions.filter(s => chosen.has(s.id)), all = picked.flatMap(s => s.solves.map(x => ({ ...x })));
  const events = [...new Set(picked.map(s => s.wca || ''))], cur = selected();
  addSessions([{ name: picked.map(s => s.name).join(' + '), solves: all.every(x => x.date != null) ? all.sort((a, b) => a.date - b.date) : all }]);
  Object.assign(sessions.at(-1), { wca: events.length === 1 ? events[0] : '', from: picked.map(s => s.id) });
  chosen.clear();
  await commitSessions(cur, true);
  say(`Made "${sessions.at(-1).name}" with ${all.length.toLocaleString()} solves. The original sessions are unchanged.`);
}

$('manage').onclick = () => { editing = null; drawManager(); $('mgr').showModal(); };
$('mgrclose').onclick = () => $('mgr').close();
$('mgrcombine').onclick = () => combine();
$('mgrremove').onclick = () => removeChosen();
$('mgrdeselect').onclick = () => { chosen.clear(); drawChosen(); };
$('mgrevent').onchange = () => { const v = $('mgrevent').value; if (v) setChosenEvent(v); };
$('mgr').addEventListener('keydown', e => { if (e.key === 'Escape' && chosen.size) { e.preventDefault(); chosen.clear(); drawChosen(); } });
$('mgr').onclick = e => { if (e.target === $('mgr')) $('mgr').close(); };
