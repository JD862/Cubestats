'use strict';
/* Events and alg groups for the trainer. `kind` says what an alg has to achieve (see Cube.reached). */
// Methods of each event and the sets they use, in order. Custom and Learnt are added to every method.
const METHODS = {
  '3x3': { Beginner: ['First layer', 'Second layer', '2-look OLL', '2-look PLL'], CFOP: ['F2L', '2-look OLL', 'OLL', '2-look PLL', 'PLL'] },
  '2x2': { Ortega: ['Ortega OLL', 'Ortega PBL'], CLL: ['CLL'] },
  OH: { CFOP: ['F2L', '2-look OLL', 'OLL', '2-look PLL', 'PLL'] },
  Blind: { 'M2 and Old Pochmann': ['M2 edges', 'OP corners'] },
  '4x4': { Reduction: ['Parity', '2-look OLL', 'OLL', '2-look PLL', 'PLL'] },
  '5x5': { Reduction: ['Edge parity', '2-look OLL', 'OLL', '2-look PLL', 'PLL'] },
  Pyraminx: { L4E: ['L4E'] },
};
const ALG_EVENTS = (() => {
  const list = (id, prefix, kind, src) => src.trim().split('\n').map(l => {
    const [n, a] = l.trim().split(': ');
    return { id: `${id} ${n}`, name: `${prefix}${n}`, alg: a, kind };
  });
  const oll = n => ALG_SETS.OLL[n - 1].alg, pll = n => ALG_SETS.PLL.find(c => c.id === 'PLL ' + n).alg;
  const ocll = [['Antisune', 26], ['Sune', 27], ['H', 21], ['Pi', 22], ['U', 23], ['T', 24], ['L', 25]];

  const F2L = list('F2L', 'F2L ', 'f2l', `
    Top 1: R U R'
    Top 2: R U' R'
    Top 3: F' U F
    Top 4: F' U' F
    Top 5: R U R' F' U' F
    Top 6: F' U' F R U R'
    Top 7: R U' R' U' R U R'
    Top 8: R U' R' U R U R'
    Top 9: R U R' U2 R U' R'
    Top 10: R U2 R' U R U' R'
    Top 11: R U2 R' U' R U R'
    Top 12: R U2 R' U2 R U' R'
    Top 13: F' U2 F2 R' F' R
    Top 14: R U' R' U F' U' F
    Top 15: R2 U2 R' U' R U' R2
    Top 16: R' U2 R2 U R2 U R
    Top 17: R U' R' U2 F' U' F
    Top 18: R U2 R' U F' U' F
    Top 19: F' U F U2 R U R'
    Top 20: F' U F U' F' U' F
    Top 21: F' U2 F U F' U' F
    Top 22: R' U' R F R' F' U R
    Top 23: R2 U2 F R2 F' U2 R2
    Top 24: F2 U2 F U F' U F2
    Corner in slot 1: R U' R' F' U' F
    Corner in slot 2: F' U F R U R'
    Corner in slot 3: R U' R' U R U' R'
    Corner in slot 4: R U2 R' F' U2 F
    Corner in slot 5: F' U F U R U' R'
    Corner in slot 6: R U R' U' F' U' F
    Edge in slot 1: F' U F R U2 R'
    Edge in slot 2: R U' R' U2 R U' R'
    Edge in slot 3: R U R' U2 R U R'
    Edge in slot 4: R U' R' U' F' U' F
    Edge in slot 5: F' U F U R U R'
    Edge in slot 6: R2 U2 R2 U' R2 U' R2
    Both in slot 1: R F U R U' R' F' U' R'
    Both in slot 2: R U F R U R' U' F' R'
    Both in slot 3: R U2 R U R' U R U2 R2
    Both in slot 4: R2 U2 R' U' R U' R' U2 R'
    Both in slot 5: R2 U2 F R2 F' U2 R' U R'`);
  const OLL2 = [
    ...list('2OLL', 'Edges: ', 'eoll', `
    Line: F R U R' U' F'
    L shape: f R U R' U' f'
    Dot: F R U R' U' F' f R U R' U' f'`),
    ...ocll.map(([n, k]) => ({ id: '2OLL ' + n, name: 'Corners: ' + n, alg: oll(k), kind: 'oll' })),
  ];
  const PLL2 = [
    { id: '2PLL Adjacent', name: 'Corners: Adjacent', alg: pll('T'), kind: 'cpll' },
    { id: '2PLL Diagonal', name: 'Corners: Diagonal', alg: pll('Y'), kind: 'cpll' },
    ...['Ua', 'Ub', 'H', 'Z'].map(n => ({ id: '2PLL ' + n, name: 'Edges: ' + n, alg: pll(n), kind: 'pll' })),
  ];
  // Beginner method: a first-layer corner, then a second-layer edge, each above the front right.
  const BEGINNER1 = list('BEG1', 'Corner: ', 'layer1', `
    White facing right: R U R'
    White facing front: F' U' F
    White on top: R U2 R' U' R U R'`);
  const BEGINNER2 = list('BEG2', 'Edge to the ', 'f2l', `
    right: U R U' R' U' F' U F
    left: U' L' U L U F U' F'`);
  const three = {
    'First layer': BEGINNER1, 'Second layer': BEGINNER2, F2L, '2-look OLL': OLL2, OLL: ALG_SETS.OLL.map(c => ({ ...c, kind: 'oll' })),
    '2-look PLL': PLL2, PLL: ALG_SETS.PLL.map(c => ({ ...c, kind: 'pll' })),
  };

  // One-handed uses the same cases with slice-free edge PLLs, and keeps its own times.
  const ohAlgs = {
    Ua: "R U' R U R U R U' R' U' R2", Ub: "R2 U R U R' U' R' U' R' U R'",
    H: 'R2 U2 R U2 R2 U2 R2 U2 R U2 R2', Z: "R' U' R U' R U R U' R' U R U R2 U' R'",
  };
  const oh = {};
  for (const g in three) oh[g] = three[g].map(c => ({ ...c, id: 'OH ' + c.id, alg: (/^2?PLL /.test(c.id) && ohAlgs[c.id.split(' ')[1]]) || c.alg }));

  const two = {
    'Ortega OLL': list('2x2 OLL', 'OLL ', 'ort', `
    Sune: R U R' U R U2 R'
    Antisune: R U2 R' U' R U' R'
    Pi: F R U R' U' R U R' U' F'
    U: F R U R' U' F'
    T: R U R' U' R' F R F'
    L: F R' F' R U R U' R'
    H: R2 U2 R U2 R2`),
    'Ortega PBL': list('2x2 PBL', 'PBL ', 'pbl', `
    Adjacent / solved: R U R' U' R' F R2 U' R' U' R U R' F'
    Diagonal / solved: F R U' R' U' R U R' F' R U R' U' R' F R F'
    Adjacent / adjacent: R2 U' R2 U2 F2 U' R2
    Diagonal / diagonal: R2 F2 R2
    Diagonal / adjacent: R U' R F2 R' U R'`),
    CLL: list('CLL', 'CLL ', 'cll', `
    Sune 1: R' U2 R U R' U R
    Sune 2: R F' U' F R' U' R
    Sune 3: F R' F' R U2 R U2 R'
    Sune 4: R' F2 R U2 R U' R' F
    Sune 5: R2 U' R' U2 R F' U2 F R'
    Sune 6: F2 R U R2 F R2 U' R' F2
    Antisune 1: R U2 R' U' R U' R'
    Antisune 2: R' U R F' U F R'
    Antisune 3: F' U F R' U2 R' U2 R
    Antisune 4: R U2 R' U2 R' F R F'
    Antisune 5: R F' U2 F R' U2 R U R2
    Antisune 6: R2 F R' U2 F U2 R F' R2
    Pi 1: R U' R2 U R2 U R2 U' R
    Pi 2: R F R F' U R' U' R U' R'
    Pi 3: R F2 U' R2 U R2 U F2 R'
    Pi 4: R U' R F U2 R2 F R' U' R
    Pi 5: R U2 R' F U2 R' F R U F'
    Pi 6: R' U2 R F' R2 U R' F' R' F
    U 1: R U F R' F' R'
    U 2: R' U F' R F U' R U F'
    U 3: R' U F' R U' R' F2 U2 R
    U 4: R2 U' R U R2 U F R2 F'
    U 5: F2 U R' U' F2 U' R' U2 R
    U 6: R U F U' R U F U2 F R
    T 1: R' U' R U F R F'
    T 2: R U R' U' F' U' F
    T 3: R' U F U' R F R' U F'
    T 4: R U' R F U2 R2 U F R'
    T 5: R' U R' F U' R U F2 R2
    T 6: R U' R' F2 U R U2 R' U F'
    L 1: F' U F U R U' R'
    L 2: R F' U' R' U' R F
    L 3: R2 U R' U2 R U2 R' U R2
    L 4: R F U2 R2 U F R' U2 R
    L 5: F' U2 F U R2 U R U' R2
    L 6: R' U2 R' U' F R2 F' U R2
    H 1: R2 U2 R U2 R2
    H 2: F2 R F2 R2 U2 R F2
    H 3: R U F2 U R2 U R U2 F2
    H 4: R U' R' F U2 R2 F R U' R`),
  };

  // Targets use the Speffz letters. Edge buffer DF, corner buffer UBL.
  const blind = {
    'M2 edges': list('M2', 'Edge ', 'blind', `
    A: M2
    B: R' U R U' M2 U R' U' R
    C: U2 M' U2 M'
    D: L U' L' U M2 U' L U L'
    E: B L' B' M2 B L B'
    F: B L2 B' M2 B L2 B'
    G: B L B' M2 B L' B'
    H: L' B L B' M2 B L' B' L
    I: D M' U R2 U' M U R2 U' D' M2
    J: U R U' M2 U R' U'
    L: U' L' U M2 U' L U
    M: B' R B M2 B' R' B
    N: R B' R' B M2 B' R B R'
    O: B' R' B M2 B' R B
    P: B' R2 B M2 B' R2 B
    Q: F2 M' U M' U M' U2 M U M U M U2 F2 M2
    R: U' L U M2 U' L' U
    S: M2 D U R2 U' M' U R2 U' M D'
    T: U R' U' M2 U R U'
    V: U R2 U' M2 U R2 U'
    W: M U2 M U2
    X: U' L2 U M2 U' L2 U`),
    'OP corners': list('OP', 'Corner ', 'blind', `
    B: R D' R U' R' U' R U R' F' R U R' U' R' F R D R'
    C: F R U' R' U' R U R' F' R U R' U' R' F R F'
    D: F U' R' U' R U R' F' R U R' U' R' F R2 F'
    F: F2 R U' R' U' R U R' F' R U R' U' R' F R F2
    G: D2 R2 U' R' U' R U R' F' R U R' U' R' F D2
    H: D2 R U' R' U' R U R' F' R U R' U' R' F R D2
    I: F' D R U' R' U' R U R' F' R U R' U' R' F R D' F
    J: R2 D' R U' R' U' R U R' F' R U R' U' R' F R D R2
    K: R F R U' R' U' R U R' F' R U R' U' R' F R F' R'
    L: D R U' R' U' R U R' F' R U R' U' R' F R D'
    M: U' R' U' R U R' F' R U R' U' R' F R2
    N: R' U' R' U' R U R' F' R U R' U' R' F R'
    O: R2 U' R' U' R U R' F' R U R' U' R' F
    P: R U' R' U' R U R' F' R U R' U' R' F R
    Q: R' F R U' R' U' R U R' F' R U R' U' R' F R F' R
    S: D' R2 U' R' U' R U R' F' R U R' U' R' F D
    T: D' R U' R' U' R U R' F' R U R' U' R' F R D
    U: F' R U' R' U' R U R' F' R U R' U' R' F R F
    V: R' D' R U' R' U' R U R' F' R U R' U' R' F R D R
    W: R2 F R U' R' U' R U R' F' R U R' U' R' F R F' R2
    X: D F' R U' R' U' R U R' F' R U R' U' R' F R F D'`),
  };
  // Attach the alternatives: one-handed shares the 3x3 ones, 2-look corners and edges share the full OLL and PLL ones.
  const shared = Object.fromEntries(ocll.map(([n, k]) => ['2OLL ' + n, 'OLL ' + k]));
  const altsFor = id => {
    const k = id.replace(/^OH /, '');
    return ALG_ALTS[k] || ALG_ALTS[shared[k]] || ALG_ALTS[k.replace('2PLL ', 'PLL ')] || [];
  };
  for (const groups of [three, two, oh, blind]) for (const g in groups) for (const c of groups[g]) c.alts = [...new Set([c.alg, ...altsFor(c.id)])];
  // Case groups inside each set.
  const OLL_GROUPS = {
    Dot: [1, 2, 3, 4, 17, 18, 19, 20], Square: [5, 6], 'Small lightning': [7, 8, 11, 12], 'Big lightning': [39, 40], Fish: [9, 10, 35, 37],
    'Knight move': [13, 14, 15, 16], Cross: [21, 22, 23, 24, 25, 26, 27], 'Corners done': [28, 57], Awkward: [29, 30, 41, 42], P: [31, 32, 43, 44],
    T: [33, 45], C: [34, 46], W: [36, 38], 'Small L': [47, 48, 49, 50, 53, 54], Line: [51, 52, 55, 56],
  };
  const PLL_GROUPS = {
    'Edges only': ['Ua', 'Ub', 'H', 'Z'], 'Corners only': ['Aa', 'Ab', 'E'], 'Adjacent corner swap': ['T', 'Ja', 'Jb', 'Ra', 'Rb', 'F'],
    'G perms': ['Ga', 'Gb', 'Gc', 'Gd'], 'Diagonal corner swap': ['V', 'Y', 'Na', 'Nb'],
  };
  const ORT_GROUPS = { '1 oriented': ['Sune', 'Antisune'], '2 oriented': ['U', 'T', 'L'], '0 oriented': ['Pi', 'H'] };
  const groupIn = (map, v) => Object.keys(map).find(k => map[k].includes(v));
  const FACES = ['U face', 'L face', 'F face', 'R face', 'B face', 'D face'];
  function caseGroup(c) {
    const id = c.id.replace(/^OH /, ''), rest = id.slice(id.indexOf(' ') + 1);
    if (id.startsWith('F2L ') || id.startsWith('CLL ')) return rest.replace(/ \d+$/, '');
    if (id.startsWith('BEG')) return id.startsWith('BEG1') ? 'Corner' : 'Edge';
    if (/^2(O|P)LL /.test(id)) return c.name.split(':')[0];
    if (id.startsWith('OLL ')) return groupIn(OLL_GROUPS, +rest);
    if (id.startsWith('PLL ')) return groupIn(PLL_GROUPS, rest);
    if (id.startsWith('2x2 OLL ')) return groupIn(ORT_GROUPS, id.slice(8));
    if (id.startsWith('2x2 PBL ')) return id.endsWith('/ solved') ? 'One layer' : 'Both layers';
    return FACES[Math.floor((rest.charCodeAt(0) - 65) / 4)]; // blind letters go four to a face
  }
  for (const groups of [three, two, oh, blind]) for (const g in groups) {
    for (const c of groups[g]) { c.group = caseGroup(c); c.set = g; }
    const order = [...new Set(g === 'OLL' ? Object.keys(OLL_GROUPS) : g === 'PLL' ? Object.keys(PLL_GROUPS) : groups[g].map(c => c.group))];
    groups[g].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)); // keeps the order inside a group
  }
  /* Bigger cubes and Pyraminx. Their algs are checked by separate simulators, not by cube.js, so their kind is 'text'. */
  const copy = prefix => Object.fromEntries(['2-look OLL', 'OLL', '2-look PLL', 'PLL'].map(g => [g, three[g].map(c => ({ ...c, id: prefix + c.id }))]));
  const big4 = {
    Parity: list('P4', '', 'text', `
    OLL parity: r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2
    PLL parity: Uw2 Rw2 U2 r2 U2 Rw2 Uw2`), ...copy('4x4 '),
  };
  const big5 = { 'Edge parity': list('P5', '', 'text', `
    Edge parity: r2 B2 U2 l U2 r' U2 r U2 F2 r F2 l' B2 r2`), ...copy('5x5 ') };
  const pyraminx = { L4E: list('L4E', 'L4E ', 'text', `
    1: R U' R'
    2: R U R'
    3: L' U' L
    4: L' U L
    5: R' L R L'
    6: L R' L' R
    7: L R U R' U' L'
    8: L U R U' R' L'
    9: R U R L R L'
    10: R U' R' L' U' L
    11: R U R' L' U' L
    12: R U' R L R L'
    13: L R' L' R' U' R'
    14: L' U L R U' R'
    15: L' U L R U R'
    16: L' U L' R' L' R
    17: R' U' R U' R' U' R
    18: R' U R U R' U R
    19: R U R' U R U' R'
    20: L U' R U R' U L'
    21: R U' R' U' L' U L
    22: R' L' R' U R L R
    23: R U R' L R' L' R
    24: R U' R' U L' U' L
    25: R U R' U L' U L
    26: L' U' L U' R U' R'
    27: L' U L U' R U R'
    28: L' U L U L' U' L
    29: L R' L' R U' R U' R'
    30: R U R L' U' L U R
    31: L' U L' R' L' R' U R'
    32: L U R U' R' L U L
    33: L R' L R' U' R L R
    34: L R U R' U' L U' L
    35: R L' U' R U' L' R' U L R' L`) };
  for (const groups of [big4, big5, pyraminx]) for (const g in groups) for (const c of groups[g]) {
    c.alts = [...new Set([c.alg, ...altsFor(c.id.replace(/^[45]x[45] /, ''))])];
    c.group = c.kind === 'text' ? (c.id.startsWith('L4E') ? `${c.alg.split(' ').length} moves` : 'Parity') : caseGroup({ ...c, id: c.id.replace(/^[45]x[45] /, '') });
    c.set = g;
  }
  return { '3x3': three, '2x2': two, OH: oh, Blind: blind, '4x4': big4, '5x5': big5, Pyraminx: pyraminx };
})();
