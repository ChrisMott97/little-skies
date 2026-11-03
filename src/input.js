// Keyboard + trackpad/mouse input, tuned for a MacBook keyboard.
//
//   Arrow keys  – stick (↑ nose down, ↓ nose up, ←/→ roll)   [I inverts pitch]
//   W / S       – throttle up / down
//   A / D       – rudder (also steers on the ground)
//   Space       – wheel brakes
//   Drag        – look around,  scroll / pinch – zoom
//   C camera · T jump into the sky · Enter back to the airfield · H help · M mute · P pause

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.invertPitch = false;
    this.handlers = {};
    this.look = { dx: 0, dy: 0, dragging: false, zoom: 0 };

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
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.look.dragging) return;
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    });
    const end = () => (this.look.dragging = false);
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

  on(code, fn) {
    this.handlers[code] = fn;
  }

  axis(neg, pos) {
    return (neg.some((k) => this.keys.has(k)) ? -1 : 0) + (pos.some((k) => this.keys.has(k)) ? 1 : 0);
  }

  read() {
    let pitch = this.axis(['ArrowUp'], ['ArrowDown']); // stick back = nose up
    if (this.invertPitch) pitch = -pitch;
    return {
      pitch,
      roll: this.axis(['ArrowLeft'], ['ArrowRight']),
      yaw: this.axis(['KeyA'], ['KeyD']),
      throttle: this.axis(['KeyS'], ['KeyW']),
      brake: this.keys.has('Space'),
    };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy, zoom: this.look.zoom, dragging: this.look.dragging };
    this.look.dx = this.look.dy = this.look.zoom = 0;
    return l;
  }
}
