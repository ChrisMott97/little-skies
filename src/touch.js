// Touch controls for phones and tablets. Dormant on desktop: nothing is shown
// until the first real touch (or on a touch-first device, or with ?touch in the URL).
//
//   left thumb   – throttle lever (stays where you leave it)
//   right thumb  – stick: up/down nose down/up, left/right roll (also steers on the ground)
//   tilt         – optional gyro mode: tip the phone like a steering wheel to roll,
//                  tip the top away / towards you for nose down / up
//   ☰            – everything else (camera, sound, time of day…)
//   drag the sky – look around, pinch – zoom (handled in input.js)

import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const STICK_RADIUS = 56; // px of thumb travel for full deflection
const LEVER_TRAVEL = 1.0; // fraction of the lever's height for idle → full
const TILT = {
  deadzone: 3, // degrees of wobble ignored around level
  rollFull: 25, // degrees of steering-wheel twist for full roll
  pitchFull: 20, // degrees of tip for full pitch
  smoothing: 10, // sensor noise filter
};

// gentle near the centre for small corrections, still full deflection at the edge
const shape = (v) => v * (0.35 + 0.65 * Math.abs(v));
const tiltCurve = (deg, full) => {
  const a = Math.abs(deg);
  if (a < TILT.deadzone) return 0;
  return Math.sign(deg) * shape(clamp((a - TILT.deadzone) / (full - TILT.deadzone), 0, 1));
};

const DEG = Math.PI / 180;
const Q_BACK = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X
const Z = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _n = new THREE.Vector3();

const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;

export class TouchControls {
  constructor({ actions, toast }) {
    this.toast = toast;
    this.active = false;
    this.throttle = 0; // the plane's actual throttle, fed in by update()
    this.stick = { id: null, ox: 0, oy: 0, pitch: 0, roll: 0 };
    this.lever = { id: null, startY: 0, startValue: 0, height: 1, target: null };
    this.tilt = { on: false, zero: null, gotEvent: false, pitch: 0, roll: 0, rawPitch: 0, rawRoll: 0 };
    this._onOrientation = (e) => this.onOrientation(e);
    this.build(actions);

    window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.activate(), true);
    window.addEventListener('blur', () => this.releaseAll());
    const recentre = () => (this.tilt.zero = null);
    screen.orientation?.addEventListener?.('change', recentre);
    window.addEventListener('orientationchange', recentre);
  }

  /** Show the touch layer. Called on the first touch, or up front on touch-first devices. */
  activate() {
    if (this.active) return;
    this.active = true;
    document.body.classList.add('touch');
    // stop the page itself from zooming, scrolling or rubber-banding under your thumbs
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener(
      'touchmove',
      (e) => {
        if (e.cancelable && !e.target.closest?.('.touch-menu')) e.preventDefault();
      },
      { passive: false }
    );
    // a nudge towards landscape, once the title has had its moment
    setTimeout(() => {
      if (innerHeight > innerWidth && Math.min(innerWidth, innerHeight) < 600) {
        this.toast('turn sideways for a wider view ↻', 4000);
      }
    }, 7000);
  }

  // ---- DOM ---------------------------------------------------------------------
  build(actions) {
    const root = (this.root = document.createElement('div'));
    root.id = 'touch';
    root.innerHTML = `
      <div class="zone lever-zone">
        <div class="lever"><div class="lever-fill"></div><div class="lever-knob"></div></div>
        <span class="lever-label">throttle</span>
      </div>
      <div class="zone stick-zone">
        <div class="stick-base rest"><div class="stick-knob"></div></div>
      </div>
      <div class="touch-buttons">
        <button class="touch-btn recentre-btn" aria-label="re-centre tilt">⟲</button>
        <button class="touch-btn tilt-btn" aria-label="tilt steering">tilt</button>
        <button class="touch-btn menu-btn" aria-label="menu">☰</button>
      </div>
      <div class="touch-menu card"></div>`;
    document.body.appendChild(root);

    const $ = (s) => root.querySelector(s);
    this.el = {
      leverZone: $('.lever-zone'),
      lever: $('.lever'),
      leverFill: $('.lever-fill'),
      leverKnob: $('.lever-knob'),
      stickZone: $('.stick-zone'),
      stickBase: $('.stick-base'),
      stickKnob: $('.stick-knob'),
      tiltBtn: $('.tilt-btn'),
      recentreBtn: $('.recentre-btn'),
      menuBtn: $('.menu-btn'),
      menu: $('.touch-menu'),
    };

    this.bindStick();
    this.bindLever();
    this.el.tiltBtn.addEventListener('click', () => this.toggleTilt());
    this.el.recentreBtn.addEventListener('click', () => {
      this.tilt.zero = null;
      this.toast('tilt re-centred');
    });

    // menu: every action from main.js, plus fullscreen where the browser allows it
    const items = actions.filter((a) => a.label);
    if (document.documentElement.requestFullscreen) {
      items.push({
        icon: '⛶',
        label: 'fullscreen',
        run: () =>
          document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}),
      });
    }
    for (const a of items) {
      const b = document.createElement('button');
      b.innerHTML = `<span>${a.icon}</span>${a.label}`;
      b.addEventListener('click', () => {
        this.setMenu(false);
        a.run();
      });
      this.el.menu.appendChild(b);
    }
    this.el.menuBtn.addEventListener('click', () => this.setMenu(!this.menuOpen));
    // tapping anywhere else closes the menu
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.menuOpen && !e.target.closest('.touch-menu, .menu-btn')) this.setMenu(false);
      },
      true
    );
  }

  setMenu(open) {
    this.menuOpen = open;
    this.el.menu.classList.toggle('open', open);
    this.el.menuBtn.classList.toggle('on', open);
  }

  // ---- Stick (floating: it centres wherever your thumb lands) -------------------
  bindStick() {
    const { stickZone: zone, stickBase: base, stickKnob: knob } = this.el;
    const s = this.stick;
    zone.addEventListener('pointerdown', (e) => {
      if (s.id !== null) return;
      s.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      s.ox = e.clientX;
      s.oy = e.clientY;
      base.classList.remove('rest');
      base.style.left = `${e.clientX - r.left}px`;
      base.style.top = `${e.clientY - r.top}px`;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== s.id) return;
      let x = (e.clientX - s.ox) / STICK_RADIUS;
      let y = (e.clientY - s.oy) / STICK_RADIUS;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      knob.style.transform = `translate(${x * STICK_RADIUS}px, ${y * STICK_RADIUS}px)`;
      s.roll = shape(x);
      s.pitch = shape(y); // thumb down = stick back = nose up
    });
    const end = (e) => {
      if (e.pointerId !== s.id) return;
      this.releaseStick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  releaseStick() {
    const s = this.stick;
    s.id = null;
    s.pitch = s.roll = 0;
    this.el.stickKnob.style.transform = '';
    this.el.stickBase.style.left = this.el.stickBase.style.top = '';
    this.el.stickBase.classList.add('rest');
  }

  // ---- Throttle lever (slide anywhere in the left zone; no jumps) ---------------
  bindLever() {
    const { leverZone: zone, lever } = this.el;
    const l = this.lever;
    zone.addEventListener('pointerdown', (e) => {
      if (l.id !== null) return;
      l.id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      l.startY = e.clientY;
      l.startValue = l.target ?? this.throttle;
      l.height = lever.getBoundingClientRect().height * LEVER_TRAVEL;
      zone.classList.add('held');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== l.id) return;
      let v = clamp(l.startValue + (l.startY - e.clientY) / l.height, 0, 1);
      if (v < 0.03) v = 0; // easy to find idle
      if (v > 0.97) v = 1;
      l.target = v;
    });
    const end = (e) => {
      if (e.pointerId !== l.id) return;
      l.id = null;
      zone.classList.remove('held');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  /** The plane was reset (crash, T, return): let go of the lever so it follows the new throttle. */
  releaseThrottle() {
    this.lever.target = null;
    this.lever.id = null;
    this.el.leverZone.classList.remove('held');
  }

  releaseAll() {
    this.releaseStick();
    this.releaseThrottle();
  }

  // ---- Tilt (gyro) ---------------------------------------------------------------
  async toggleTilt() {
    const t = this.tilt;
    if (t.on) return this.setTilt(false);

    const DOE = window.DeviceOrientationEvent;
    if (!DOE || !window.isSecureContext) {
      this.toast('tilt needs a phone or tablet (and https)');
      return;
    }
    // iOS asks permission, and only from inside a tap
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') {
          this.toast('tilt needs motion access');
          return;
        }
      } catch {
        this.toast('tilt needs motion access');
        return;
      }
    }
    this.setTilt(true);
    this.toast('tilt on: however you hold it now is level', 3000);
    setTimeout(() => {
      if (t.on && !t.gotEvent) {
        this.setTilt(false);
        this.toast('no tilt sensor found');
      }
    }, 1500);
  }

  setTilt(on) {
    const t = this.tilt;
    t.on = on;
    t.zero = null;
    t.gotEvent = false;
    t.pitch = t.roll = t.rawPitch = t.rawRoll = 0;
    this.el.tiltBtn.classList.toggle('on', on);
    this.root.classList.toggle('tilting', on);
    if (on) window.addEventListener('deviceorientation', this._onOrientation);
    else window.removeEventListener('deviceorientation', this._onOrientation);
    if (!on) this.toast('tilt off');
  }

  onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const t = this.tilt;
    t.gotEvent = true;
    // device attitude as a camera looking out of the back of the screen, with
    // screen-right as +X whatever way up it's held (same maths as three's old
    // DeviceOrientationControls). Working in quaternions avoids the beta/gamma
    // flips you get from a phone held sideways and fairly upright.
    _euler.set(e.beta * DEG, (e.alpha ?? 0) * DEG, -e.gamma * DEG, 'YXZ');
    _q.setFromEuler(_euler).multiply(Q_BACK).multiply(_qs.setFromAxisAngle(Z, -screenAngle() * DEG));

    // Measure against gravity only, so turning your chair (or the compass drifting)
    // never reads as a turn. y is world up.
    _r.set(1, 0, 0).applyQuaternion(_q); // screen right
    _u.set(0, 1, 0).applyQuaternion(_q); // screen up
    _n.set(0, 0, 1).applyQuaternion(_q); // screen normal, towards your face
    const roll = Math.atan2(-_r.y, _u.y) / DEG; // steering-wheel twist, clockwise +
    const tip = Math.atan2(_n.y, Math.hypot(_u.y, _r.y)) / DEG; // screen facing up +
    if (!t.zero) t.zero = { roll, tip };

    const wrap = (a) => ((a + 540) % 360) - 180;
    t.rawRoll = tiltCurve(wrap(roll - t.zero.roll), TILT.rollFull); // twist clockwise → roll right
    t.rawPitch = tiltCurve(-(tip - t.zero.tip), TILT.pitchFull); // top tipped away → nose down
  }

  // ---- Per frame -----------------------------------------------------------------
  update(dt, flight) {
    if (!this.active) return;
    this.throttle = flight.throttle;
    const l = this.lever;
    // once the engine has caught up with the lever, hand back to the plane's own throttle
    if (l.id === null && l.target !== null && Math.abs(flight.throttle - l.target) < 0.01) l.target = null;
    const shown = l.target ?? flight.throttle;
    this.el.leverKnob.style.bottom = `${shown * 100}%`;
    this.el.leverFill.style.height = `${flight.throttle * 100}%`;

    const t = this.tilt;
    if (t.on) {
      t.roll = damp(t.roll, t.rawRoll, TILT.smoothing, dt);
      t.pitch = damp(t.pitch, t.rawPitch, TILT.smoothing, dt);
    }
  }

  /** Touch contribution to the controls, or null when the touch layer is dormant. */
  read() {
    if (!this.active) return null;
    const s = this.stick;
    const t = this.tilt;
    const target = this.lever.target;
    return {
      pitch: clamp(s.pitch + (t.on ? t.pitch : 0), -1, 1),
      roll: clamp(s.roll + (t.on ? t.roll : 0), -1, 1),
      throttleTarget: target,
      // no brake button: closing the throttle on the ground brakes
      brake: this.throttle < 0.02 && (target === null || target < 0.02),
    };
  }
}
