// Sky Courier HUD: every instrument and screen is drawn on the canvas so the
// game looks identical in a screenshot and in play. Menus are clickable;
// the game loop hands this file the current state and the pointer.

import { GAME, PALETTE, MISSIONS, CONTROLS, RUNWAY_MAIN } from './config.js';
import { clamp } from './rng.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,22,36,0.62)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(234,246,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx, text, x, y, size = 11, color = PALETTE.hudDim) {
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bigValue(ctx, text, x, y, size = 30, color = PALETTE.hudInk) {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export class HUD {
  constructor() {
    this.flash = null; // {text, until, color}
    this.menuRects = []; // clickable rects for the current menu screen
  }

  say(text, seconds = 2.5, color = PALETTE.hudInk) {
    this.flash = { text, until: performance.now() / 1000 + seconds, color };
  }

  // --- In-flight instruments --------------------------------------------------
  drawFlight(ctx, w, h, plane, mission, time) {
    const now = performance.now() / 1000;

    // Speed (left) and altitude (right).
    panel(ctx, 16, 14, 168, 74);
    label(ctx, 'AIRSPEED', 28, 34);
    bigValue(ctx, `${Math.round(plane.knots)}`, 28, 66, 30,
      plane.stalled ? PALETTE.hudBad : PALETTE.hudInk);
    label(ctx, 'KT', 118, 66, 13);
    label(ctx, plane.stalled ? 'STALL — NOSE DOWN' : `V/S ${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 196)} FPM`,
      28, 82, 11, plane.stalled ? PALETTE.hudBad : PALETTE.hudDim);

    panel(ctx, w - 184, 14, 168, 74);
    label(ctx, 'ALTITUDE', w - 172, 34);
    bigValue(ctx, `${Math.round(plane.altitudeFt)}`, w - 172, 66, 30);
    label(ctx, 'FT', w - 62, 66, 13);
    label(ctx, `AGL ${Math.round(plane.agl * 3.28)} FT`, w - 172, 82, 11);

    // Compass tape across the top centre. Degrees are placed by their
    // absolute bearing, so the labels are always there however the nose
    // points — an offset tape only labels when the heading happens to sit
    // on a multiple of 15.
    const cw = 300;
    const cx0 = w / 2 - cw / 2;
    panel(ctx, cx0, 14, cw, 52);
    const heading = plane.headingDeg;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx0, 14, cw, 52);
    ctx.clip();
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let deg = 0; deg < 360; deg += 5) {
      const off = ((deg - heading + 540) % 360) - 180; // -180..180
      if (Math.abs(off) > 36) continue;
      const x = w / 2 + off * 4.4;
      const major = deg % 15 === 0;
      ctx.strokeStyle = major ? 'rgba(234,246,255,0.9)' : 'rgba(234,246,255,0.35)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x, major ? 40 : 34);
      ctx.stroke();
      if (major) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        const text = names[deg] || String(deg).padStart(3, '0');
        ctx.fillStyle = names[deg] ? PALETTE.ringGold : PALETTE.hudInk;
        ctx.fillText(text, x, 58);
      }
    }
    ctx.restore();
    // Centre caret + readout.
    ctx.fillStyle = PALETTE.ringGold;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 7, 16);
    ctx.lineTo(w / 2 + 7, 16);
    ctx.lineTo(w / 2, 26);
    ctx.closePath();
    ctx.fill();

    // Artificial horizon, left centre.
    const hx = 92;
    const hy = h * 0.42;
    const hr = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-plane.bank);
    ctx.translate(0, plane.pitch * 130);
    ctx.fillStyle = '#3f8fd0';
    ctx.fillRect(-hr - 2, -hr * 2 - 2, hr * 2 + 4, hr * 2 + 2);
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(-hr - 2, 0, hr * 2 + 4, hr * 2 + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-hr, 0);
    ctx.lineTo(hr, 0);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(234,246,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = PALETTE.ringGold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - 34, hy);
    ctx.lineTo(hx - 12, hy);
    ctx.moveTo(hx + 12, hy);
    ctx.lineTo(hx + 34, hy);
    ctx.stroke();
    ctx.fillStyle = PALETTE.ringGold;
    ctx.beginPath();
    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, 'ATTITUDE', hx - 30, hy + hr + 18, 11);

    // Throttle / fuel / damage bars, right centre.
    const bx = w - 66;
    const by = h * 0.32;
    this.bar(ctx, bx, by, 22, 150, plane.throttle, 'THR', PALETTE.hudInk);
    this.bar(ctx, bx - 40, by, 22, 150, plane.fuel / 100, 'FUEL',
      plane.fuel < 25 ? PALETTE.hudBad : PALETTE.hudGood);
    if (plane.damage > 0) {
      this.bar(ctx, bx - 80, by, 22, 150, plane.damage / 100, 'DMG', PALETTE.hudBad);
    }

    // Mission line, bottom centre.
    const ring = mission.nextRing;
    let objective = '';
    if (mission.state === 'flying') {
      if (ring) {
        const d = Math.hypot(plane.x - ring.x, plane.y - ring.y, plane.z - ring.z);
        objective = `RING ${mission.ringIndex + 1}/${mission.rings.length}  ·  ${Math.round(d)} m ahead`;
      } else {
        objective = `All rings flown — land at ${mission.targetRunway.name}`;
      }
    }
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudInk;
    ctx.fillText(objective, w / 2, h - 58);
    const mm = Math.floor(mission.time / 60);
    const ss = Math.floor(mission.time % 60).toString().padStart(2, '0');
    const left = Math.max(0, mission.def.timeLimit - mission.time);
    const lm = Math.floor(left / 60);
    const ls = Math.floor(left % 60).toString().padStart(2, '0');
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(
      `SCORE ${mission.score}   ·   ${mm}:${ss}   ·   ${lm}:${ls} left`,
      w / 2, h - 34,
    );

    // Centre flight-path marker.
    ctx.strokeStyle = 'rgba(234,246,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.52, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 14, h * 0.52);
    ctx.lineTo(w / 2 - 5, h * 0.52);
    ctx.moveTo(w / 2 + 5, h * 0.52);
    ctx.lineTo(w / 2 + 14, h * 0.52);
    ctx.moveTo(w / 2, h * 0.52 - 14);
    ctx.lineTo(w / 2, h * 0.52 - 5);
    ctx.moveTo(w / 2, h * 0.52 + 5);
    ctx.lineTo(w / 2, h * 0.52 + 14);
    ctx.stroke();

    // Warnings.
    if (plane.agl < 25 && !plane.onGround && plane.speed > 30) {
      this.warning(ctx, w, h, 'PULL UP', PALETTE.hudBad);
    } else if (plane.fuel < 20 && plane.fuel > 0) {
      this.warning(ctx, w, h, 'LOW FUEL', PALETTE.hudWarn);
    } else if (plane.fuel <= 0) {
      this.warning(ctx, w, h, 'FUEL EMPTY — GLIDING', PALETTE.hudBad);
    }

    // Flash message.
    if (this.flash && now < this.flash.until) {
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.flash.color;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(this.flash.text, w / 2, h * 0.24);
      ctx.shadowBlur = 0;
    }
    void time;
  }

  warning(ctx, w, h, text, color) {
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const blink = Math.sin(performance.now() / 130) > 0 ? 1 : 0.35;
    ctx.globalAlpha = blink;
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, w / 2, h * 0.17);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  bar(ctx, x, y, bw, bh, frac, name, color) {
    ctx.fillStyle = 'rgba(10,22,36,0.62)';
    roundRect(ctx, x - 4, y - 4, bw + 8, bh + 8, 6);
    ctx.fill();
    const fh = Math.max(0, Math.min(1, frac)) * bh;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + bh - fh, bw, fh);
    ctx.strokeStyle = 'rgba(234,246,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, bw, bh);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(name, x + bw / 2, y + bh + 16);
  }

  // --- Title / menu -------------------------------------------------------------
  drawMenu(ctx, w, h, selected, time) {
    this.menuRects = [];
    ctx.fillStyle = 'rgba(8,18,32,0.42)';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '800 64px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 14;
    ctx.fillText(GAME.title, cx, h * 0.2);
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ringGold;
    ctx.fillText('— ' + GAME.subtitle.toUpperCase() + ' —', cx, h * 0.2 + 44);
    ctx.shadowBlur = 0;
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudInk;
    ctx.fillText(
      'Fly the mail run across the island: thread the rings, mind the fuel, and bring her home.',
      cx, h * 0.2 + 78,
    );

    // Mission cards.
    const cardW = 300;
    const cardH = 132;
    const gap = 24;
    const totalW = MISSIONS.length * cardW + (MISSIONS.length - 1) * gap;
    let x = cx - totalW / 2;
    const y = h * 0.36;
    MISSIONS.forEach((m, i) => {
      const sel = i === selected;
      ctx.fillStyle = sel ? 'rgba(255,201,60,0.16)' : 'rgba(10,22,36,0.66)';
      roundRect(ctx, x, y, cardW, cardH, 12);
      ctx.fill();
      ctx.strokeStyle = sel ? PALETTE.ringGold : 'rgba(234,246,255,0.3)';
      ctx.lineWidth = sel ? 2.5 : 1;
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.font = '800 20px system-ui, sans-serif';
      ctx.fillStyle = sel ? PALETTE.ringGold : PALETTE.hudInk;
      ctx.fillText(`${i + 1}. ${m.name}`, x + 16, y + 32);
      ctx.font = '400 13px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudDim;
      this.wrapText(ctx, m.blurb, x + 16, y + 56, cardW - 32, 18);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.hudInk;
      ctx.fillText(
        `${m.rings} rings  ·  ${Math.floor(m.timeLimit / 60)}:${String(m.timeLimit % 60).padStart(2, '0')} limit`,
        x + 16, y + cardH - 14,
      );
      this.menuRects.push({ x, y, w: cardW, h: cardH, mission: i });
      x += cardW + gap;
    });

    // Start button.
    const bw = 260;
    const bh = 54;
    const bx = cx - bw / 2;
    const by = y + cardH + 34;
    const pulse = 0.75 + Math.sin(time * 3) * 0.25;
    ctx.fillStyle = `rgba(255,201,60,${0.85 + pulse * 0.15})`;
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillStyle = '#241a05';
    ctx.textAlign = 'center';
    ctx.fillText('START FLYING  ▸', cx, by + 35);
    this.menuRects.push({ x: bx, y: by, w: bw, h: bh, start: true });

    // Controls.
    let cy = by + bh + 42;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText('CONTROLS', cx, cy);
    cy += 22;
    ctx.font = '400 13px system-ui, sans-serif';
    const half = Math.ceil(CONTROLS.length / 2);
    CONTROLS.forEach((c, i) => {
      const colX = i < half ? cx - 330 : cx + 10;
      const rowY = cy + (i % half) * 20;
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.hudInk;
      ctx.fillText(c[0], colX, rowY);
      ctx.fillStyle = PALETTE.hudDim;
      ctx.fillText(c[1], colX + 150, rowY);
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(
      'Click a mission, or press 1–3 then Enter. Land gently on the strip to finish a sortie.',
      cx, cy + half * 20 + 16,
    );
  }

  wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  // Which menu rect (if any) holds the point.
  menuHit(x, y) {
    return this.menuRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  }

  // --- Pause / end overlays -----------------------------------------------------
  drawPaused(ctx, w, h) {
    ctx.fillStyle = 'rgba(8,18,32,0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('PAUSED', w / 2, h / 2 - 10);
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText('Press P to keep flying · R to restart · M for the menu', w / 2, h / 2 + 28);
  }

  drawEnd(ctx, w, h, mission, plane) {
    const ok = mission.state === 'done';
    ctx.fillStyle = ok ? 'rgba(10,32,18,0.55)' : 'rgba(32,10,10,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = ok ? PALETTE.hudGood : PALETTE.hudBad;
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillText(ok ? 'MISSION COMPLETE' : 'SORTIE FAILED', w / 2, h * 0.3);
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '400 17px system-ui, sans-serif';
    ctx.fillText(mission.endReason, w / 2, h * 0.3 + 36);
    const s = mission.endStats || mission.stats();
    ctx.font = '700 22px system-ui, sans-serif';
    const mm = Math.floor(s.time / 60);
    const ss = Math.floor(s.time % 60).toString().padStart(2, '0');
    ctx.fillText(`SCORE  ${s.score}`, w / 2, h * 0.3 + 88);
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(
      `Rings ${s.rings}   ·   Time ${mm}:${ss}   ·   Fuel ${Math.round(plane.fuel)}%   ·   Damage ${Math.round(plane.damage)}%`,
      w / 2, h * 0.3 + 120,
    );
    ctx.fillStyle = PALETTE.hudInk;
    ctx.font = '400 16px system-ui, sans-serif';
    ctx.fillText('R — fly it again      M — back to the menu', w / 2, h * 0.3 + 168);
    void RUNWAY_MAIN;
  }
}
