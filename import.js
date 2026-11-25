'use strict';
// Importers return { sessions: [{ name, solves: [{ t, pen, date }] }], skipped }.
// t: ms. pen: '' | '+' (2s already in t) | '+?' (unknown whether included) | 'DNF'. date: epoch ms or null.
const Import = (() => {
  function parseTime(v) {
    let s = String(v).trim().replace(/\s*\[.*\]$/, '');
    if (/^(DNF|DNS)(\(.*\))?\+?$/i.test(s)) return { t: 0, pen: 'DNF' };
    s = s.replace(/^\((.*)\)$/, '$1');
    const plus = s.endsWith('+');
    s = s.replace(/\+$/, '');
    if (!/^(\d+:){0,2}\d*[.,]?\d+$/.test(s)) return null;
    const sec = s.replace(',', '.').split(':').reduce((a, p) => a * 60 + Number(p), 0);
    return Number.isFinite(sec) ? { t: Math.round(sec * 1000), pen: plus ? '+?' : '' } : null;
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') { // Excel serial date, taken as local time
      const u = new Date(Math.round((v - 25569) * 864e5));
      return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()).getTime();
    }
    let s = String(v).trim();
    if (/^\d{10}$/.test(s)) return s * 1000;
    if (/^\d{13}$/.test(s)) return +s;
    if (/^\d{4}-\d\d-\d\d$/.test(s)) s += 'T00:00:00';
    const d = new Date(s.replace(/^(\d{4}-\d\d-\d\d) /, '$1T')).getTime();
    return Number.isNaN(d) ? null : d;
  }

  function splitCSV(text, sep) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c !== '"') cell += c;
        else if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // Cells are strings, or { n, date: true } for date/duration formatted spreadsheet cells.
  function fromTable(rows) {
    const norm = c => (typeof c === 'string' ? c.trim().toLowerCase() : '');
    const isTime = c => /^(time|times|result|single)\b/.test(norm(c));
    const h = rows.findIndex(r => r.some(isTime));
    if (h < 0) return null;
    const find = re => rows[h].findIndex(c => re.test(norm(c)));
    const ti = rows[h].findIndex(isTime), di = find(/^(date|timestamp)/), pi = find(/^p\.?1$/);
    const value = c => (c && c.date ? { t: Math.round(c.n * 864e5), pen: '' } : parseTime(c ?? ''));
    const solves = [];
    let skipped = 0;
    for (const r of rows.slice(h + 1)) {
      if (r[ti] == null || r[ti] === '') continue;
      const p = value(r[ti]);
      if (!p) { skipped++; continue; }
      if (p.pen === '+?' && pi >= 0) { // csTimer's P.1 column is the raw time
        const raw = value(r[pi]);
        if (raw) { p.t = raw.t + 2000; p.pen = '+'; }
      }
      const d = di >= 0 ? r[di] : null;
      solves.push({ ...p, date: parseDate(d && d.date ? d.n : d) });
    }
    return { solves, skipped };
  }

  function fromJSON(data) {
    let names = {};
    try {
      const sd = data.properties?.sessionData;
      names = (typeof sd === 'string' ? JSON.parse(sd) : sd) || {};
    } catch { /* names are optional */ }
    const out = [];
    for (const key of Object.keys(data)) {
      const m = /^session(\d+)$/.exec(key);
      if (!m) continue;
      const list = typeof data[key] === 'string' ? JSON.parse(data[key]) : data[key];
      if (!Array.isArray(list) || !list.length) continue;
      const info = names[m[1]] || {};
      out.push({
        rank: Number(info.rank) || Number(m[1]),
        name: String(info.name ?? `Session ${m[1]}`),
        solves: list.map(s => {
          const [pen, ms] = s[0];
          return { t: ms + Math.max(pen, 0), pen: pen < 0 ? 'DNF' : pen ? '+' : '', date: s[3] ? s[3] * 1000 : null };
        }),
      });
    }
    return out.sort((a, b) => a.rank - b.rank);
  }

  function fromText(text, name) {
    text = text.replace(/^﻿/, '');
    if (/^\s*\[\s*\{/.test(text)) return { sessions: [], skipped: 0, wca: WCA.build(JSON.parse(text)) };
    if (/^\s*\{/.test(text)) return { sessions: fromJSON(JSON.parse(text)), skipped: 0 };
    const first = text.trimStart().split('\n', 1)[0];
    const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    let rows = splitCSV(text, sep);
    if (rows[0]?.length === 1 && rows[0][0].includes(sep)) { // whole rows wrapped in quotes
      rows = rows.map(r => (r.length === 1 ? splitCSV(r[0], sep)[0] || [] : r));
    }
    const table = fromTable(rows);
    if (table) return { sessions: [{ name, solves: table.solves }], skipped: table.skipped };
    const solves = [];
    let skipped = 0;
    for (const line of text.split(/\r?\n/)) {
      const numbered = /^\s*\d+\.\s+(\S+)/.exec(line); // "12. 9.87  R U R' ..."
      const tokens = numbered ? [numbered[1]] : line.split(line.includes('.') ? /[\s;,]+/ : /[\s;]+|,(?!\d)/).filter(Boolean);
      for (const tok of tokens) {
        const p = parseTime(tok);
        if (p) solves.push({ ...p, date: null }); else skipped++;
      }
    }
    return { sessions: [{ name, solves }], skipped };
  }

  async function unzip(buf) {
    const v = new DataView(buf);
    let e = buf.byteLength - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a valid .xlsx file');
    const files = {}, n = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nl)), o = v.getUint32(p + 42, true);
      const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
      files[name] = async () => {
        const blob = new Blob([new Uint8Array(buf, start, size)]);
        return method ? new Response(blob.stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : blob.text();
      };
      p += 46 + nl + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    return files;
  }

  async function fromXLSX(buf, name) {
    const files = await unzip(buf);
    const xml = async f => (files[f] ? new DOMParser().parseFromString(await files[f](), 'text/xml') : null);
    const all = (n, tag) => (n ? [...n.getElementsByTagNameNS('*', tag)] : []);
    const textOf = n => all(n, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join('');
    const shared = all(await xml('xl/sharedStrings.xml'), 'si').map(textOf);
    const styles = await xml('xl/styles.xml'), codes = {};
    all(styles, 'numFmt').forEach(f => { codes[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
    const isDate = all(all(styles, 'cellXfs')[0], 'xf').map(x => {
      const id = +x.getAttribute('numFmtId');
      return (id >= 14 && id <= 22) || (id >= 45 && id <= 47) ||
        /[hmsyd]/i.test((codes[id] || '').replace(/"[^"]*"|\\.|\[(?![hms]+\])[^\]]*\]/gi, ''));
    });
    const rels = {};
    all(await xml('xl/_rels/workbook.xml.rels'), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const sheets = all(await xml('xl/workbook.xml'), 'sheet'), sessions = [];
    let skipped = 0;
    for (const s of sheets) {
      const rid = [...s.attributes].find(a => a.localName === 'id')?.value, target = rels[rid];
      if (!target) continue;
      const doc = await xml(target.startsWith('/') ? target.slice(1) : 'xl/' + target);
      const rows = all(doc, 'row').map(r => {
        const row = [];
        all(r, 'c').forEach((c, i) => {
          const ref = (c.getAttribute('r') || '').replace(/\d/g, '');
          const col = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : i;
          const raw = all(c, 'v')[0]?.textContent ?? '', type = c.getAttribute('t'), numeric = (!type || type === 'n') && raw !== '';
          row[col] = type === 's' ? shared[+raw] : type === 'inlineStr' ? textOf(c)
            : numeric && isDate[+c.getAttribute('s')] ? { n: +raw, date: true }
            : numeric ? String(+(+raw).toFixed(6)) : raw;
        });
        return Array.from(row);
      });
      const t = fromTable(rows);
      if (!t) continue;
      skipped += t.skipped;
      if (t.solves.length) sessions.push({ name: sheets.length > 1 ? `${name} – ${s.getAttribute('name')}` : name, solves: t.solves });
    }
    return { sessions, skipped };
  }

  async function fromFile(file) {
    const name = file.name.replace(/\.[^.]+$/, ''), buf = await file.arrayBuffer();
    const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    if (b[0] === 0x50 && b[1] === 0x4b) return fromXLSX(buf, name);
    if (b[0] === 0xd0 && b[1] === 0xcf) throw new Error('old .xls format; save it as .xlsx or CSV');
    return fromText(new TextDecoder(b[0] === 0xff && b[1] === 0xfe ? 'utf-16le' : 'utf-8').decode(buf), name);
  }
  return { fromFile, fromText };
})();
