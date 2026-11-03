// Decides *where* everything goes: landmarks, roads, village streets, houses,
// farm fields. Pure data, computed once from the terrain. Other modules paint
// and build from LAYOUT.
import { groundHeight, flatness, WORLD, RIVER } from './terrain.js';
import { mulberry32, createNoise2D } from '../noise.js';

const rand = mulberry32(31337);
const wiggle = createNoise2D(8);
const R = (a, b) => a + rand() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** How far (x, z) is from the river's edge (negative = in the water). */
function riverGap(x, z) {
  const q = RIVER.query(x, z);
  return q ? q.d - q.width : Infinity;
}

// Region covered by the painted feature texture (paths, fields...)
export const REGION = { minX: -1700, minZ: -1500, size: 3600 };

function findSpot(cx, cz, radius, score, samples = 600) {
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < samples; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const s = score(x, z, groundHeight(x, z), flatness(x, z));
    if (s > bestScore) {
      bestScore = s;
      best = { x, z };
    }
  }
  best.y = groundHeight(best.x, best.z);
  return best;
}

/** Distance from (x, z) to the nearest sea/lake water, searched up to `max`. */
function waterDistance(x, z, max = 80) {
  for (let r = 4; r <= max; r += 4) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (groundHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) < 0) return r;
    }
  }
  return max;
}

// ---- Catmull-Rom smoothing ---------------------------------------------------
function smooth(points, step = 4) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/** A meandering country road from a to b (avoids the lake). */
function road(a, b, { meander = 35, width = 5, kind = 'dirt', seed = rand() * 100 } = {}) {
  const L = dist(a, b);
  const n = Math.max(2, Math.round(L / 45));
  const dx = (b.x - a.x) / L;
  const dz = (b.z - a.z) / L;
  const pts = [];
  const lake = WORLD.lake;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const taper = Math.sin(Math.PI * t);
    const off = wiggle(seed, t * L * 0.006) * meander * taper;
    const p = { x: a.x + dx * L * t - dz * off, z: a.z + dz * L * t + dx * off };
    const ld = Math.hypot(p.x - lake.x, p.z - lake.z);
    const keep = lake.radius + 30;
    if (ld < keep) {
      p.x = lake.x + ((p.x - lake.x) / ld) * keep;
      p.z = lake.z + ((p.z - lake.z) / ld) * keep;
    }
    pts.push(p);
  }
  return { points: smooth(pts), width, kind };
}

// ---- Landmarks ---------------------------------------------------------------
const af = WORLD.airfield;

const plaza = findSpot(-150, 1230, 160, (x, z, h, f) => (h > 10 && h < 60 ? f * 100 - Math.abs(h - 25) : -1e9));
const windmill = findSpot(950, 320, 300, (x, z, h, f) => (f > 0.86 ? h + f * 60 : -1e9));
const giantTree = findSpot(-650, -620, 320, (x, z, h, f) => (f > 0.88 ? h * 0.4 + f * 80 : -1e9));
const lighthouse = findSpot(-640, 1520, 180, (x, z, h, f) => {
  if (h < 5 || h > 45 || f < 0.75) return -1e9;
  return -waterDistance(x, z, 60) * 1.5 - Math.abs(h - 16) * 0.3;
}, 300);
const farmWest = findSpot(-470, 120, 120, (x, z, h, f) => f * 100 - Math.abs(h - 20) * 0.5);
const farmEast = findSpot(560, 420, 160, (x, z, h, f) => f * 100 - h * 0.2);

// ---- Roads -------------------------------------------------------------------
const roads = [];
roads.push(road({ x: af.x - 26, z: af.z + 150 }, plaza, { meander: 50 })); // airfield → village
roads.push(road({ x: af.x + 22, z: af.z - 60 }, windmill, { meander: 45 })); // → windmill hill
roads.push(road({ x: af.x - 10, z: af.z - af.runwayLength / 2 - 20 }, giantTree, { meander: 40 })); // → giant tree
roads.push(road(giantTree, { x: giantTree.x - 300, z: giantTree.z - 600 }, { meander: 60, width: 3.5 })); // into the hills
roads.push(road(plaza, lighthouse, { meander: 30, width: 4 })); // coast path to lighthouse
roads.push(road({ x: af.x + 22, z: af.z - 130 }, { x: WORLD.lake.x - WORLD.lake.radius * 0.7, z: WORLD.lake.z + 10 }, { meander: 10, width: 3 })); // lake lane
roads.push(road({ x: af.x - 26, z: af.z + 60 }, farmWest, { meander: 25, width: 4 }));
roads.push(road(windmill, farmEast, { meander: 25, width: 4 }));
roads.push(road(farmEast, { x: af.x + 22, z: af.z + 180 }, { meander: 30, width: 4 }));

// ---- Village: streets radiating from the plaza, houses lining them -------------
const PLAZA_R = 16;
const streets = [];
const houses = [];
let pier = null;

{
  // a street down to the sea for the pier: find the direction to the nearest shore
  let bestDir = 0;
  let bestLen = Infinity;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    for (let r = 10; r < 400; r += 5) {
      if (groundHeight(plaza.x + Math.cos(a) * r, plaza.z + Math.sin(a) * r) < -1.2) {
        if (r < bestLen) {
          bestLen = r;
          bestDir = a;
        }
        break;
      }
    }
  }
  const dirs = [bestDir];
  const roadDir = Math.atan2(roads[0].points.at(-8).z - plaza.z, roads[0].points.at(-8).x - plaza.x);
  for (let k = 0; k < 4; k++) {
    const a = bestDir + ((k + 1) / 5) * Math.PI * 2 + R(-0.3, 0.3);
    // skip directions that duplicate the incoming road
    if (Math.abs(Math.atan2(Math.sin(a - roadDir), Math.cos(a - roadDir))) < 0.5) continue;
    dirs.push(a);
  }

  dirs.forEach((a0, si) => {
    const pts = [];
    let a = a0;
    let x = plaza.x + Math.cos(a) * PLAZA_R * 0.6;
    let z = plaza.z + Math.sin(a) * PLAZA_R * 0.6;
    const maxLen = si === 0 ? bestLen + 20 : R(110, 190);
    for (let l = 0; l < maxLen; l += 4) {
      pts.push({ x, z });
      a += wiggle(si * 10, l * 0.01) * 0.06;
      x += Math.cos(a) * 4;
      z += Math.sin(a) * 4;
      const h = groundHeight(x, z);
      if (si === 0) {
        if (h < 0.4) break; // reached the water: pier goes here
      } else if (h < 3 || flatness(x, z) < 0.6) break;
    }
    if (pts.length > 3) streets.push({ points: pts, width: 4.5, kind: 'cobble', toSea: si === 0 });
  });

  const seaStreet = streets.find((s) => s.toSea);
  if (seaStreet) {
    const end = seaStreet.points.at(-1);
    const prev = seaStreet.points.at(-4);
    const ang = Math.atan2(end.z - prev.z, end.x - prev.x);
    pier = { x: end.x, z: end.z, angle: ang, length: 34 };
  }

  // houses along every street (and the village end of the airfield road)
  const roadInVillage = roads[0].points.filter((p) => dist(p, plaza) < 220);
  const allStreetPts = [...streets.flatMap((s) => s.points), ...roadInVillage];
  const lanes = [...streets.map((s) => s.points), roadInVillage];

  const tryHouse = (x, z, facing) => {
    const h = groundHeight(x, z);
    if (h < 2.5 || flatness(x, z) < 0.72) return false;
    if (riverGap(x, z) < 16) return false;
    // keep plinths short: reject spots where the ground under the house varies a lot
    let lo = Infinity;
    let hi = -Infinity;
    for (const [u, v] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) {
      const g = groundHeight(x + u, z + v);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    if (hi - lo > 5) return false;
    if (dist({ x, z }, plaza) < PLAZA_R + 9) return false;
    for (const o of houses) if (dist(o, { x, z }) < 13) return false;
    for (const p of allStreetPts) if (Math.hypot(p.x - x, p.z - z) < 7.5) return false;
    houses.push({ x, z, y: h, rot: facing, seed: rand() });
    return true;
  };

  for (const pts of lanes) {
    for (let i = 2; i < pts.length - 1; i += 3 + Math.floor(rand() * 2)) {
      const p = pts[i];
      const q = pts[i + 1];
      const ang = Math.atan2(q.z - p.z, q.x - p.x);
      for (const side of [-1, 1]) {
        if (rand() < 0.15) continue;
        const off = R(10, 12.5);
        const nx = -Math.sin(ang) * side;
        const nz = Math.cos(ang) * side;
        const x = p.x + nx * off;
        const z = p.z + nz * off;
        // house front (+Z local) faces back towards the street
        tryHouse(x, z, Math.atan2(-nx, -nz));
      }
    }
  }
  // a few cottages tucked behind, on the hillside
  for (let i = 0; i < 120 && houses.length < 55; i++) {
    const a = rand() * Math.PI * 2;
    const r = R(40, 200);
    const x = plaza.x + Math.cos(a) * r;
    const z = plaza.z + Math.sin(a) * r;
    tryHouse(x, z, Math.atan2(plaza.x - x, plaza.z - z));
  }
}

// ---- Farm fields: BSP patchwork in a few valley regions ------------------------
const CROPS = [
  ['wheat', 20], ['green', 24], ['pasture', 22], ['lavender', 8], ['ploughed', 8],
  ['rapeseed', 6], ['orchard', 7], ['sunflower', 3], ['meadow', 8],
];
const cropTotal = CROPS.reduce((s, c) => s + c[1], 0);
function pickCrop() {
  let r = rand() * cropTotal;
  for (const [c, w] of CROPS) if ((r -= w) < 0) return c;
  return 'wheat';
}

const allRoadPts = [...roads.flatMap((r) => r.points), ...streets.flatMap((s) => s.points)];
const roadHash = new Map();
for (const p of allRoadPts) {
  const k = `${Math.floor(p.x / 20)},${Math.floor(p.z / 20)}`;
  if (!roadHash.has(k)) roadHash.set(k, []);
  roadHash.get(k).push(p);
}
export function nearRoad(x, z, d) {
  const cx = Math.floor(x / 20);
  const cz = Math.floor(z / 20);
  const r = Math.ceil(d / 20);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const list = roadHash.get(`${cx + i},${cz + j}`);
      if (!list) continue;
      for (const p of list) if (Math.hypot(p.x - x, p.z - z) < d) return true;
    }
  }
  return false;
}

const sites = [
  { ...windmill, r: 30 }, { ...giantTree, r: 45 }, { ...lighthouse, r: 30 },
  { ...farmWest, r: 40 }, { ...farmEast, r: 40 }, { ...plaza, r: 240 },
];

const fields = [];
function fieldOk(cx, cz, w, d, angle) {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const hs = [];
  for (const [u, v] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0.45], [0, -0.45], [0.45, 0], [-0.45, 0]]) {
    const x = cx + (u * w) * ca - (v * d) * sa;
    const z = cz + (u * w) * sa + (v * d) * ca;
    const h = groundHeight(x, z);
    if (h < 3.5) return false;
    if (Math.abs(x - af.x) < 70 && Math.abs(z - af.z) < af.runwayLength / 2 + 60) return false;
    if (Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) < WORLD.lake.radius + 15) return false;
    if (flatness(x, z) < 0.9) return false;
    if (nearRoad(x, z, 9)) return false;
    if (riverGap(x, z) < 14) return false;
    for (const s of sites) if (Math.hypot(x - s.x, z - s.z) < s.r) return false;
    hs.push(h);
  }
  return Math.max(...hs) - Math.min(...hs) < 30;
}

function split(region, x0, z0, w, d, depth) {
  const big = Math.max(w, d);
  if (big < 140 && (big < 70 || rand() < 0.35 || depth > 6)) {
    const gap = 5;
    const cu = x0 + w / 2;
    const cv = z0 + d / 2;
    const ca = Math.cos(region.angle);
    const sa = Math.sin(region.angle);
    const cx = region.x + cu * ca - cv * sa;
    const cz = region.z + cu * sa + cv * ca;
    const fw = w - gap;
    const fd = d - gap;
    if (fieldOk(cx, cz, fw, fd, region.angle)) {
      fields.push({ x: cx, z: cz, w: fw, d: fd, angle: region.angle, crop: pickCrop(), stripe: rand() < 0.5 ? 0 : 1, seed: rand() });
    }
    return;
  }
  const t = R(0.35, 0.65);
  if (w > d) {
    split(region, x0, z0, w * t, d, depth + 1);
    split(region, x0 + w * t, z0, w * (1 - t), d, depth + 1);
  } else {
    split(region, x0, z0, w, d * t, depth + 1);
    split(region, x0, z0 + d * t, w, d * (1 - t), depth + 1);
  }
}

for (const region of [
  { x: -560, z: 260, w: 720, d: 1000, angle: 0.18 },
  { x: 600, z: 560, w: 760, d: 800, angle: -0.32 },
  { x: -130, z: 720, w: 600, d: 460, angle: 0.08 },
  { x: 380, z: -560, w: 520, d: 420, angle: 0.4 },
]) {
  split(region, -region.w / 2, -region.d / 2, region.w, region.d, 0);
}

// ---- Reservation grid: where trees must not grow ------------------------------
const CELL = 4;
const GRID = Math.ceil(REGION.size / CELL);
const reserved = new Uint8Array(GRID * GRID);
function stamp(x, z, r) {
  const i0 = Math.floor((x - r - REGION.minX) / CELL);
  const i1 = Math.ceil((x + r - REGION.minX) / CELL);
  const j0 = Math.floor((z - r - REGION.minZ) / CELL);
  const j1 = Math.ceil((z + r - REGION.minZ) / CELL);
  for (let j = Math.max(j0, 0); j <= Math.min(j1, GRID - 1); j++) {
    for (let i = Math.max(i0, 0); i <= Math.min(i1, GRID - 1); i++) {
      const cx = REGION.minX + (i + 0.5) * CELL;
      const cz = REGION.minZ + (j + 0.5) * CELL;
      if (Math.hypot(cx - x, cz - z) <= r) reserved[j * GRID + i] = 1;
    }
  }
}
for (const p of allRoadPts) stamp(p.x, p.z, 7);
// keep the water clear; trees may line the banks
for (let i = 0; i < RIVER.points.length; i += 2) stamp(RIVER.points[i].x, RIVER.points[i].z, RIVER.width[i] + 4);

// ---- Bridges: wherever a road or street crosses the river ---------------------
const bridges = [];
for (const r of [...roads, ...streets]) {
  let best = null;
  const flush = () => {
    if (best && !bridges.some((b) => dist(b, best) < 60)) bridges.push(best);
    best = null;
  };
  r.points.forEach((p, i) => {
    const q = RIVER.query(p.x, p.z);
    if (!q || q.d > q.width + 6) return flush();
    if (!best || q.d < best.d) {
      const a = r.points[Math.max(i - 2, 0)];
      const b = r.points[Math.min(i + 2, r.points.length - 1)];
      best = { x: p.x, z: p.z, d: q.d, angle: Math.atan2(b.z - a.z, b.x - a.x), level: q.level, span: q.width * 2 + 14, width: r.width + 1.5, kind: r.kind };
    }
  });
  flush();
}
for (const h of houses) stamp(h.x, h.z, 9);
stamp(plaza.x, plaza.z, PLAZA_R + 6);
for (const s of sites) if (s.r < 100) stamp(s.x, s.z, s.r * 0.7);
for (const f of fields) {
  const ca = Math.cos(f.angle);
  const sa = Math.sin(f.angle);
  const step = CELL * 0.8;
  for (let u = -f.w / 2 - 2; u <= f.w / 2 + 2; u += step) {
    for (let v = -f.d / 2 - 2; v <= f.d / 2 + 2; v += step) {
      const x = f.x + u * ca - v * sa;
      const z = f.z + u * sa + v * ca;
      const i = Math.floor((x - REGION.minX) / CELL);
      const j = Math.floor((z - REGION.minZ) / CELL);
      if (i >= 0 && j >= 0 && i < GRID && j < GRID) reserved[j * GRID + i] = 1;
    }
  }
}

export function isReserved(x, z) {
  const i = Math.floor((x - REGION.minX) / CELL);
  const j = Math.floor((z - REGION.minZ) / CELL);
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return false;
  return reserved[j * GRID + i] === 1;
}

export const LAYOUT = {
  plaza: { ...plaza, r: PLAZA_R },
  windmill,
  giantTree,
  lighthouse,
  farms: [farmWest, farmEast],
  roads,
  streets,
  houses,
  pier,
  fields,
  bridges,
};

