// Little effects for when the plane bumps into things: soft puffs (dust,
// spray, cloud mist), fluttering bits (confetti, petals, leaves), and chunky
// toy-block debris that bounces, settles, and can fly back home again.
import * as THREE from 'three';
import { toon, celRamp, outlineMaterial, ensureSmoothNormals } from './materials.js';
import { groundHeight } from './world/terrain.js';

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const col = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const ZERO = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

/** A fixed pool of instances: grab one, recycle the oldest when full. */
function pool(mesh, n) {
  for (let i = 0; i < n; i++) {
    mesh.setMatrixAt(i, HIDDEN);
    mesh.setColorAt(i, col.set('#ffffff')); // create the colour buffer up front
  }
  mesh.frustumCulled = false;
  const items = [];
  let next = 0;
  return {
    items,
    take(item) {
      const i = next;
      next = (next + 1) % n;
      item.i = i;
      item.id = Math.random();
      items[i] = item;
      if (item.c) mesh.setColorAt(i, col.set(item.c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return item;
    },
    kill(i) {
      items[i] = null;
      mesh.setMatrixAt(i, HIDDEN);
    },
  };
}

export function createFx() {
  const group = new THREE.Group();
  group.name = 'fx';

  // ---- puffs: little round clouds that swell and fade --------------------------
  const PUFFS = 260;
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMesh = new THREE.InstancedMesh(puffGeo, toon({ color: '#ffffff', ramp: celRamp, rim: 0.5 }), PUFFS);
  puffMesh.castShadow = false;
  const puffs = pool(puffMesh, PUFFS);
  group.add(puffMesh);

  // ---- flutter: flat scraps that tumble and drift down -------------------------
  const BITS = 420;
  const bitGeo = new THREE.PlaneGeometry(1, 0.62);
  const bitMat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.2, side: THREE.DoubleSide });
  const bitMesh = new THREE.InstancedMesh(bitGeo, bitMat, BITS);
  bitMesh.castShadow = false;
  const bits = pool(bitMesh, BITS);
  group.add(bitMesh);

  // ---- debris: chunky blocks with ink outlines ---------------------------------
  const BLOCKS = 520;
  const blockGeo = ensureSmoothNormals(new THREE.BoxGeometry(1, 1, 1));
  const blockMesh = new THREE.InstancedMesh(blockGeo, toon({ color: '#ffffff', ramp: celRamp, rim: 0.3 }), BLOCKS);
  blockMesh.castShadow = true;
  blockMesh.receiveShadow = true;
  const blocks = pool(blockMesh, BLOCKS);
  const blockInk = new THREE.InstancedMesh(blockGeo, outlineMaterial(0.06), BLOCKS);
  blockInk.instanceMatrix = blockMesh.instanceMatrix; // one set of matrices drives both
  blockInk.frustumCulled = false;
  group.add(blockMesh, blockInk);

  const fx = {
    group,

    /** Soft round puffs. opts: { n, colour(s), size, spread, speed, up, life, vel, drag, rise } */
    puff(pos, o = {}) {
      const cs = [].concat(o.colour ?? '#ffffff');
      for (let k = 0; k < (o.n ?? 8); k++) {
        const dir = v.randomDirection();
        const spd = (o.speed ?? 4) * rnd(0.4, 1);
        puffs.take({
          p: new THREE.Vector3().copy(pos).addScaledVector(dir, (o.spread ?? 1) * Math.random()),
          v: new THREE.Vector3(dir.x * spd, Math.abs(dir.y) * spd * (o.up ?? 0.6) + (o.rise ?? 0.5), dir.z * spd).addScaledVector(o.vel ?? ZERO, 1),
          age: 0,
          life: (o.life ?? 1.6) * rnd(0.7, 1.3),
          size: (o.size ?? 1.2) * rnd(0.6, 1.3),
          drag: o.drag ?? 1.8,
          c: cs[Math.floor(Math.random() * cs.length)],
        });
      }
    },

    /** Fluttering flat bits. opts: { n, colours, size, speed, up, life, vel, gravity, flutter } */
    flutter(pos, o = {}) {
      const cs = [].concat(o.colours ?? ['#ffffff']);
      for (let k = 0; k < (o.n ?? 20); k++) {
        const dir = v.randomDirection();
        const spd = (o.speed ?? 8) * rnd(0.3, 1);
        bits.take({
          p: new THREE.Vector3().copy(pos).addScaledVector(dir, (o.spread ?? 1) * Math.random()),
          v: new THREE.Vector3(dir.x * spd, (dir.y * 0.5 + (o.up ?? 0.6)) * spd, dir.z * spd).addScaledVector(o.vel ?? ZERO, 1),
          rot: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)),
          spin: new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)),
          age: 0,
          life: (o.life ?? 4) * rnd(0.6, 1.3),
          size: (o.size ?? 0.6) * rnd(0.6, 1.3),
          gravity: o.gravity ?? 3,
          flutter: o.flutter ?? 1,
          ph: rnd(0, 6),
          c: cs[Math.floor(Math.random() * cs.length)],
        });
      }
    },

    /**
     * One chunky block. `home` (optional) is where it can fly back to:
     * { p: Vector3, q: Quaternion }. Returns a handle for fx.sendHome().
     */
    block(p, vel, size, colour, home) {
      return blocks.take({
        p: p.clone(),
        v: vel.clone(),
        q: home ? home.q.clone() : new THREE.Quaternion().random(),
        spin: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)),
        size: size.clone(),
        c: colour,
        home,
        state: 'fly',
        age: 0,
        rest: 0,
      });
    },

    /** Fly a block back to its home over `dur` seconds, starting after `delay`. */
    sendHome(handle, delay, dur) {
      const b = blocks.items[handle.i];
      if (b !== handle || !b.home) return false; // recycled meanwhile
      b.state = 'home';
      b.from = b.p.clone();
      b.fromQ = b.q.clone();
      b.t = -delay;
      b.dur = dur;
      return true;
    },

    /** Remove a block now (e.g. once its house is whole again). */
    drop(handle) {
      if (blocks.items[handle.i] === handle) blocks.kill(handle.i);
    },

    update(dt, t) {
      // puffs
      for (const pf of puffs.items) {
        if (!pf) continue;
        pf.age += dt;
        if (pf.age >= pf.life) {
          puffs.kill(pf.i);
          continue;
        }
        pf.v.multiplyScalar(Math.exp(-pf.drag * dt));
        pf.p.addScaledVector(pf.v, dt);
        const k = pf.age / pf.life;
        const sc = pf.size * Math.sin(Math.min(k * 3, 1) * Math.PI * 0.5) * (1 - k * k) * (0.7 + k * 0.8);
        m4.compose(pf.p, q.identity(), s.setScalar(Math.max(sc, 0.001)));
        puffMesh.setMatrixAt(pf.i, m4);
      }
      puffMesh.instanceMatrix.needsUpdate = true;

      // fluttering bits: tumble, drift, fall gently like paper
      for (const b of bits.items) {
        if (!b) continue;
        b.age += dt;
        const gh = groundHeight(b.p.x, b.p.z);
        if (b.age >= b.life || b.p.y < Math.max(gh, 0) - 0.2) {
          bits.kill(b.i);
          continue;
        }
        b.v.multiplyScalar(Math.exp(-2.2 * dt));
        b.v.y -= b.gravity * dt;
        b.v.y = Math.max(b.v.y, -2.2); // paper falls slowly
        const sway = Math.sin(t * 3 + b.ph) * 1.6 * b.flutter;
        b.p.x += (b.v.x + sway) * dt;
        b.p.y += b.v.y * dt;
        b.p.z += (b.v.z + Math.cos(t * 2.3 + b.ph) * 1.2 * b.flutter) * dt;
        b.rot.x += b.spin.x * dt;
        b.rot.y += b.spin.y * dt;
        b.rot.z += b.spin.z * dt;
        const k = b.age / b.life;
        const sc = b.size * Math.min(1, b.age * 8) * (k > 0.85 ? (1 - k) / 0.15 : 1);
        m4.compose(b.p, q.setFromEuler(b.rot), s.setScalar(Math.max(sc, 0.001)));
        bitMesh.setMatrixAt(b.i, m4);
      }
      bitMesh.instanceMatrix.needsUpdate = true;

      // blocks
      for (const b of blocks.items) {
        if (!b) continue;
        b.age += dt;
        if (b.state === 'home') {
          b.t += dt;
          if (b.t < 0) {
            // a little shiver of anticipation before lifting off
            const j = Math.sin(t * 40 + b.i) * 0.05;
            m4.compose(v.copy(b.p).setY(b.p.y + j), b.q, b.size);
          } else {
            const k = Math.min(b.t / b.dur, 1);
            const ease = k * k * (3 - 2 * k);
            v.lerpVectors(b.from, b.home.p, ease);
            v.y += Math.sin(k * Math.PI) * (4 + b.from.distanceTo(b.home.p) * 0.25);
            q.slerpQuaternions(b.fromQ, b.home.q, ease);
            m4.compose(v, q, b.size);
            if (k >= 1) b.state = 'placed';
          }
          blockMesh.setMatrixAt(b.i, m4);
          continue;
        }
        if (b.state === 'placed') continue;

        // tumbling and bouncing
        const floor = Math.max(groundHeight(b.p.x, b.p.z), -0.5) + b.size.y * 0.5;
        if (b.state === 'fly') {
          b.v.y -= 22 * dt; // a little heavier than real: snappy, toy-like
          b.p.addScaledVector(b.v, dt);
          q.setFromEuler(e.set(b.spin.x * dt, b.spin.y * dt, b.spin.z * dt));
          b.q.multiply(q);
          if (b.p.y < floor) {
            b.p.y = floor;
            if (groundHeight(b.p.x, b.p.z) < 0) {
              // plopped into the water
              fx.puff(b.p, { n: 3, colour: '#ffffff', size: 0.9, speed: 2, life: 0.9 });
              b.state = 'sink';
            } else if (b.v.y < -3) {
              b.v.y *= -0.32;
              b.v.x *= 0.6;
              b.v.z *= 0.6;
              b.spin.multiplyScalar(0.5);
            } else {
              b.state = 'rest';
              // settle onto a flat face so it looks stacked, not balanced on a corner
              e.setFromQuaternion(b.q, 'YXZ');
              b.restQ = new THREE.Quaternion().setFromEuler(e.set(Math.round(e.x / (Math.PI / 2)) * (Math.PI / 2), e.y, Math.round(e.z / (Math.PI / 2)) * (Math.PI / 2), 'YXZ'));
            }
          }
        } else if (b.state === 'rest') {
          b.rest += dt;
          b.p.y = floor;
          b.q.slerp(b.restQ, 1 - Math.exp(-10 * dt));
          if (!b.home && b.rest > 14) {
            // stray rubble with nowhere to go quietly shrinks away
            const k = Math.max(0, 1 - (b.rest - 14) / 1.5);
            if (k <= 0) {
              blocks.kill(b.i);
              continue;
            }
            m4.compose(b.p, b.q, s.copy(b.size).multiplyScalar(k));
            blockMesh.setMatrixAt(b.i, m4);
            continue;
          }
        } else if (b.state === 'sink') {
          b.p.y -= dt * 1.2;
          if (b.p.y < -4) {
            blocks.kill(b.i);
            continue;
          }
        }
        m4.compose(b.p, b.q, b.size);
        blockMesh.setMatrixAt(b.i, m4);
      }
      blockMesh.instanceMatrix.needsUpdate = true;
    },
  };
  return fx;
}
