// A river that winds from the mountains, past the giant tree and the airfield,
// down to the sea beside the village. Its course is found the way water would:
// a least-cost path that prefers valley floors and hates climbing. The terrain is
// then carved around it (channel, banks, and a gorge where it has to cut a ridge).

const CELL = 40;

/** Plan the river over `baseHeight(x, z)`. Returns the course + carving helpers. */
export function planRiver(baseHeight, { size, avoid = () => 0 }) {
  const half = size / 2;
  const N = Math.floor(size / CELL);
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = baseHeight(-half + (i + 0.5) * CELL, -half + (j + 0.5) * CELL);
  const idx = (x, z) => [Math.floor((x + half) / CELL), Math.floor((z + half) / CELL)];
  const pos = (i, j) => ({ x: -half + (i + 0.5) * CELL, z: -half + (j + 0.5) * CELL });

  // Dijkstra between waypoints; `goal(i, j)` decides when we've arrived.
  function route(from, goal) {
    const dist = new Float32Array(N * N).fill(Infinity);
    const prev = new Int32Array(N * N).fill(-1);
    const done = new Uint8Array(N * N);
    const [si, sj] = idx(from.x, from.z);
    const start = sj * N + si;
    dist[start] = 0;
    // tiny binary heap
    const heap = [[0, start]];
    const push = (e) => {
      heap.push(e);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    let end = -1;
    while (heap.length) {
      const [d, k] = pop();
      if (done[k]) continue;
      done[k] = 1;
      const i = k % N;
      const j = (k / N) | 0;
      if (goal(i, j)) {
        end = k;
        break;
      }
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nk = nj * N + ni;
          if (done[nk]) continue;
          const len = Math.hypot(di, dj);
          const up = Math.max(0, H[nk] - H[k]);
          const p = pos(ni, nj);
          // valley floors are cheap; climbing and high ground are expensive
          const c = len * (1 + Math.max(H[nk], 0) * 0.02) + up * 4 + avoid(p.x, p.z) * len;
          if (d + c < dist[nk]) {
            dist[nk] = d + c;
            prev[nk] = k;
            push([d + c, nk]);
          }
        }
      }
    }
    const path = [];
    for (let k = end; k !== -1; k = prev[k]) path.push(pos(k % N, (k / N) | 0));
    return path.reverse();
  }

  return { route, H, N, CELL, half };
}

/** Chaikin smoothing + even resampling. */
export function smoothPath(pts, iterations = 4, step = 8) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  // resample evenly
  const res = [p[0]];
  let carry = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1];
    const b = p[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let t = step - carry;
    while (t <= L) {
      res.push({ x: a.x + ((b.x - a.x) * t) / L, z: a.z + ((b.z - a.z) * t) / L });
      t += step;
    }
    carry = L - (t - step);
  }
  return res;
}

/**
 * Turn a smoothed course into a river: water level (always flowing downhill),
 * width, and a fast "distance to river" lookup for carving and placement.
 */
export function buildRiver(course, baseHeight, { widthFrom = 6, widthTo = 15, endAtSea = -1.5 } = {}) {
  // stop a little way out to sea
  let cut = course.length;
  for (let i = 0; i < course.length; i++) {
    if (baseHeight(course[i].x, course[i].z) < endAtSea) {
      cut = Math.min(course.length, i + 6);
      break;
    }
  }
  const pts = course.slice(0, cut);
  const n = pts.length;
  const level = new Float32Array(n);
  let run = Infinity;
  for (let i = 0; i < n; i++) {
    run = Math.min(run, baseHeight(pts[i].x, pts[i].z) - 1.2);
    level[i] = Math.max(run, -2.2); // the estuary slips gently under the sea
  }
  // in the lowlands, spread any drop out so it meanders down calmly (no long rapids)
  for (let i = n - 2; i >= Math.floor(n * 0.55); i--) level[i] = Math.min(level[i], level[i + 1] + 0.1);
  // soften the steps but keep it flowing downhill
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 1; i < n - 1; i++) level[i] = Math.min(level[i - 1], (level[i - 1] + level[i] * 2 + level[i + 1]) / 4);
  }
  const width = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    width[i] = widthFrom + (widthTo - widthFrom) * t * t;
  }

  // spatial hash of segments for distance queries
  const G = 60;
  const grid = new Map();
  const key = (a, b) => `${a},${b}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const r = 90; // max influence radius
    const x0 = Math.floor((Math.min(a.x, b.x) - r) / G);
    const x1 = Math.floor((Math.max(a.x, b.x) + r) / G);
    const z0 = Math.floor((Math.min(a.z, b.z) - r) / G);
    const z1 = Math.floor((Math.max(a.z, b.z) + r) / G);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const k = key(gx, gz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  }

  /** Nearest point on the river: { d, level, width, t (0 source..1 mouth), i } or null if far. */
  function query(x, z) {
    const list = grid.get(key(Math.floor(x / G), Math.floor(z / G)));
    if (!list) return null;
    let best = null;
    let bd = Infinity;
    for (const i of list) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      let u = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      u = Math.max(0, Math.min(1, u));
      const px = a.x + dx * u - x;
      const pz = a.z + dz * u - z;
      const d = px * px + pz * pz;
      if (d < bd) {
        bd = d;
        best = { i, u };
      }
    }
    const { i, u } = best;
    return {
      d: Math.sqrt(bd),
      level: level[i] + (level[i + 1] - level[i]) * u,
      width: width[i] + (width[i + 1] - width[i]) * u,
      t: (i + u) / (n - 1),
      i,
    };
  }

  const smooth01 = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /** Carve the river into a terrain height. */
  function carve(x, z, h) {
    const q = query(x, z);
    if (!q) return h;
    const { d, level: L, width: w } = q;
    // The water itself is painted by the terrain shader from a smooth distance
    // map, so the ground only needs a flat bed and soft banks: no ribbon of
    // water to fight with the terrain triangles.
    const bank = w + 14;
    // valley sides: never higher than this slope away from the water
    h = Math.min(h, L + 1.2 + Math.max(0, d - bank) * 0.7);
    // low ground beside the river is lifted into a little floodplain
    if (h > -0.5) h = Math.max(h, L + 0.6 - smooth01(bank + 10, bank + 40, d) * 50);
    // flat water bed, easing up into the banks
    const bed = L - 0.3 + smooth01(w + 2, bank, d) * 1.5;
    return h + (bed - h) * (1 - smooth01(w + 4, bank, d));
  }

  return { points: pts, level, width, query, carve };
}

/**
 * Bake the river into a small RGBA texture the terrain shader reads:
 *   R: distance from the water's edge (-20..40 m, < 0 is water)
 *   G,B: flow direction (downstream), A: steepness (for white water)
 */
export function bakeRiverMap(river, texel = 2.5) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of river.points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 60;
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
  const w = Math.ceil((maxX - minX) / texel);
  const h = Math.ceil((maxZ - minZ) / texel);
  const data = new Uint8Array(w * h * 4);
  const P = river.points;
  const n = P.length;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + (i + 0.5) * texel;
      const z = minZ + (j + 0.5) * texel;
      const k = (j * w + i) * 4;
      const q = river.query(x, z);
      if (!q) {
        data[k] = 255; data[k + 1] = 128; data[k + 2] = 128; data[k + 3] = 0;
        continue;
      }
      const gap = q.d - q.width;
      const a = P[Math.max(q.i - 2, 0)];
      const b = P[Math.min(q.i + 3, n - 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const i0 = Math.max(q.i - 3, 0);
      const i1 = Math.min(q.i + 4, n - 1);
      const slope = (river.level[i0] - river.level[i1]) / Math.max(1, Math.hypot(P[i1].x - P[i0].x, P[i1].z - P[i0].z));
      data[k] = Math.round(Math.max(0, Math.min(1, (gap + 20) / 60)) * 255);
      data[k + 1] = Math.round(((b.x - a.x) / l * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round(((b.z - a.z) / l * 0.5 + 0.5) * 255);
      data[k + 3] = Math.round(Math.max(0, Math.min(1, slope * 10)) * 255);
    }
  }
  return { data, width: w, height: h, bounds: [minX, minZ, w * texel, h * texel] };
}
