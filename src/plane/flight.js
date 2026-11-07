import * as THREE from 'three';
import { groundHeight, flatness, WORLD, RIVER } from '../world/terrain.js';
import { GEAR_HEIGHT } from './model.js';

// ---- Tunables: the whole "feel" of the plane lives here ---------------------
export const TUNING = {
  maxThrust: 10, // m/s² at full throttle
  drag: 0.0033, // quadratic drag (top speed ≈ sqrt(maxThrust / drag) ≈ 55 m/s)
  stallSpeed: 22, // m/s: below this the wings stop holding you up
  rotateSpeed: 19, // m/s: can lift the nose on the runway
  pitchRate: 0.75, // rad/s
  rollRate: 1.6, // rad/s
  yawRate: 0.45, // rad/s
  bankTurn: 0.85, // how strongly banking turns you
  autoLevel: 0.7, // gentle hands-off wings-levelling (0 = off)
  sinkDamping: 1.5, // vertical air resistance when falling
  groundFriction: 0.7,
  brakeFriction: 6,
  steerRate: 0.9, // taxi steering
  inputSmoothing: 7, // how quickly controls respond
  throttleRate: 0.55, // throttle change per second
  leverRate: 1.2, // how fast the engine follows the touch throttle lever
};

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velocity = new THREE.Vector3();
    this.speed = 0; // forward airspeed
    this.sink = 0; // extra vertical velocity from lack of lift
    this.throttle = 0;
    this.onGround = true;
    this.pitchIn = 0;
    this.rollIn = 0;
    this.yawIn = 0;
    this.onEvent = () => {};
    this.resetToRunway();
  }

  forward(out = _fwd) {
    return out.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  resetToRunway() {
    const af = WORLD.airfield;
    this.position.set(af.x, af.height + GEAR_HEIGHT, af.z + af.runwayLength / 2 - 25);
    this.quaternion.identity(); // facing north (-Z) down the runway
    this.speed = 0;
    this.sink = 0;
    this.throttle = 0;
    this.onGround = true;
    this.velocity.set(0, 0, 0);
  }

  resetToAir() {
    const af = WORLD.airfield;
    this.position.set(af.x + 60, af.height + 160, af.z + 700);
    this.quaternion.setFromEuler(_euler.set(-0.02, 0, 0));
    this.speed = 38;
    this.sink = 0;
    this.throttle = 0.6;
    this.onGround = false;
  }

  update(dt, input) {
    const T = TUNING;
    this.pitchIn = damp(this.pitchIn, input.pitch, T.inputSmoothing, dt);
    this.rollIn = damp(this.rollIn, input.roll, T.inputSmoothing, dt);
    this.yawIn = damp(this.yawIn, input.yaw, T.inputSmoothing, dt);
    if (input.throttleTarget != null && !input.throttle) {
      const step = T.leverRate * dt;
      this.throttle += THREE.MathUtils.clamp(input.throttleTarget - this.throttle, -step, step);
    } else {
      this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * T.throttleRate * dt, 0, 1);
    }

    const fwd = this.forward(_fwd);
    const up = _up.set(0, 1, 0).applyQuaternion(this.quaternion);
    const right = _right.set(1, 0, 0).applyQuaternion(this.quaternion);

    // ---- Speed along the flight path -----------------------------------
    let accel = this.throttle * T.maxThrust - T.drag * this.speed * this.speed - 9.81 * fwd.y;
    if (this.onGround) {
      accel -= T.groundFriction + (input.brake ? T.brakeFriction : 0);
    }
    this.speed = Math.max(0, this.speed + accel * dt);

    const lift = THREE.MathUtils.clamp((this.speed / T.stallSpeed) ** 2, 0, 1);

    if (this.onGround) {
      this.updateGround(dt, input, lift);
    } else {
      this.updateAir(dt, fwd, up, right, lift);
    }

    // ---- Integrate position --------------------------------------------
    this.forward(_fwd);
    this.velocity.copy(_fwd).multiplyScalar(this.speed);
    this.velocity.y += this.sink;
    this.position.addScaledVector(this.velocity, dt);

    this.handleGround(dt);
  }

  updateAir(dt, fwd, up, right, lift) {
    const T = TUNING;
    const authority = THREE.MathUtils.clamp(this.speed / 25, 0.2, 1);
    const q = this.quaternion;

    // body-axis rotations from the stick
    q.multiply(_q.setFromAxisAngle(X, this.pitchIn * T.pitchRate * authority * dt));
    q.multiply(_q.setFromAxisAngle(Z, -this.rollIn * T.rollRate * authority * dt));
    q.multiply(_q.setFromAxisAngle(Y, -this.yawIn * T.yawRate * authority * dt));

    // banking turns the plane (simplified coordinated turn)
    const turn = right.y * T.bankTurn * THREE.MathUtils.clamp(this.speed / 30, 0.3, 1.2);
    q.premultiply(_q.setFromAxisAngle(Y, turn * dt));

    // cosy assist: wings drift back to level when you let go
    if (Math.abs(this.rollIn) < 0.05 && up.y > 0.2) {
      q.multiply(_q.setFromAxisAngle(Z, -right.y * T.autoLevel * dt));
    }

    // stall: nose gently drops when too slow
    if (this.speed < T.stallSpeed && fwd.y > -0.7) {
      const s = 1 - this.speed / T.stallSpeed;
      q.multiply(_q.setFromAxisAngle(X, -s * 1.2 * dt));
    }
    q.normalize();

    // lift vs gravity on the vertical axis
    const support = lift * THREE.MathUtils.clamp(up.y * 1.3, 0, 1);
    this.sink += -9.81 * (1 - support) * dt;
    this.sink *= Math.exp(-T.sinkDamping * dt);
    if (support > 0.98) this.sink *= Math.exp(-3 * dt);
  }

  updateGround(dt, input, lift) {
    const T = TUNING;
    _euler.setFromQuaternion(this.quaternion, 'YXZ');
    let heading = _euler.y;
    let pitch = _euler.x;

    const steer = THREE.MathUtils.clamp(this.speed / 4, 0, 1) * T.steerRate;
    heading -= (this.rollIn + this.yawIn) * steer * dt;

    if (this.pitchIn > 0.1 && this.speed > T.rotateSpeed) pitch += this.pitchIn * 0.6 * dt;
    else pitch = damp(pitch, 0, 3, dt);
    pitch = THREE.MathUtils.clamp(pitch, 0, 0.3);

    this.quaternion.setFromEuler(_euler.set(pitch, heading, 0, 'YXZ'));
    this.sink = 0;

    // not enough lift yet? stay glued to the ground
    if (this.speed < T.stallSpeed * 0.92) this._glued = true;
    else this._glued = false;
  }

  handleGround(dt) {
    const gh = groundHeight(this.position.x, this.position.z);
    const rq = RIVER.query(this.position.x, this.position.z);
    const water = rq && rq.d < rq.width ? rq.level : WORLD.seaLevel;
    const overWater = gh < water;
    const surface = Math.max(gh, water);
    const floor = surface + GEAR_HEIGHT;

    if (this.onGround) {
      if (overWater) return this.crash('splash');
      if (this._glued || this.position.y < floor) {
        this.position.y = floor;
      } else if (this.position.y > floor + 0.05) {
        this.onGround = false;
        this.onEvent('takeoff');
      }
      return;
    }

    if (this.position.y <= floor) {
      const up = _up.set(0, 1, 0).applyQuaternion(this.quaternion);
      const fwd = this.forward(_fwd);
      const vy = this.velocity.y;
      if (overWater) return this.crash('splash');
      const gentle = vy > -7 && up.y > 0.8 && fwd.y > -0.3 && flatness(this.position.x, this.position.z) > 0.9;
      if (!gentle) return this.crash('bonk');
      this.position.y = floor;
      this.onGround = true;
      this.sink = 0;
      this.onEvent('landed', { vy });
    }
  }

  crash(kind) {
    this.onEvent('crash', { kind });
    this.resetToRunway();
  }
}
