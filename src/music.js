// A small generative score. Each "piece" is composed on the fly: a key, a gentle
// tempo (often a waltz), a chord progression, and a melody built from a short
// motif that returns, the way a theme does in a film score. Instruments are
// synthesised: mostly a soft solo piano (think quiet film-score piano
// arrangements), with the odd music-box shimmer. Between pieces there's a long,
// quiet pause so it never wears on you.

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const deg2midi = (tonic, d) => tonic + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const R = (a, b) => a + Math.random() * (b - a);

// Chord progressions as scale degrees (0 = I, 3 = IV, 4 = V, 5 = vi...).
// Lots of IV–V–iii–vi: warm, nostalgic and a little bittersweet.
const PROGS_A = [
  [0, 4, 5, 2, 3, 0, 3, 4],
  [0, 2, 3, 0, 5, 1, 3, 4],
  [3, 4, 2, 5, 1, 4, 0, 0],
  [0, 3, 0, 4, 5, 3, 1, 4],
  [0, 5, 3, 4, 0, 5, 1, 4],
];
const PROGS_B = [
  [3, 4, 2, 5, 3, 4, 0, 0],
  [5, 3, 0, 4, 5, 3, 1, 4],
  [1, 4, 0, 5, 1, 2, 3, 4],
  [3, 2, 1, 0, 3, 4, 5, 4],
];
// rhythm cells in eighth notes, one bar each
const CELLS = {
  3: { move: [[2, 2, 2], [3, 1, 2], [2, 1, 1, 2], [1, 1, 2, 2], [4, 2]], rest: [[6], [4, 2], [2, 4]] },
  4: { move: [[2, 2, 4], [3, 1, 2, 2], [2, 2, 2, 2], [1, 1, 2, 4], [3, 1, 4]], rest: [[8], [6, 2], [4, 4]] },
};

function contour(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    out.push(r < 0.3 ? 1 : r < 0.6 ? -1 : r < 0.7 ? 2 : r < 0.8 ? -2 : r < 0.85 ? 0 : r < 0.93 ? pick([3, 4]) : pick([-3, -4]));
  }
  return out;
}

function makeMotif(bpb) {
  const cells = CELLS[bpb];
  const rhythm = [pick(cells.move), pick(Math.random() < 0.6 ? cells.rest : cells.move)];
  const n = rhythm[0].length + rhythm[1].length;
  const steps = contour(n);
  // themes like to open with a hopeful leap, then settle back down by step
  if (Math.random() < 0.65) {
    steps[1] = pick([2, 3, 4]);
    for (let i = 2; i < n; i++) if (steps[i] > 1) steps[i] = -1;
  }
  return { rhythm, steps };
}

function chordTones(c) {
  return [c, c + 2, c + 4].map((d) => ((d % 7) + 7) % 7);
}

/** Nearest degree to `d` whose pitch class is a chord tone. */
function snap(d, c) {
  const tones = chordTones(c);
  for (let k = 0; k < 4; k++) {
    for (const s of [d - k, d + k]) if (tones.includes(((s % 7) + 7) % 7)) return s;
  }
  return d;
}

/** Compose one piece: returns a time-sorted list of events (seconds from start). */
function compose() {
  const waltz = Math.random() < 0.55;
  const bpb = waltz ? 3 : 4;
  const bpm = waltz ? R(78, 92) : R(56, 66);
  const beat = 60 / bpm;
  const tonic = 60 + pick([0, 2, 3, 5, 7, -2]); // C, D, Eb, F, G, Bb
  const progA = pick(PROGS_A);
  const progB = pick(PROGS_B);
  const motifA = makeMotif(bpb);
  const motifB = makeMotif(bpb);
  const arpStyle = waltz ? pick(['broken', 'open']) : pick(['rolling', 'broken']);

  const plan = [{ prog: progA.slice(0, 4), mel: null, intro: true }];
  plan.push({ prog: progA, mel: 'piano', motif: motifA });
  if (Math.random() < 0.7) plan.push({ prog: progA, mel: 'piano', motif: motifA, vary: true, high: true });
  plan.push({ prog: progB, mel: 'piano', motif: motifB, lift: 2 });
  plan.push({ prog: progA, mel: 'piano', motif: motifA, box: Math.random() < 0.5 });
  plan.push({ prog: [3, 4, 0, 0], mel: null, outro: true });

  const ev = [];
  let t = 0;
  let lastDeg = 9 + Math.floor(Math.random() * 3);

  for (const sec of plan) {
    const bars = sec.prog.length;
    // melody note list for the section (degrees + eighth offsets), built per 2-bar cell
    const mel = [];
    if (sec.mel) {
      const m = sec.motif;
      for (let pair = 0; pair < bars / 2; pair++) {
        const last = pair === bars / 2 - 1;
        let rhythm = m.rhythm;
        if (last) rhythm = [m.rhythm[0], [bpb * 2]]; // cadence: one long final note
        let shift = pair === 1 ? pick([1, -1]) : pair === 2 ? (sec.lift ?? 2) : 0;
        if (sec.vary && pair === 1) shift = pick([2, -2]);
        let si = 0;
        let d = pair === 0 ? snap(lastDeg, sec.prog[0]) : null;
        rhythm.forEach((cell, bi) => {
          const bar = pair * 2 + bi;
          let off = 0;
          cell.forEach((len) => {
            if (d === null) d = snap(lastDeg + shift, sec.prog[bar]);
            else if (off > 0 || bi > 0 || si > 0) d += m.steps[si % m.steps.length];
            // strong beats land on chord tones
            const strong = off === 0 || (bpb === 4 && off === 4);
            if (strong) d = snap(d, sec.prog[bar]);
            if (last && bi === 1) d = snap(d < 9 ? 7 : d > 12 ? 14 : d, sec.prog[bar]);
            while (d > 16) d -= 2;
            while (d < 6) d += 2;
            mel.push({ bar, off, len, d });
            off += len;
            si++;
          });
        });
        lastDeg = d;
      }
    }

    for (let b = 0; b < bars; b++) {
      const c = sec.prog[b];
      let barLen = bpb * beat;
      if (sec.outro) barLen *= 1 + b * 0.12; // ritardando
      if (b === bars - 1) barLen *= 1.05; // breathe at the end of a phrase
      const e8 = barLen / (bpb * 2); // one eighth in this bar
      const lo = tonic - 12;

      // left hand: a low root, then a flowing broken chord held by the pedal
      ev.push({ t, i: 'piano', m: deg2midi(tonic - 24, c), d: barLen * 1.02, v: 0.36 });
      const acc = (off, deg, v) => ev.push({ t: t + off * e8 + R(0, 0.015), i: 'piano', m: deg2midi(lo, deg), d: (bpb * 2 - off) * e8 + 0.1, v });
      const accV = (sec.intro ? 0.26 : sec.outro ? 0.22 : 0.18) * (sec.high ? 0.8 : 1);
      const seq = arpStyle === 'open'
        ? [0, 4, 9, 11, 9, 4]
        : arpStyle === 'broken'
          ? (bpb === 3 ? [0, 4, 7, 9, 7, 4] : [0, 4, 7, 9, 11, 9, 7, 4])
          : [0, 4, 7, 11, 9, 7, 4, 2];
      seq.forEach((s, k) => {
        if (k === 0) return; // the low root already sounds
        acc(k, c + s, accV * (k % 2 ? 0.8 : 1));
      });

      // melody
      for (const n of mel.filter((n) => n.bar === b)) {
        const nt = t + n.off * e8 + R(-0.01, 0.015);
        const nd = n.len * e8;
        const accent = n.off === 0 ? 1.1 : 0.9;
        const m = deg2midi(tonic, n.d) + (sec.high ? 12 : 0);
        ev.push({ t: nt, i: 'piano', m, d: nd * 1.15, v: R(0.58, 0.7) * accent * (sec.high ? 0.85 : 1) });
        if (sec.box && n.len >= 2) ev.push({ t: nt, i: 'box', m: m + 12, d: nd, v: 0.22 });
      }
      t += barLen;
    }
    // final chord of the piece rings out
    if (sec.outro) {
      for (const dd of [0, 4, 7, 9, 14]) ev.push({ t: t + dd * 0.06, i: 'piano', m: deg2midi(tonic - 12, dd), d: 6, v: 0.22 });
      ev.push({ t, i: 'piano', m: tonic - 24, d: 6, v: 0.32 });
      t += 6;
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { events: ev, length: t, info: { waltz, bpm: Math.round(bpm), tonic } };
}

// ---- Instruments -------------------------------------------------------------
export class Music {
  constructor(ctx, dest, reverb, volume = 1.0) {
    this.ctx = ctx;
    this.volume = volume;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    // a gentle high cut keeps everything soft
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    this.bus.connect(tone).connect(dest);
    this.send = ctx.createGain();
    this.send.gain.value = 0.7;
    this.bus.connect(this.send).connect(reverb);
    this.piece = null;
    this.cursor = 0;
    this.playing = false;
    this.nextAt = 0;
    this.timer = null;
    // noise for the piano's felt hammers
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  start(delay = 3) {
    if (this.playing) return;
    this.playing = true;
    this.piece = null;
    this.nextAt = Math.max(this.nextAt, this.ctx.currentTime + delay);
    this.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.bus.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.5);
    if (!this.timer && this.ctx instanceof AudioContext) this.timer = setInterval(() => this.schedule(this.ctx.currentTime + 0.6), 120);
  }

  stop() {
    this.playing = false;
    this.piece = null;
    this.nextAt = this.ctx.currentTime + 2;
    this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }

  /** Schedule every event that starts before `horizon` (seconds, ctx time). */
  schedule(horizon) {
    if (!this.playing) return;
    for (;;) {
      if (!this.piece) {
        if (this.nextAt > horizon) return;
        this.piece = compose();
        this.piece.t0 = Math.max(this.nextAt, this.ctx.currentTime + 0.05);
        this.cursor = 0;
        console.log('[music] new piece', this.piece.info);
      }
      const e = this.piece.events[this.cursor];
      if (!e) {
        this.nextAt = this.piece.t0 + this.piece.length + R(25, 55); // a quiet pause
        this.piece = null;
        continue;
      }
      const at = this.piece.t0 + e.t;
      if (at > horizon) return;
      this.cursor++;
      if (at < this.ctx.currentTime - 0.05) continue;
      this[e.i](at, e.m, e.d, e.v);
    }
  }

  update() {}

  _out(gain, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.bus);
    } else g.connect(this.bus);
    return g;
  }

  /** Waveforms for the piano: a warm body that rings, and a bright attack that fades fast. */
  _waves() {
    if (this.waves) return this.waves;
    const mk = (amps) => {
      const re = new Float32Array(amps.length + 1);
      const im = new Float32Array(amps.length + 1);
      amps.forEach((a, i) => (im[i + 1] = a));
      return this.ctx.createPeriodicWave(re, im);
    };
    this.waves = {
      body: mk([1, 0.32, 0.1, 0.045, 0.02, 0.01]),
      bright: mk([0, 0.45, 0.3, 0.22, 0.14, 0.1, 0.06, 0.04]),
    };
    return this.waves;
  }

  /**
   * Soft felt piano. Each note is a pair of slightly detuned "strings" (the
   * gentle beating is what makes a piano sound alive), a bright attack layer
   * that fades quickly, and a tiny felt-hammer thump.
   */
  piano(t, m, dur, v) {
    const ctx = this.ctx;
    const W = this._waves();
    const f = mtof(m);
    const pan = Math.max(-0.45, Math.min(0.45, (m - 62) / 45));
    const out = this._out(v * 0.15, pan);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    const bright = 700 + v * 2200 + f * 1.2;
    lp.frequency.setValueAtTime(bright, t);
    lp.frequency.setTargetAtTime(400 + f * 1.1, t + 0.01, 0.8);
    lp.connect(out);
    // low notes ring for a long time, high notes are short
    const decay = Math.min(4.5, Math.max(0.7, 2.6 * Math.sqrt(262 / f)));
    const end = t + Math.max(dur, 0.2);
    const stop = end + 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.006);
    env.gain.setTargetAtTime(0.55, t + 0.006, 0.12); // the initial "ping" settles
    env.gain.setTargetAtTime(0, t + 0.15, decay);
    env.gain.setTargetAtTime(0, end, 0.18); // damper
    env.connect(lp);
    for (const det of [-1.6, 1.8]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(W.body);
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(env);
      o.start(t);
      o.stop(stop);
    }
    const b = ctx.createOscillator();
    b.setPeriodicWave(W.bright);
    b.frequency.value = f * 1.0007;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.35 * v, t + 0.004);
    bg.gain.setTargetAtTime(0, t + 0.004, 0.09 + 60 / f);
    b.connect(bg).connect(lp);
    b.start(t);
    b.stop(Math.min(stop, t + 1.5));
    // felt hammer
    const h = ctx.createBufferSource();
    h.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = Math.min(4000, f * 3);
    hp.Q.value = 1.2;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.05 * v, t);
    hg.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    h.connect(hp).connect(hg).connect(out);
    h.start(t);
    h.stop(t + 0.05);
  }

  /** Music box: a bright tine with a quick decay. */
  box(t, m, dur, v) {
    const ctx = this.ctx;
    const f = mtof(m);
    const out = this._out(v * 0.07, 0.3);
    for (const [n, a, d] of [[1, 1, 0.9], [3.95, 0.25, 0.25], [6.1, 0.08, 0.12]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * n;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.003, d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d * 6);
    }
  }

}

// exported for offline listening tests
export { compose };
