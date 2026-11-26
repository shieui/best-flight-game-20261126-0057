// Sky Courier — Island Run: bootstrap and game loop.
// Owns the state machine (menu / flying / paused / end), reads input into
// flight controls, and calls the renderer and HUD each frame. The flight
// model, missions, terrain and sound live in their own files.

import { GAME, MISSIONS, RUNWAY_MAIN, RUNWAY_FAR } from './config.js';
import { clamp } from './rng.js';
import { Renderer } from './render.js';
import { HUD } from './hud.js';
import { Plane } from './flight.js';
import { Mission } from './missions.js';
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { parseShot, applyShot, runSelfTest } from './shots.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.statusEl = document.getElementById('status');
    this.renderer = new Renderer(this.canvas);
    this.hud = new HUD();
    this.input = new Input(this.canvas);
    this.sound = new SoundEngine();
    this.plane = new Plane();
    this.mainRunway = RUNWAY_MAIN;
    this.farRunway = RUNWAY_FAR;
    this.state = 'menu'; // menu | flying | paused | end
    this.selectedMission = 0;
    this.mission = this.newMission(0);
    this.time = 0;
    this.last = performance.now();
    this.announced = '';
    this.frozen = false; // shot mode: render a fixed moment, do not fly on
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  newMission(index) {
    return new Mission(MISSIONS[index % MISSIONS.length]);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
  }

  startMission(index) {
    this.selectedMission = index % MISSIONS.length;
    this.mission = this.newMission(this.selectedMission);
    this.plane.reset(this.mainRunway);
    this.plane.fuel = this.mission.def.fuel;
    this.mission.start();
    this.state = 'flying';
    this.hud.say(`${this.mission.def.name} — ${this.mission.rings.length} rings ahead`, 3);
    this.announce('Mission started. Fly through the rings, then land.');
    this.sound.ensure();
  }

  restart() {
    this.startMission(this.selectedMission);
  }

  toMenu() {
    this.state = 'menu';
    this.mission = this.newMission(this.selectedMission);
    this.plane.reset(this.mainRunway);
    this.announce('Menu. Choose a mission.');
  }

  announce(text) {
    this.announced = text;
    if (this.statusEl) this.statusEl.textContent = text;
  }

  // --- Input -> flight controls -------------------------------------------------
  readControls(dt) {
    const input = this.input;
    let pitch = 0;
    let bank = 0;
    let throttleDelta = 0;
    if (input.down('w', 'arrowup')) pitch += 1;
    if (input.down('s', 'arrowdown')) pitch -= 1;
    if (input.down('a', 'arrowleft')) bank -= 1;
    if (input.down('d', 'arrowright')) bank += 1;
    if (input.down('shift', 'r')) throttleDelta += 1.4;
    if (input.down('control', 'f')) throttleDelta -= 1.4;
    const steer = input.steer();
    if (steer.x !== 0 || steer.y !== 0) {
      bank += steer.x;
      pitch += -steer.y * 0.7;
    }
    const wheel = input.takeWheel();
    if (wheel !== 0) throttleDelta += wheel > 0 ? -1.2 : 1.2;
    return {
      pitch: clamp(pitch, -1, 1),
      bank: clamp(bank, -1, 1),
      throttleDelta,
      brake: input.down(' '),
    };
  }

  // --- Frame ----------------------------------------------------------------------
  frame(now) {
    const dt = clamp((now - this.last) / 1000, 0.001, 0.05);
    this.last = now;
    this.time += dt;
    const input = this.input;

    if (!this.frozen) {
      if (this.state === 'menu') {
        this.updateMenu(input);
      } else if (this.state === 'flying') {
        this.updateFlying(dt, input);
      } else if (this.state === 'paused') {
        if (input.hit('p', 'escape')) {
          this.state = 'flying';
          this.announce('Resumed.');
        }
        if (input.hit('r')) this.restart();
        if (input.hit('m')) this.toMenu();
      } else if (this.state === 'end') {
        if (input.hit('r', 'enter')) this.restart();
        if (input.hit('m')) this.toMenu();
      }
    }

    if (input.hit('n')) {
      const on = this.sound.toggle();
      this.hud.say(on ? 'Sound on' : 'Sound off', 1.2);
    }

    // Render always, even on menus, so the island is the backdrop.
    this.renderer.updateCamera(this.plane, dt, this.time);
    this.renderer.renderFrame(this.plane, this.mission, this.time);
    if (this.state === 'flying' || this.state === 'paused') {
      this.hud.drawFlight(this.renderer.ctx, this.renderer.w, this.renderer.h, this.plane, this.mission, this.time);
    }
    if (this.state === 'menu') {
      this.hud.drawMenu(this.renderer.ctx, this.renderer.w, this.renderer.h, this.selectedMission, this.time);
    } else if (this.state === 'paused') {
      this.hud.drawPaused(this.renderer.ctx, this.renderer.w, this.renderer.h);
    } else if (this.state === 'end') {
      this.hud.drawEnd(this.renderer.ctx, this.renderer.w, this.renderer.h, this.mission, this.plane);
    }

    this.sound.update(dt, {
      throttle: this.plane.throttle,
      speed: this.plane.speed,
      flying: this.state === 'flying',
    });
    input.endFrame();
  }

  updateMenu(input) {
    // Keyboard selection.
    if (input.hit('1')) this.selectedMission = 0;
    if (input.hit('2')) this.selectedMission = 1;
    if (input.hit('3')) this.selectedMission = 2;
    if (input.hit('arrowleft')) this.selectedMission = (this.selectedMission + 2) % 3;
    if (input.hit('arrowright')) this.selectedMission = (this.selectedMission + 1) % 3;
    if (input.hit('enter')) {
      this.startMission(this.selectedMission);
      return;
    }
    // Mouse selection.
    const click = input.consumeClick();
    if (click) {
      const hit = this.hud.menuHit(click.x, click.y);
      if (hit) {
        if (hit.start) this.startMission(this.selectedMission);
        else {
          this.selectedMission = hit.mission;
          this.sound.ensure();
          this.sound.blip(520, 0.06, 'sine', 0.08);
        }
      }
    }
    // Idle drift: the parked plane sits on the runway; keep the camera alive.
    this.plane.throttle = 0;
  }

  updateFlying(dt, input) {
    if (input.hit('p', 'escape')) {
      this.state = 'paused';
      this.announce('Paused.');
      return;
    }
    const ctl = this.readControls(dt);
    const event = this.plane.update(dt, ctl);
    if (event === 'takeoff') {
      this.hud.say('Airborne — gear up, eyes on the rings', 2.5);
      this.announce('Airborne.');
    } else if (event === 'landed') {
      this.sound.thud();
      const result = this.mission.onLanded(this.plane);
      if (result) this.finishMission(result);
      else this.hud.say('Down safe — but the sortie is not finished', 3);
    } else if (event === 'rough') {
      this.sound.thud();
      this.hud.say(`Rough touchdown — damage ${Math.round(this.plane.damage)}%`, 2.5);
    } else if (event === 'crashed') {
      this.sound.crashSound();
      const result = this.mission.onCrashed();
      this.finishMission(result || { type: 'failed', reason: 'The courier went down.' });
      return;
    } else if (event === 'fuelEmpty') {
      this.hud.say('Fuel empty — glide her down', 3);
    }

    const missionEvent = this.mission.update(dt, this.plane);
    if (missionEvent) {
      if (missionEvent.type === 'ring') {
        this.sound.ringChime();
        this.hud.say(
          `RING ${missionEvent.ring}/${missionEvent.total}  +${missionEvent.bonus}`,
          2,
          '#ffe9a3',
        );
        this.announce(`Ring ${missionEvent.ring} of ${missionEvent.total}.`);
      } else if (missionEvent.type === 'complete' || missionEvent.type === 'failed') {
        this.finishMission(missionEvent);
        return;
      }
    }
  }

  finishMission(result) {
    this.state = 'end';
    if (result.type === 'complete') {
      this.sound.fanfare();
      this.announce(`Mission complete. Score ${this.mission.score}.`);
    } else {
      this.announce(`Sortie failed. ${result.reason}`);
    }
  }

  run() {
    const loop = (now) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
const { shot, selftest } = parseShot(window.location.search);
if (selftest) {
  game.run();
  // Let one frame render, then run the scripted check.
  setTimeout(() => runSelfTest(game), 300);
} else {
  applyShot(game, shot);
  game.run();
}
window.__skyCourier = game;
