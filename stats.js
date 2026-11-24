'use strict';
// All times are integer milliseconds; DNF is Infinity; "not enough solves" is NaN.
const Stats = (() => {
  // Every average drops the fastest 5% and slowest 5%, rounded up to whole solves.
  const trimCount = n => (n < 3 ? 0 : Math.ceil(n / 20));

  // dnfMode: 'dnf'    standard rules, more DNFs than trimmed solves makes the average a DNF
  //          'remove' DNF solves are skipped, so an average covers the last `size` finished solves
  //          'pair'   every DNF also drops the best remaining time (1, 2, 3, 4, DNF averages 3)
  function rolling(times, size, dnfMode = 'dnf') {
    if (dnfMode !== 'remove') return windowed(times, size, dnfMode === 'pair');
    const avg = windowed(times.filter(t => t !== Infinity), size, false), out = new Float64Array(times.length);
    let seen = 0;
    for (let i = 0; i < times.length; i++) {
      if (times[i] !== Infinity) seen++;
      out[i] = seen ? avg[seen - 1] : NaN;
    }
    return out;
  }

  // Rolling trimmed average in O(N log N) for any window size (Fenwick tree over ranks).
  function windowed(times, size, pair) {
    const N = times.length, out = new Float64Array(N).fill(NaN);
    if (size < 1 || size > N) return out;
    const base = trimCount(size);
    const order = [];
    for (let i = 0; i < N; i++) if (times[i] !== Infinity) order.push(i);
    order.sort((a, b) => times[a] - times[b]);
    const M = order.length, rank = new Int32Array(N);
    order.forEach((idx, r) => { rank[idx] = r + 1; });
    const cnt = new Int32Array(M + 1), sum = new Float64Array(M + 1);
    let top = 1;
    while (top * 2 <= M) top *= 2;
    const add = (i, sign) => {
      for (let p = rank[i]; p <= M; p += p & -p) { cnt[p] += sign; sum[p] += sign * times[i]; }
    };
    const smallest = k => {
      let pos = 0, s = 0;
      for (let b = top; b; b >>= 1) {
        if (pos + b <= M && cnt[pos + b] <= k) { pos += b; k -= cnt[pos]; s += sum[pos]; }
      }
      return s;
    };
    let dnf = 0;
    for (let i = 0; i < N; i++) {
      if (times[i] === Infinity) dnf++; else add(i, 1);
      if (i >= size) { if (times[i - size] === Infinity) dnf--; else add(i - size, -1); }
      if (i < size - 1) continue;
      const trim = pair ? Math.max(base, dnf) : base, keep = size - 2 * trim;
      out[i] = dnf > trim || keep < 1 ? Infinity : (smallest(size - trim) - smallest(trim)) / keep;
    }
    return out;
  }

  // Running record: the best so far at each position, and where it improved.
  function records(vals) {
    const line = new Float64Array(vals.length).fill(NaN), at = [];
    let best = Infinity;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] < best) { best = vals[i]; at.push(i); }
      if (best < Infinity) line[i] = best;
    }
    return { line, at, best: at.length ? best : NaN };
  }

  function summary(times) {
    const ok = times.filter(t => t !== Infinity).sort((a, b) => a - b), n = ok.length;
    if (!n) return { n: times.length, dnf: times.length, best: NaN, worst: NaN, mean: NaN, average: NaN, median: NaN, sd: NaN };
    const mean = ok.reduce((a, b) => a + b, 0) / n;
    const trim = trimCount(n), kept = ok.slice(trim, n - trim), average = kept.reduce((a, b) => a + b, 0) / kept.length;
    return {
      n: times.length, dnf: times.length - n, best: ok[0], worst: ok[n - 1], mean, average,
      median: (ok[(n - 1) >> 1] + ok[n >> 1]) / 2,
      sd: n > 1 ? Math.sqrt(ok.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN,
    };
  }

  function format(ms, digits = 2) {
    if (ms === Infinity) return 'DNF';
    if (!Number.isFinite(ms)) return '–';
    const f = 10 ** digits, u = Math.round(ms * f / 1000), m = Math.floor(u / (60 * f)), h = Math.floor(m / 60);
    const s = ((u - m * 60 * f) / f).toFixed(digits), padded = s.padStart(digits ? digits + 3 : 2, '0');
    return h ? `${h}:${String(m % 60).padStart(2, '0')}:${padded}` : m ? `${m}:${padded}` : s;
  }
  return { rolling, records, summary, format, trimCount };
})();
