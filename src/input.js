// Keyboard + trackpad/mouse input, tuned for a MacBook keyboard.
//
//   Arrow keys  – stick (↑ nose down, ↓ nose up, ←/→ roll)   [I inverts pitch]
//   W / S       – throttle up / down
//   A / D       – rudder (also steers on the ground)
//   Space       – wheel brakes
//   Drag        – look around,  scroll / pinch – zoom
//   C camera · T jump into the sky · Enter back to the airfield · H help · M mute · P pause
//
// On touch screens, `touch` (see touch.js) adds a thumbstick, throttle lever and tilt
// steering, and dragging on the sky looks around with one finger or zooms with two.

const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.invertPitch = false;
    this.handlers = {};
    this.look = { dx: 0, dy: 0, dragging: false, zoom: 0 };
    this.touch = null; // TouchControls, set by main.js
    this.fingers = new Map(); // touch pointers on the canvas (look / pinch)

    window.addEventListener('keydown', (e) => {
      if (e.metaKey) return; // leave ⌘ shortcuts to macOS
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.handlers[e.code]?.();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      this.look.dragging = true;
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.look.dragging) return;
      if (e.pointerType === 'touch') return this.moveFinger(e);
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    });
    const end = (e) => {
      if (e.pointerType === 'touch') {
        this.fingers.delete(e.pointerId);
        if (this.fingers.size) return;
      }
      this.look.dragging = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.look.zoom += e.deltaY;
      },
      { passive: false }
    );
  }

  // one finger looks around, two fingers pinch to zoom
  moveFinger(e) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    if (this.fingers.size >= 2) {
      const before = this.pinchSpread();
      f.x = e.clientX;
      f.y = e.clientY;
      this.look.zoom -= (this.pinchSpread() - before) * 1.5;
      return;
    }
    this.look.dx += e.clientX - f.x;
    this.look.dy += e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
  }

  pinchSpread() {
    const [a, b] = this.fingers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  on(code, fn) {
    this.handlers[code] = fn;
  }

  axis(neg, pos) {
    return (neg.some((k) => this.keys.has(k)) ? -1 : 0) + (pos.some((k) => this.keys.has(k)) ? 1 : 0);
  }

  read() {
    const t = this.touch?.read();
    let pitch = this.axis(['ArrowUp'], ['ArrowDown']); // stick back = nose up
    let roll = this.axis(['ArrowLeft'], ['ArrowRight']);
    if (t) {
      pitch = clamp1(pitch + t.pitch);
      roll = clamp1(roll + t.roll);
    }
    if (this.invertPitch) pitch = -pitch;
    return {
      pitch,
      roll,
      yaw: this.axis(['KeyA'], ['KeyD']),
      throttle: this.axis(['KeyS'], ['KeyW']),
      throttleTarget: t?.throttleTarget ?? null, // touch lever position, eased towards
      brake: this.keys.has('Space') || !!t?.brake,
    };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy, zoom: this.look.zoom, dragging: this.look.dragging };
    this.look.dx = this.look.dy = this.look.zoom = 0;
    return l;
  }
}
