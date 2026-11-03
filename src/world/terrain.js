import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep, lerp, clamp } from '../noise.js';
import { landRamp, shared } from '../materials.js';
import { GLSL_NOISE } from '../glsl.js';
import { planRiver, smoothPath, buildRiver, bakeRiverMap } from './river.js';

// ---- World layout constants (tweak freely) ---------------------------------
export const WORLD = {
  size: 6000, // terrain extent in metres
  segments: 512, // grid resolution (size / segments = metres per cell)
  seaLevel: 0,
  islandCenter: new THREE.Vector2(0, -900),
  islandRadius: 2500,
  airfield: {
    x: 0,
    z: 0,
    height: 12,
    runwayLength: 420,
    runwayWidth: 18,
  },
  lake: { x: 380, z: -150, radius: 170 },
  village: { x: -164, z: 1373, radius: 320, height: 24 },
};

const nBase = createNoise2D(11);
const nRidge = createNoise2D(23);
const nDetail = createNoise2D(37);
const nWarp = createNoise2D(41);
const nColor = createNoise2D(53);
const nForest = createNoise2D(67);

/** The land before the river is carved in. */
function baseHeight(x, z) {
  const { islandCenter: c, islandRadius: R, airfield: af, lake } = WORLD;

  // Island mask with a wobbly coastline
  const dx = x - c.x;
  const dz = z - c.y;
  let d = Math.sqrt(dx * dx + dz * dz) / R;
  d += fbm(nWarp, x / 900, z / 900, 3) * 0.2;
  const mask = 1 - smoothstep(0.68, 1.05, d);

  // Distance from the airfield: keep a soft meadow valley around it
  const dOrigin = Math.hypot(x - af.x, z - af.z);
  const valley = smoothstep(220, 1500, dOrigin);

  const meadow = 14 + fbm(nDetail, x / 320, z / 320, 3) * 7 + nDetail(x / 90, z / 90) * 1.2;
  const b = fbm(nBase, x / 1600, z / 1600, 5) * 0.5 + 0.5;
  const hills = Math.pow(clamp(b, 0, 1), 2.2) * 420;
  const r = 1 - Math.abs(fbm(nRidge, x / 1100, z / 1100, 4));
  const mount = Math.pow(r, 3) * 280 * smoothstep(500, 1900, dOrigin);

  const land = meadow + valley * (hills + mount);
  let h = lerp(-45, land, mask);

  // A little lake beside the airfield
  let ld = Math.hypot(x - lake.x, z - lake.z);
  ld += nWarp(x / 120, z / 120) * 35;
  const lakeW = 1 - smoothstep(lake.radius * 0.35, lake.radius, ld);
  h = lerp(h, -9, lakeW);

  // Soften the hillside above the village so houses can sit on gentle slopes
  const v = WORLD.village;
  const vd = Math.hypot(x - v.x, z - v.z);
  const vw = 1 - smoothstep(v.radius * 0.5, v.radius, vd);
  if (vw > 0 && h > v.height) h = lerp(h, v.height + (h - v.height) * 0.35, vw);

  // Flatten the airfield
  const qx = Math.abs(x - af.x) - 45;
  const qz = Math.abs(z - af.z) - af.runwayLength / 2 - 40;
  const q = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
  const w = 1 - smoothstep(0, 150, q);
  h = lerp(h, af.height, w);

  return h;
}

// ---- The river ----------------------------------------------------------------
// Waypoints it must pass near: high valley → beside the giant tree → west of the
// airfield → out to sea just west of the village.
function riverAvoid(x, z) {
  const { airfield: af, lake, village } = WORLD;
  if (Math.abs(x - af.x) < 240 && Math.abs(z - af.z) < af.runwayLength / 2 + 180) return 60;
  if (Math.hypot(x - lake.x, z - lake.z) < lake.radius + 90) return 60;
  if (Math.hypot(x - village.x, z - village.z) < 190) return 40;
  return 0;
}
export const RIVER = (() => {
  const planner = planRiver(baseHeight, { size: WORLD.size, avoid: riverAvoid });
  const near = (p, r) => (i, j) => Math.hypot(-planner.half + (i + 0.5) * planner.CELL - p.x, -planner.half + (j + 0.5) * planner.CELL - p.z) < r;
  const W = [{ x: -420, z: -1750 }, { x: -520, z: -560 }, { x: -330, z: 350 }];
  const mouth = { x: -470, z: 1300 };
  let course = [];
  for (let k = 0; k < W.length; k++) {
    const goal = k < W.length - 1 ? near(W[k + 1], 60) : (i, j) => near(mouth, 320)(i, j) && planner.H[j * planner.N + i] < -3;
    const leg = planner.route(course.length ? course[course.length - 1] : W[0], goal);
    course.push(...(course.length ? leg.slice(1) : leg));
  }
  return buildRiver(smoothPath(course, 4, 8), baseHeight, { widthFrom: 6, widthTo: 16 });
})();

/** Analytic height function — the "truth" the mesh is sampled from. */
export function heightFn(x, z) {
  return RIVER.carve(x, z, baseHeight(x, z));
}

/** 0..1 forest density used by trees + ground colouring */
export function forestAt(x, z) {
  const f = fbm(nForest, x / 650, z / 650, 4) * 0.5 + 0.5;
  return smoothstep(0.48, 0.66, f);
}

// ---- Build the sampled grid + mesh -----------------------------------------
const N = WORLD.segments;
const STEP = WORLD.size / N;
const HALF = WORLD.size / 2;
const heights = new Float32Array((N + 1) * (N + 1));

for (let j = 0; j <= N; j++) {
  for (let i = 0; i <= N; i++) {
    heights[j * (N + 1) + i] = heightFn(-HALF + i * STEP, -HALF + j * STEP);
  }
}

/** Height matching the rendered triangles exactly (use for collisions). */
export function groundHeight(x, z) {
  const fx = (x + HALF) / STEP;
  const fz = (z + HALF) / STEP;
  if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -45;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const hA = heights[j * (N + 1) + i]; // (i, j)
  const hB = heights[(j + 1) * (N + 1) + i]; // (i, j+1)
  const hC = heights[j * (N + 1) + i + 1]; // (i+1, j)
  const hE = heights[(j + 1) * (N + 1) + i + 1]; // (i+1, j+1)
  if (u + v <= 1) return hA + u * (hC - hA) + v * (hB - hA);
  return hE + (1 - u) * (hB - hE) + (1 - v) * (hC - hE);
}

/** Approximate surface normal's y component (1 = flat). */
export function flatness(x, z) {
  const e = 4;
  const hx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const hz = groundHeight(x, z + e) - groundHeight(x, z - e);
  return 1 / Math.sqrt(1 + (hx * hx + hz * hz) / (4 * e * e));
}

export function createTerrain(featureTex, region, sunDir) {
  const count = (N + 1) * (N + 1);
  const pos = new Float32Array(count * 3);
  const forest = new Float32Array(count);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i;
      const x = -HALF + i * STEP;
      const z = -HALF + j * STEP;
      pos[k * 3] = x;
      pos[k * 3 + 1] = heights[k];
      pos[k * 3 + 2] = z;
      forest[k] = forestAt(x, z);
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let p = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = (j + 1) * (N + 1) + i;
      const c = j * (N + 1) + i + 1;
      const e = (j + 1) * (N + 1) + i + 1;
      idx[p++] = a; idx[p++] = b; idx[p++] = c;
      idx[p++] = c; idx[p++] = b; idx[p++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: landRamp });
  const C = (hex) => new THREE.Color(hex);
  const rm = bakeRiverMap(RIVER);
  const riverTex = new THREE.DataTexture(rm.data, rm.width, rm.height, THREE.RGBAFormat);
  riverTex.minFilter = riverTex.magFilter = THREE.LinearFilter;
  riverTex.wrapS = riverTex.wrapT = THREE.ClampToEdgeWrapping;
  riverTex.needsUpdate = true;
  const uniforms = {
    uRiver: { value: riverTex },
    uRiverB: { value: new THREE.Vector4(...rm.bounds) },
    uWaterDeep: { value: C('#3f97b0') },
    uWaterShallow: { value: C('#7fcfc2') },
    uSkyRefl: { value: C('#d9ecf5') },
    uSunDir: { value: sunDir },
    uTime: shared.uTime,
    uFeatures: { value: featureTex },
    uSway: { value: featureTex.userData.sway },
    uRegion: { value: new THREE.Vector3(region.minX, region.minZ, region.size) },
    uMeadow: { value: C('#93c25a') },
    uGold: { value: C('#bccd6c') },
    uDeep: { value: C('#62a04e') },
    uForest: { value: C('#3f7f45') },
    uHigh: { value: C('#6a9e5c') },
    uRock: { value: C('#a3aac2') },
    uRock2: { value: C('#838cab') },
    uSnow: { value: C('#fdf8f1') },
    uSand: { value: C('#f2e0ad') },
    uWetSand: { value: C('#cdb88a') },
    uSeabed: { value: C('#77bfae') },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aForest;
         varying vec3 vWorldP;
         varying vec3 vWorldN;
         varying float vForest;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vWorldP = (modelMatrix * vec4(position, 1.0)).xyz;
         vWorldN = normal;
         vForest = aForest;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform sampler2D uFeatures;
         uniform sampler2D uSway;
         uniform sampler2D uRiver;
         uniform vec4 uRiverB;
         uniform vec3 uWaterDeep, uWaterShallow, uSkyRefl, uSunDir;
         uniform vec3 uRegion;
         uniform vec3 uMeadow, uGold, uDeep, uForest, uHigh, uRock, uRock2, uSnow, uSand, uWetSand, uSeabed;
         varying vec3 vWorldP;
         varying vec3 vWorldN;
         varying float vForest;
         ${GLSL_NOISE}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float rWater = 0.0;
         float rN = 0.5;
         {
           vec2 p = vWorldP.xz;
           float y = vWorldP.y;
           vec3 n = normalize(vWorldN);
           float slope = 1.0 - n.y;
           float blur = clamp(length(fwidth(p)) * 0.02, 0.0, 1.0); // soften detail far away

           // big painted patches with crisp edges
           float n1 = snoise(p / 260.0) * 0.5 + 0.5 + snoise(p / 80.0) * 0.12;
           float n2 = snoise(p / 40.0 + 17.0);
           vec3 col = uMeadow;
           float e = 0.012 + blur * 0.08;
           col = mix(col, uGold, smoothstep(0.64 - e, 0.64 + e, n1));
           col = mix(col, uDeep, smoothstep(0.34 + e, 0.34 - e, n1));

           // brush strokes: stretched noise nudging the value
           float stroke = snoise(vec2(p.x * 0.09 + p.y * 0.035, p.y * 0.3 - p.x * 0.05));
           col *= 1.0 + stroke * 0.045 * (1.0 - blur);
           // tiny grass speckle up close
           float speck = snoise(p * 0.9);
           col *= 1.0 + step(0.55, speck) * 0.05 * (1.0 - blur);

           // woodland floor
           col = mix(col, uForest, smoothstep(0.35, 0.55, vForest + n2 * 0.08) * 0.9);
           // cooler, deeper greens up high
           col = mix(col, uHigh, smoothstep(90.0, 200.0, y + n2 * 15.0) * 0.7);

           // rock with painted strata
           float rockAmt = smoothstep(0.33, 0.35, slope + n2 * 0.04) + smoothstep(290.0, 300.0, y + n2 * 25.0);
           float rockShade = snoise(p / 90.0) * 0.5 + 0.5;
           vec3 rock = mix(uRock, uRock2, smoothstep(0.53, 0.57, rockShade) * 0.7);
           col = mix(col, rock, clamp(rockAmt, 0.0, 1.0));

           // snow caps
           col = mix(col, uSnow, smoothstep(355.0, 360.0, y + n2 * 25.0 - slope * 60.0));

           // beaches and shallows
           col = mix(col, uSand, smoothstep(3.2, 2.9, y + n2 * 0.8));
           col = mix(col, uWetSand, smoothstep(0.6, 0.2, y));
           col = mix(col, uSeabed, smoothstep(-1.5, -8.0, y));

           // grass that can catch the wind: open meadow, not rock/sand/woods
           float grassy = (1.0 - clamp(rockAmt, 0.0, 1.0)) * smoothstep(3.0, 6.0, y)
                        * (1.0 - smoothstep(0.35, 0.6, vForest)) * (1.0 - smoothstep(150.0, 260.0, y));

           // hand-painted features: paths, fields, village
           vec2 fuv = (p - uRegion.xy) / uRegion.z;
           if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) {
             vec4 f = texture2D(uFeatures, fuv);
             col = mix(col, f.rgb, f.a);
             grassy = mix(grassy, texture2D(uSway, fuv).r, f.a); // crops ripple, roads don't
           }

           // gusts sweep across the hills as bright, silvery waves
           vec2 wdir = normalize(vec2(1.0, 0.3));
           vec2 wp = p - wdir * uTime * 11.0;
           float gust = smoothstep(0.1, 0.75, snoise(wp / 210.0) * 0.5 + 0.5);
           float along = dot(wp, wdir) + snoise(p / 70.0) * 25.0;
           float wave = sin(along * 0.07) * 0.5 + 0.5;
           float streak = snoise(vec2(dot(wp, wdir) * 0.05, dot(p, vec2(-wdir.y, wdir.x)) * 0.012));
           float sheen = smoothstep(0.55, 0.95, wave) * gust + smoothstep(0.45, 0.8, streak) * gust * 0.5;
           sheen *= grassy;
           col = mix(col, col * vec3(1.12, 1.16, 1.0) + vec3(0.05, 0.05, 0.03), clamp(sheen, 0.0, 1.0) * 0.55);

           // ---- the river, painted from its distance + flow map ----
           vec2 ruv = (p - uRiverB.xy) / uRiverB.zw;
           if (ruv.x > 0.0 && ruv.y > 0.0 && ruv.x < 1.0 && ruv.y < 1.0) {
             vec4 rv = texture2D(uRiver, ruv);
             float gap = rv.r * 60.0 - 20.0;          // metres from the water's edge
             vec2 dir = rv.gb * 2.0 - 1.0;            // downstream
             float steep = rv.a * 0.1;
             float aa = max(fwidth(gap) * 0.75, 0.05);
             rWater = 1.0 - smoothstep(-aa, aa, gap);
             if (rWater > 0.0) {
               // flow map: two noise layers dragged downstream, cross-faded so they never stretch
               float spd = 1.6 + steep * 90.0;
               float T = 3.0;
               float f0 = fract(uTime / T);
               float f1 = fract(uTime / T + 0.5);
               vec2 q0 = (p - dir * spd * f0 * T) * 0.07;
               vec2 q1 = (p - dir * spd * f1 * T) * 0.07 + 31.0;
               float n0 = snoise(q0) * 0.5 + 0.5 + snoise(q0 * 2.6) * 0.18;
               float n1 = snoise(q1) * 0.5 + 0.5 + snoise(q1 * 2.6) * 0.18;
               rN = mix(n0, n1, abs(1.0 - 2.0 * f0));
               vec3 wcol = mix(uWaterShallow, uWaterDeep, smoothstep(-1.5, -9.0, gap));
               // soft cel ripples catching the sky
               float band = smoothstep(0.6, 0.64, rN) * (1.0 - smoothstep(0.7, 0.76, rN));
               wcol = mix(wcol, uSkyRefl, band * 0.4);
               // a pale lip where water meets the bank
               wcol = mix(wcol, uSkyRefl, smoothstep(-1.6, -0.2, gap) * 0.55);
               // white water where it tumbles
               float rapids = smoothstep(0.015, 0.05, steep);
               wcol = mix(wcol, vec3(0.97, 0.99, 1.0), rapids * smoothstep(0.5, 0.6, rN) * 0.7);
               col = mix(col, wcol, rWater);
             }
           }

           // drifting cloud shadows
           vec2 cp = (p - vec2(uTime * 4.0, 0.0)) / 520.0;
           float cs = smoothstep(0.42, 0.47, snoise(cp) * 0.5 + 0.5 + snoise(cp * 2.3) * 0.15);
           col *= 1.0 - cs * 0.16;

           diffuseColor.rgb = col;
         }`
      )
      // water lies flat: light it as if facing straight up
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), rWater));`
      )
      // ...and give it sky reflection + sun glints on top of the lighting
      .replace(
        '#include <opaque_fragment>',
        `if (rWater > 0.001) {
           vec3 V = normalize(cameraPosition - vWorldP);
           float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
           vec3 lit = mix(outgoingLight, uSkyRefl * (0.6 + 0.4 * max(uSunDir.y * 2.0, 0.0)), fres * 0.4);
           vec3 N = normalize(vec3((rN - 0.5) * 0.5, 1.0, (fract(rN * 7.0) - 0.5) * 0.3));
           float spec = pow(max(dot(reflect(-normalize(uSunDir), N), V), 0.0), 90.0);
           lit += vec3(1.0, 0.9, 0.72) * step(0.5, spec) * smoothstep(-0.05, 0.1, uSunDir.y);
           outgoingLight = mix(outgoingLight, lit, rWater);
         }
         #include <opaque_fragment>`
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.uniforms = uniforms;
  return mesh;
}

/** Depth texture for the water shader (shallows / shoreline foam). */
export function createDepthTexture(res = 512) {
  const data = new Uint8Array(res * res * 4);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = -HALF + (i / (res - 1)) * WORLD.size;
      const z = -HALF + (j / (res - 1)) * WORLD.size;
      const h = groundHeight(x, z);
      const depth = clamp(-h / 30, 0, 1);
      const k = (j * res + i) * 4;
      const v = Math.round(depth * 255);
      data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
