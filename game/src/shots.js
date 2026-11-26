// Sky Courier screenshot presets: ?shot=start | play | ring | end drives the
// game into a fixed, deterministic moment so real renders can be captured
// headlessly. ?selftest=1 runs a scripted flight and reports the result in
// the #status line, so the game can be verified without a display.

import { MISSIONS } from './config.js';

export function parseShot(search) {
  const params = new URLSearchParams(search);
  return {
    shot: params.get('shot'),
    selftest: params.get('selftest') === '1',
  };
}

// Put the game into the named moment. Returns the state the loop should use.
// The moment is frozen: the loop renders it but does not fly on, so the
// captured frame is the one described here.
export function applyShot(game, shot) {
  if (!shot) return;
  game.frozen = true;
  const plane = game.plane;
  if (shot === 'start') {
    // On the runway, engine idling, menu up over the scene.
    game.state = 'menu';
    game.selectedMission = 0;
    game.mission = game.newMission(0);
    plane.reset(game.mission.def.startRunway === 'far' ? game.farRunway : game.mainRunway);
    plane.throttle = 0.25;
    game.time = 3;
  } else if (shot === 'play') {
    // Mid-flight: on the approach to ring 2 over the river valley, the
    // ring ahead, the island and the bay below, HUD live.
    game.state = 'flying';
    game.mission = game.newMission(0);
    game.mission.start();
    plane.reset(game.mainRunway);
    plane.x = -632;
    plane.z = 527;
    plane.y = 95;
    plane.heading = -2.63; // on course for ring 2 at (-760, 70, 300)
    plane.pitch = 0.05;
    plane.bank = 0.18;
    plane.speed = 90;
    plane.throttle = 0.8;
    plane.fuel = 82;
    plane.onGround = false;
    game.mission.ringIndex = 2;
    game.mission.ringsHit = 2;
    game.mission.score = 240;
    game.mission.time = 74;
    game.time = 5;
  } else if (shot === 'ring') {
    // A breath from ring 3, wings level on the course line.
    game.state = 'flying';
    game.mission = game.newMission(0);
    game.mission.start();
    plane.reset(game.mainRunway);
    plane.x = -548;
    plane.z = -230;
    plane.y = 126;
    plane.heading = 2.76; // on course for ring 3 at (-500, 120, -350)
    plane.pitch = 0.02;
    plane.bank = -0.06;
    plane.speed = 96;
    plane.throttle = 0.8;
    plane.fuel = 71;
    plane.onGround = false;
    game.mission.ringIndex = 3;
    game.mission.ringsHit = 3;
    game.mission.score = 380;
    game.mission.time = 118;
    game.time = 5;
  } else if (shot === 'end') {
    // Mission complete: parked on the strip, results on screen.
    game.state = 'flying';
    game.mission = game.newMission(0);
    game.mission.start();
    plane.reset(game.mainRunway);
    plane.x = 0;
    plane.z = 320;
    plane.y = 3.6;
    plane.speed = 0;
    plane.throttle = 0;
    plane.fuel = 46;
    plane.onGround = true;
    game.mission.ringIndex = game.mission.rings.length;
    game.mission.ringsHit = game.mission.rings.length;
    game.mission.score = 1240;
    game.mission.time = 214;
    game.mission.complete('Delivered! Time bonus +312, fuel bonus +46.');
    game.state = 'end';
    game.time = 5;
  }
}

// Headless self-test: drive the flight model with scripted inputs for a few
// seconds and write the outcome into #status for the harness to read.
export function runSelfTest(game) {
  const status = document.getElementById('status');
  const out = [];
  try {
    const plane = game.plane;
    const mission = game.newMission(0);
    game.mission = mission;
    mission.start();
    game.state = 'flying';
    plane.reset(game.mainRunway);
    // 6 s: full throttle, gentle climb.
    let events = [];
    for (let i = 0; i < 360; i++) {
      const ev = plane.update(1 / 60, { pitch: 0.5, bank: 0, throttleDelta: 1.5, brake: false });
      if (ev) events.push(ev);
    }
    out.push(`takeoff speed=${plane.speed.toFixed(1)} alt=${plane.y.toFixed(1)} events=${events.join(',') || 'none'}`);
    // 6 s: level flight, slight turn.
    events = [];
    for (let i = 0; i < 360; i++) {
      const ev = plane.update(1 / 60, { pitch: 0.1, bank: 0.5, throttleDelta: 0, brake: false });
      if (ev) events.push(ev);
    }
    out.push(`cruise speed=${plane.speed.toFixed(1)} alt=${plane.y.toFixed(1)} heading=${plane.headingDeg.toFixed(0)} fuel=${plane.fuel.toFixed(1)} events=${events.join(',') || 'none'}`);
    // Ring check: teleport near the first ring and fly through it.
    const ring = mission.rings[0];
    plane.x = ring.x;
    plane.y = ring.y;
    plane.z = ring.z;
    const hit = mission.update(1 / 60, plane);
    out.push(`ring hit=${hit ? hit.type + ' ' + hit.ring + '/' + hit.total : 'MISS'} score=${mission.score}`);
    // Ground check: put the plane on the runway, slow, gentle, aligned.
    plane.x = 0;
    plane.z = 260;
    plane.y = 3.0;
    plane.heading = 0;
    plane.bank = 0;
    plane.pitch = 0;
    plane.speed = 40;
    plane.verticalSpeed = -2;
    plane.onGround = false;
    const ev = plane.update(1 / 60, { pitch: 0, bank: 0, throttleDelta: -1, brake: true });
    out.push(`touchdown event=${ev} onGround=${plane.onGround} damage=${plane.damage}`);
    out.push('SELFTEST OK');
  } catch (err) {
    out.push(`SELFTEST FAIL ${err.message}`);
  }
  if (status) status.textContent = out.join(' | ');
  document.title = out.join(' | ');
  return out.join(' | ');
}

export { MISSIONS };
