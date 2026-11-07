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
  const bodies = instanced(bodyGeo, woolMat, sheepList);
  const heads = instanced(headGeo, faceMat, sheepList);
  const legMesh = instanced(legGeo, faceMat, legs, { shadow: false });
  group.add(bodies, heads, legMesh);
  for (const m of [bodies, heads, legMesh]) m.frustumCulled = false; // they wander off their bounds

  // buzz them low and they bound away in a fluster, then settle and graze again
  let baaTimer = 0;
  const placeSheep = (sh, i, hop, tilt) => {
    m4.compose(p.set(sh.x, sh.y + hop, sh.z), q.setFromEuler(e.set(tilt, sh.ry, 0)), s.set(1, 1, 1));
    bodies.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
    const c = Math.cos(sh.ry);
    const sn = Math.sin(sh.ry);
    [[-0.3, -0.5], [0.3, -0.5], [-0.3, 0.5], [0.3, 0.5]].forEach(([lx, lz], k) => {
      // legs tuck up a little mid-hop
      m4.compose(p.set(sh.x + lx * c + lz * sn, sh.y + 0.25 + hop * 0.92, sh.z - lx * sn + lz * c), q.identity(), s.set(1, hop > 0.1 ? 0.7 : 1, 1));
      legMesh.setMatrixAt(i * 4 + k, m4);
    });
  };
  group.userData.update = (dt, t, play) => {
    if (!play) return;
    const P = play.flight.position;
    baaTimer -= dt;
    let scared = 0;
    let moved = false;
    sheep.forEach((sh, i) => {
      const dx = sh.x - P.x;
      const dz = sh.z - P.z;
      const d2 = dx * dx + dz * dz;
      if (!sh.run && d2 < 45 * 45 && P.y - sh.y < 28 && play.flight.speed > 8) {
        const d = Math.sqrt(d2) || 1;
        const spd = 4 + Math.random() * 3;
        const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * 1.2;
        sh.run = 2.2 + Math.random() * 0.8;
        sh.runFull = sh.run;
        sh.vx = Math.sin(a) * spd;
        sh.vz = Math.cos(a) * spd;
        sh.delay = (d / 45) * 0.35 + Math.random() * 0.15;
        sh.hopPh = Math.random() * Math.PI;
        scared++;
      }
      if (!sh.run) return;
      if (sh.delay > 0) {
        sh.delay -= dt;
        return;
      }
      sh.run = Math.max(0, sh.run - dt);
      const k = sh.run / sh.runFull;
      sh.x += sh.vx * k * dt;
      sh.z += sh.vz * k * dt;
      sh.y = groundHeight(sh.x, sh.z);
      const target = Math.atan2(sh.vx, sh.vz);
      let dy = target - sh.ry;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      sh.ry += dy * Math.min(1, dt * 8);
      sh.hopPh += dt * 11;
      const hop = Math.abs(Math.sin(sh.hopPh)) * 0.8 * Math.min(1, k * 1.5);
      placeSheep(sh, i, hop, -Math.cos(sh.hopPh) * 0.25 * k);
      if (sh.run === 0) {
        placeSheep(sh, i, 0, 0);
      }
      moved = true;
    });
    if (moved) {
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      legMesh.instanceMatrix.needsUpdate = true;
    }
    if (scared && baaTimer <= 0) {
      baaTimer = 2.5;
      play.sound.baa?.();
      if (scared > 3) setTimeout(() => play.sound.baa?.(1.2), 350);
      play.emit('sheep', { count: scared });
    }
  };

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
  // everything under the envelope hangs off one "rig", so it can drift down on its own
  const rig = new THREE.Group();
  g.add(rig);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.3, 10), toon({ color: '#a8743f' }));
  basket.position.y = -2.2;
  rig.add(basket);
  // a little balloonist peeking over the rim
  const pilot = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), toon({ color: '#f3c9a6' }));
  head.position.y = -0.95;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.28, 10), toon({ color: colours[0] }));
  hat.position.y = -0.62;
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 10), toon({ color: colours[2] ?? '#5b6f9c' }));
  coat.position.y = -1.55;
  pilot.add(head, hat, coat);
  pilot.position.x = 0.35;
  rig.add(pilot);
  const ropeMat = toon({ color: '#6a5040' });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 4), ropeMat);
    rope.position.set(Math.cos(a) * 1.4, -0.1, Math.sin(a) * 1.4);
    rope.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    rig.add(rope);
  }
  const burner = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), toon({ color: '#ffd27a', emissive: '#ff9a3a' }));
  burner.position.y = 1.6;
  rig.add(burner);
  // an emergency parachute, folded away until it's needed
  const chute = new THREE.Group();
  const canopyGeo = new THREE.SphereGeometry(3.4, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.4);
  const cc = canopyGeo.attributes.position;
  const ccol = new Float32Array(cc.count * 3);
  for (let i = 0; i < cc.count; i++) {
    const seg = Math.floor(((Math.atan2(cc.getZ(i), cc.getX(i)) + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 2;
    c.set(seg ? colours[0] : '#fbf3e2').convertSRGBToLinear();
    ccol.set([c.r, c.g, c.b], i * 3);
  }
  canopyGeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const canopy = new THREE.Mesh(canopyGeo, toon({ color: '#ffffff', vertexColors: true, ramp: celRamp, rim: 0.4, side: THREE.DoubleSide }));
  canopy.position.y = 3.2;
  chute.add(canopy);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.6, 3), ropeMat);
    line.position.set(Math.cos(a) * 1.5, 1.4, Math.sin(a) * 1.5);
    line.rotation.set(Math.sin(a) * -0.4, 0, Math.cos(a) * 0.4);
    chute.add(line);
  }
  chute.position.y = 1.4;
  chute.visible = false;
  rig.add(chute);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  addOutlines(g, 0.05);
  g.userData = { env: envMesh, rig, chute, pilot };
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
      colours: sc,
      state: 'fly',
      cx: (rand() - 0.5) * 1600,
      cz: (rand() - 0.3) * 1600,
      r: 300 + rand() * 500,
      speed: (0.008 + rand() * 0.01) * (i % 2 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      alt: 150 + rand() * 170,
    };
  });
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  /** Pop! The envelope zips off like a let-go party balloon; the basket parachutes down. */
  function pop(o, play) {
    const { env, rig, chute } = o.b.userData;
    o.state = 'popped';
    o.timer = 0;
    const centre = env.getWorldPosition(tmp).clone();
    centre.y -= 1;
    play.fx.flutter(centre, { n: 90, colours: [...o.colours, '#ffffff'], size: 0.9, speed: 16, spread: 7, life: 6, vel: tmp2.copy(play.flight.velocity).multiplyScalar(0.25) });
    play.fx.puff(centre, { n: 14, colour: ['#ffffff', '#fff6e4'], size: 3.5, spread: 6, speed: 9, life: 1.1 });
    group.attach(env);
    group.attach(rig);
    o.zip = { v: new THREE.Vector3(0, 18, 0).addScaledVector(play.flight.velocity, 0.3), turn: 0, t: 0, spin: new THREE.Vector3() };
    rig.userData.vy = -6;
    chute.visible = true;
    chute.scale.setScalar(0.01);
    play.sound.pop?.();
    play.sound.deflate?.(2.6);
    play.flight.speed *= 0.93;
    play.emit('pop');
  }

  function updatePopped(o, dt, t, play) {
    const { env, rig, chute, pilot } = o.b.userData;
    o.timer += dt;
    // the envelope: darting about, shrinking, spluttering
    const z = o.zip;
    if (env.visible) {
      z.t += dt;
      z.turn -= dt;
      if (z.turn <= 0) {
        z.turn = 0.08 + Math.random() * 0.18;
        tmp.randomDirection();
        tmp.y = Math.abs(tmp.y) * 0.8 + 0.25;
        z.target = tmp.normalize().multiplyScalar(26 + Math.random() * 18).clone();
        z.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
      }
      z.v.lerp(z.target, 1 - Math.exp(-9 * dt));
      env.position.addScaledVector(z.v, dt);
      env.rotation.x += z.spin.x * dt;
      env.rotation.y += z.spin.y * dt;
      env.rotation.z += z.spin.z * dt;
      const k = Math.min(z.t / 2.6, 1);
      const size = 9 * (1 - k * 0.85);
      const wob = Math.sin(t * 38) * 0.18 * (1 - k);
      env.scale.set(size * (1 + wob), size * (1 - wob), size * (1 + wob));
      if (Math.random() < dt * 14) play.fx.puff(env.position, { n: 1, colour: '#ffffff', size: 1.2, speed: 1, life: 0.6 });
      if (k >= 1) {
        env.visible = false;
        play.fx.puff(env.position, { n: 8, colour: ['#ffffff', o.colours[0]], size: 2, speed: 6, life: 0.9 });
      }
    }
    // the basket: a little drop, then the chute pops open and it sways down
    const open = Math.min(Math.max((o.timer - 0.35) / 0.5, 0), 1);
    const boing = open < 1 ? open * (1 + Math.sin(open * Math.PI) * 0.4) : 1;
    chute.scale.set(Math.max(boing, 0.01), Math.max(boing * (0.8 + Math.sin(t * 2.2) * 0.04), 0.01), Math.max(boing, 0.01));
    const gh = Math.max(groundHeight(rig.position.x, rig.position.z), 0);
    const floor = gh + 2.85;
    if (rig.position.y > floor) {
      const terminal = open > 0.5 ? -4.2 : -14;
      rig.userData.vy += (terminal - rig.userData.vy) * Math.min(1, dt * (open > 0.5 ? 3 : 1));
      rig.position.y = Math.max(floor, rig.position.y + rig.userData.vy * dt);
      rig.rotation.z = Math.sin(t * 1.3 + o.phase) * 0.12 * open;
      rig.rotation.x = Math.sin(t * 0.9 + o.phase) * 0.08 * open;
      rig.position.x += Math.sin(t * 0.4 + o.phase) * dt * 1.2;
      pilot.rotation.z = Math.sin(t * 6) * 0.15; // a nervous wobble
    } else {
      // landed: the chute sighs down over the basket
      o.landed = (o.landed ?? 0) + dt;
      const f = Math.min(o.landed / 1.6, 1);
      chute.scale.y = Math.max(0.01, 1 - f * 0.8);
      chute.rotation.z = f * 0.9;
      rig.rotation.z *= 1 - f;
      rig.rotation.x *= 1 - f;
      pilot.rotation.z = 0;
      if (gh <= 0) rig.position.y = floor + Math.sin(t * 1.1) * 0.15; // bobbing on the sea
    }
  }

  function reinflate(o) {
    const { env, rig, chute, pilot } = o.b.userData;
    o.b.add(env);
    o.b.add(rig);
    env.position.set(0, 10, 0);
    env.rotation.set(0, 0, 0);
    env.visible = true;
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    chute.visible = false;
    chute.rotation.set(0, 0, 0);
    pilot.rotation.set(0, 0, 0);
    o.landed = 0;
    o.state = 'inflate';
    o.timer = 0;
  }

  group.userData.update = (dt, t, play) => {
    for (const o of balloons) {
      const a = o.phase + t * o.speed;
      const x = o.cx + Math.cos(a) * o.r;
      const z = o.cz + Math.sin(a) * o.r;
      const floor = Math.max(groundHeight(x, z), 0) + 60;
      o.b.position.set(x, Math.max(o.alt + Math.sin(t * 0.15 + o.phase) * 12, floor), z);
      o.b.rotation.y = t * 0.03 + o.phase;
      if (!play) continue;
      const P = play.flight.position;
      if (o.state === 'fly') {
        // envelope ≈ a 9.5 m ball centred 9 m above the basket ring; the basket hangs below
        const env = tmp.set(x, o.b.position.y + 9, z);
        const bask = tmp2.set(x, o.b.position.y - 2.2, z);
        if (P.distanceTo(env) < 11.5 || P.distanceTo(bask) < 3.2) pop(o, play);
      } else if (o.state === 'popped') {
        updatePopped(o, dt, t, play);
        // a fresh balloon floats back once you're well away
        if (o.timer > 40 && P.distanceTo(o.b.position) > 400) reinflate(o);
      } else if (o.state === 'inflate') {
        o.timer += dt;
        const k = Math.min(o.timer / 2.5, 1);
        const sz = 9 * (1 - Math.pow(1 - k, 3)) * (1 + Math.sin(k * Math.PI * 2.5) * 0.12 * (1 - k));
        o.b.userData.env.scale.setScalar(Math.max(sz, 0.01));
        if (k >= 1) o.state = 'fly';
      }
    }
  };
  group.userData.balloons = balloons;
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
      birds.push({ f, off: rand() * Math.PI * 2, dr: (rand() - 0.5) * 30, dy: (rand() - 0.5) * 10, flap: rand() * 10, fs: 7 + rand() * 4, o: new THREE.Vector3(), ov: new THREE.Vector3() });
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
  const away = new THREE.Vector3();
  let flurryTimer = 0;
  group.userData.update = (dt, t, play) => {
    const P = play?.flight.position;
    flurryTimer -= dt;
    let startled = 0;
    birds.forEach((b, i) => {
      const a = b.off + t * b.f.speed;
      const r = b.f.r + b.dr;
      const x = b.f.cx + Math.cos(a) * r;
      const z = b.f.cz + Math.sin(a) * r;
      const ground = Math.max(groundHeight(x, z), 0);
      const y = ground + b.f.alt + b.dy + Math.sin(t * 0.7 + b.off) * 3;
      // scatter from the plane, then drift back into the flock on a soft spring
      if (P) {
        away.set(x, y, z).add(b.o).sub(P);
        const d = away.length();
        if (d < 32) {
          if (b.ov.lengthSq() < 25) startled++;
          away.normalize();
          away.y += 0.5;
          b.ov.addScaledVector(away, (1 - d / 32) * 90 * dt);
        }
      }
      b.ov.addScaledVector(b.o, -0.35 * dt).multiplyScalar(Math.exp(-0.7 * dt));
      b.o.addScaledVector(b.ov, dt);
      const fluster = Math.min(b.ov.length() / 8, 1);
      let heading = Math.atan2(-Math.sin(a) * Math.sign(b.f.speed), Math.cos(a) * Math.sign(b.f.speed));
      if (fluster > 0.3) heading = Math.atan2(b.ov.x, b.ov.z);
      const glide = Math.sin(t * 0.5 + b.off) > 0.3 && fluster < 0.2;
      const flap = glide ? 0.15 : Math.sin(t * b.fs * (1 + fluster * 1.5) + b.flap) * (0.6 + fluster * 0.3);
      body.compose(p.set(x + b.o.x, y + b.o.y, z + b.o.z), q.setFromEuler(e.set(0, heading, 0)), s.set(1.4, 1.4, 1.4));
      w.makeRotationZ(flap);
      left.setMatrixAt(i, m4.multiplyMatrices(body, w));
      w.makeRotationZ(Math.PI - flap);
      right.setMatrixAt(i, m4.multiplyMatrices(body, w));
    });
    left.instanceMatrix.needsUpdate = true;
    right.instanceMatrix.needsUpdate = true;
    if (startled > 1 && flurryTimer <= 0) {
      flurryTimer = 4;
      play.sound.flurry?.(Math.min(startled / 6, 1));
      play.emit('birds', { count: startled });
    }
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
