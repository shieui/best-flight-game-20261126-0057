// Sky Courier renderer: a software-projected 3D chase view on a 2D canvas.
// Owns the camera, the perspective projection, sky, terrain, runway, rings,
// clouds, trees, houses, the plane itself and its shadow. No game logic here.

import { GAME, PALETTE, RUNWAY_MAIN, RUNWAY_FAR } from './config.js';
import { clamp } from './rng.js';
import { heightAt, terrainColour, TREES, HOUSES, CLOUDS } from './terrain.js';

const CELL = GAME.cellSize;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.focal = 600;
    this.cam = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
    this.heightCache = new Map();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.focal = h * 1.05;
  }

  // --- Camera ---------------------------------------------------------------
  updateCamera(plane, dt, time) {
    const fx = Math.sin(plane.heading);
    const fz = Math.cos(plane.heading);
    // Chase camera: behind and above the plane, eased toward its anchor so
    // it never snaps when the plane banks — but snap at once when it is far
    // away (first frame, or a teleport), or the opening frames show the
    // world from the wrong place.
    const tx = plane.x - fx * 15;
    const ty = plane.y + 4.6;
    const tz = plane.z - fz * 15;
    const far = Math.hypot(tx - this.cam.x, ty - this.cam.y, tz - this.cam.z);
    const k = far > 120 ? 1 : Math.min(1, dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.z += (tz - this.cam.z) * k;
    // Look at a point ahead of the plane, slightly below it.
    const lx = plane.x + fx * 42;
    const ly = plane.y - 1.5 + plane.pitch * 18;
    const lz = plane.z + fz * 42;
    let fvx = lx - this.cam.x;
    let fvy = ly - this.cam.y;
    let fvz = lz - this.cam.z;
    const fl = Math.hypot(fvx, fvy, fvz) || 1;
    fvx /= fl; fvy /= fl; fvz /= fl;
    // right = fwd x worldUp = (-fz, 0, fx); up = right x fwd.
    const rx = -fvz;
    const rz = fvx;
    const rl = Math.hypot(rx, rz) || 1;
    const c = this.cam;
    c.fx = fvx; c.fy = fvy; c.fz = fvz;
    c.rx = rx / rl; c.ry = 0; c.rz = rz / rl;
    c.ux = c.ry * c.fz - c.rz * c.fy;
    c.uy = c.rz * c.fx - c.rx * c.fz;
    c.uz = c.rx * c.fy - c.ry * c.fx;
    void time;
  }

  // Camera-space coordinates of a world point (no projection yet).
  toCamera(x, y, z) {
    const c = this.cam;
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    return {
      x: dx * c.rx + dy * c.ry + dz * c.rz,
      y: dx * c.ux + dy * c.uy + dz * c.uz,
      z: dx * c.fx + dy * c.fy + dz * c.fz,
    };
  }

  // Project a world point to screen space. Returns null when behind the
  // camera; near points are clamped so geometry never inverts.
  project(x, y, z) {
    const p = this.toCamera(x, y, z);
    if (p.z < 0.4) return null;
    const s = this.focal / p.z;
    return {
      x: this.w / 2 + p.x * s,
      y: this.h * 0.52 - p.y * s,
      depth: p.z,
      scale: s,
    };
  }

  // Project a quad, clipping it against the near plane in camera space
  // first: a cell straddling the camera (common right below a low camera)
  // is clipped to the part in front instead of dropped whole, which would
  // leave a hole showing the sea band through the foreground.
  projectQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3) {
    let poly = [
      this.toCamera(x0, y0, z0),
      this.toCamera(x1, y1, z1),
      this.toCamera(x2, y2, z2),
      this.toCamera(x3, y3, z3),
    ];
    const NEAR = 0.5;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a.z >= NEAR;
      const bIn = b.z >= NEAR;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        // Edge crosses the near plane: add the crossing point.
        const t = (NEAR - a.z) / (b.z - a.z);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: NEAR,
        });
      }
    }
    if (out.length < 3) return null;
    return out.map((p) => {
      const s = this.focal / p.z;
      return { x: this.w / 2 + p.x * s, y: this.h * 0.52 - p.y * s, depth: p.z, scale: s };
    });
  }

  fillQuad(ctx, q) {
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y);
    for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // --- Sky --------------------------------------------------------------------
  drawSky(plane) {
    const ctx = this.ctx;
    const { w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.45, PALETTE.skyMid);
    g.addColorStop(0.62, PALETTE.skyHorizon);
    g.addColorStop(0.63, '#c8a06a');
    g.addColorStop(1, '#5a6b52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sun: low in the west, fixed in the world so it stays put as you turn.
    const sun = this.project(this.cam.x - 2600, 620, this.cam.z - 900);
    if (sun) {
      const rg = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      rg.addColorStop(0, 'rgba(255,244,200,0.95)');
      rg.addColorStop(0.25, 'rgba(255,214,140,0.55)');
      rg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    void plane;
  }

  // --- Terrain ------------------------------------------------------------------
  drawTerrain(plane) {
    const ctx = this.ctx;
    this.heightCache.clear();
    const H = (ix, iz) => {
      const key = ix + ',' + iz;
      let v = this.heightCache.get(key);
      if (v === undefined) {
        v = heightAt(ix * CELL, iz * CELL);
        this.heightCache.set(key, v);
      }
      return v;
    };

    // The sea horizon: a band of water from the horizon line down, so the
    // world never ends in sky gradient beyond the terrain grid.
    const hor = this.project(
      this.cam.x + this.cam.fx * 3000, 0, this.cam.z + this.cam.fz * 3000,
    );
    if (hor && hor.y < this.h) {
      const top = Math.max(0, hor.y);
      const sg = ctx.createLinearGradient(0, top, 0, this.h);
      sg.addColorStop(0, PALETTE.seaShallow);
      sg.addColorStop(1, PALETTE.seaDeep);
      ctx.fillStyle = sg;
      ctx.fillRect(0, top, this.w, this.h - top);
    }

    // Terrain cells around the camera, far to near.
    const ix0 = Math.floor((this.cam.x - 950) / CELL);
    const ix1 = Math.floor((this.cam.x + 950) / CELL);
    const iz0 = Math.floor((this.cam.z - 350) / CELL);
    const iz1 = Math.floor((this.cam.z + 1500) / CELL);
    const cells = [];
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cx = (ix + 0.5) * CELL;
        const cz = (iz + 0.5) * CELL;
        const dx = cx - this.cam.x;
        const dz = cz - this.cam.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1500 * 1500) continue;
        cells.push({ ix, iz, cx, cz, d2 });
      }
    }
    cells.sort((a, b) => b.d2 - a.d2);

    for (const cell of cells) {
      const { ix, iz } = cell;
      const x0 = ix * CELL;
      const z0 = iz * CELL;
      const x1 = x0 + CELL;
      const z1 = z0 + CELL;
      const h00 = H(ix, iz);
      const h10 = H(ix + 1, iz);
      const h11 = H(ix + 1, iz + 1);
      const h01 = H(ix, iz + 1);
      const hMid = (h00 + h10 + h11 + h01) / 4;
      if (hMid <= 0.4) {
        // Water surface for this cell.
        const quad = this.projectQuad(x0, 0.15, z0, x1, 0.15, z0, x1, 0.15, z1, x0, 0.15, z1);
        if (quad) {
          ctx.fillStyle = hMid < -6 ? PALETTE.seaDeep : PALETTE.seaShallow;
          this.fillQuad(ctx, quad);
        }
        continue;
      }
      const quad = this.projectQuad(x0, h00, z0, x1, h10, z0, x1, h11, z1, x0, h01, z1);
      if (!quad) continue;
      ctx.fillStyle = this.cellColour(cell.cx, cell.cz, hMid);
      this.fillQuad(ctx, quad);
      // Runway strip: the cell is 60 m wide but the strip is 34 m, so the
      // strip is drawn as its own quad clipped to this cell — a flat asphalt
      // band with centreline dashes, edge lines and threshold bars.
      this.drawRunwayCell(ctx, x0, z0, x1, z1);
    }
    void plane;
  }

  drawRunwayCell(ctx, x0, z0, x1, z1) {
    for (const rw of [RUNWAY_MAIN, RUNWAY_FAR]) {
      const rx0 = rw.cx - rw.width / 2;
      const rx1 = rw.cx + rw.width / 2;
      const rz0 = rw.cz - rw.length / 2;
      const rz1 = rw.cz + rw.length / 2;
      const ix0 = Math.max(x0, rx0);
      const ix1 = Math.min(x1, rx1);
      const iz0 = Math.max(z0, rz0);
      const iz1 = Math.min(z1, rz1);
      if (ix0 >= ix1 || iz0 >= iz1) continue;
      const y = rw.elevation + 0.06;
      const strip = this.projectQuad(ix0, y, iz0, ix1, y, iz0, ix1, y, iz1, ix0, y, iz1);
      if (!strip) continue;
      ctx.fillStyle = PALETTE.asphalt;
      this.fillQuad(ctx, strip);
      // Centreline dashes: 18 m dashes every 36 m.
      const dashLen = 18;
      const period = 36;
      const firstDash = Math.floor((iz0 + 600) / period) * period - 600;
      for (let dz = firstDash; dz < iz1; dz += period) {
        const d0 = Math.max(iz0, dz);
        const d1 = Math.min(iz1, dz + dashLen);
        if (d0 >= d1) continue;
        const dash = this.projectQuad(
          rw.cx - 1.4, y + 0.01, d0, rw.cx + 1.4, y + 0.01, d0,
          rw.cx + 1.4, y + 0.01, d1, rw.cx - 1.4, y + 0.01, d1,
        );
        if (dash) {
          ctx.fillStyle = PALETTE.asphaltLine;
          this.fillQuad(ctx, dash);
        }
      }
      // Edge lines.
      for (const ex of [rw.cx - rw.width / 2 + 1.2, rw.cx + rw.width / 2 - 1.2]) {
        const edge = this.projectQuad(
          ex - 1, y + 0.01, iz0, ex + 1, y + 0.01, iz0,
          ex + 1, y + 0.01, iz1, ex - 1, y + 0.01, iz1,
        );
        if (edge) {
          ctx.fillStyle = PALETTE.asphaltLine;
          this.fillQuad(ctx, edge);
        }
      }
      // Threshold bars near each end: three white bars across the strip.
      for (const endZ of [rz0 + 30, rz1 - 30]) {
        if (endZ < iz0 || endZ > iz1) continue;
        for (const bx of [-10, 0, 10]) {
          const bar = this.projectQuad(
            rw.cx + bx - 3, y + 0.01, endZ - 8, rw.cx + bx + 3, y + 0.01, endZ - 8,
            rw.cx + bx + 3, y + 0.01, endZ + 8, rw.cx + bx - 3, y + 0.01, endZ + 8,
          );
          if (bar) {
            ctx.fillStyle = PALETTE.asphaltLine;
            this.fillQuad(ctx, bar);
          }
        }
      }
    }
  }

  // Terrain colour for a cell; the runway strip is drawn over it separately.
  cellColour(x, z, h) {
    return terrainColour(x, z, h);
  }

  // --- Rings ------------------------------------------------------------------
  drawRings(mission) {
    const ctx = this.ctx;
    const rings = mission.rings;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      if (i < mission.ringIndex) continue; // flown rings are gone
      const centre = this.project(ring.x, ring.y, ring.z);
      if (!centre || centre.depth > 2600 || centre.depth < 25) continue;
      // Skip rings far off-axis: a ring mostly behind the camera would
      // project its far points to wild screen coordinates and draw a
      // giant arc across the frame.
      const dx = ring.x - this.cam.x;
      const dy = ring.y - this.cam.y;
      const dz = ring.z - this.cam.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const facing = (dx * this.cam.fx + dy * this.cam.fy + dz * this.cam.fz) / dl;
      if (facing < 0.45) continue;
      const isNext = i === mission.ringIndex;
      // Ring plane faces the next ring (or the camera, for the last one).
      const target = rings[i + 1] || { x: this.cam.x, y: ring.y, z: this.cam.z };
      let nx = target.x - ring.x;
      let ny = target.y - ring.y;
      let nz = target.z - ring.z;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // u = normal x worldUp = (-nz, 0, nx); v = u x normal.
      let ux = -nz;
      let uz = nx;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      const vx = -uz * ny;
      const vy = uz * nx - ux * nz;
      const vz = ux * ny;
      const pts = [];
      const N = 26;
      for (let s = 0; s <= N; s++) {
        const a = (s / N) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = ring.x + (ux * ca + vx * sa) * ring.r;
        const py = ring.y + vy * sa * ring.r;
        const pz = ring.z + (uz * ca + vz * sa) * ring.r;
        const p = this.project(px, py, pz);
        // A point swinging near the camera plane projects to wild
        // coordinates; drop it so the ring never streaks across the frame.
        if (p && p.depth > 2 && Math.abs(p.x) < this.w * 3 && Math.abs(p.y) < this.h * 3) pts.push(p);
      }
      if (pts.length < 3) continue;
      ctx.save();
      ctx.lineJoin = 'round';
      if (isNext) {
        ctx.shadowColor = PALETTE.ringGold;
        ctx.shadowBlur = 18;
        // A light pillar marks the next ring from far away.
        const top = this.project(ring.x, ring.y + 190, ring.z);
        if (top && centre) {
          const lg = ctx.createLinearGradient(centre.x, centre.y, top.x, top.y);
          lg.addColorStop(0, 'rgba(255,201,60,0.55)');
          lg.addColorStop(1, 'rgba(255,201,60,0)');
          ctx.strokeStyle = lg;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(centre.x, centre.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = isNext ? PALETTE.ringNext : 'rgba(255,201,60,0.55)';
      ctx.lineWidth = isNext ? 6 : 3.5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s].x, pts[s].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // Ring number above the ring.
      if (centre.depth < 1200) {
        const label = this.project(ring.x, ring.y + ring.r + 12, ring.z);
        if (label) {
          const fs = clamp(26 * label.scale, 12, 30);
          ctx.font = `700 ${fs}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = isNext ? '#fff3c4' : 'rgba(255,233,163,0.75)';
          ctx.fillText(String(ring.index + 1), label.x, label.y);
        }
      }
    }
  }

  // --- Clouds, trees, houses ----------------------------------------------------
  drawClouds() {
    const ctx = this.ctx;
    for (const cloud of CLOUDS) {
      const p = this.project(cloud.x, cloud.y, cloud.z);
      if (!p || p.depth > 4200 || p.depth < 40) continue;
      const s = cloud.s * p.scale;
      if (s < 4 || s > 900) continue;
      // Each puff is its own fill: one shared path leaves triangular gaps
      // where the ellipses cross.
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.08, s * 0.6, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.65, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTrees(plane) {
    const ctx = this.ctx;
    const near = [];
    for (const t of TREES) {
      const dx = t.x - plane.x;
      const dz = t.z - plane.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 700 * 700) near.push({ t, d2 });
    }
    near.sort((a, b) => b.d2 - a.d2);
    for (const { t } of near.slice(0, 140)) {
      const base = this.project(t.x, t.h, t.z);
      const top = this.project(t.x, t.h + 9 * t.s, t.z);
      if (!base || !top) continue;
      const wdt = Math.max(2, (base.y - top.y) * 0.45);
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(base.x - 1, top.y + (base.y - top.y) * 0.55, 2, (base.y - top.y) * 0.45);
      ctx.fillStyle = '#2e6b33';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(base.x - wdt, base.y - (base.y - top.y) * 0.35);
      ctx.lineTo(base.x + wdt, base.y - (base.y - top.y) * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawHouses() {
    const ctx = this.ctx;
    const sorted = HOUSES
      .map((h) => ({ h, d: Math.hypot(h.x - this.cam.x, h.z - this.cam.z) }))
      .filter((o) => o.d < 900)
      .sort((a, b) => b.d - a.d);
    for (const { h } of sorted) {
      const hw = h.w / 2;
      const hd = h.d / 2;
      const c1 = this.project(h.x - hw, h.h, h.z - hd);
      const c2 = this.project(h.x + hw, h.h, h.z - hd);
      const c3 = this.project(h.x + hw, h.h + h.ht, h.z - hd);
      const c4 = this.project(h.x - hw, h.h + h.ht, h.z - hd);
      const roof = this.project(h.x, h.h + h.ht + 4, h.z);
      if (!c1 || !c2 || !c3 || !c4 || !roof) continue;
      ctx.fillStyle = '#efe6d0';
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(c4.x, c4.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = h.roof;
      ctx.beginPath();
      ctx.moveTo(c4.x, c4.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.lineTo(roof.x, roof.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- The aircraft ---------------------------------------------------------------
  drawPlaneShadow(plane) {
    const ground = heightAt(plane.x, plane.z);
    const p = this.project(plane.x, ground + 0.4, plane.z);
    if (!p) return;
    const ctx = this.ctx;
    // About the size of the aircraft on screen, shrinking and fading fast
    // as it climbs away from the ground.
    const rx = clamp(2600 / (plane.agl + 18), 22, 130);
    const alpha = clamp(0.34 - plane.agl / 550, 0.04, 0.34);
    ctx.fillStyle = `rgba(20,30,20,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, Math.max(6, rx * 0.32), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Chase view: the courier plane drawn in screen space, banked with the turn.
  drawPlane(plane, time) {
    const ctx = this.ctx;
    const { w, h } = this;
    const s = Math.min(w, h) / 620; // aircraft scale
    const cx = w / 2;
    const cy = h * 0.62 - plane.pitch * 60;
    const jx = Math.sin(time * 47) * 0.6 * plane.throttle;
    const jy = Math.cos(time * 39) * 0.6 * plane.throttle;
    ctx.save();
    ctx.translate(cx + jx, cy + jy);
    ctx.rotate(plane.bank * 0.9);
    ctx.scale(s, s);
    const red = PALETTE.planeRed;
    const cream = PALETTE.planeCream;
    const dark = PALETTE.planeDark;
    // Tail fin
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(-14, 58);
    ctx.lineTo(-30, 96);
    ctx.lineTo(-8, 92);
    ctx.lineTo(0, 66);
    ctx.closePath();
    ctx.fill();
    // Horizontal stabiliser
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.moveTo(-52, 78);
    ctx.lineTo(52, 78);
    ctx.lineTo(38, 92);
    ctx.lineTo(-38, 92);
    ctx.closePath();
    ctx.fill();
    // Main wings (swept, seen from behind)
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(-16, 34);
    ctx.lineTo(-168, 74);
    ctx.lineTo(-160, 92);
    ctx.lineTo(-14, 62);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(16, 34);
    ctx.lineTo(168, 74);
    ctx.lineTo(160, 92);
    ctx.lineTo(14, 62);
    ctx.closePath();
    ctx.fill();
    // Wing tips: navigation lights
    const blink = Math.sin(time * 6) > 0 ? 1 : 0.25;
    ctx.fillStyle = `rgba(255,70,60,${blink})`;
    ctx.beginPath();
    ctx.arc(-164, 82, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(90,255,140,${blink})`;
    ctx.beginPath();
    ctx.arc(164, 82, 4, 0, Math.PI * 2);
    ctx.fill();
    // Fuselage: tapered body, nose at the top of the screen.
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.quadraticCurveTo(20, -70, 18, 10);
    ctx.quadraticCurveTo(17, 60, 10, 92);
    ctx.lineTo(-10, 92);
    ctx.quadraticCurveTo(-17, 60, -18, 10);
    ctx.quadraticCurveTo(-20, -70, 0, -118);
    ctx.closePath();
    ctx.fill();
    // Red cheatline along the fuselage
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(-18, 8);
    ctx.quadraticCurveTo(-19, -40, -8, -84);
    ctx.lineTo(8, -84);
    ctx.quadraticCurveTo(19, -40, 18, 8);
    ctx.quadraticCurveTo(0, 16, -18, 8);
    ctx.closePath();
    ctx.fill();
    // Canopy
    ctx.fillStyle = '#bfe3f2';
    ctx.beginPath();
    ctx.ellipse(0, -58, 11, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-3, -66, 4, 9, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Registration on the tail
    ctx.fillStyle = dark;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SKY-7', 0, 74);
    // Propeller: spinning blurred disc at the nose.
    ctx.save();
    ctx.translate(0, -118);
    ctx.rotate(plane.propAngle);
    ctx.fillStyle = 'rgba(43,47,54,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(0, -118, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Soft darkening at the frame edges, like a camera lens.
  drawVignette() {
    const ctx = this.ctx;
    const { w, h } = this;
    const g = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.75,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,16,28,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Full frame: sky, sea, terrain, scenery, rings, plane.
  renderFrame(plane, mission, time) {
    this.drawSky(plane);
    this.drawTerrain(plane);
    this.drawClouds();
    this.drawHouses();
    this.drawTrees(plane);
    this.drawRings(mission);
    this.drawPlaneShadow(plane);
    this.drawPlane(plane, time);
    this.drawVignette();
  }
}
