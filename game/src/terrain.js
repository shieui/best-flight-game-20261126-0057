// Sky Courier terrain: one island in a bay, built from seeded noise.
// Owns the height function, the runways, the river, the town, the trees and
// the ring course. Everything else asks this file "what is the ground here?".

import { GAME, RUNWAY_MAIN, RUNWAY_FAR, PALETTE } from './config.js';
import { fbm, valueNoise, clamp, lerp } from './rng.js';

const SEED = GAME.seed;

// The island is a rough disc of radius ~1900 m around (150, 700); outside it
// the height falls below the waterline and the sea takes over.
function islandMask(x, z) {
  const dx = (x - 150) / 1900;
  const dz = (z - 700) / 1900;
  const r = Math.sqrt(dx * dx + dz * dz);
  return clamp(1.4 - r * 1.4, 0, 1);
}

// A river winds from the northern hills down to the bay on the west side.
function riverDistance(x, z) {
  const centre = -700 + 260 * Math.sin(z / 700) + 120 * Math.sin(z / 260 + 2);
  return Math.abs(x - centre);
}

function runwayBlend(x, z, runway) {
  // Distance from the runway centreline, in the runway's own frame.
  const dx = x - runway.cx;
  const dz = z - runway.cz;
  const along = Math.abs(dz); // runway points north (+z)
  const across = Math.abs(dx);
  if (along > runway.length / 2 + 60 || across > runway.width / 2 + 60) return 0;
  const edge = Math.max(
    (along - runway.length / 2) / 60,
    (across - runway.width / 2) / 60,
  );
  return clamp(1 - Math.max(0, edge), 0, 1);
}

export function isOnRunway(x, z, runway) {
  const along = Math.abs(z - runway.cz);
  const across = Math.abs(x - runway.cx);
  return along <= runway.length / 2 && across <= runway.width / 2;
}

export function heightAt(x, z) {
  const mask = islandMask(x, z);
  // Rolling hills, a high ridge to the north, and a low flat valley near the
  // main runway so the field sits in open ground.
  let h = fbm(x, z, 420, SEED) * 46 - 6;
  h += Math.max(0, fbm(x, z, 180, SEED + 31) - 0.55) * 130;
  const northRidge = clamp((z - 1250) / 500, 0, 1);
  h += northRidge * northRidge * (60 + fbm(x, z, 300, SEED + 53) * 90);
  // The bay flats around the main runway.
  const valley = clamp(1 - Math.hypot(x - 0, z - 260) / 520, 0, 1);
  h = lerp(h, 2, valley * valley * 0.85);
  // River channel carves down toward the waterline.
  const rd = riverDistance(x, z);
  h -= clamp(1 - rd / 90, 0, 1) * 9;
  // Island edge: fall away into the sea.
  h = lerp(-14, h, mask);
  // Runways are flat pads at elevation 2.
  const b1 = runwayBlend(x, z, RUNWAY_MAIN);
  const b2 = runwayBlend(x, z, RUNWAY_FAR);
  const b = Math.max(b1, b2);
  h = lerp(h, RUNWAY_MAIN.elevation, b);
  return h;
}

// What a terrain cell looks like: returns a fill colour for the quad whose
// centre is (x, z) at height h. Fields, forest, beach and rock come from
// large-scale noise so the island reads as patchwork farmland — blended
// smoothly, never hard-edged, so neighbouring cells do not snap between
// colours and read as flat rectangles.
function parseColour(c) {
  if (c.startsWith('rgb')) return c.slice(4, -1).split(',').map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHex(a, b, t) {
  const ca = parseColour(a);
  const cb = parseColour(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

export function terrainColour(x, z, h) {
  if (h <= 0.4) return PALETTE.seaShallow; // drawn as water surface instead
  if (h < 1.2) return PALETTE.sand;
  if (h > 95) return PALETTE.snow;
  if (h > 62) return PALETTE.rock;
  const patch = valueNoise(x, z, 260, SEED + 97);
  let colour = mixHex(PALETTE.grassA, PALETTE.grassB, patch);
  const field = valueNoise(x, z, 700, SEED + 91);
  const wheatAmt = clamp((field - 0.62) / 0.15, 0, 1) * 0.8;
  if (wheatAmt > 0) colour = mixHex(colour, PALETTE.fieldWheat, wheatAmt);
  const forest = valueNoise(x, z, 320, SEED + 77);
  const forestAmt = clamp((forest - 0.58) / 0.12, 0, 1) * 0.7 * (1 - wheatAmt);
  if (forestAmt > 0) colour = mixHex(colour, PALETTE.forest, forestAmt);
  return colour;
}

// --- Scenery placement (seeded, fixed) -------------------------------------

function scatter(count, seedOff, minR, maxR, cx, cz) {
  const rand = mulberry32Local(seedOff);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = minR + rand() * (maxR - minR);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > 3 && h < 55) out.push({ x, z, h, s: 0.7 + rand() * 0.9 });
  }
  return out;
}

// Local mulberry32 (kept here so terrain.js does not depend on rng exports
// beyond noise helpers).
function mulberry32Local(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TREES = scatter(240, SEED + 401, 120, 1650, 150, 700);

export const HOUSES = (() => {
  const rand = mulberry32Local(SEED + 501);
  const out = [];
  // A little harbour town east of the main runway, plus a hamlet by the far strip.
  const clusters = [
    { cx: 330, cz: 330, n: 26, spread: 150 },
    { cx: 990, cz: 1330, n: 10, spread: 110 },
  ];
  const roofs = ['#b5503c', '#c97a3d', '#7d8a99', '#a34d5e'];
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const x = c.cx + (rand() - 0.5) * c.spread * 2;
      const z = c.cz + (rand() - 0.5) * c.spread * 2;
      const h = heightAt(x, z);
      if (h < 3 || isOnRunway(x, z, RUNWAY_MAIN) || isOnRunway(x, z, RUNWAY_FAR)) continue;
      out.push({ x, z, h, w: 8 + rand() * 8, d: 7 + rand() * 7, ht: 5 + rand() * 5, roof: roofs[i % roofs.length] });
    }
  }
  return out;
})();

export const CLOUDS = (() => {
  const rand = mulberry32Local(SEED + 601);
  const out = [];
  for (let i = 0; i < 26; i++) {
    out.push({
      x: -1800 + rand() * 4200,
      y: 260 + rand() * 220,
      z: -1200 + rand() * 3800,
      s: 60 + rand() * 130,
    });
  }
  return out;
})();

// --- Ring course ------------------------------------------------------------
// Rings hang in the air along a tour of the island: off the runway, out over
// the bay, up the river valley, around the northern ridge, and home.
function ringCourse(count) {
  const waypoints = [
    [0, 60, 700],
    [-420, 90, 900],
    [-760, 70, 300],
    [-500, 120, -350],
    [150, 170, -650],
    [800, 150, -300],
    [1150, 90, 500],
    [1180, 70, 1150],
    [700, 80, 1150],
    [250, 60, 700],
  ];
  const rings = [];
  for (let i = 0; i < count; i++) {
    const w = waypoints[i % waypoints.length];
    rings.push({ x: w[0], y: w[1], z: w[2], r: 17 + (i % 3) * 2, index: i });
  }
  return rings;
}

export function ringsForMission(mission) {
  if (mission.id === 'courier') {
    // Courier: five rings leading to Palm Cay Strip.
    const pts = [
      [0, 60, 700],
      [420, 90, 950],
      [850, 110, 1150],
      [1150, 80, 1330],
      [1180, 55, 1420],
    ];
    return pts.map((w, i) => ({ x: w[0], y: w[1], z: w[2], r: 17, index: i }));
  }
  if (mission.id === 'landing') {
    return [
      { x: -350, y: 90, z: 650, r: 18, index: 0 },
      { x: 0, y: 70, z: 1050, r: 18, index: 1 },
    ];
  }
  return ringCourse(mission.rings);
}
