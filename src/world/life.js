// Little things that make the countryside feel lived in: hedgerows, orchards,
// hay bales, sheep, hot air balloons, birds and chimney smoke.
import * as THREE from 'three';
import { toon, celRamp, addOutlines } from '../materials.js';
import { groundHeight, WORLD } from './terrain.js';
import { LAYOUT } from './layout.js';
import { mulberry32, createNoise2D } from '../noise.js';

const rand = mulberry32(1234);
const noise = createNoise2D(19);

function lumpyBall(detail = 1, amt = 0.15, seed = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.multiplyScalar(1 + noise(v.x * 2.1 + seed, v.z * 2.1 + v.y) * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Walk the outline of each field, returning points along its edge. */
function fieldEdges(f, step, cb) {
  const ca = Math.cos(f.angle);
  const sa = Math.sin(f.angle);
  const hw = f.w / 2 + 1.8;
  const hd = f.d / 2 + 1.8;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (let e = 0; e < 4; e++) {
    const [u0, v0] = corners[e];
    const [u1, v1] = corners[(e + 1) % 4];
    const len = Math.hypot(u1 - u0, v1 - v0);
    const edgeSeed = rand();
    for (let t = 0; t < len; t += step) {
      const u = u0 + ((u1 - u0) * t) / len;
      const v = v0 + ((v1 - v0) * t) / len;
      cb(f.x + u * ca - v * sa, f.z + u * sa + v * ca, edgeSeed, e);
    }
  }
}

function scatterInField(f, n, margin, cb) {
  const ca = Math.cos(f.angle);
  const sa = Math.sin(f.angle);
  for (let i = 0; i < n; i++) {
    const u = (rand() - 0.5) * (f.w - margin * 2);
    const v = (rand() - 0.5) * (f.d - margin * 2);
    cb(f.x + u * ca - v * sa, f.z + u * sa + v * ca);
  }
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const col = new THREE.Color();

function instanced(geo, mat, list, { colours, shadow = true } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(list.length, 1));
  mesh.count = list.length;
  list.forEach((it, i) => {
    m4.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0)), s.set(it.sx, it.sy ?? it.sx, it.sz ?? it.sx));
    mesh.setMatrixAt(i, m4);
    if (colours) mesh.setColorAt(i, col.set(it.c));
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// ---- Countryside (static) ------------------------------------------------------
export function createCountryside() {
  const group = new THREE.Group();
  group.name = 'countryside';

  // hedgerows round the fields, with gaps and the odd tall tree
  const bushes = [];
  const hedgeTrees = [];
  const hedgeCols = ['#5d9a48', '#6aa650', '#548f45', '#73ad55'];
  for (const f of LAYOUT.fields) {
    fieldEdges(f, 3.2, (x, z, edgeSeed, edge) => {
      if (edgeSeed < 0.25) return; // some edges are open
      if (noise(x * 0.05, z * 0.05) > 0.55) return; // gaps
      const y = groundHeight(x, z);
      if (rand() < 0.035) {
        hedgeTrees.push({ x, y: y - 0.3, z, sx: 1.0 + rand() * 0.6, ry: rand() * 6, c: hedgeCols[Math.floor(rand() * 4)] });
        return;
      }
      const sc = 1.2 + rand() * 0.7;
      bushes.push({ x, y: y + sc * 0.5, z, sx: sc, sy: sc * 0.85, ry: rand() * 6, c: hedgeCols[Math.floor(rand() * 4)] });
    });
  }
  const bushMat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.4, rimColor: '#fff6c8' });
  group.add(instanced(lumpyBall(1, 0.2), bushMat, bushes, { colours: true }));

  // orchards: neat rows of little fruit trees
  const orchardTrees = [];
  for (const f of LAYOUT.fields.filter((f) => f.crop === 'orchard')) {
    const ca = Math.cos(f.angle);
    const sa = Math.sin(f.angle);
    for (let u = -f.w / 2 + 5; u < f.w / 2 - 4; u += 9) {
      for (let v = -f.d / 2 + 5; v < f.d / 2 - 4; v += 9) {
        const x = f.x + u * ca - v * sa;
        const z = f.z + u * sa + v * ca;
        orchardTrees.push({ x, y: groundHeight(x, z), z, sx: 0.8 + rand() * 0.3, ry: rand() * 6, c: rand() < 0.3 ? '#f4c2cf' : '#79b552' });
      }
    }
  }
  const smallTrunk = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6).translate(0, 1.1, 0);
  const smallCanopy = lumpyBall(1, 0.18, 4).scale(2.0, 1.7, 2.0).translate(0, 3.2, 0);
  const allTrees = [...orchardTrees, ...hedgeTrees.map((t) => ({ ...t, sx: t.sx * 1.6 }))];
  const trunkMat = toon({ color: '#8b5e3c', ramp: celRamp, rim: 0.1 });
  const canopyMat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.45, rimColor: '#fff6c8', wind: 0.02 });
  group.add(instanced(smallTrunk, trunkMat, allTrees));
  group.add(instanced(smallCanopy, canopyMat, allTrees, { colours: true }));

  // hay bales in some wheat fields
  const bales = [];
  for (const f of LAYOUT.fields.filter((f) => f.crop === 'wheat')) {
    if (rand() < 0.55) continue;
    scatterInField(f, 4 + Math.floor(rand() * 8), 6, (x, z) => {
      bales.push({ x, y: groundHeight(x, z) + 0.75, z, sx: 0.8, sy: 1.2, sz: 0.8, rz: Math.PI / 2, ry: rand() * 6 });
    });
  }
  const baleGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
  group.add(instanced(baleGeo, toon({ color: '#e6c467', ramp: celRamp, rim: 0.3 }), bales));

  // sheep!
  const sheep = [];
  for (const f of LAYOUT.fields.filter((f) => f.crop === 'pasture')) {
    const n = 4 + Math.floor(rand() * 10);
    scatterInField(f, n, 5, (x, z) => sheep.push({ x, z, y: groundHeight(x, z), ry: rand() * Math.PI * 2 }));
  }
  const bodyGeo = lumpyBall(1, 0.12, 9).scale(0.75, 0.62, 1.0).translate(0, 0.85, 0);
  const headGeo = new THREE.SphereGeometry(0.3, 10, 8).scale(0.9, 1, 1.2).translate(0, 0.95, 0.95);
  const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 5);
  const legs = [];
  for (const sh of sheep) {
    for (const [lx, lz] of [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]]) {
      const c = Math.cos(sh.ry);
      const sn = Math.sin(sh.ry);
      legs.push({ x: sh.x + lx * c + lz * sn, y: sh.y + 0.25, z: sh.z - lx * sn + lz * c, sx: 1 });
    }
  }
  const woolMat = toon({ color: '#fbf6ea', ramp: celRamp, rim: 0.5 });
  const faceMat = toon({ color: '#4a3b3f', ramp: celRamp, rim: 0.2 });
  const sheepList = sheep.map((sh) => ({ ...sh, sx: 1 }));
  group.add(instanced(bodyGeo, woolMat, sheepList));
  group.add(instanced(headGeo, faceMat, sheepList));
  group.add(instanced(legGeo, faceMat, legs, { shadow: false }));

  group.userData.counts = { bushes: bushes.length, orchard: orchardTrees.length, bales: bales.length, sheep: sheep.length };
  return group;
}

// ---- Hot air balloons ---------------------------------------------------------
function balloon(colours) {
  const g = new THREE.Group();
  const profile = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * 2 - 1; // -1 bottom .. 1 top
    const r = y < -0.55 ? 0.3 + (y + 1) * 1.2 : Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.1) / 1.1, 2))) * 1.05;
    profile.push(new THREE.Vector2(Math.max(r, 0.001), y));
  }
  const env = new THREE.LatheGeometry(profile, 24);
  // stripe vertex colours
  const posA = env.attributes.position;
  const cols = new Float32Array(posA.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < posA.count; i++) {
    const a = Math.atan2(posA.getZ(i), posA.getX(i));
    const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12 + 0.5) % 12;
    c.set(colours[seg % colours.length]).convertSRGBToLinear();
    cols.set([c.r, c.g, c.b], i * 3);
  }
  env.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const envMesh = new THREE.Mesh(env, toon({ color: '#ffffff', vertexColors: true, ramp: celRamp, rim: 0.5 }));
  envMesh.scale.setScalar(9);
  envMesh.position.y = 10;
  g.add(envMesh);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.3, 10), toon({ color: '#a8743f' }));
  basket.position.y = -2.2;
  g.add(basket);
  const ropeMat = toon({ color: '#6a5040' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 4), ropeMat);
    rope.position.set(Math.cos(a) * 1.4, -0.1, Math.sin(a) * 1.4);
    rope.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    g.add(rope);
  }
  const burner = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), toon({ color: '#ffd27a', emissive: '#ff9a3a' }));
  burner.position.y = 1.6;
  g.add(burner);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  addOutlines(g, 0.05);
  return g;
}

export function createBalloons() {
  const group = new THREE.Group();
  const schemes = [
    ['#e8735c', '#fbf3e2', '#f2c14e', '#fbf3e2'],
    ['#4f9fa0', '#f6e7c4', '#4f9fa0', '#e8735c'],
    ['#a48ad8', '#fbf3e2', '#f4a6b8', '#fbf3e2'],
    ['#f2c14e', '#e86f5a', '#f2c14e', '#7fb7d6'],
  ];
  const balloons = schemes.map((sc, i) => {
    const b = balloon(sc);
    group.add(b);
    return {
      b,
      cx: (rand() - 0.5) * 1600,
      cz: (rand() - 0.3) * 1600,
      r: 300 + rand() * 500,
      speed: (0.008 + rand() * 0.01) * (i % 2 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      alt: 150 + rand() * 170,
    };
  });
  group.userData.update = (dt, t) => {
    for (const o of balloons) {
      const a = o.phase + t * o.speed;
      const x = o.cx + Math.cos(a) * o.r;
      const z = o.cz + Math.sin(a) * o.r;
      const floor = Math.max(groundHeight(x, z), 0) + 60;
      o.b.position.set(x, Math.max(o.alt + Math.sin(t * 0.15 + o.phase) * 12, floor), z);
      o.b.rotation.y = t * 0.03 + o.phase;
    }
  };
  return group;
}

// ---- Birds --------------------------------------------------------------------
export function createBirds() {
  const flocks = [
    { cx: LAYOUT.plaza.x, cz: LAYOUT.plaza.z + 80, alt: 45, r: 70, n: 9, speed: 0.25 },
    { cx: LAYOUT.lighthouse.x, cz: LAYOUT.lighthouse.z, alt: 50, r: 50, n: 6, speed: -0.3 },
    { cx: -400, cz: 300, alt: 70, r: 120, n: 8, speed: 0.18 },
    { cx: 500, cz: 500, alt: 80, r: 90, n: 7, speed: -0.2 },
  ];
  const birds = [];
  for (const f of flocks) {
    for (let i = 0; i < f.n; i++) {
      birds.push({ f, off: rand() * Math.PI * 2, dr: (rand() - 0.5) * 30, dy: (rand() - 0.5) * 10, flap: rand() * 10, fs: 7 + rand() * 4 });
    }
  }
  const wing = new THREE.BufferGeometry();
  // one wing: a soft triangle out along +X
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, -0.25, 0, 0, 0.35, 1.1, 0, -0.05]), 3));
  wing.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: '#4a3b3f', side: THREE.DoubleSide, fog: true });
  const left = new THREE.InstancedMesh(wing, mat, birds.length);
  const right = new THREE.InstancedMesh(wing, mat, birds.length);
  left.frustumCulled = right.frustumCulled = false;
  const group = new THREE.Group();
  group.add(left, right);
  const body = new THREE.Matrix4();
  const w = new THREE.Matrix4();
  group.userData.update = (dt, t) => {
    birds.forEach((b, i) => {
      const a = b.off + t * b.f.speed;
      const r = b.f.r + b.dr;
      const x = b.f.cx + Math.cos(a) * r;
      const z = b.f.cz + Math.sin(a) * r;
      const ground = Math.max(groundHeight(x, z), 0);
      const y = ground + b.f.alt + b.dy + Math.sin(t * 0.7 + b.off) * 3;
      const heading = Math.atan2(-Math.sin(a) * Math.sign(b.f.speed), Math.cos(a) * Math.sign(b.f.speed));
      const glide = Math.sin(t * 0.5 + b.off) > 0.3;
      const flap = glide ? 0.15 : Math.sin(t * b.fs + b.flap) * 0.6;
      body.compose(p.set(x, y, z), q.setFromEuler(e.set(0, heading, 0)), s.set(1.4, 1.4, 1.4));
      w.makeRotationZ(flap);
      left.setMatrixAt(i, m4.multiplyMatrices(body, w));
      w.makeRotationZ(Math.PI - flap);
      right.setMatrixAt(i, m4.multiplyMatrices(body, w));
    });
    left.instanceMatrix.needsUpdate = true;
    right.instanceMatrix.needsUpdate = true;
  };
  return group;
}

// ---- Chimney smoke ------------------------------------------------------------
export function createSmoke(chimneys) {
  const PER = 7;
  const n = chimneys.length * PER;
  const geo = lumpyBall(1, 0.15, 2);
  const mat = toon({ color: '#f4efe8', ramp: celRamp, rim: 0.4 });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
  mesh.frustumCulled = false;
  const puffs = [];
  chimneys.forEach((c, ci) => {
    for (let k = 0; k < PER; k++) puffs.push({ c, age: (k / PER) * 6 + ci * 0.37, life: 6 });
  });
  mesh.userData.update = (dt, t) => {
    puffs.forEach((pf, i) => {
      pf.age += dt;
      if (pf.age > pf.life) pf.age -= pf.life;
      const k = pf.age / pf.life;
      const size = Math.sin(Math.min(k * 1.4, 1) * Math.PI * 0.5) * (1 - Math.pow(k, 3)) * (0.5 + k * 1.6);
      m4.compose(
        p.set(pf.c.x + k * k * 9 + Math.sin(t + i) * 0.3, pf.c.y + k * 9, pf.c.z + Math.sin(k * 4 + i) * 0.6),
        q.identity(),
        s.setScalar(Math.max(size, 0.001))
      );
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return mesh;
}
