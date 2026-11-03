// Things going about their day: boats out on the water, and little cars, a bus
// and hay carts pottering along the country roads. Seen from the air, it's
// these slow, purposeful movements that make the island feel lived in.
import * as THREE from 'three';
import { toon, celRamp, MergeBuilder } from '../materials.js';
import { groundHeight, RIVER } from './terrain.js';
import { LAYOUT } from './layout.js';
import { mulberry32 } from '../noise.js';

const rand = mulberry32(777);
const R = (a, b) => a + rand() * (b - a);
const pick = (a) => a[Math.floor(rand() * a.length)];

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2); // axle along X
const SPH = new THREE.IcosahedronGeometry(1, 1);
const M = (x, y, z, sx, sy, sz, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

const matCache = new Map();
const mat = (c) => {
  if (!matCache.has(c)) matCache.set(c, toon({ color: c, ramp: celRamp, rim: 0.35 }));
  return matCache.get(c);
};

// ---- Vehicles (local +Z is forward, origin on the ground) ---------------------
function wheels(b, w, z0, z1, r = 0.38) {
  for (const z of [z0, z1]) for (const s of [-1, 1]) b.add(CYL, mat('#3d3236'), M((s * w) / 2, r, z, 0.22, r, r));
}

function car(colour) {
  const b = new MergeBuilder();
  b.add(BOX, mat(colour), M(0, 0.75, 0, 1.7, 0.75, 3.6));
  b.add(BOX, mat(colour), M(0, 1.45, -0.3, 1.5, 0.7, 1.9));
  b.add(BOX, mat('#cfeff5'), M(0, 1.45, -0.3, 1.54, 0.42, 1.6));
  b.add(BOX, mat('#fbf3e2'), M(0, 0.6, 1.82, 1.2, 0.25, 0.1)); // bumper
  wheels(b, 1.7, -1.1, 1.1);
  return b.build({ outline: 0.04 });
}

function bus() {
  const b = new MergeBuilder();
  b.add(BOX, mat('#5e9a7a'), M(0, 1.1, 0, 2.2, 1.2, 6.4));
  b.add(BOX, mat('#f6eedc'), M(0, 2.1, -0.2, 2.2, 0.8, 5.8));
  b.add(BOX, mat('#cfeff5'), M(0, 2.1, -0.2, 2.24, 0.5, 5.4));
  b.add(BOX, mat('#f6eedc'), M(0, 2.55, -0.2, 2.0, 0.15, 5.6));
  b.add(BOX, mat('#5e9a7a'), M(0, 1.0, 3.5, 1.9, 0.9, 1.0)); // snub nose
  b.add(BOX, mat('#c9b48a'), M(0, 2.75, -0.8, 1.6, 0.3, 2.6)); // luggage on the roof
  wheels(b, 2.2, -2.2, 2.4, 0.5);
  return b.build({ outline: 0.05 });
}

function hayCart() {
  const b = new MergeBuilder();
  // cart
  b.add(BOX, mat('#9a6a44'), M(0, 0.95, -1.2, 1.7, 0.5, 2.8));
  b.add(SPH, mat('#e6c467'), M(0, 1.6, -1.2, 0.95, 0.75, 1.5));
  wheels(b, 1.9, -1.2, -1.2, 0.6);
  // shafts + horse
  b.add(BOX, mat('#7d5236'), M(0, 1.0, 1.1, 1.1, 0.1, 2.0));
  b.add(BOX, mat('#8a5a3a'), M(0, 1.45, 2.2, 0.75, 0.75, 1.7)); // body
  b.add(BOX, mat('#8a5a3a'), M(0, 2.0, 3.05, 0.4, 0.8, 0.45)); // neck
  b.add(BOX, mat('#8a5a3a'), M(0, 2.25, 3.35, 0.36, 0.38, 0.7)); // head
  b.add(BOX, mat('#4a3b3f'), M(0, 2.25, 2.95, 0.12, 0.5, 0.5)); // mane
  for (const [x, z] of [[-0.25, 1.6], [0.25, 1.6], [-0.25, 2.8], [0.25, 2.8]]) b.add(BOX, mat('#5e4235'), M(x, 0.55, z, 0.16, 1.1, 0.16));
  // farmer in a straw hat
  b.add(BOX, mat('#6f8fb8'), M(0, 1.6, 0.35, 0.5, 0.6, 0.4));
  b.add(SPH, mat('#f7d2b4'), M(0, 2.1, 0.35, 0.2, 0.22, 0.2));
  b.add(CYL, mat('#e6c467'), new THREE.Matrix4().compose(new THREE.Vector3(0, 2.28, 0.35), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(0.05, 0.42, 0.42)));
  return b.build({ outline: 0.04 });
}

function cyclist(colour) {
  const b = new MergeBuilder();
  for (const z of [-0.55, 0.55]) b.add(CYL, mat('#3d3236'), M(0, 0.35, z, 0.05, 0.35, 0.35));
  b.add(BOX, mat('#3d3236'), M(0, 0.6, 0, 0.06, 0.06, 1.1));
  b.add(BOX, mat(colour), M(0, 1.15, -0.05, 0.42, 0.65, 0.3));
  b.add(SPH, mat('#f7d2b4'), M(0, 1.62, 0, 0.17, 0.19, 0.17));
  b.add(BOX, mat('#a8743f'), M(0, 0.85, 0.7, 0.35, 0.25, 0.3)); // basket
  return b.build({ outline: 0.03 });
}

// ---- Following a road -----------------------------------------------------------
function makeTrack(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  return { points, cum, length: cum[cum.length - 1] };
}

function sampleTrack(tr, s, out) {
  s = Math.max(0, Math.min(tr.length - 0.01, s));
  let lo = 0;
  let hi = tr.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tr.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const a = tr.points[lo];
  const b = tr.points[hi];
  const u = (s - tr.cum[lo]) / (tr.cum[hi] - tr.cum[lo] || 1);
  out.x = a.x + (b.x - a.x) * u;
  out.z = a.z + (b.z - a.z) * u;
  out.dx = b.x - a.x;
  out.dz = b.z - a.z;
  return out;
}

/** Ground height along roads, riding up and over the humpback bridges. */
function roadHeight(x, z) {
  let y = groundHeight(x, z);
  const q = RIVER.query(x, z);
  if (q && q.d < q.width + 16) {
    const S = q.width * 2 + 14;
    const s = q.d;
    const deck = s < S / 4 ? 4.2 : s < S / 2 + 2 ? 4.2 - ((s - S / 4) / (S / 4 + 2)) * 0.6 : 3.6 - ((s - S / 2 - 2) / 7) * 2.6;
    y = Math.max(y, q.level + Math.max(deck, 1.0) + 0.05);
  }
  return y;
}

export function createTraffic() {
  const group = new THREE.Group();
  group.name = 'traffic';
  const roads = LAYOUT.roads.filter((r) => r.points.length > 10).map((r) => makeTrack(r.points));
  const streets = LAYOUT.streets.map((s) => makeTrack(s.points));
  const colours = ['#e8735c', '#4f9fa0', '#f2c14e', '#a48ad8', '#f6eedc', '#7fb7d6', '#c25b4a'];

  const movers = [];
  const add = (obj, track, speed) => {
    group.add(obj);
    obj.rotation.order = 'YXZ';
    movers.push({ obj, track, speed, s: rand() * track.length, dir: rand() < 0.5 ? 1 : -1, wait: 0 });
  };
  roads.forEach((tr, i) => {
    if (i === 0) add(bus(), tr, 7);
    add(car(pick(colours)), tr, R(8, 11));
    if (tr.length > 600 && rand() < 0.7) add(hayCart(), tr, R(2, 2.8));
    if (rand() < 0.5) add(cyclist(pick(colours)), tr, R(4, 5));
  });
  streets.forEach((tr) => {
    if (rand() < 0.6) add(cyclist(pick(colours)), tr, R(3, 4));
  });

  const p = {};
  const p2 = {};
  group.userData.update = (dt) => {
    for (const m of movers) {
      if (m.wait > 0) {
        m.wait -= dt;
        continue;
      }
      m.s += m.speed * m.dir * dt;
      if (m.s > m.track.length - 2 || m.s < 2) {
        // reached the end of the road: pause, then head back
        m.dir *= -1;
        m.s = Math.max(2, Math.min(m.track.length - 2, m.s));
        m.wait = R(3, 12);
      }
      sampleTrack(m.track, m.s, p);
      sampleTrack(m.track, m.s + m.dir * 3, p2);
      const hx = (p2.x - p.x) * 1;
      const hz = (p2.z - p.z) * 1;
      const l = Math.hypot(hx, hz) || 1;
      // keep to the right-hand side of the road
      const x = p.x - (hz / l) * 1.3;
      const z = p.z + (hx / l) * 1.3;
      const y = roadHeight(x, z);
      const yAhead = roadHeight(x + (hx / l) * 2, z + (hz / l) * 2);
      m.obj.position.set(x, y, z);
      m.obj.rotation.y = Math.atan2(hx, hz);
      m.obj.rotation.x = -Math.atan2(yAhead - y, 2) * 0.8;
    }
  };
  group.userData.count = movers.length;
  return group;
}

// ---- Boats ----------------------------------------------------------------------
function sailboat(sailColour) {
  const g = new THREE.Group();
  const b = new MergeBuilder();
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, mat('#fbf8f0'), M(0, 0.4, 0, 1.4, 1.1, 3.6));
  b.add(BOX, mat('#9a6a44'), M(0, 0.45, 0, 2.3, 0.12, 6.2));
  b.add(BOX, mat('#5e4235'), M(0, 4.2, 0.2, 0.12, 7.6, 0.12));
  g.add(b.build({ outline: 0.04 }));
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 7);
  sailShape.lineTo(3.4, 0.2);
  sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), toon({ color: sailColour, side: THREE.DoubleSide, rim: 0.4 }));
  sail.rotation.y = Math.PI / 2;
  sail.position.set(0, 0.9, 0.2);
  g.add(sail);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 6), new THREE.Vector2(-2.6, 0)])), sail.material);
  jib.rotation.y = Math.PI / 2;
  jib.position.set(0, 0.9, 0.35);
  g.add(jib);
  g.userData.sail = sail;
  return g;
}

function fishingBoat(colour) {
  const b = new MergeBuilder();
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  b.add(hull, mat(colour), M(0, 0.5, 0, 1.8, 1.3, 4.4));
  b.add(BOX, mat('#fbf8f0'), M(0, 0.55, 0, 2.9, 0.15, 7.4));
  b.add(BOX, mat('#fbf8f0'), M(0, 1.5, -1.2, 1.8, 1.8, 2.0)); // wheelhouse
  b.add(BOX, mat('#cfeff5'), M(0, 1.9, -1.2, 1.85, 0.5, 1.6));
  b.add(BOX, mat('#c8643f'), M(0, 2.5, -1.2, 2.1, 0.2, 2.3));
  b.add(BOX, mat('#5e4235'), M(0, 3.4, 1.2, 0.1, 5, 0.1));
  b.add(BOX, mat('#5e4235'), M(0, 4.4, 2.2, 0.08, 0.08, 2.2));
  return b.build({ outline: 0.04 });
}

function wakeMesh() {
  // a soft V of foam trailing behind
  const pos = [];
  const alpha = [];
  const L = 16;
  for (const s of [-1, 1]) {
    pos.push(s * 0.6, 0, 2.6, s * 1.9, 0, 1.4, s * 9, 0, -L, s * 6, 0, -L);
    alpha.push(0.6, 0.6, 0, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alpha, 1));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(1.0, 1.0, 1.0, vA * 0.55); }`,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.y = 0.08;
  mesh.renderOrder = 3;
  return mesh;
}

function seaLoop(cx, cz, rx, rz) {
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    if (groundHeight(cx + Math.cos(a) * rx, cz + Math.sin(a) * rz) > -4) return false;
  }
  return true;
}

export function createBoats() {
  const group = new THREE.Group();
  group.name = 'boats';
  const boats = [];
  const P = LAYOUT.plaza;
  const sails = ['#fbf3e2', '#fbf3e2', '#f4a6b8', '#f2c14e', '#e8735c', '#7fb7d6'];
  let tries = 0;
  while (boats.length < 9 && tries++ < 4000) {
    // fishing boats stay near the village harbour; yachts roam further
    const fishing = boats.length < 3;
    const a = rand() * Math.PI * 2;
    const r = fishing ? R(150, 700) : R(250, 2600);
    const ox = fishing ? P.x : 0;
    const oz = fishing ? P.z : -900;
    const cx = ox + Math.cos(a) * (fishing ? r : 2300 + r * 0.3);
    const cz = oz + Math.sin(a) * (fishing ? r : 2300 + r * 0.3);
    const rx = R(90, fishing ? 200 : 380);
    const rz = rx * R(0.4, 0.9);
    if (!seaLoop(cx, cz, rx, rz)) continue;
    if (boats.some((b) => Math.hypot(b.cx - cx, b.cz - cz) < 300)) continue;
    const obj = fishing ? fishingBoat(pick(['#c25b4a', '#3f8c8a', '#5b6f9c'])) : sailboat(pick(sails));
    obj.add(wakeMesh());
    obj.traverse((o) => o.isMesh && (o.castShadow = true));
    group.add(obj);
    const speed = fishing ? R(3, 4.5) : R(4, 6.5);
    boats.push({ obj, cx, cz, rx, rz, th: rand() * 6.28, w: (speed / ((rx + rz) / 2)) * (rand() < 0.5 ? 1 : -1), phase: rand() * 6, sail: !fishing });
  }
  group.userData.update = (dt, t) => {
    for (const b of boats) {
      b.th += b.w * dt;
      const x = b.cx + Math.cos(b.th) * b.rx;
      const z = b.cz + Math.sin(b.th) * b.rz;
      const dx = -Math.sin(b.th) * b.rx * Math.sign(b.w);
      const dz = Math.cos(b.th) * b.rz * Math.sign(b.w);
      b.obj.position.set(x, Math.sin(t * 1.2 + b.phase) * 0.15, z);
      b.obj.rotation.set(Math.sin(t * 0.8 + b.phase) * 0.03, Math.atan2(dx, dz), (b.sail ? -0.12 * Math.sign(b.w) : 0) + Math.sin(t * 1.1 + b.phase) * 0.05);
    }
  };
  group.userData.count = boats.length;
  return group;
}
