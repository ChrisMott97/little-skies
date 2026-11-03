import * as THREE from 'three';
import { groundHeight } from './world/terrain.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Smooth chase camera that keeps the horizon level, plus a pilot's-eye view. */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.distance = 16;
    this.targetDistance = 16;
    this.orbitYaw = 0;
    this.orbitPitch = 0.12;
    this.lastDrag = -10;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.lookAt = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._o = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this.first = true;
  }

  toggle() {
    this.mode = this.mode === 'chase' ? 'pilot' : 'chase';
  }

  update(dt, t, flight, look) {
    const cam = this.camera;
    if (look.dragging || look.dx || look.dy) this.lastDrag = t;
    this.orbitYaw -= look.dx * 0.005;
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + look.dy * 0.004, -0.5, 1.3);
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + look.zoom * 0.02, 8, 60);
    this.distance = damp(this.distance, this.targetDistance, 6, dt);

    // drift back behind the plane a moment after you let go
    if (t - this.lastDrag > 1.5) {
      this.orbitYaw = damp(this.orbitYaw, 0, 1.5, dt);
      this.orbitPitch = damp(this.orbitPitch, 0.12, 1.5, dt);
    }

    const fwd = flight.forward(this._v);

    if (this.mode === 'pilot') {
      const q = flight.quaternion;
      const eye = this._o.set(0, 1.9, 0.6).applyQuaternion(q).add(flight.position);
      cam.position.copy(eye);
      const lookQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-this.orbitPitch * 0.6 + 0.07, this.orbitYaw, 0, 'YXZ'));
      cam.quaternion.copy(q).multiply(lookQ);
      this.first = true;
      return;
    }

    // lazily follow the flight direction (flattened a bit so climbs don't whip the camera)
    const target = this._o.copy(fwd);
    target.y *= 0.6;
    target.normalize();
    if (this.first) this.dir.copy(target);
    this.dir.lerp(target, 1 - Math.exp(-3 * dt)).normalize();

    const heading = Math.atan2(-this.dir.x, -this.dir.z) + this.orbitYaw;
    const elev = Math.asin(THREE.MathUtils.clamp(-this.dir.y, -1, 1)) * 0.8 + this.orbitPitch;
    const d = this.distance;
    const offset = new THREE.Vector3(
      Math.sin(heading) * Math.cos(elev) * d,
      Math.sin(elev) * d + 2.2,
      Math.cos(heading) * Math.cos(elev) * d
    );
    const desired = offset.add(flight.position);
    const minY = groundHeight(desired.x, desired.z) + 1.5;
    desired.y = Math.max(desired.y, minY, 0.8);

    if (this.first) {
      cam.position.copy(desired);
      this.lookAt.copy(flight.position);
      this.first = false;
    }
    cam.position.lerp(desired, 1 - Math.exp(-10 * dt));
    const lookTarget = this._t.copy(flight.position).addScaledVector(fwd, 4).add(new THREE.Vector3(0, 1.2, 0));
    this.lookAt.lerp(lookTarget, 1 - Math.exp(-12 * dt));
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lookAt);
  }
}
