'use strict';
/* Sign-in and syncing. Merge compares this device and the cloud with what both had at the last sync. */
const Merge = (() => {
  // Text form that does not depend on property order.
  const key = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : p > q ? 1 : 0))) : x));
  const eq = (a, b) => a === b || key(a) === key(b), obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}), arr = v => (Array.isArray(v) ? v : []);
  // One value: whichever side changed; this device wins when both did.
  const value = (b, l, r) => (eq(l, b) ? r : eq(r, b) ? l : l === undefined ? r : l);
  function map(b, l, r, each = value) {
    const out = {};
    b = obj(b); l = obj(l); r = obj(r);
    for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
      if (k === '__proto__') continue;
      const v = each(b[k], l[k], r[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  // Lists as multisets: additions and removals from both sides are applied, and duplicates are kept as often as they occur.
  function list(b, l, r, id = key) {
    const count = a => { const m = new Map(); for (const x of a) { const k = id(x); m.set(k, (m.get(k) || 0) + 1); } return m; };
    b = arr(b); l = arr(l); r = arr(r);
    const B = count(b), L = count(l), R = count(r), want = new Map();
    for (const k of new Set([...L.keys(), ...R.keys()])) {
      const n = B.get(k) || 0, x = L.get(k) || 0, y = R.get(k) || 0;
      want.set(k, x === n ? y : y === n ? x : x > n && y > n ? Math.max(x, y) : Math.min(x, y));
    }
    const out = [];
    for (const x of [...r, ...l]) { const k = id(x), n = want.get(k); if (n > 0) { out.push(x); want.set(k, n - 1); } }
    return out;
  }
  function solves(b, l, r) {
    if (eq(l, b)) return r;
    if (eq(r, b) || eq(l, r)) return l;
    const out = list(b, l, r, s => `${s.date}|${s.t}|${s.pen}`);
    return out.every(s => s.date != null) ? out.sort((x, y) => x.date - y.date) : out;
  }
  function session(b, l, r) {
    if (!l || !r) { const one = l || r; return b && eq(one, b) ? undefined : one; } // removed on one side and untouched on the other
    return { ...map({ ...b, solves: 0 }, { ...l, solves: 0 }, { ...r, solves: 0 }), id: r.id, solves: solves(b ? b.solves : [], l.solves, r.solves) };
  }
  function sessionList(b, l, r) {
    b = arr(b); l = arr(l).map(s => ({ ...s })); r = arr(r);
    // The same import on two devices has different ids but the same solves: treat it as one session.
    const ids = new Set(r.map(s => s.id)), used = new Set(l.map(s => s.id));
    for (const s of l) {
      if (ids.has(s.id) || b.some(x => x.id === s.id)) continue;
      const twin = r.find(x => !used.has(x.id) && eq(x.solves, s.solves));
      if (twin) { s.id = twin.id; used.add(twin.id); }
    }
    const by = a => new Map(a.map(s => [s.id, s])), B = by(b), L = by(l), R = by(r);
    const base = b.map(s => s.id), moved = !eq(l.map(s => s.id), base) && eq(r.map(s => s.id), base), first = moved ? l : r, second = moved ? r : l;
    return [...new Set([...first, ...second].map(s => s.id))].map(id => session(B.get(id), L.get(id), R.get(id))).filter(Boolean);
  }
  function trainer(b, l, r) {
    b = obj(b); l = obj(l); r = obj(r);
    const out = map(b, l, r);
    for (const k of ['learnt', 'learning', 'useAlt']) out[k] = [...new Set(list(b[k], l[k], r[k]))];
    for (const k of ['edits', 'alt', 'groups', 'extra', 'methods']) out[k] = map(b[k], l[k], r[k]);
    out.custom = Object.values(map(...[b, l, r].map(x => Object.fromEntries(arr(x.custom).map(c => [c.id, c])))));
    out.results = map(b.results, l.results, r.results, (x, y, z) => { const a = list(x, y, z); return a.length ? a.sort((p, q) => p.d - q.d) : undefined; });
    return out;
  }
  const doc = (b, l, r) => ({
    v: 1, sessions: sessionList(b?.sessions, l.sessions, r.sessions), trainer: trainer(b?.trainer, l.trainer, r.trainer),
    settings: map(b?.settings, l.settings, r.settings), wca: value(b?.wca ?? undefined, l.wca ?? undefined, r.wca ?? undefined) ?? null,
  });
  return { doc, eq, list, map };
})();

const Sync = (() => {
  const KEYS = ['sessions', 'trainer', 'settings', 'wca'];
  let user = null, methods = null, state = 'off', timer = 0, running = null, writing = 0, edits = 0, lastTry = 0;

  /* ---------- called by setKV around every save ---------- */
  function begin(k) { if (KEYS.includes(k)) { writing++; edits++; } }
  function end(k) {
    if (!KEYS.includes(k)) return;
    writing--;
    if (user) schedule(1500);
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => run(), ms); }

  /* ---------- server ---------- */
  class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = data; } }
  async function api(path, method = 'GET', data) {
    let res;
    try { res = await fetch('api/' + path, { method, credentials: 'same-origin', ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) }); } catch { throw new ApiError(0, 'Could not reach the server.'); }
    const out = await res.json().catch(() => null);
    if (!res.ok || !out) throw new ApiError(res.status, out?.error || 'The server did not answer properly.', out);
    return out;
  }
  const pack = async d => {
    const buf = new Uint8Array(await new Response(new Blob([JSON.stringify(d)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768));
    return btoa(s);
  };
  const unpack = async b64 => JSON.parse(await new Response(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  const EMPTY = { v: 1, sessions: [], trainer: {}, settings: {}, wca: null };
  const isEmpty = d => !d.sessions.length && !d.wca && !Object.keys(d.trainer.results || {}).length && !(d.trainer.learnt || []).length && !(d.trainer.custom || []).length;

  async function local() {
    const d = { ...EMPTY };
    for (const k of KEYS) d[k] = (await getKV(k)) ?? EMPTY[k];
    d.sessions = d.sessions.map(s => (s.id ? s : { ...s, id: newId() }));
    return d;
  }
  async function write(d, meta) {
    const base = await db; // everything in one step, so a crash cannot leave half of it
    await new Promise((ok, no) => {
      const t = base.transaction('kv', 'readwrite'), o = t.objectStore('kv');
      if (d) for (const k of KEYS) o.put(d[k], k);
      o.put(meta, 'sync');
      t.oncomplete = () => ok();
      t.onerror = t.onabort = () => no(t.error);
    });
  }

  /* ---------- syncing ---------- */
  const busy = () => Trainer.busy() || document.querySelector('dialog[open]:not(#account)');
  function run() { return (running ||= work().finally(() => { running = null; })); }
  async function work() {
    if (!user) return;
    clearTimeout(timer);
    lastTry = Date.now();
    show('busy');
    try {
      await ready;
      let cloud = await api('data');
      for (let tries = 0; tries < 6; tries++) {
        if (writing) { await new Promise(r => setTimeout(r, 200)); continue; }
        const seen = edits, meta = await getKV('sync'), mine = await local();
        const base = meta?.uid === user.id ? meta.base : null, theirs = cloud.blob ? { ...EMPTY, ...(await unpack(cloud.blob)) } : { ...EMPTY };
        const fresh = !base && meta?.uid && meta.uid !== user.id && !isEmpty(mine);
        const mix = fresh ? await ask('This device has data from a different account. Add it to this account?', 'Add it', 'Use account data only') : true;
        const merged = mix ? Merge.doc(base, mine, theirs) : theirs, changed = !Merge.eq(merged, mine);
        if (changed && busy()) { show('wait'); return schedule(3000); } // never redraw under the timer or an open dialog
        if (!Merge.eq(merged, theirs) || !cloud.blob) {
          try { cloud = { rev: (await api('data', 'PUT', { rev: cloud.rev, blob: await pack(merged) })).rev, blob: null }; } catch (e) {
            if (e.status !== 409) throw e;
            cloud = e.data; // another device saved first: merge with that
            continue;
          }
        }
        // Saved here meanwhile: go again. The old base stays, because this device has not applied the merge yet.
        if (edits !== seen || writing || (changed && busy())) { schedule(1000); return show('wait'); }
        if (changed) reload(merged); // no pause between the check and this, so later edits build on the merged data
        await write(changed ? merged : null, { uid: user.id, base: merged });
        return show('ok');
      }
      schedule(3000);
    } catch (e) {
      if (e.status === 401) { user = null; return show('off'); }
      show(e.status === 413 ? 'big' : 'error');
      if (e.status !== 413) schedule(30000);
    }
  }
  function reload(d) {
    const v = $('session').value, cur = /^\d+$/.test(v) ? sessions[+v] : null;
    sessions = structuredClone(d.sessions);
    WCA.load(d.wca);
    for (const f of FIELDS) if (d.settings[f] != null) $(f).value = d.settings[f];
    fillSizes();
    const i = cur ? sessions.findIndex(s => s.id === cur.id) : -1;
    fillSessions(v.startsWith('wca:') && WCA.hasEvent(v) ? v : Math.max(0, i));
    Trainer.load(structuredClone(d.trainer));
  }

  /* ---------- account window ---------- */
  const TEXT = { off: 'Not signed in', busy: 'Syncing…', wait: 'Waiting to sync', ok: 'Synced', error: 'Not synced, will retry', big: 'Too much data to sync' };
  function show(s) {
    state = s;
    $('syncstate').textContent = TEXT[s];
    $('signin').textContent = user ? user.username || user.wca?.name || 'Account' : 'Sign in';
  }
  function draw(message = '') {
    const here = methods?.ready;
    $('accmsg').textContent = message || (here ? '' : 'Sign-in works on the Vercel site once it is set up. Your data is still saved in this browser.');
    $('accout').hidden = !!user || !here;
    $('accin').hidden = !user;
    $('accwca').hidden = !methods?.wca;
    $('accor').hidden = !methods?.wca;
    if (!user) return;
    $('accwho').textContent = [user.username && `Username: ${user.username}`, user.wca && `WCA: ${user.wca.name}${user.wca.id ? ` (${user.wca.id})` : ''}`].filter(Boolean).join(' · ');
    $('accwcalink').hidden = !!user.wca || !methods?.wca;
    $('accsum').textContent = user.hasPassword ? 'Change username or password' : 'Add a username and password';
    $('acccurbox').hidden = !user.hasPassword;
    $('accnewname').value = user.username || '';
  }
  async function attempt(fn) {
    $('accmsg').textContent = 'Working…';
    for (const b of $('account').querySelectorAll('button')) b.disabled = true;
    try { await fn(); } catch (e) { draw(e.message); } finally { for (const b of $('account').querySelectorAll('button')) b.disabled = false; }
  }
  function clearPasswords() { for (const i of $('account').querySelectorAll('input[type=password]')) i.value = ''; }
  async function signedIn(u) {
    user = u;
    clearPasswords();
    draw('Signed in.');
    $('account').close();
    await run();
  }
  async function signOut() {
    if (running) await running;
    if (state !== 'ok') await run();
    const wipe = await ask(state === 'ok' ? 'Also remove your data from this device? It stays in your account.' : 'Your latest changes are not synced. Remove your data from this device anyway? Unsynced changes would be lost.', 'Remove from device', 'Keep on device');
    await api('logout', 'POST', {});
    clearTimeout(timer);
    user = null;
    if (wipe) { reload(structuredClone(EMPTY)); await write(EMPTY, null); }
    show('off');
    draw('Signed out.');
  }
  async function remove() {
    if (!(await ask('Delete your account and everything synced to it? This cannot be undone. Data on this device stays.', 'Delete account', 'Cancel'))) return draw();
    if (running) await running;
    await api('account', 'DELETE', { current: $('acccur').value });
    clearTimeout(timer);
    user = null;
    await setKV('sync', null);
    clearPasswords();
    show('off');
    draw('Your account was deleted.');
  }
  const RESULTS = { ok: '', linked: 'Your WCA account is connected.', cancelled: 'WCA sign-in was cancelled.', expired: 'That sign-in expired. Try again.', failed: 'WCA sign-in failed. Try again.', taken: 'That WCA account already belongs to another Cubestats account.', other: 'A different WCA account is already connected.' };

  let loaded, parts = 2;
  const ready = new Promise(r => { loaded = () => { if (!--parts) r(); }; }); // statistics and trainer have both read their saved data
  async function init() {
    $('signin').onclick = () => { draw(); $('account').showModal(); };
    $('accclose').onclick = () => $('account').close();
    $('account').addEventListener('close', clearPasswords);
    $('accwca').onclick = $('accwcalink').onclick = () => { location.href = 'api/wca'; };
    $('accform').onsubmit = e => {
      e.preventDefault();
      const path = e.submitter?.value === 'register' ? 'register' : 'login';
      attempt(async () => signedIn((await api(path, 'POST', { username: $('accname').value, password: $('accpass').value })).user));
    };
    $('accchange').onsubmit = e => {
      e.preventDefault();
      attempt(async () => { user = (await api('account', 'POST', { username: $('accnewname').value, password: $('accnewpass').value, current: $('acccur').value })).user; clearPasswords(); show(state); draw('Saved. Other devices were signed out.'); });
    };
    $('accsignout').onclick = () => attempt(signOut);
    $('accdelete').onclick = () => attempt(remove);
    addEventListener('online', () => user && schedule(0));
    document.addEventListener('visibilitychange', () => { if (user && !document.hidden && Date.now() - lastTry > 20000) schedule(0); });

    const result = new URLSearchParams(location.search).get('signin');
    if (result) history.replaceState(null, '', location.pathname);
    if (location.protocol !== 'file:') {
      try { methods = await api('me'); user = methods.user; } catch { methods = null; }
    }
    show('off');
    if (result && RESULTS[result]) { draw(RESULTS[result]); $('account').showModal(); }
    if (user) run();
  }
  return { init, begin, end, loaded: () => loaded(), wcaId: () => user?.wca?.id || '' };
})();
