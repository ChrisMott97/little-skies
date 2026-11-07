// Everything built: village houses, clock tower, windmill, lighthouse, farms,
// the giant tree, the pier and boats. Static stuff is merged per material.
import * as THREE from 'three';
import { toon, celRamp, MergeBuilder, addOutlines } from '../materials.js';
import { groundHeight, WORLD } from './terrain.js';
import { LAYOUT } from './layout.js';
import { mulberry32, createNoise2D } from '../noise.js';

const PAL = {
  walls: ['#fbf3e2', '#f7e6c4', '#f4d8c2', '#f2ebe2', '#efd9df', '#dbe6e4'],
  roofs: ['#c8643f', '#b5473b', '#3f8c8a', '#5b6f9c', '#d9874a', '#8a5a6e'],
  shutters: ['#4f8f7a', '#4f74a8', '#c25b4a', '#6a8f4a'],
};

let M; // materials, created lazily
function mats() {
  if (M) return M;
  const t = (c, o = {}) => toon({ color: c, ramp: celRamp, rim: 0.3, ...o });
  M = {
    walls: PAL.walls.map((c) => t(c)),
    roofs: PAL.roofs.map((c) => t(c)),
    shutters: PAL.shutters.map((c) => t(c)),
    stone: t('#c4b6a2'),
    stoneDark: t('#a8998a'),
    wood: t('#8e5f3e'),
    darkWood: t('#5e4235'),
    glass: t('#ffe2a0', { emissive: '#8a5a14', rim: 0 }),
    lamp: t('#fff0b8', { emissive: '#ffb84a', rim: 0 }),
    iron: t('#4a3b3f'),
    flowers: t('#f2869e'),
    flowers2: t('#ffd166'),
    white: t('#fbf8f0'),
    red: t('#cf4a3c'),
    barn: t('#b9493a'),
    canvas: t('#f6eedc'),
    clock: t('#fffdf5'),
    leaf: toon({ color: '#6aa84f', ramp: celRamp, rim: 0.45, rimColor: '#fff3c0', wind: 0.004 }),
    leaf2: toon({ color: '#7fb85a', ramp: celRamp, rim: 0.45, rimColor: '#fff3c0', wind: 0.004 }),
    bark: t('#7d5236'),
    rope: t('#c9b48a'),
  };
  return M;
}

// ---- tiny geometry helpers ---------------------------------------------------
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    _p.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _s.set(sx, sy, sz)
  );
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const SPHERE = new THREE.IcosahedronGeometry(1, 2);

function prism(halfBase, height, length) {
  const s = new THREE.Shape();
  s.moveTo(-halfBase, 0);
  s.lineTo(0, height);
  s.lineTo(halfBase, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false })
    .translate(0, 0, -length / 2)
    .rotateY(Math.PI / 2);
}

/** Adds a part to builder b, positioned in the local frame `base`. */
function part(b, geo, mat, base, local) {
  b.add(geo, mat, new THREE.Matrix4().multiplyMatrices(base, local));
}

// ---- Houses ------------------------------------------------------------------
export const chimneys = []; // world positions of chimney tops (for smoke)

function house(b, h, opts = {}) {
  const m = mats();
  const r = mulberry32(Math.floor(h.seed * 1e9));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const w = opts.w ?? 6 + r() * 3.5;
  const d = opts.d ?? 5 + r() * 2.5;
  const floors = opts.floors ?? (r() < 0.45 ? 2 : 1);
  const H = floors * 3.1;
  const wall = opts.wall ?? pick(m.walls);
  const roof = opts.roof ?? pick(m.roofs);
  const shutter = pick(m.shutters);

  // sit on the highest corner, plinth reaches down to the lowest
  const ca = Math.cos(h.rot);
  const sa = Math.sin(h.rot);
  let hi = -Infinity;
  let lo = Infinity;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = h.x + (u * w * 0.55) * ca + (v * d * 0.55) * sa;
    const z = h.z - (u * w * 0.55) * sa + (v * d * 0.55) * ca;
    const g = groundHeight(x, z);
    hi = Math.max(hi, g);
    lo = Math.min(lo, g);
  }
  const baseY = hi + 0.35;
  const base = mat4(h.x, baseY, h.z, 0, h.rot, 0);
  const plinthH = baseY - lo + 1.5;
  part(b, BOX, m.stone, base, mat4(0, -plinthH / 2 + 0.05, 0, 0, 0, 0, w + 0.5, plinthH, d + 0.5));
  // everything above the plinth can be knocked down (and put back)
  const tag = {};
  b.setTag(tag);

  // walls + gables + roof planes
  part(b, BOX, wall, base, mat4(0, H / 2, 0, 0, 0, 0, w, H, d));
  const pitch = d / 2 * (0.65 + r() * 0.45);
  part(b, prism(d / 2, pitch, w), wall, base, mat4(0, H, 0));
  const over = 0.55;
  const run = d / 2 + over;
  const slopeLen = Math.hypot(run, pitch * (run / (d / 2)));
  const ang = Math.atan2(pitch, d / 2);
  for (const s of [-1, 1]) {
    part(b, BOX, roof, base, mat4(0, H + pitch / 2 - (over / 2) * Math.tan(ang) + 0.16 / Math.cos(ang), s * (d / 4 + over / 2), s * ang, 0, 0, w + over * 2, 0.32, slopeLen));
  }
  // ridge cap
  part(b, BOX, roof, base, mat4(0, H + pitch + 0.12, 0, Math.PI / 4, 0, 0, w + over * 2 + 0.1, 0.4, 0.4));

  // chimney
  let chimney = null;
  if (r() < 0.8) {
    const cx = (r() - 0.5) * w * 0.6;
    const cz = (r() < 0.5 ? -1 : 1) * d * 0.18;
    const top = H + pitch + 0.9;
    part(b, BOX, r() < 0.5 ? m.stoneDark : m.red, base, mat4(cx, top - 1.6, cz, 0, 0, 0, 0.8, 3.2, 0.8));
    part(b, BOX, m.stoneDark, base, mat4(cx, top, cz, 0, 0, 0, 1.0, 0.25, 1.0));
    chimney = { x: cx, z: cz, top };
    if (r() < 0.6) {
      chimney.smoke = new THREE.Vector3(cx, top + 0.3, cz).applyMatrix4(base);
      chimneys.push(chimney.smoke);
    }
  }

  // door (front is +Z)
  part(b, BOX, r() < 0.5 ? m.wood : shutter, base, mat4((r() - 0.5) * w * 0.3, 1.1, d / 2 + 0.05, 0, 0, 0, 1.1, 2.2, 0.15));
  part(b, BOX, roof, base, mat4(0, 2.55, d / 2 + 0.45, -0.25, 0, 0, 2.0, 0.12, 1.0)); // little awning

  // windows
  const winRow = (y, side) => {
    const n = Math.max(1, Math.round((side === 'front' ? w : d) / 3.2));
    const span = side === 'front' ? w : d;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      if (side === 'front' && y < 2 && Math.abs(t * span) < 1.2) continue; // leave room for the door
      const pos = side === 'front' ? [t * span, y, d / 2 + 0.06] : [w / 2 + 0.06, y, t * span];
      const ry = side === 'front' ? 0 : Math.PI / 2;
      const wm = mat4(pos[0], pos[1], pos[2], 0, ry, 0);
      part(b, BOX, m.glass, base, wm.clone().multiply(mat4(0, 0, 0, 0, 0, 0, 0.9, 1.1, 0.1)));
      part(b, BOX, m.white, base, wm.clone().multiply(mat4(0, -0.62, 0.05, 0, 0, 0, 1.15, 0.14, 0.22)));
      if (r() < 0.5) {
        for (const s of [-1, 1]) part(b, BOX, shutter, base, wm.clone().multiply(mat4(s * 0.72, 0, 0.02, 0, 0, 0, 0.45, 1.15, 0.08)));
      }
      if (r() < 0.3) {
        part(b, BOX, m.wood, base, wm.clone().multiply(mat4(0, -0.8, 0.22, 0, 0, 0, 1.0, 0.28, 0.35)));
        for (let k = -1; k <= 1; k++) {
          part(b, SPHERE, r() < 0.5 ? m.flowers : m.flowers2, base, wm.clone().multiply(mat4(k * 0.32, -0.6, 0.25, 0, 0, 0, 0.2, 0.2, 0.2)));
        }
      }
    }
  };
  for (let f = 0; f < floors; f++) {
    winRow(1.7 + f * 3.1, 'front');
    winRow(1.7 + f * 3.1, 'side');
  }

  // the occasional storybook turret
  let turret = null;
  if (opts.turret ?? r() < 0.13) {
    const tx = (r() < 0.5 ? -1 : 1) * w / 2;
    const tz = d / 2;
    const th = H + 2.6;
    part(b, CYL, wall, base, mat4(tx, th / 2, tz, 0, 0, 0, 1.5, th, 1.5));
    part(b, new THREE.ConeGeometry(1.95, 3.6, 12), roof, base, mat4(tx, th + 1.8, tz));
    part(b, BOX, m.glass, base, mat4(tx, th - 1.2, tz + 1.45, 0, 0, 0, 0.6, 0.9, 0.1));
    turret = { x: tx, z: tz, h: th + 3.6 };
  }
  b.untag();
  return {
    kind: 'house',
    tag,
    x: h.x,
    z: h.z,
    rot: h.rot,
    baseY,
    groundY: lo,
    hw: w / 2,
    hd: d / 2,
    ox: 0,
    walls: H,
    top: H + pitch,
    pitch,
    floors,
    chimney,
    turret,
    colours: { wall: '#' + wall.color.getHexString(), roof: '#' + roof.color.getHexString(), shutter: '#' + shutter.color.getHexString() },
  };
}

// ---- Village -----------------------------------------------------------------
function clockTower(b) {
  const m = mats();
  const P = LAYOUT.plaza;
  const base = mat4(P.x, groundHeight(P.x, P.z), P.z);
  part(b, BOX, m.stone, base, mat4(0, 1, 0, 0, 0, 0, 6.5, 2, 6.5));
  part(b, BOX, m.walls[1], base, mat4(0, 9, 0, 0, 0, 0, 5, 14, 5));
  part(b, BOX, m.stone, base, mat4(0, 16.3, 0, 0, 0, 0, 5.8, 0.6, 5.8));
  part(b, BOX, m.walls[0], base, mat4(0, 18.3, 0, 0, 0, 0, 4.4, 3.4, 4.4));
  part(b, new THREE.ConeGeometry(4.1, 6, 4), m.roofs[2], base, mat4(0, 23, 0, 0, Math.PI / 4, 0));
  part(b, SPHERE, m.lamp, base, mat4(0, 26.3, 0, 0, 0, 0, 0.35, 0.35, 0.35));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const face = mat4(Math.sin(a) * 2.6, 13.5, Math.cos(a) * 2.6, 0, a, 0);
    part(b, new THREE.CylinderGeometry(1.5, 1.5, 0.2, 24).rotateX(Math.PI / 2), m.clock, base, face);
    part(b, new THREE.TorusGeometry(1.5, 0.12, 6, 24), m.iron, base, face);
    part(b, BOX, m.iron, base, face.clone().multiply(mat4(0, 0.45, 0.15, 0, 0, 0, 0.12, 0.9, 0.05)));
    part(b, BOX, m.iron, base, face.clone().multiply(mat4(0.3, 0, 0.15, 0, 0, 0, 0.7, 0.1, 0.05)));
    part(b, BOX, m.glass, base, mat4(Math.sin(a) * 2.21, 18.4, Math.cos(a) * 2.21, 0, a, 0, 1.2, 1.8, 0.1));
    part(b, BOX, m.darkWood, base, mat4(Math.sin(a) * 3.3, 1.2, Math.cos(a) * 3.3, 0, a, 0, 1.4, 2.4, 0.1));
  }
  // benches around the plaza
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = P.x + Math.cos(a) * (P.r - 3);
    const z = P.z + Math.sin(a) * (P.r - 3);
    const bb = mat4(x, groundHeight(x, z), z, 0, -a + Math.PI / 2, 0);
    part(b, BOX, m.wood, bb, mat4(0, 0.5, 0, 0, 0, 0, 2.2, 0.15, 0.6));
    part(b, BOX, m.wood, bb, mat4(0, 0.9, -0.28, 0, 0, 0, 2.2, 0.5, 0.1));
    for (const s of [-1, 1]) part(b, BOX, m.iron, bb, mat4(s * 0.9, 0.25, 0, 0, 0, 0, 0.12, 0.5, 0.5));
  }
}

function streetLamps(b) {
  const m = mats();
  const lamps = [];
  const paths = [...LAYOUT.streets.map((s) => s.points), LAYOUT.roads[0].points.slice(-60)];
  for (const pts of paths) {
    for (let i = 4; i < pts.length - 1; i += 6) {
      const p = pts[i];
      const q = pts[i + 1];
      const a = Math.atan2(q.z - p.z, q.x - p.x);
      const s = i % 12 === 4 ? 1 : -1;
      const x = p.x - Math.sin(a) * 3.4 * s;
      const z = p.z + Math.cos(a) * 3.4 * s;
      const y = groundHeight(x, z);
      if (y < 1) continue;
      const base = mat4(x, y, z);
      part(b, CYL6, m.iron, base, mat4(0, 1.9, 0, 0, 0, 0, 0.08, 3.8, 0.08));
      part(b, BOX, m.lamp, base, mat4(0, 4.0, 0, 0, 0, 0, 0.45, 0.6, 0.45));
      part(b, new THREE.ConeGeometry(0.45, 0.4, 4), m.iron, base, mat4(0, 4.5, 0, 0, Math.PI / 4, 0));
      lamps.push(new THREE.Vector3(x, y + 4, z));
    }
  }
  return lamps;
}

function laundryLines(b) {
  const m = mats();
  const cloths = ['#e86f5a', '#f2c14e', '#7fb7d6', '#ffffff', '#a48ad8', '#9ccb5e'].map((c) => {
    const mat = toon({ color: c, side: THREE.DoubleSide });
    mat.userData.noOutline = true;
    return mat;
  });
  const r = mulberry32(5);
  const H = LAYOUT.houses;
  let lines = 0;
  for (let i = 0; i < H.length && lines < 7; i++) {
    for (let j = i + 1; j < H.length; j++) {
      const a = H[i];
      const c = H[j];
      const d = Math.hypot(a.x - c.x, a.z - c.z);
      if (d < 14 || d > 22 || r() < 0.6) continue;
      const pa = new THREE.Vector3(a.x, Math.max(a.y, c.y) + 4.2, a.z);
      const pc = new THREE.Vector3(c.x, Math.max(a.y, c.y) + 4.2, c.z);
      const dir = pc.clone().sub(pa);
      const len = dir.length();
      const mid = pa.clone().add(pc).multiplyScalar(0.5);
      const rope = new THREE.Matrix4().compose(
        mid,
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
        new THREE.Vector3(0.03, len, 0.03)
      );
      b.add(CYL6, m.rope, rope);
      const yaw = Math.atan2(dir.x, dir.z) + Math.PI / 2;
      for (let k = 0; k < 6; k++) {
        const t = 0.2 + (k / 6) * 0.6;
        const p = pa.clone().lerp(pc, t);
        const sag = Math.sin(t * Math.PI) * 0.5;
        const cw = 0.6 + r() * 0.5;
        const ch = 0.7 + r() * 0.6;
        b.add(new THREE.PlaneGeometry(cw, ch), cloths[Math.floor(r() * cloths.length)], mat4(p.x, p.y - sag - ch / 2, p.z, 0, yaw, 0));
      }
      lines++;
      break;
    }
  }
}

// ---- Landmarks ---------------------------------------------------------------
function createWindmill() {
  const m = mats();
  const W = LAYOUT.windmill;
  const group = new THREE.Group();
  const b = new MergeBuilder();
  const id = new THREE.Matrix4();
  part(b, CYL, m.stone, id, mat4(0, 1, 0, 0, 0, 0, 4.6, 2, 4.6));
  part(b, new THREE.CylinderGeometry(3.0, 4.2, 13, 16), m.walls[0], id, mat4(0, 8.5, 0));
  part(b, new THREE.ConeGeometry(4.0, 4.5, 16), m.roofs[0], id, mat4(0, 17.2, 0));
  part(b, BOX, m.wood, id, mat4(0, 1.6, 4.0, -0.12, 0, 0, 1.4, 2.6, 0.3));
  for (const [y, a] of [[6, 0.3], [10, -0.4], [13, 0.9]]) {
    part(b, BOX, m.glass, id, mat4(Math.sin(a) * 3.6, y, Math.cos(a) * 3.6, 0, a, 0, 0.8, 1.0, 0.1));
  }
  part(b, CYL, m.darkWood, id, mat4(0, 15.3, 3.4, Math.PI / 2, 0, 0, 0.35, 1.6, 0.35));
  group.add(b.build({ outline: 0.07 }));

  const sails = new THREE.Group();
  sails.position.set(0, 15.3, 4.3);
  const sb = new MergeBuilder();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = mat4(0, 0, 0, 0, 0, a);
    part(sb, BOX, m.darkWood, arm, mat4(0, 6, 0, 0, 0, 0, 0.35, 12, 0.3));
    part(sb, BOX, m.canvas, arm, mat4(1.15, 7, 0.12, 0, 0, 0, 1.9, 8.5, 0.08));
    for (let k = 0; k < 5; k++) part(sb, BOX, m.darkWood, arm, mat4(1.15, 3.2 + k * 1.9, 0.18, 0, 0, 0, 2.1, 0.1, 0.1));
  }
  part(sb, SPHERE, m.darkWood, new THREE.Matrix4(), mat4(0, 0, 0, 0, 0, 0, 0.6, 0.6, 0.6));
  sails.add(sb.build({ outline: 0.06 }));
  group.add(sails);

  // face the sails roughly toward the airfield so you see them turning on takeoff
  group.position.set(W.x, W.y - 0.3, W.z);
  group.rotation.y = Math.atan2(WORLD.airfield.x - W.x, WORLD.airfield.z - W.z);
  group.updateMatrixWorld(true);
  const hub = sails.getWorldPosition(new THREE.Vector3());
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  // fly past close and the sails catch your prop wash, then slowly wind down
  let spin = 0.6;
  group.userData.update = (dt, t, flight) => {
    if (flight) {
      const d = flight.position.distanceTo(hub);
      const gust = Math.max(0, 1 - d / 70) * Math.min(flight.speed / 30, 1.5);
      spin += gust * 6 * dt;
    }
    spin = Math.min(0.6 + (spin - 0.6) * Math.exp(-0.25 * dt), 9);
    sails.rotation.z -= dt * spin;
  };
  group.userData.solid = { x: W.x, z: W.z, r: 4.4, bottom: W.y - 2, top: W.y + 19.5, name: 'windmill' };
  group.userData.sails = { hub, facing, r: 12.5 };
  return group;
}

function createLighthouse(b) {
  const m = mats();
  const L = LAYOUT.lighthouse;
  const base = mat4(L.x, L.y - 0.5, L.z);
  part(b, CYL, m.stone, base, mat4(0, 1, 0, 0, 0, 0, 4.4, 2.5, 4.4));
  const segs = 6;
  const totalH = 19;
  for (let i = 0; i < segs; i++) {
    const r0 = 3.2 - (i / segs) * 1.2;
    const r1 = 3.2 - ((i + 1) / segs) * 1.2;
    const h = totalH / segs;
    part(b, new THREE.CylinderGeometry(r1, r0, h, 16), i % 2 ? m.red : m.white, base, mat4(0, 2 + h * (i + 0.5), 0));
  }
  const top = 2 + totalH;
  part(b, CYL, m.iron, base, mat4(0, top + 0.2, 0, 0, 0, 0, 2.9, 0.4, 2.9));
  part(b, new THREE.TorusGeometry(2.7, 0.08, 6, 24).rotateX(Math.PI / 2), m.iron, base, mat4(0, top + 1.2, 0));
  part(b, CYL, m.lamp, base, mat4(0, top + 1.6, 0, 0, 0, 0, 1.5, 2.4, 1.5));
  part(b, new THREE.SphereGeometry(1.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.red, base, mat4(0, top + 2.8, 0));
  part(b, SPHERE, m.iron, base, mat4(0, top + 4.6, 0, 0, 0, 0, 0.3, 0.3, 0.3));
  part(b, BOX, m.darkWood, base, mat4(0, 3.2, 3.15, 0, 0, 0, 1.2, 2.2, 0.2));
  // keeper's cottage
  const a = Math.atan2(LAYOUT.plaza.x - L.x, LAYOUT.plaza.z - L.z);
  const cottage = house(b, { x: L.x + Math.sin(a) * 11, z: L.z + Math.cos(a) * 11, rot: a, seed: 0.42 }, { w: 6, d: 5, floors: 1, wall: m.walls[0], roof: m.roofs[3] });
  return {
    cottage,
    solid: { x: L.x, z: L.z, r: 3.4, bottom: L.y - 2, top: L.y + 25.5, name: 'lighthouse' },
  };
}

function barn(b, x, z, rot) {
  const m = mats();
  const y = groundHeight(x, z);
  const base = mat4(x, y + 0.2, z, 0, rot, 0);
  const w = 12;
  const d = 9;
  part(b, BOX, m.stone, base, mat4(0, -0.8, 0, 0, 0, 0, w + 0.4, 2.2, d + 0.4));
  const tag = {};
  b.setTag(tag);
  part(b, BOX, m.barn, base, mat4(0, 2.6, 0, 0, 0, 0, w, 5.2, d));
  // gambrel roof profile
  const s = new THREE.Shape();
  const hw = d / 2 + 0.5;
  s.moveTo(-hw, 0);
  s.lineTo(-hw * 0.7, 2.6);
  s.lineTo(0, 4.2);
  s.lineTo(hw * 0.7, 2.6);
  s.lineTo(hw, 0);
  s.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(s, { depth: w + 1, bevelEnabled: false }).translate(0, 0, -(w + 1) / 2).rotateY(Math.PI / 2);
  part(b, roofGeo, m.roofs[3], base, mat4(0, 5.2, 0));
  part(b, prism(d / 2, 3.6, w - 0.2), m.barn, base, mat4(0, 5.15, 0));
  // big doors with white X trim
  part(b, BOX, m.barn, base, mat4(0, 2.2, d / 2 + 0.08, 0, 0, 0, 4.2, 4.4, 0.12));
  for (const r of [0.8, -0.8]) part(b, BOX, m.white, base, mat4(0, 2.2, d / 2 + 0.16, 0, 0, r, 0.22, 5.6, 0.06));
  part(b, BOX, m.white, base, mat4(0, 4.45, d / 2 + 0.16, 0, 0, 0, 4.4, 0.22, 0.06));
  part(b, BOX, m.white, base, mat4(0, 7.2, d / 2 + 0.1, 0, 0, 0, 1.2, 1.2, 0.08));
  // silo
  part(b, CYL, m.walls[3], base, mat4(w / 2 + 3, 5, -1, 0, 0, 0, 2.2, 10, 2.2));
  part(b, new THREE.SphereGeometry(2.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.roofs[2], base, mat4(w / 2 + 3, 10, -1));
  b.untag();
  return {
    kind: 'barn',
    tag,
    x,
    z,
    rot,
    baseY: y + 0.2,
    groundY: y - 1,
    hw: (w / 2 + 5.2 + w / 2) / 2, // the box reaches over the silo too
    hd: d / 2 + 0.5,
    ox: 2.6,
    walls: 5.2,
    top: 9.4,
    pitch: 4.2,
    floors: 2,
    silo: { x: w / 2 + 3, z: -1, r: 2.2, h: 10 },
    colours: { wall: '#' + m.barn.color.getHexString(), roof: '#' + m.roofs[3].color.getHexString(), shutter: '#' + m.white.color.getHexString(), silo: '#' + m.walls[3].color.getHexString() },
  };
}

function createGiantTree() {
  const m = mats();
  const T = LAYOUT.giantTree;
  const r = mulberry32(808);
  const noise = createNoise2D(3);
  const b = new MergeBuilder();
  const id = new THREE.Matrix4();
  part(b, new THREE.CylinderGeometry(2.2, 3.6, 20, 12), m.bark, id, mat4(0, 10, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    part(b, new THREE.ConeGeometry(1.4, 5, 8), m.bark, id, mat4(Math.cos(a) * 2.6, 1.2, Math.sin(a) * 2.6, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9));
  }
  const branchEnds = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5;
    const tilt = 0.7 + r() * 0.4;
    const len = 9 + r() * 4;
    const y0 = 14 + r() * 5;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const mid = new THREE.Vector3(0, y0, 0).addScaledVector(dir, len / 2);
    b.add(
      new THREE.CylinderGeometry(0.6, 1.2, len, 8),
      m.bark,
      new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1))
    );
    branchEnds.push(new THREE.Vector3(0, y0, 0).addScaledVector(dir, len));
  }
  // billowing canopy
  const blob = new THREE.IcosahedronGeometry(1, 2);
  const pos = blob.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + noise(v.x * 2 + v.z, v.y * 2) * 0.12);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  blob.computeVertexNormals();
  for (const e of branchEnds) {
    const s = 6 + r() * 3;
    part(b, blob, r() < 0.5 ? m.leaf : m.leaf2, id, mat4(e.x, e.y + 1, e.z, 0, r() * 6, 0, s, s * 0.8, s));
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const s = 7 + r() * 3;
    part(b, blob, r() < 0.5 ? m.leaf : m.leaf2, id, mat4(Math.cos(a) * 4, 28 + r() * 5, Math.sin(a) * 4, 0, r() * 6, 0, s, s * 0.8, s));
  }
  // a rope swing on the lowest branch
  const swing = branchEnds.reduce((lo, e) => (e.y < lo.y ? e : lo), branchEnds[0]).clone().multiplyScalar(0.75);
  for (const s of [-0.5, 0.5]) part(b, CYL6, m.rope, id, mat4(swing.x + s, swing.y / 2 + 0.6, swing.z, 0, 0, 0, 0.04, swing.y - 1.2, 0.04));
  part(b, BOX, m.wood, id, mat4(swing.x, 1.2, swing.z, 0, 0, 0, 1.3, 0.1, 0.45));
  // a little bench to sit and look out
  part(b, BOX, m.wood, id, mat4(6, 0.5, 4, 0, -0.6, 0, 2.4, 0.15, 0.6));

  const g = b.build({ outline: 0.08 });
  g.position.set(T.x, T.y - 0.6, T.z);
  g.userData.solid = { x: T.x, z: T.z, r: 3.4, bottom: T.y - 2, top: T.y + 19, name: 'giant tree' };
  g.userData.canopy = { p: new THREE.Vector3(T.x, T.y + 27, T.z), r: 17, colours: ['#6aa84f', '#7fb85a', '#9ccb5e'] };
  return g;
}

function createPier() {
  const m = mats();
  const P = LAYOUT.pier;
  const group = new THREE.Group();
  if (!P) return group;
  const b = new MergeBuilder();
  const base = mat4(P.x, 0, P.z, 0, -P.angle + Math.PI / 2, 0); // local +Z points out to sea
  part(b, BOX, m.wood, base, mat4(0, 1.3, P.length / 2, 0, 0, 0, 3.2, 0.25, P.length));
  for (let z = 1; z < P.length; z += 4) {
    for (const s of [-1, 1]) part(b, CYL6, m.darkWood, base, mat4(s * 1.5, -1.5, z, 0, 0, 0, 0.18, 6, 0.18));
  }
  part(b, CYL6, m.iron, base, mat4(1.4, 2.8, P.length - 1, 0, 0, 0, 0.07, 3, 0.07));
  part(b, BOX, m.lamp, base, mat4(1.4, 4.4, P.length - 1, 0, 0, 0, 0.4, 0.5, 0.4));
  group.add(b.build({ outline: 0.05 }));

  // moored boats that bob
  const boats = [];
  const hullGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const colours = [mats().roofs[2], mats().red, mats().roofs[4]];
  for (let i = 0; i < 3; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(hullGeo, colours[i]);
    hull.scale.set(1.2, 0.8, 2.8);
    boat.add(hull);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 20).rotateX(Math.PI / 2), m.white);
    rim.scale.set(1.2, 1, 2.8);
    boat.add(rim);
    if (i !== 1) {
      const mast = new THREE.Mesh(CYL6, m.darkWood);
      mast.scale.set(0.06, 4, 0.06);
      mast.position.set(0, 2, -0.3);
      boat.add(mast);
      const sailShape = new THREE.Shape();
      sailShape.moveTo(0, 0);
      sailShape.lineTo(0, 3.4);
      sailShape.lineTo(0, 0.2);
      sailShape.lineTo(1.8, 0.2);
      sailShape.lineTo(0, 3.4);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), toon({ color: '#fbf3e2', side: THREE.DoubleSide }));
      sail.rotation.y = Math.PI / 2;
      sail.position.set(0, 0.6, -0.2);
      boat.add(sail);
    }
    const side = i % 2 ? 1 : -1;
    const along = 10 + i * 9;
    const local = new THREE.Vector3(side * 4.2, 0.1, along).applyMatrix4(base);
    boat.position.copy(local);
    boat.rotation.y = -P.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    boat.traverse((o) => o.isMesh && (o.castShadow = true));
    addOutlines(boat, 0.04);
    group.add(boat);
    boats.push({ boat, phase: i * 1.7, baseY: 0.1 });
  }
  group.userData.update = (dt, t) => {
    for (const b of boats) {
      b.boat.position.y = b.baseY + Math.sin(t * 1.1 + b.phase) * 0.12;
      b.boat.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.06;
      b.boat.rotation.x = Math.sin(t * 0.7 + b.phase * 2) * 0.04;
    }
  };
  return group;
}

// ---- Bridges: humpbacked stone arches where roads cross the river -------------
function bridge(b, br) {
  const m = mats();
  const S = br.span;
  const L = S / 2 + 9; // ramps down onto each bank
  const H = 4.2; // deck height above the water
  const W = br.width;
  const arches = S > 30 ? 2 : 1;
  // outline (x along the road, y up from the water), traced as one polygon
  const top = [[-L, 1.0], [-S / 2 - 2, H - 0.6], [-S / 4, H], [S / 4, H], [S / 2 + 2, H - 0.6], [L, 1.0]];
  const s = new THREE.Shape();
  s.moveTo(-L, -3);
  top.forEach(([x, y]) => s.lineTo(x, y));
  s.lineTo(L, -3);
  const open = S - 2;
  const rx = open / (2 * arches) - (arches > 1 ? 1.2 : 0);
  for (let a = arches - 1; a >= 0; a--) {
    const cx = -open / 2 + (open / arches) * (a + 0.5);
    for (let k = 0; k <= 16; k++) {
      const th = (k / 16) * Math.PI;
      s.lineTo(cx + Math.cos(th) * rx, -3 + Math.sin(th) * (H + 1.6));
    }
  }
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2);
  const base = mat4(br.x, br.level, br.z, 0, -br.angle, 0);
  part(b, body, m.stone, base, new THREE.Matrix4());
  // parapets
  const p = new THREE.Shape();
  p.moveTo(top[0][0], top[0][1]);
  top.forEach(([x, y]) => p.lineTo(x, y + 0.9));
  [...top].reverse().forEach(([x, y]) => p.lineTo(x, y));
  const parapet = new THREE.ExtrudeGeometry(p, { depth: 0.5, bevelEnabled: false });
  for (const side of [-1, 1]) part(b, parapet, m.stoneDark, base, mat4(0, 0, side > 0 ? W / 2 - 0.5 : -W / 2, 0, 0, 0));
  // a lamp at each end of the bigger bridges
  if (S > 24) {
    for (const x of [-S / 2 - 2, S / 2 + 2]) {
      part(b, CYL6, m.iron, base, mat4(x, H + 1.6, W / 2 - 0.25, 0, 0, 0, 0.08, 2.4, 0.08));
      part(b, BOX, m.lamp, base, mat4(x, H + 3, W / 2 - 0.25, 0, 0, 0, 0.45, 0.55, 0.45));
    }
  }
}

// ---- Everything --------------------------------------------------------------
export function createBuildings() {
  const group = new THREE.Group();
  group.name = 'buildings';
  const updates = [];

  const village = new MergeBuilder();
  const breakables = LAYOUT.houses.map((h) => house(village, h));
  clockTower(village);
  const lamps = streetLamps(village);
  laundryLines(village);
  const lighthouse = createLighthouse(village);
  breakables.push(lighthouse.cottage);
  for (const br of LAYOUT.bridges) bridge(village, br);

  // farms: a farmhouse + barn at each
  LAYOUT.farms.forEach((f, i) => {
    const rot = Math.atan2(WORLD.airfield.x - f.x, WORLD.airfield.z - f.z);
    breakables.push(house(village, { x: f.x + Math.cos(rot) * 14, z: f.z - Math.sin(rot) * 14, rot, seed: 0.13 + i * 0.31 }, { floors: 2 }));
    breakables.push(barn(village, f.x - Math.cos(rot) * 10, f.z + Math.sin(rot) * 10, rot));
  });

  group.add(village.build({ outline: 0.06 }));
  // where each breakable building lives inside the merged village meshes
  for (const b of breakables) b.ranges = village.ranges(b.tag);

  const windmill = createWindmill();
  group.add(windmill);
  updates.push(windmill.userData.update);
  const giantTree = createGiantTree();
  group.add(giantTree);
  const pier = createPier();
  group.add(pier);
  if (pier.userData.update) updates.push(pier.userData.update);

  group.userData.lamps = lamps;
  group.userData.breakables = breakables;
  // things that stay put when you fly into them (you bonk off instead)
  const P = LAYOUT.plaza;
  const plazaY = groundHeight(P.x, P.z);
  group.userData.solids = [
    { x: P.x, z: P.z, r: 3.6, bottom: plazaY - 2, top: plazaY + 26.5, name: 'clock tower' },
    lighthouse.solid,
    windmill.userData.solid,
    giantTree.userData.solid,
  ];
  group.userData.sails = windmill.userData.sails;
  group.userData.canopy = giantTree.userData.canopy;
  group.userData.update = (dt, t, flight) => updates.forEach((u) => u(dt, t, flight));
  return group;
}
