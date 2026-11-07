import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, createNoise2D } from '../noise.js';
import { toon, celRamp } from '../materials.js';
import { WORLD, RIVER, groundHeight, forestAt, flatness } from './terrain.js';
import { isReserved } from './layout.js';
import { withFarLod } from './lod.js';

const noise = createNoise2D(5);

function lumpy(geo, amt, freq, seed = 0) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise(v.x * freq + seed, v.z * freq + v.y * freq * 0.7);
    v.addScaledVector(v.clone().normalize(), n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

function roundCanopyGeo() {
  const a = lumpy(new THREE.IcosahedronGeometry(2.6, 1), 0.3, 0.9).translate(0, 4.8, 0);
  const b = lumpy(new THREE.IcosahedronGeometry(1.8, 1), 0.2, 1.1, 3).translate(1.4, 3.9, 0.5);
  const c = lumpy(new THREE.IcosahedronGeometry(1.9, 1), 0.2, 1.1, 7).translate(-1.2, 4.2, -0.7);
  const g = mergeGeometries([a, b, c]);
  g.computeVertexNormals();
  return g;
}

// far-away stand-ins: one lump instead of three, one cone instead of three
function farCanopyGeo() {
  const g = lumpy(new THREE.IcosahedronGeometry(2.9, 1), 0.3, 0.9).translate(0, 4.5, 0);
  g.computeVertexNormals();
  return g;
}
const farPineGeo = () => new THREE.ConeGeometry(2.3, 7.0, 6).translate(0, 5.0, 0);

function pineGeo() {
  const a = new THREE.ConeGeometry(2.3, 4.2, 8).translate(0, 3.6, 0);
  const b = new THREE.ConeGeometry(1.7, 3.4, 8).translate(0, 5.6, 0);
  const c = new THREE.ConeGeometry(1.0, 2.4, 8).translate(0, 7.3, 0);
  return mergeGeometries([a, b, c]);
}

const ROUND_COLOURS = ['#4f9447', '#5ea54c', '#3f7f43', '#76b450', '#5b9a52', '#468a4f'];
const ACCENT_COLOURS = ['#e3b25a', '#f2b8c6', '#d98e4f']; // autumn gold, blossom pink, rust
const PINE_COLOURS = ['#2f6a4a', '#3a7652', '#2a5f45', '#3f7a58'];

/**
 * Scatter trees across the island. Trees are bucketed into spatial chunks so
 * the renderer can frustum-cull them (and skip them in the shadow pass).
 */
export function createTrees({ attempts = 150000, chunkSize = 750 } = {}) {
  const rand = mulberry32(2024);
  const af = WORLD.airfield;
  const lake = WORLD.lake;
  const half = WORLD.size / 2;

  const chunks = new Map();
  const getChunk = (x, z) => {
    const key = `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;
    if (!chunks.has(key)) chunks.set(key, { round: [], pine: [] });
    return chunks.get(key);
  };

  const place = (x, z, kind, scale, colour) => {
    const y = groundHeight(x, z);
    getChunk(x, z)[kind].push({ x, y, z, scale, colour, kind, rot: rand() * Math.PI * 2, refs: [] });
  };

  for (let i = 0; i < attempts; i++) {
    const x = (rand() - 0.5) * WORLD.size * 0.95;
    const z = (rand() - 0.5) * WORLD.size * 0.95;
    // keep the airfield clear
    if (Math.abs(x - af.x) < 85 && Math.abs(z - af.z) < af.runwayLength / 2 + 70) continue;
    if (isReserved(x, z)) continue;
    const h = groundHeight(x, z);
    if (h < 2.5 || h > 330) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.radius * 0.8) continue;
    const flat = flatness(x, z);
    const f = forestAt(x, z);
    const p = f * 0.7 + 0.01;
    if (rand() > p) continue;
    const pineChance = THREE.MathUtils.smoothstep(h, 70, 200) * 0.9 + (noise(x / 400, z / 400) > 0.45 ? 0.3 : 0);
    const isPine = rand() < pineChance;
    if (flat < (isPine ? 0.7 : 0.8)) continue;
    const scale = (isPine ? 1.0 : 0.9) + rand() * 0.9;
    let colour;
    if (isPine) colour = PINE_COLOURS[Math.floor(rand() * PINE_COLOURS.length)];
    else if (rand() < 0.04) colour = ACCENT_COLOURS[Math.floor(rand() * ACCENT_COLOURS.length)];
    else colour = ROUND_COLOURS[Math.floor(rand() * ROUND_COLOURS.length)];
    place(x, z, isPine ? 'pine' : 'round', scale, colour);
  }

  // Trees lining the river in loose, uneven rows (with gaps for the view)
  const RP = RIVER.points;
  for (let i = 4; i < RP.length - 4; i += 2) {
    const a = RP[i - 1];
    const b = RP[i + 1];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const nx = -(b.z - a.z) / l;
    const nz = (b.x - a.x) / l;
    for (const side of [-1, 1]) {
      if (noise(i * 0.07 + side * 13, 3.1) < -0.15) continue; // open stretches
      if (rand() > 0.55) continue;
      const off = RIVER.width[i] + 7 + rand() * 9;
      const x = RP[i].x + nx * side * off;
      const z = RP[i].z + nz * side * off;
      if (isReserved(x, z) || groundHeight(x, z) < 1) continue;
      const tall = rand() < 0.3;
      place(x, z, tall ? 'pine' : 'round', tall ? 1.1 + rand() * 0.5 : 0.9 + rand() * 0.6,
        tall ? PINE_COLOURS[Math.floor(rand() * PINE_COLOURS.length)] : ROUND_COLOURS[Math.floor(rand() * ROUND_COLOURS.length)]);
    }
  }

  // A few friendly hand-placed trees around the airfield buildings
  const nearby = [
    [-95, 40], [-110, 70], [-88, 100], [-120, 120], [-100, 190], [75, -60], [90, -20],
    [95, 30], [-90, -80], [-105, -140], [88, 160], [100, 210], [-80, 230],
  ];
  for (const [x, z] of nearby) {
    place(x + af.x, z + af.z, 'round', 1.0 + rand() * 0.5, ROUND_COLOURS[Math.floor(rand() * 6)]);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 3.4, 6).translate(0, 1.7, 0);
  const roundGeo = roundCanopyGeo();
  const pineG = pineGeo();
  const pineTrunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 2.2, 6).translate(0, 1.1, 0);
  const roundFar = farCanopyGeo();
  const pineFar = farPineGeo();

  const trunkMat = toon({ color: '#8b5e3c', ramp: celRamp, rim: 0.1 });
  const canopyMat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.45, rimColor: '#fff6c8', wind: 0.02 });
  const pineMat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.3, rimColor: '#e8ffd8', wind: 0.012 });

  const group = new THREE.Group();
  group.name = 'trees';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  let total = 0;

  const build = (list, geo, mat, withColour, farGeo) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      p.set(t.x, t.y - 0.3, t.z);
      s.setScalar(t.scale);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
      t.refs.push({ mesh, i }); // so a tree can be shaken later
      if (withColour) {
        col.set(t.colour);
        col.offsetHSL(0, 0, (rand() - 0.5) * 0.05);
        mesh.setColorAt(i, col);
      }
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    if (farGeo) group.add(...withFarLod(mesh, farGeo));
  };

  for (const c of chunks.values()) {
    build(c.round, trunkGeo, trunkMat, false);
    build(c.round, roundGeo, canopyMat, true, roundFar);
    build(c.pine, pineTrunkGeo, trunkMat, false);
    build(c.pine, pineG, pineMat, true, pineFar);
    total += c.round.length + c.pine.length;
  }
  group.userData.count = total;
  group.userData.list = [...chunks.values()].flatMap((c) => [...c.round, ...c.pine]);
  return group;
}

/** Little wildflowers dotted through the meadows near the airfield. */
export function createFlowers(count = 2500) {
  const rand = mulberry32(77);
  const af = WORLD.airfield;
  const geo = new THREE.IcosahedronGeometry(0.35, 0);
  const mat = toon({ color: '#ffffff', ramp: celRamp, rim: 0.2 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const colours = ['#ffffff', '#ffe27a', '#f7a8c4', '#c9a8f0', '#ff9a7a'];
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  while (n < count) {
    // clumps
    const cx = af.x + (rand() - 0.5) * 700;
    const cz = af.z + (rand() - 0.5) * 900;
    if (Math.abs(cx - af.x) < 22) continue; // not on the runway
    const c = colours[Math.floor(rand() * colours.length)];
    const k = 15 + Math.floor(rand() * 30);
    for (let i = 0; i < k && n < count; i++) {
      const x = cx + (rand() - 0.5) * 18;
      const z = cz + (rand() - 0.5) * 18;
      if (Math.abs(x - af.x) < 16 || isReserved(x, z)) continue;
      const y = groundHeight(x, z);
      if (y < 2) continue;
      const sc = 0.6 + rand() * 0.8;
      m4.makeScale(sc, sc * 0.7, sc).setPosition(x, y + 0.15, z);
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, col.set(c));
      n++;
    }
  }
  mesh.computeBoundingSphere();
  mesh.name = 'flowers';
  return mesh;
}
