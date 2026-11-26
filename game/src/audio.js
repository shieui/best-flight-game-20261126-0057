// Sky Courier sound: every sound is synthesised live with WebAudio —
// engine drone, wind, ring chimes, touchdown thud, crash and a slow pad.
// No audio files are shipped, so the game loads nothing over the network.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.windGain = null;
    this.padOsc = null;
    this.padGain = null;
    this.padTimer = 0;
    this.chords = [
      [130.81, 196.0, 261.63], // C major
      [110.0, 164.81, 220.0], // A minor
      [87.31, 130.81, 174.61], // F major
      [98.0, 146.83, 196.0], // G major
    ];
    this.chordIndex = 0;
  }

  // Must be called from a user gesture at least once; afterwards it is safe
  // to call again (it no-ops) and safe to call from anywhere.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;

      // Engine: two detuned saws through a low-pass, gain follows throttle.
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = 'sawtooth';
      this.engineOsc2.frequency.value = 55 * 1.007;
      this.engineOsc.connect(filter);
      this.engineOsc2.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(ctx.destination);
      this.engineOsc.start();
      this.engineOsc2.start();

      // Wind: looped noise buffer through a band-pass, gain follows speed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      noise.connect(band);
      band.connect(this.windGain);
      this.windGain.connect(ctx.destination);
      noise.start();

      // Pad: a soft triangle chord that changes every 12 seconds.
      this.padGain = ctx.createGain();
      this.padGain.gain.value = 0.0;
      this.padGain.connect(ctx.destination);
      this.startChord(0);
    } catch {
      this.ctx = null;
    }
  }

  startChord(index) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (this.padOsc) {
      try { this.padOsc.stop(); } catch { /* already stopped */ }
      this.padOsc.disconnect();
    }
    const chord = this.chords[index % this.chords.length];
    this.padOsc = ctx.createOscillator();
    this.padOsc.type = 'triangle';
    // One oscillator per chord is too thin; use the root and let the fifth
    // ride as a second oscillator through the same gain.
    this.padOsc.frequency.value = chord[0];
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = chord[1];
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    this.padOsc.connect(this.padGain);
    osc2.connect(g2);
    g2.connect(this.padGain);
    this.padOsc.start();
    osc2.start();
    this.padOsc._second = osc2;
    this.padGain.gain.setTargetAtTime(this.enabled ? 0.035 : 0, ctx.currentTime, 1.5);
  }

  // Called every frame with the flight state; keeps engine, wind and pad
  // following the aircraft.
  update(dt, { throttle, speed, flying }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.enabled && flying;
    const eng = on ? 0.028 + throttle * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(eng, t, 0.15);
    const freq = 48 + throttle * 68 + speed * 0.12;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.2);
    this.engineOsc2.frequency.setTargetAtTime(freq * 1.007, t, 0.2);
    const wind = on ? Math.min(0.09, Math.max(0, speed - 25) * 0.0011) : 0;
    this.windGain.gain.setTargetAtTime(wind, t, 0.25);
    this.padTimer += dt;
    if (this.padTimer > 12) {
      this.padTimer = 0;
      this.chordIndex += 1;
      this.startChord(this.chordIndex);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain.gain.setTargetAtTime(this.enabled ? 0.05 : 0, t, 0.1);
      this.windGain.gain.setTargetAtTime(0, t, 0.1);
      this.padGain.gain.setTargetAtTime(this.enabled ? 0.035 : 0, t, 0.5);
    }
    return this.enabled;
  }

  blip(freq = 660, dur = 0.08, type = 'sine', vol = 0.12) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  ringChime() {
    this.blip(880, 0.16, 'sine', 0.16);
    setTimeout(() => this.blip(1318, 0.22, 'sine', 0.14), 70);
    setTimeout(() => this.blip(1760, 0.3, 'sine', 0.1), 140);
  }

  thud() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.35, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  crashSound() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.7;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    src.connect(low);
    low.connect(g);
    g.connect(ctx.destination);
    src.start();
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this.blip(f, 0.35, 'triangle', 0.16), i * 130),
    );
  }
}
