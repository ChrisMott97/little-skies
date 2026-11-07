// Procedural soundscape: a soft engine hum, breathing wind, birdsong near the
// ground, surf along the coast, village bells, and the generative score in
// music.js. Everything starts on the first key press / click (browsers need a
// gesture before audio can play).
import { groundHeight } from './world/terrain.js';
import { LAYOUT } from './world/layout.js';
import { Music } from './music.js';

const MASTER = 0.6;

function noiseBuffer(ctx, seconds, colour = 'pink') {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (colour === 'brown') {
        last = (last + w * 0.02) / 1.02;
        d[i] = last * 3.5;
      } else {
        // Paul Kellet's cheap pink filter
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
    }
    // crossfade the loop seam
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
  }
  return buf;
}

/** A soft, warm hall: exponentially decaying filtered noise. */
function makeReverb(ctx, seconds = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp = lp * 0.7 + (Math.random() * 2 - 1) * 0.3; // darker tail
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.music = null;
    this.musicOn = true;
    this.birdTimer = 2;
    this.bellTimer = 25;
    this.gust = 0.5;
    this.gustTimer = 0;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());

    // master → gentle compressor → speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, ctx.currentTime, 1.0); // fade in
    this.master.connect(comp);

    // shared reverb bus
    this.reverb = makeReverb(ctx);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);

    this._engine();
    this._wind();
    this._sea();
    this.sfxPink = noiseBuffer(ctx, 1.5, 'pink');
    this.sfxBrown = noiseBuffer(ctx, 2, 'brown');
    this.music = new Music(ctx, this.master, this.reverb);
    if (this.musicOn) this.music.start();
  }

  // ---- Engine: a rounded, distant hum. Sine + soft triangle, gently "puttered"
  // with a sine LFO (a square LFO clicks and buzzes, which sounded harsh).
  _engine() {
    const ctx = this.ctx;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 0.5;
    this.engineFilter = lp;
    const putt = ctx.createGain();
    putt.gain.value = 0.8;
    lp.connect(putt).connect(this.engineGain).connect(this.master);

    this.engOsc = [];
    for (const [type, mult, amp, detune] of [
      ['sine', 1, 0.8, 0],
      ['triangle', 2, 0.22, 4],
      ['sine', 0.5, 0.35, 0],
    ]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g).connect(lp);
      o.start();
      this.engOsc.push({ o, mult });
    }
    // breathy prop wash
    const wash = ctx.createBufferSource();
    wash.buffer = noiseBuffer(ctx, 3, 'pink');
    wash.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.8;
    this.washGain = ctx.createGain();
    this.washGain.gain.value = 0;
    wash.connect(bp).connect(this.washGain).connect(lp);
    wash.start();

    this.putter = ctx.createOscillator();
    this.putter.type = 'sine';
    this.putter.frequency.value = 9;
    this.putterDepth = ctx.createGain();
    this.putterDepth.gain.value = 0.18;
    this.putter.connect(this.putterDepth).connect(putt.gain);
    this.putter.start();
  }

  // ---- Wind: airflow that rises with speed, plus slow natural gusts.
  _wind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 4, 'pink');
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // rustling grass/leaves when close to the ground
    const rs = ctx.createBufferSource();
    rs.buffer = noiseBuffer(ctx, 3, 'pink');
    rs.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    this.rustleGain = ctx.createGain();
    this.rustleGain.gain.value = 0;
    rs.connect(hp).connect(this.rustleGain).connect(this.master);
    rs.start();
  }

  // ---- Sea: slow surf swells, heard near the coast.
  _sea() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 5, 'brown');
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    this.seaSwell = ctx.createGain();
    this.seaSwell.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 7.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(this.seaSwell.gain);
    lfo.start();
    this.seaGain = ctx.createGain();
    this.seaGain.gain.value = 0;
    src.connect(lp).connect(this.seaSwell).connect(this.seaGain).connect(this.master);
    src.start();
  }

  // ---- One-shot voices -------------------------------------------------------
  _chirp(near) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = ctx.createGain();
    out.gain.value = 0.05 * near;
    out.connect(pan).connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    out.connect(send).connect(this.reverb);

    const kind = Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1600;
    const notes = kind === 0 ? 2 + Math.floor(Math.random() * 3) : kind === 1 ? 1 : 4 + Math.floor(Math.random() * 4);
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const dur = kind === 2 ? 0.05 : 0.09 + Math.random() * 0.08;
      const f = base * (kind === 1 ? 1 : 1 + (Math.random() - 0.4) * 0.25);
      o.frequency.setValueAtTime(f, t);
      if (kind === 1) {
        // a slow two-note "pee-oo" call
        o.frequency.setValueAtTime(f * 1.15, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.78, t + 0.32);
      } else {
        o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.25 : 0.8), t + dur);
      }
      const len = kind === 1 ? 0.34 : dur;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
      t += len + (kind === 2 ? 0.03 : 0.06 + Math.random() * 0.1);
    }
  }

  _cricket(vol) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(pan).connect(this.master);
    const f = 4200 + Math.random() * 900;
    const trills = 2 + Math.floor(Math.random() * 3);
    for (let r = 0; r < trills; r++) {
      for (let i = 0; i < 4; i++) {
        const t = t0 + r * 0.42 + i * 0.045;
        const o = ctx.createOscillator();
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(1, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.05);
      }
    }
  }

  _bell(time, freq, vol) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 1.2;
    out.connect(send).connect(this.reverb);
    // church-bell partials (hum, prime, tierce, quint, nominal)
    for (const [r, a, d] of [[0.5, 0.5, 5], [1, 1, 4], [1.2, 0.5, 3], [1.5, 0.35, 2.5], [2, 0.4, 2], [2.74, 0.15, 1.2]]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(a, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0005, time + d);
      o.connect(g).connect(out);
      o.start(time);
      o.stop(time + d + 0.1);
    }
  }

  _peal(vol) {
    const notes = [523.25, 440, 392, 349.23];
    const t0 = this.ctx.currentTime + 0.1;
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) this._bell(t0 + i * 1.1, notes[i % notes.length], vol);
  }

  // ---- Bumps and pops: one-shots for the plane meeting the world ----------------
  // A short burst of filtered noise. env: [[time, gain], ...] relative to t.
  _noise(t, { buf = this.sfxPink, type = 'bandpass', freq = 1000, Q = 1, env, vol = 1, rate = 1, reverb = 0.3, pan = 0, sweep }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + env[env.length - 1][0]);
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (const [dt, v] of env) g.gain.linearRampToValueAtTime(v * vol, t + dt);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.master);
    if (reverb) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      g.connect(send).connect(this.reverb);
    }
    const end = env[env.length - 1][0];
    src.start(t, Math.random() * 0.5);
    src.stop(t + end + 0.05);
  }

  _tone(t, { type = 'sine', f0, f1, dur, vol, attack = 0.005, reverb = 0.4 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.master);
    if (reverb) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      g.connect(send).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** A balloon going pop: a bright snap and a hollow "plock". */
  pop(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this._noise(t, { type: 'highpass', freq: 1800, Q: 0.7, env: [[0.003, 0.5], [0.07, 0]], vol, reverb: 0.6 });
    this._tone(t, { f0: 620, f1: 180, dur: 0.16, vol: 0.22 * vol });
  }

  /** ...then the "pfrrrrt" of the envelope whizzing away. */
  deflate(dur = 2.5, vol = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.12;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, t);
    o.frequency.linearRampToValueAtTime(520, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(260, t + dur);
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 70;
    flutter.connect(depth).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * vol, t + 0.05);
    g.gain.setValueAtTime(0.07 * vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(0, t);
    pan.pan.linearRampToValueAtTime(Math.random() < 0.5 ? -0.7 : 0.7, t + dur);
    o.connect(lp).connect(g).connect(pan).connect(this.master);
    o.start(t);
    flutter.start(t);
    o.stop(t + dur + 0.05);
    flutter.stop(t + dur + 0.05);
  }

  /** A house tumbling into toy blocks: a soft whump, then wooden clacks and thuds. */
  crumble(vol = 1) {
    if (!this.ctx || vol <= 0) return;
    const t = this.ctx.currentTime + 0.01;
    this._noise(t, { buf: this.sfxBrown, type: 'lowpass', freq: 900, sweep: 200, Q: 0.5, env: [[0.02, 0.9], [1.4, 0]], vol, reverb: 0.5 });
    this._tone(t, { f0: 110, f1: 45, dur: 0.5, vol: 0.3 * vol });
    for (let i = 0; i < 9; i++) {
      const at = t + 0.08 + Math.random() * 1.1;
      if (Math.random() < 0.55) {
        // wooden block knock
        this._noise(at, { type: 'bandpass', freq: 900 + Math.random() * 1400, Q: 6, env: [[0.002, 0.7], [0.06, 0]], vol: vol * 0.8, pan: Math.random() * 1.2 - 0.6 });
        this._tone(at, { f0: 500 + Math.random() * 500, dur: 0.07, vol: 0.05 * vol, reverb: 0.2 });
      } else {
        this._tone(at, { f0: 140 + Math.random() * 60, f1: 60, dur: 0.18, vol: 0.14 * vol, reverb: 0.2 });
      }
    }
  }

  /** The blocks flying home: a little music-box run up a pentatonic scale. */
  rebuild(vol = 1) {
    if (!this.ctx || vol <= 0) return;
    const t = this.ctx.currentTime + 0.05;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
    const root = 523.25 * (Math.random() < 0.5 ? 1 : 0.89);
    for (let i = 0; i < 8; i++) {
      const f = root * Math.pow(2, scale[i] / 12);
      const at = t + i * 0.13 + (i === 7 ? 0.12 : 0);
      this._tone(at, { f0: f, dur: 1.4, vol: 0.05 * vol, reverb: 1 });
      this._tone(at, { f0: f * 3, dur: 0.4, vol: 0.012 * vol, reverb: 1 });
    }
  }

  /** A startled sheep. */
  baa(pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const dur = 0.75;
    const f = (290 + Math.random() * 70) * pitch;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.06, t);
    o.frequency.linearRampToValueAtTime(f, t + 0.12);
    o.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 7.5;
    const vd = ctx.createGain();
    vd.gain.value = f * 0.045;
    vib.connect(vd).connect(o.frequency);
    // two soft formants make it an "ehh" rather than a buzz
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.06, t + 0.06);
    out.gain.setValueAtTime(0.06, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    for (const [ff, q, a] of [[700, 5, 1], [1800, 7, 0.5]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(bp).connect(g).connect(out);
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    out.connect(pan).connect(this.master);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    out.connect(send).connect(this.reverb);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  /** A flock bursting into the air: a flutter of wings and some alarmed chirps. */
  flurry(amount = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    for (let i = 0; i < 10; i++) {
      const at = t + i * 0.055 + Math.random() * 0.03;
      this._noise(at, { type: 'bandpass', freq: 1400 + Math.random() * 900, Q: 1.5, env: [[0.01, 0.35], [0.05, 0]], vol: amount, pan: Math.random() * 1.4 - 0.7, reverb: 0.1 });
    }
    for (let i = 0; i < 2 + Math.round(amount * 3); i++) setTimeout(() => this._chirp(0.8 + amount), i * 140 + Math.random() * 80);
  }

  /** Brushing through a treetop. */
  rustle(vol = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    this._noise(t, { type: 'highpass', freq: 2500, Q: 0.4, env: [[0.05, 0.3], [0.25, 0.2], [0.7, 0]], vol: Math.min(vol, 1.5), reverb: 0.2 });
    this._noise(t, { type: 'bandpass', freq: 700, Q: 0.8, env: [[0.05, 0.3], [0.5, 0]], vol: Math.min(vol, 1.5) * 0.6, reverb: 0.1 });
  }

  // ---- Controls --------------------------------------------------------------
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, this.ctx.currentTime, 0.3);
    return this.muted;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.music) this.musicOn ? this.music.start() : this.music.stop();
    return this.musicOn;
  }

  update(flight, dt, night = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const thr = flight.throttle;
    const spd = flight.speed;
    const P = flight.position;
    const ground = groundHeight(P.x, P.z);
    const agl = P.y - Math.max(ground, 0);

    // engine
    const base = 46 + thr * 38 + spd * 0.25;
    for (const { o, mult } of this.engOsc) o.frequency.setTargetAtTime(base * mult, t, 0.25);
    this.putter.frequency.setTargetAtTime(6 + thr * 12, t, 0.3);
    this.putterDepth.gain.setTargetAtTime(0.22 - thr * 0.1, t, 0.3);
    this.engineFilter.frequency.setTargetAtTime(220 + thr * 260, t, 0.25);
    this.engineGain.gain.setTargetAtTime(0.05 + thr * 0.09, t, 0.3);
    this.washGain.gain.setTargetAtTime(0.15 + thr * 0.35, t, 0.3);

    // gusts: wander toward a new random target every few seconds
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = 2 + Math.random() * 5;
      this.gustTarget = 0.35 + Math.random() * 0.65;
    }
    this.gust += ((this.gustTarget ?? 0.5) - this.gust) * Math.min(dt * 0.6, 1);
    const w = Math.min(spd / 55, 1);
    this.windGain.gain.setTargetAtTime(0.04 + w * w * 0.22 * (0.7 + this.gust * 0.5) + this.gust * 0.03, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(350 + w * 700 + this.gust * 300, t, 0.4);
    const low = Math.max(0, 1 - agl / 60) * (ground > 1 ? 1 : 0);
    this.rustleGain.gain.setTargetAtTime(low * (0.012 + this.gust * 0.02), t, 0.5);

    // sea: loudest over the shoreline, fades inland and far out
    let shore = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const g = groundHeight(P.x + Math.cos(a) * 120, P.z + Math.sin(a) * 120);
      if ((g < 0) !== (ground < 0)) shore++;
    }
    const seaAmt = (ground < 0 ? 0.35 : 0) + (shore / 8) * 0.9;
    this.seaGain.gain.setTargetAtTime(seaAmt * 0.16 * Math.max(0, 1 - agl / 400), t, 1.2);

    // birdsong over land when you're low by day; crickets after dark
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      const near = ground > 2 ? Math.max(0, 1 - agl / 140) : 0;
      if (near > 0.05) {
        if (Math.random() > night) this._chirp(near);
        else this._cricket(0.018 * near);
      }
      this.birdTimer = (0.6 + Math.random() * 3.5 + (1 - near) * 3) * (night > 0.5 ? 0.5 : 1);
    }

    // the clock tower rings now and then when you're nearby
    this.bellTimer -= dt;
    if (this.bellTimer <= 0) {
      const d = Math.hypot(P.x - LAYOUT.plaza.x, P.z - LAYOUT.plaza.z);
      const vol = Math.max(0, 1 - d / 900);
      if (vol > 0) this._peal(0.05 * vol);
      this.bellTimer = vol > 0 ? 70 + Math.random() * 60 : 10;
    }

    this.music?.update(dt);
  }
}
