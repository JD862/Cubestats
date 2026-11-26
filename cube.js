'use strict';
/* 3x3x3 sticker simulator and algorithm tools. x = right, y = up, z = front. */
const Cube = (() => {
  const FACES = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
  const stickers = [], index = new Map(), key = (p, n) => p.join() + '|' + n.join();
  for (const f of Object.keys(FACES)) {
    const n = FACES[f], ax = n.findIndex(v => v);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const p = [a, a, a];
      p[ax] = n[ax]; p[(ax + 1) % 3] = a; p[(ax + 2) % 3] = b;
      index.set(key(p, n), stickers.length);
      stickers.push({ p, n, f });
    }
  }
  // Clockwise quarter turns seen from the +x, +y and +z sides.
  const TURN = [([x, y, z]) => [x, z, -y], ([x, y, z]) => [-z, y, x], ([x, y, z]) => [y, -x, z]];
  const perms = {};
  for (const f of Object.keys(FACES)) {
    const ax = FACES[f].findIndex(v => v), side = FACES[f][ax], times = side > 0 ? 1 : 3;
    perms[f] = stickers.map(({ p, n }, i) => {
      if (p[ax] !== side) return i;
      for (let k = 0; k < times; k++) { p = TURN[ax](p); n = TURN[ax](n); }
      return index.get(key(p, n));
    });
  }
  const solved = () => stickers.map(s => s.f);
  function apply(state, moves) { // moves: [{ f, n }] with outer faces only
    for (const { f, n } of moves) for (let k = 0; k < n; k++) {
      const next = [];
      perms[f].forEach((to, from) => { next[to] = state[from]; });
      state = next;
    }
    return state;
  }
  const at = (state, p, f) => state[index.get(key(p, FACES[f]))];

  // Rotations: which face ends up in each position. Wide and slice moves are outer turns plus a rotation.
  const ROT = { x: { U: 'F', B: 'U', D: 'B', F: 'D' }, y: { L: 'F', B: 'L', R: 'B', F: 'R' }, z: { R: 'U', D: 'R', L: 'D', U: 'L' } };
  const PARTS = {
    r: [['L', 1], ['x', 1]], l: [['R', 1], ['x', 3]], u: [['D', 1], ['y', 1]], d: [['U', 1], ['y', 3]], f: [['B', 1], ['z', 1]], b: [['F', 1], ['z', 3]],
    M: [['R', 1], ['L', 3], ['x', 3]], E: [['U', 1], ['D', 3], ['y', 3]], S: [['F', 3], ['B', 1], ['z', 1]],
  };
  // Parses an algorithm into outer turns of a cube that is never rotated. Throws on anything unknown.
  function parse(text) {
    const out = [];
    let o = { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B' };
    const step = (m, n) => {
      if (ROT[m]) for (let k = 0; k < n; k++) { const p = o; o = { ...p }; for (const to in ROT[m]) o[to] = p[ROT[m][to]]; }
      else out.push({ f: o[m], n });
    };
    const tokens = String(text).replace(/[’‘`]/g, "'").replace(/[()[\],]/g, ' ').match(/\S+/g) || [];
    for (const tok of tokens) for (const part of tok.match(/[A-Za-z]w?[23]?'?|./g)) {
      const m = /^([UDRLFBudrlfbMESxyz])(w?)([23]?)('?)$/.exec(part);
      if (!m || (m[2] && !FACES[m[1]])) throw new Error(`"${part}" is not a move`);
      const name = m[2] ? m[1].toLowerCase() : m[1], n = ((m[3] ? +m[3] : 1) * (m[4] ? 3 : 1)) % 4;
      for (let k = 0; k < n; k++) for (const [p, c] of PARTS[name] || [[name, 1]]) step(p, c);
    }
    return simplify(out);
  }
  const AXIS = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
  function simplify(moves) {
    const out = [];
    for (const m of moves) {
      let i = out.length - 1;
      while (i >= 0 && out[i].f !== m.f && AXIS[out[i].f] === AXIS[m.f]) i--;
      if (i >= 0 && out[i].f === m.f) {
        const n = (out[i].n + m.n) % 4;
        if (n) out[i] = { f: m.f, n }; else out.splice(i, 1);
      } else if (m.n % 4) out.push({ f: m.f, n: m.n % 4 });
    }
    return out;
  }
  // Difficulty from 1 to 10: how long an alg is, how awkward its moves are, and how much of it is easy sequences.
  const EFFORT = { R: 1, U: 1, r: 1.2, L: 1.3, l: 1.4, F: 1.4, D: 1.4, f: 1.6, u: 1.5, d: 1.5, B: 1.8, b: 1.8, M: 1.5, E: 2, S: 2, x: 1, y: 1, z: 1 };
  const OH_EFFORT = { ...EFFORT, L: 2, l: 2, F: 1.7, M: 3, S: 3, E: 3 }; // slices and left turns are hard with one hand
  const IN_GROUP = 0.65; // moves inside an easy sequence take this much of their usual effort
  const known = new Map();
  // Number of moves and total effort of an alg.
  function measure(text, oneHanded) {
    const id = (oneHanded ? 'OH ' : '') + text;
    if (known.has(id)) return known.get(id);
    const table = oneHanded ? OH_EFFORT : EFFORT, one = m => (table[m[1] === 'w' ? m[0].toLowerCase() : m[0]] || 1) + (m.includes('2') ? 0.3 : 0), groups = split(text);
    const r = { moves: groups.flat().length, effort: groups.reduce((a, g) => a + g.reduce((x, m) => x + one(m), 0) * (g.length > 1 ? IN_GROUP : 1), 0) };
    known.set(id, r);
    return r;
  }
  const tenth = (v, lo) => Math.round(Math.min(10, Math.max(lo, v)) * 10) / 10;
  const difficulty = (text, oneHanded) => tenth(1 + (measure(text, oneHanded).effort - 2) * 0.5, 1);
  // Efficiency from 1 to 10: half for how short an alg is next to the shortest one for its case, half for how easy each move is on average.
  function efficiency(text, algs, oneHanded) {
    const { moves, effort } = measure(text, oneHanded);
    if (!moves) return 1;
    const shortest = Math.min(moves, ...algs.map(a => measure(a, oneHanded).moves).filter(Boolean));
    return tenth(5 * shortest / moves + 5 * Math.min(1, IN_GROUP * moves / effort), 1);
  }
  // Easy sequences that are turned as one, such as R U R' U'. X stands for each face in the list.
  const TRIGGERS = new Map();
  for (const [faces, shapes] of [
    [['R', 'L', 'r', 'l'], ["X U X' U'", "X' U' X U", "X U' X' U", "X' U X U'", "X' F X F'", "X F' X' F", "F X' F' X", "F' X F X'"]],
    [['R', 'L', 'r', 'l', 'F', 'f'], ["X U X'", "X U' X'", "X U2 X'", "X' U X", "X' U' X", "X' U2 X"]],
    [[''], ["r U R' U'", "r' U' R U", "l' U' L U", "l U L' U'"]],
  ]) for (const f of faces) for (const s of shapes) TRIGGERS.set(s.replaceAll('X', f), s.split(' ').length);
  // Splits an alg into single moves and easy sequences, covering as many moves as possible with as few groups as possible.
  function split(text) {
    const m = String(text).match(/[UDRLFBudrlfbMESxyz]w?[23]?'?/g) || [], best = Array(m.length + 1).fill(null), out = [];
    best[m.length] = { score: 0 };
    for (let i = m.length - 1; i >= 0; i--) {
      best[i] = { score: best[i + 1].score, n: 1 };
      for (const n of [3, 4]) {
        if (i + n > m.length || TRIGGERS.get(m.slice(i, i + n).join(' ')) !== n) continue;
        const score = best[i + n].score + n * 10 - 5;
        if (score >= best[i].score) best[i] = { score, n };
      }
    }
    for (let i = 0; i < m.length; i += best[i].n) out.push(m.slice(i, i + best[i].n));
    return out;
  }
  const grouped = text => split(text).map(g => (g.length > 1 ? `(${g.join(' ')})` : g[0])).join(' ');
  const invert = moves => moves.map(m => ({ f: m.f, n: 4 - m.n })).reverse();
  const turnY = (moves, k) => moves.map(m => { let f = m.f; for (let i = 0; i < k; i++) f = { F: 'R', R: 'B', B: 'L', L: 'F' }[f] || f; return { f, n: m.n }; });
  const text = moves => moves.map(m => m.f + ['', '', '2', "'"][m.n]).join(' ');
  // True when everything below the top layer is solved.
  const CORNER = stickers.map(s => s.p.every(v => v));
  const SOLVED = solved(), anyTurn = (state, f, test) => [0, 1, 2, 3].some(n => test(n ? apply(state, [{ f, n }]) : state));
  const cornersDone = state => CORNER.every((c, i) => !c || state[i] === SOLVED[i]);
  // Whether a state is what algs of this kind should lead to.
  function reached(kind, state) {
    switch (kind) {
      case 'f2l': return keepsF2L(state);
      case 'layer1': return stickers.every((s, i) => s.p[1] !== -1 || state[i] === s.f); // bottom layer solved
      case 'oll': return keepsF2L(state) && oriented(state);
      case 'eoll': return keepsF2L(state) && stickers.every((s, i) => CORNER[i] || s.f !== 'U' || state[i] === 'U');
      case 'cpll': return keepsF2L(state) && oriented(state) && anyTurn(state, 'U', cornersDone);
      case 'pll': return anyTurn(state, 'U', s => s.every((v, i) => v === SOLVED[i]));
      case 'ort': return stickers.every((s, i) => !CORNER[i] || (s.f !== 'U' && s.f !== 'D') || state[i] === s.f);
      case 'cll': return anyTurn(state, 'U', cornersDone);
      case 'pbl': return anyTurn(state, 'D', s => anyTurn(s, 'U', cornersDone));
      default: return true;
    }
  }
  // Solved cube with the last-layer pieces marked X, so only the first two layers are coloured.
  // Solved cube with only the bottom layer coloured, for first-layer cases.
  const maskedLayer1 = () => stickers.map(s => (s.p[1] !== -1 && !(s.p[0] === 0 && s.p[2] === 0) ? 'X' : s.f));
  const maskedF2L = () => stickers.map(s => (s.p[1] === 1 && !(s.p[0] === 0 && s.p[2] === 0) ? 'X' : s.f));
  // Corner points of the visible U, F and R stickers, seen from the front right.
  function isoView(state, two) {
    const out = [];
    stickers.forEach(({ p, n, f }, i) => {
      if (!'UFR'.includes(f) || (two && !CORNER[i])) return;
      const ax = n.findIndex(v => v), c = p.map((v, k) => (k === ax ? (two ? 1 : 1.5) * n[k] : two ? v / 2 : v));
      const pts = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => {
        const q = [...c];
        q[(ax + 1) % 3] += a * 0.46;
        q[(ax + 2) % 3] += b * 0.46;
        return [(q[0] - q[2]) * 0.866, (q[0] + q[2]) * 0.5 - q[1]];
      });
      out.push({ pts, f: state[i] });
    });
    return out;
  }
  const keepsF2L = state => stickers.every((s, i) => s.p[1] === 1 || state[i] === s.f);
  const oriented = state => stickers.every((s, i) => s.f !== 'U' || state[i] === 'U');

  // Last-layer picture: the top face with the four side rows around it.
  function topView(state) {
    const cells = [];
    for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) cells.push({ x: c, y: r, f: at(state, [c, 1, r], 'U') });
    for (let i = -1; i <= 1; i++) {
      cells.push({ x: i, y: 2, f: at(state, [i, 1, 1], 'F'), side: 'h' }, { x: i, y: -2, f: at(state, [i, 1, -1], 'B'), side: 'h' });
      cells.push({ x: 2, y: i, f: at(state, [1, 1, i], 'R'), side: 'v' }, { x: -2, y: i, f: at(state, [-1, 1, i], 'L'), side: 'v' });
    }
    return cells;
  }
  return { solved, apply, parse, simplify, invert, turnY, text, grouped, difficulty, efficiency, keepsF2L, reached, maskedF2L, maskedLayer1, isoView, topView };
})();

const ALG_SETS = (() => {
  const list = (prefix, src) => src.trim().split('\n').map(l => { const [n, a] = l.trim().split(': '); return { id: `${prefix} ${n}`, name: `${prefix} ${n}`, alg: a }; });
  return {
    OLL: list('OLL', `
      1: R U2 R2 F R F' U2 R' F R F'
      2: F R U R' U' F' f R U R' U' f'
      3: f R U R' U' f' U' F R U R' U' F'
      4: f R U R' U' f' U F R U R' U' F'
      5: r' U2 R U R' U r
      6: r U2 R' U' R U' r'
      7: r U R' U R U2 r'
      8: r' U' R U' R' U2 r
      9: R U R' U' R' F R2 U R' U' F'
      10: R U R' U R' F R F' R U2 R'
      11: r U R' U R' F R F' R U2 r'
      12: M' R' U' R U' R' U2 R U' R r'
      13: F U R U' R2 F' R U R U' R'
      14: R' F R U R' F' R F U' F'
      15: r' U' r R' U' R U r' U r
      16: r U r' R U R' U' r U' r'
      17: R U R' U R' F R F' U2 R' F R F'
      18: r U R' U R U2 r2 U' R U' R' U2 r
      19: r' R U R U R' U' M' R' F R F'
      20: r U R' U' M2 U R U' R' U' M'
      21: R U2 R' U' R U R' U' R U' R'
      22: R U2 R2 U' R2 U' R2 U2 R
      23: R2 D' R U2 R' D R U2 R
      24: r U R' U' r' F R F'
      25: F' r U R' U' r' F R
      26: R U2 R' U' R U' R'
      27: R U R' U R U2 R'
      28: r U R' U' r' R U R U' R'
      29: R U R' U' R U' R' F' U' F R U R'
      30: F R' F R2 U' R' U' R U R' F2
      31: R' U' F U R U' R' F' R
      32: L U F' U' L' U L F L'
      33: R U R' U' R' F R F'
      34: R U R2 U' R' F R U R U' F'
      35: R U2 R2 F R F' R U2 R'
      36: L' U' L U' L' U L U L F' L' F
      37: F R' F' R U R U' R'
      38: R U R' U R U' R' U' R' F R F'
      39: L F' L' U' L U F U' L'
      40: R' F R U R' U' F' U R
      41: R U R' U R U2 R' F R U R' U' F'
      42: R' U' R U' R' U2 R F R U R' U' F'
      43: F' U' L' U L F
      44: F U R U' R' F'
      45: F R U R' U' F'
      46: R' U' R' F R F' U R
      47: R' U' R' F R F' R' F R F' U R
      48: F R U R' U' R U R' U' F'
      49: r U' r2 U r2 U r2 U' r
      50: r' U r2 U' r2 U' r2 U r'
      51: F U R U' R' U R U' R' F'
      52: R U R' U R U' B U' B' R'
      53: r' U' R U' R' U R U' R' U2 r
      54: r U R' U R U' R' U R U2 r'
      55: R' F R U R U' R2 F' R2 U' R' U R U R'
      56: r' U' r U' R' U R U' R' U R r' U r
      57: R U R' U' M' U R U' r'`),
    PLL: list('PLL', `
      Aa: x R' U R' D2 R U' R' D2 R2 x'
      Ab: x R2 D2 R U R' D2 R U' R x'
      E: x' R U' R' D R U R' D' R U R' D R U' R' D' x
      F: R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R
      Ga: R2 U R' U R' U' R U' R2 U' D R' U R D'
      Gb: R' U' R U D' R2 U R' U R U' R U' R2 D
      Gc: R2 U' R U' R U R' U R2 U D' R U' R' D
      Gd: R U R' U' D R2 U' R U' R' U R' U R2 D'
      H: M2 U M2 U2 M2 U M2
      Ja: R' U L' U2 R U' R' U2 R L
      Jb: R U R' F' R U R' U' R' F R2 U' R'
      Na: R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'
      Nb: R' U R U' R' F' U' F R U R' F R' F' R U' R
      Ra: R U' R' U' R U R D R' U' R D' R' U2 R'
      Rb: R2 F R U R U' R' F' R U2 R' U2 R
      T: R U R' U' R' F R2 U' R' U' R U R' F'
      Ua: M2 U M U2 M' U M2
      Ub: M2 U' M U2 M' U' M2
      V: R' U R' U' y R' F' R2 U' R' U R' F R F
      Y: F R U' R' U' R U R' F' R U R' U' R' F R F'
      Z: M' U M2 U M2 U M' U2 M2`),
  };
})();
