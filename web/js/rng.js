// Seeded randomness: the same seed always gives the same numbers,
// so the same song always gives the same face.

export function hash(str) {
  let h = 2166136261 >>> 0;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// makeRng("some seed") -> helpers. fork(label) gives an independent stream,
// so adding a new feature later doesn't reshuffle every other feature.
export function makeRng(seed) {
  const base = typeof seed === "number" ? seed >>> 0 : hash(seed);
  const next = mulberry32(base);
  const r = {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(weights) {
      const entries = Object.entries(weights).filter(([, w]) => w > 0);
      let total = entries.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [k, w] of entries) if ((x -= w) <= 0) return k;
      return entries[entries.length - 1][0];
    },
    fork: (label) => makeRng(hash(base + ":" + label)),
  };
  return r;
}

// Smooth 1D value noise in [-1, 1]. Used to make lines wobble like a real hand.
export function noise1(seed) {
  const h = (i) => {
    let x = Math.imul(i ^ seed, 0x27d4eb2d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
  return (t) => {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };
}
