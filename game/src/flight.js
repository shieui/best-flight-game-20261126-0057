// Sky Courier flight model: arcade physics for one little courier plane.
// Owns position, heading, pitch, bank, speed, throttle, fuel and damage,
// plus ground contact (landing vs crash). No rendering lives here.

import { GAME, RUNWAY_MAIN, RUNWAY_FAR } from './config.js';
import { clamp, angleDiff } from './rng.js';
import { heightAt, isOnRunway } from './terrain.js';

export class Plane {
  constructor() {
    this.reset(RUNWAY_MAIN);
  }

  reset(runway) {
    this.x = runway.cx;
    this.z = runway.cz - runway.length / 2 + 40; // start near the threshold
    this.y = runway.elevation + 1.6;
    this.heading = 0; // north, +z
    this.pitch = 0;
    this.bank = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = GAME.startFuel;
    this.damage = 0;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.stalled = false;
    this.propAngle = 0;
    this._fuelEmptySent = false;
    this._wasAirborne = false;
  }

  get groundHeight() {
    return heightAt(this.x, this.z);
  }

  get agl() {
    return Math.max(0, this.y - this.groundHeight);
  }

  get knots() {
    return this.speed * 1.94384;
  }

  get altitudeFt() {
    return this.y * 3.28084;
  }

  get headingDeg() {
    let d = ((-this.heading * 180) / Math.PI) % 360;
    if (d < 0) d += 360;
    return d;
  }

  // One physics step. `ctl` is {pitch, bank, throttleDelta, brake} from the
  // game loop; returns events the game reacts to: 'takeoff' | 'landed' |
  // 'crashed' | 'fuelEmpty' | null.
  update(dt, ctl) {
    this.propAngle += dt * (4 + this.throttle * 40);

    // --- Throttle -----------------------------------------------------------
    if (this.fuel > 0) {
      this.throttle = clamp(this.throttle + ctl.throttleDelta * dt, 0, 1);
    } else {
      this.throttle = Math.max(0, this.throttle - dt * 0.5);
      if (this.throttle === 0 && !this._fuelEmptySent) {
        this._fuelEmptySent = true;
        return 'fuelEmpty';
      }
    }
    if (ctl.brake) this.throttle = Math.max(0, this.throttle - dt * 0.8);

    // --- Fuel ----------------------------------------------------------------
    if (this.fuel > 0) {
      this.fuel = Math.max(
        0,
        this.fuel - (GAME.fuelBurnBase + GAME.fuelBurnThrottle * this.throttle) * dt,
      );
    }

    // --- Speed ---------------------------------------------------------------
    const target = 18 + this.throttle * (GAME.maxSpeed - 18);
    const accel = this.throttle > 0.05 ? 12 : 5;
    if (this.speed < target) this.speed = Math.min(target, this.speed + accel * dt);
    else this.speed = Math.max(target, this.speed - 14 * dt);
    if (ctl.brake) this.speed = Math.max(0, this.speed - 22 * dt);

    // --- Attitude -------------------------------------------------------------
    const targetBank = clamp(ctl.bank * 0.85, -0.85, 0.85);
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 4.5);
    const targetPitch = clamp(ctl.pitch * 0.42, -0.42, 0.42);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3.5);

    // Turning is coordinated: heading follows the bank.
    this.heading += -this.bank * (this.speed / 60) * 0.55 * dt;

    // --- Stall ---------------------------------------------------------------
    this.stalled = this.speed < GAME.minFlySpeed && !this.onGround;
    let pitchEff = this.pitch;
    if (this.stalled) pitchEff = Math.min(pitchEff, -0.12); // nose drops

    // --- Position --------------------------------------------------------------
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    const climb = Math.sin(pitchEff) * this.speed;
    this.verticalSpeed = climb - (this.stalled ? GAME.gravitySink : 0);
    this.y += this.verticalSpeed * dt;

    // --- Ground contact ---------------------------------------------------------
    // Rolling is pinned to the surface; only rotation speed with pitch up
    // lifts the plane off. Airborne contact is judged as a touchdown.
    const ground = this.groundHeight;
    if (this.onGround) {
      this.y = ground + 1.6;
      this.verticalSpeed = 0;
      if (this.speed > GAME.minFlySpeed + 4 && pitchEff > 0.03) {
        this.onGround = false;
        return 'takeoff';
      }
      // Light rolling resistance; the engine wins.
      if (this.speed < GAME.minFlySpeed + 6) {
        this.speed = Math.max(0, this.speed - 4 * dt);
      }
    } else {
      const clearance = this.y - ground;
      if (clearance > 6) this._wasAirborne = true;
      if (clearance <= 1.62) {
        this.y = ground + 1.6;
        if (this._wasAirborne) {
          // Touchdown: judge it. A plane that never really left the ground
          // (rotation dip) just keeps rolling.
          const runway = this.whichRunway();
          const aligned = runway
            ? Math.abs(angleDiff(this.heading, 0)) < 0.45 ||
              Math.abs(angleDiff(this.heading, Math.PI)) < 0.45
            : false;
          const gentle = this.verticalSpeed > -5 && this.speed < 78;
          if (runway && aligned && gentle) {
            this.onGround = true;
            this._wasAirborne = false;
            this.pitch = 0;
            this.bank *= 0.3;
            return 'landed';
          }
          if (this.verticalSpeed < -8 || this.speed > 85) {
            this.damage = 100;
            return 'crashed';
          }
          // Rough touchdown off the strip: bounce, take damage, keep rolling.
          this.damage = Math.min(100, this.damage + 18 + Math.abs(this.verticalSpeed) * 2);
          this.verticalSpeed = 2;
          this.y = ground + 2.2;
          this.onGround = true;
          this._wasAirborne = false;
          this.pitch = 0;
          if (this.damage >= 100) return 'crashed';
          return 'rough';
        }
        this.onGround = true;
        this._wasAirborne = false;
      }
    }

    // Ceiling and world edge: soft push-back, never a hard wall.
    if (this.y > 900) this.y = 900;
    const r = Math.hypot(this.x - 150, this.z - 700);
    if (r > 2600) {
      const k = 2600 / r;
      this.x = 150 + (this.x - 150) * k;
      this.z = 700 + (this.z - 700) * k;
      this.heading += Math.PI; // turn back toward the island
    }
    return null;
  }

  whichRunway() {
    if (isOnRunway(this.x, this.z, RUNWAY_MAIN)) return RUNWAY_MAIN;
    if (isOnRunway(this.x, this.z, RUNWAY_FAR)) return RUNWAY_FAR;
    return null;
  }
}
