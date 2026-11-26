// Sky Courier missions: objectives, ring order, scoring and end states.
// The flight model flies the plane; this file decides what counts.

import { RUNWAY_MAIN, RUNWAY_FAR } from './config.js';
import { ringsForMission } from './terrain.js';
import { angleDiff } from './rng.js';

export class Mission {
  constructor(def) {
    this.def = def;
    this.rings = ringsForMission(def);
    this.ringIndex = 0;
    this.score = 0;
    this.time = 0;
    this.state = 'ready'; // ready | flying | done | failed
    this.endReason = '';
    this.endStats = null;
    this.ringsHit = 0;
    this.bestLanding = null;
    this._landedAt = null;
  }

  get nextRing() {
    return this.ringIndex < this.rings.length ? this.rings[this.ringIndex] : null;
  }

  get ringsLeft() {
    return this.rings.length - this.ringIndex;
  }

  get targetRunway() {
    return this.def.landAt === 'far' ? RUNWAY_FAR : RUNWAY_MAIN;
  }

  start() {
    this.state = 'flying';
    this.time = 0;
  }

  update(dt, plane) {
    if (this.state !== 'flying') return null;
    this.time += dt;
    if (this.time > this.def.timeLimit) {
      return this.fail('Time up — the sortie window closed.');
    }
    // Ring check: inside the ring's sphere, roughly in its plane.
    const ring = this.nextRing;
    if (ring) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < ring.r) {
        this.ringIndex += 1;
        this.ringsHit += 1;
        const bonus = 100 + Math.max(0, Math.round(30 - dist));
        this.score += bonus;
        return { type: 'ring', ring: this.ringsHit, total: this.rings.length, bonus };
      }
    }
    // Landing challenge is judged on the touchdown itself.
    if (this.def.id === 'landing' && this.ringsHit >= this.rings.length) {
      const rw = this.targetRunway;
      const lateral = Math.abs(plane.x - rw.cx);
      const aligned = Math.abs(angleDiff(plane.heading, 0)) < 0.3;
      if (plane.onGround && lateral < rw.width / 2 && aligned) {
        const quality = Math.max(0, 100 - Math.round(Math.abs(plane.verticalSpeed) * 12) - Math.round(lateral));
        this.bestLanding = quality;
        this.score += quality * 3;
        return this.complete(`Greased it — landing quality ${quality}/100.`);
      }
    }
    return null;
  }

  // Called by the game loop when the flight model reports a landing.
  onLanded(plane) {
    if (this.state !== 'flying') return null;
    const rw = this.targetRunway;
    const onTarget = plane.whichRunway() === rw;
    if (this.def.id === 'landing') {
      // Landing challenge without the rings done is a failed attempt.
      if (this.ringsHit < this.rings.length) {
        return this.fail('Landed before flying the circuit rings.');
      }
      return null; // update() completes it once the plane is settled
    }
    if (this.ringsHit >= this.rings.length && onTarget) {
      const timeBonus = Math.max(0, Math.round((this.def.timeLimit - this.time) * 2));
      const fuelBonus = Math.round(plane.fuel);
      this.score += timeBonus + fuelBonus;
      return this.complete(
        `Delivered! Time bonus +${timeBonus}, fuel bonus +${fuelBonus}.`,
      );
    }
    if (this.ringsHit < this.rings.length) {
      return this.fail('Landed before collecting every ring.');
    }
    return this.fail(`Wrong strip — the sortie ends at ${rw.name}.`);
  }

  onCrashed() {
    if (this.state !== 'flying') return null;
    return this.fail('The courier went down. The mail is soggy.');
  }

  complete(reason) {
    this.state = 'done';
    this.endReason = reason;
    this.endStats = this.stats();
    return { type: 'complete', reason };
  }

  fail(reason) {
    this.state = 'failed';
    this.endReason = reason;
    this.endStats = this.stats();
    return { type: 'failed', reason };
  }

  stats() {
    return {
      score: this.score,
      rings: `${this.ringsHit}/${this.rings.length}`,
      time: this.time,
      timeLimit: this.def.timeLimit,
    };
  }
}
