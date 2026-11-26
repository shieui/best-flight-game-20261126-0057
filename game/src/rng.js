// Deterministic randomness for Sky Courier: a small seeded PRNG and value noise.
// The terrain, trees, clouds and ring course all come from one seed, so every
// load of the game builds the same island and screenshots are reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer lattice hash -> [0, 1). Stable for any (x, z) pair.
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

// 2D value noise in [0, 1], one octave at the given cell size (metres).
export function valueNoise(x, z, cell, seed) {
  const gx = x / cell;
  const gz = z / cell;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = smooth(gx - ix);
  const fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Fractal noise in roughly [0, 1]: three octaves, each half the weight.
export function fbm(x, z, cell, seed) {
  return (
    valueNoise(x, z, cell, seed) * 0.55 +
    valueNoise(x, z, cell / 2.3, seed + 7) * 0.3 +
    valueNoise(x, z, cell / 5.1, seed + 13) * 0.15
  );
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angular difference, in radians.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function degToRad(d) {
  return (d * Math.PI) / 180;
}
