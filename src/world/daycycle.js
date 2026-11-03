// Time of day. A slow cycle that lingers in the golden hour, then drifts through
// sunset and dusk into a blue, moonlit night where windows and lamps glow.
// Everything that cares about light (sun, sky, fog, clouds, sea, river glints,
// colour grade, glowing windows) is driven from one set of keyframes.
import * as THREE from 'three';
import { glowMats } from '../materials.js';
import { LAYOUT } from './layout.js';
import { WORLD } from './terrain.js';

// t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
const KEYS = [
  { t: 0.0, name: 'night', light: ['#9fb4e8', 0.75], hemi: ['#5a70b0', '#2e3a58', 1.1], zenith: '#0f1d42', horizon: '#33467a', haze: '#2a3b68', glow: '#7088c4', cloud: ['#8c9cc8', '#3e4c7a', '#2f3b66'], sea: '#3a5082', tint: [0.2, 0.25, 0.44], night: 1, warmth: 0.2 },
  { t: 0.21, name: 'before dawn', light: ['#c0a8d8', 0.4], hemi: ['#8a8fc4', '#5a5a74', 0.95], zenith: '#3a4f8c', horizon: '#dcaabc', haze: '#9c9abc', glow: '#f2b0a4', cloud: ['#f0c2cc', '#8a86b2', '#7a709a'], sea: '#c2a8c4', tint: [0.6, 0.58, 0.72], night: 0.6, warmth: 0.6 },
  { t: 0.27, name: 'sunrise', light: ['#ffb47a', 1.7], hemi: ['#c8c2e2', '#a89878', 1.1], zenith: '#5a8ad0', horizon: '#ffd2aa', haze: '#dac4bc', glow: '#ffc080', cloud: ['#ffe2c4', '#b2aad2', '#a892ba'], sea: '#f0d8c8', tint: [1.0, 0.9, 0.84], night: 0.08, warmth: 1.3 },
  { t: 0.36, name: 'morning', light: ['#fff0d6', 2.4], hemi: ['#c6dcf4', '#a9b98a', 1.3], zenith: '#3584d0', horizon: '#d2e6f0', haze: '#b0cfe6', glow: '#fff0cf', cloud: ['#ffffff', '#b4c6e2', '#90a6c8'], sea: '#d9ecf5', tint: [1, 1, 1], night: 0, warmth: 1.0 },
  { t: 0.5, name: 'midday', light: ['#fff4e2', 2.55], hemi: ['#c6dcf4', '#aab98a', 1.3], zenith: '#2f7fcf', horizon: '#cfe5f0', haze: '#a8c9e4', glow: '#fff0cf', cloud: ['#ffffff', '#b4c6e2', '#90a6c8'], sea: '#d9ecf5', tint: [1, 1, 1], night: 0, warmth: 1.0 },
  { t: 0.62, name: 'afternoon', light: ['#ffe2b0', 2.55], hemi: ['#cfd8ee', '#c2b07e', 1.32], zenith: '#3a84cc', horizon: '#ecdcc0', haze: '#d0d2cc', glow: '#ffe0a8', cloud: ['#fff6e2', '#bcbcd8', '#a8a2c4'], sea: '#eae2d2', tint: [1.03, 1.0, 0.94], night: 0, warmth: 1.25 },
  { t: 0.68, name: 'golden hour', light: ['#ffcf8a', 2.6], hemi: ['#dcd4e6', '#d4aa70', 1.4], zenith: '#4a86c6', horizon: '#fad6a4', haze: '#ecd0aa', glow: '#ffd28a', cloud: ['#fff0cc', '#c8b4d0', '#b896b4'], sea: '#f4dcbc', tint: [1.06, 0.97, 0.86], night: 0, warmth: 1.5 },
  { t: 0.735, name: 'sunset', light: ['#ff9c5c', 1.9], hemi: ['#c8a8d4', '#b88866', 1.2], zenith: '#4a6cb4', horizon: '#ffae7c', haze: '#eaa88a', glow: '#ff9a52', cloud: ['#ffc68e', '#ac88ba', '#9a6898'], sea: '#f0b48e', tint: [1.0, 0.82, 0.74], night: 0.15, warmth: 1.6 },
  { t: 0.775, name: 'dusk', light: ['#c894c0', 0.55], hemi: ['#7472b4', '#544a66', 1.15], zenith: '#27386e', horizon: '#c98ca4', haze: '#6e6c9c', glow: '#e48a94', cloud: ['#da9cae', '#5c5a8c', '#4a4878'], sea: '#8c7cab', tint: [0.42, 0.4, 0.58], night: 0.75, warmth: 0.8 },
  { t: 0.84, name: 'night', light: ['#9fb4e8', 0.75], hemi: ['#5a70b0', '#2e3a58', 1.1], zenith: '#0f1d42', horizon: '#33467a', haze: '#2a3b68', glow: '#7088c4', cloud: ['#8c9cc8', '#3e4c7a', '#2f3b66'], sea: '#3a5082', tint: [0.2, 0.25, 0.44], night: 1, warmth: 0.2 },
  { t: 1.0, name: 'night', light: ['#9fb4e8', 0.75], hemi: ['#5a70b0', '#2e3a58', 1.1], zenith: '#0f1d42', horizon: '#33467a', haze: '#2a3b68', glow: '#7088c4', cloud: ['#8c9cc8', '#3e4c7a', '#2f3b66'], sea: '#3a5082', tint: [0.2, 0.25, 0.44], night: 1, warmth: 0.2 },
];
// pre-parse colours
for (const k of KEYS) {
  for (const f of ['zenith', 'horizon', 'haze', 'glow', 'sea']) k[f] = new THREE.Color(k[f]);
  k.lightC = new THREE.Color(k.light[0]);
  k.hemiS = new THREE.Color(k.hemi[0]);
  k.hemiG = new THREE.Color(k.hemi[1]);
  k.cloudC = k.cloud.map((c) => new THREE.Color(c));
}

const DAY_SECONDS = 30 * 60; // a full day takes half an hour...
// ...but time slows right down through golden hour and sunset
const rate = (t) => 1 / (1 + 2.2 * Math.exp(-(((t - 0.7) / 0.07) ** 2)));

/** Soft round sprite for lights and stars. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function createStars() {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  const rand = (s) => {
    const x = Math.sin(s * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < n; i++) {
    const u = rand(i + 1);
    const v = rand(i + 7.3);
    const th = u * Math.PI * 2;
    const y = 0.05 + v * 0.95;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * 900, y * 900, Math.sin(th) * r * 900], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, color: '#fff8e8', transparent: true, opacity: 0, depthWrite: false, fog: false, map: glowTexture() });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  stars.renderOrder = -0.5;
  return stars;
}

/** Warm points of light in windows, lamps and the lighthouse, shown after dark. */
function createNightLights() {
  const pts = [];
  const add = (x, y, z, s = 1) => pts.push(x, y, z, s);
  for (const h of LAYOUT.houses) {
    const c = Math.cos(h.rot);
    const s = Math.sin(h.rot);
    // a couple of lit windows on the front (+Z local) and one on a side
    for (const [lx, ly, lz] of [[-1.6, 2.2, 4.4], [1.8, 2.4, 4.4], [5.2, 2.2, 0.5], [-1.2, 5.0, 4.4]]) {
      if (Math.sin(h.x * 3.1 + lx * 7 + h.z) < -0.4) continue; // some windows stay dark
      add(h.x + lx * c + lz * s, h.y + ly, h.z - lx * s + lz * c, 0.8);
    }
  }
  for (const b of LAYOUT.bridges) {
    if (b.span <= 24) continue;
    for (const sx of [-b.span / 2 - 2, b.span / 2 + 2]) {
      add(b.x + Math.cos(b.angle) * sx, b.level + 7.2, b.z + Math.sin(b.angle) * sx, 1.1);
    }
  }
  const af = WORLD.airfield;
  add(af.x - 48, af.height + 2.5, af.z + 70, 1);
  const geo = new THREE.BufferGeometry();
  const P = [];
  const S = [];
  for (let i = 0; i < pts.length; i += 4) {
    P.push(pts[i], pts[i + 1], pts[i + 2]);
    S.push(pts[i + 3]);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: glowTexture() }, uNight: { value: 0 }, uColor: { value: new THREE.Color('#ffc477') }, uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      uniform float uScale;
      varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        // a little bigger far away so the village twinkles from altitude
        gl_PointSize = aSize * uScale * clamp(3200.0 / -mv.z, 6.0, 48.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uNight;
      uniform vec3 uColor;
      varying float vDist;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * uNight * (1.0 - smoothstep(2500.0, 5000.0, vDist));
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const lights = new THREE.Points(geo, mat);
  lights.frustumCulled = false;
  lights.renderOrder = 5;
  return lights;
}

export function createDayCycle({ scene, sun, hemi, sky, clouds, water, terrain, post, lamps = [] }) {
  const state = { t: 0.63, skipTo: null, name: '' };
  const lightDir = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const stars = createStars();
  scene.add(stars);
  const nightLights = createNightLights();
  // street lamps glow too
  if (lamps.length) {
    const g = nightLights.geometry;
    const P = [...g.attributes.position.array];
    const S = [...g.attributes.aSize.array];
    for (const l of lamps) {
      P.push(l.x, l.y, l.z);
      S.push(1.1);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(S, 1));
  }
  scene.add(nightLights);

  const k = { light: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), zenith: new THREE.Color(), horizon: new THREE.Color(), haze: new THREE.Color(), glow: new THREE.Color(), sea: new THREE.Color(), cloud: [new THREE.Color(), new THREE.Color(), new THREE.Color()], tint: new THREE.Vector3() };

  function sample(t) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    let u = (t - a.t) / (b.t - a.t);
    u = u * u * (3 - 2 * u);
    k.light.copy(a.lightC).lerp(b.lightC, u);
    k.lightI = a.light[1] + (b.light[1] - a.light[1]) * u;
    k.hemiS.copy(a.hemiS).lerp(b.hemiS, u);
    k.hemiG.copy(a.hemiG).lerp(b.hemiG, u);
    k.hemiI = a.hemi[2] + (b.hemi[2] - a.hemi[2]) * u;
    for (const f of ['zenith', 'horizon', 'haze', 'glow', 'sea']) k[f].copy(a[f]).lerp(b[f], u);
    for (let c = 0; c < 3; c++) k.cloud[c].copy(a.cloudC[c]).lerp(b.cloudC[c], u);
    k.tint.set(...a.tint).lerp(new THREE.Vector3(...b.tint), u);
    k.night = a.night + (b.night - a.night) * u;
    k.warmth = a.warmth + (b.warmth - a.warmth) * u;
    k.name = u < 0.5 ? a.name : b.name;
  }

  function apply(t) {
    sample(t);
    // sun rises in the east (+x), sets in the west (−x) over the southern sea
    const ang = (t - 0.25) * Math.PI * 2;
    sunDir.set(Math.cos(ang) * 0.85, Math.sin(ang) * 0.8, 0.5).normalize();
    moonDir.set(-sunDir.x * 0.9, -sunDir.y, 0.35).normalize();
    // the shadow-casting light follows the sun, or the moon after dark
    if (sunDir.y > -0.02) lightDir.copy(sunDir);
    else lightDir.copy(moonDir);
    lightDir.y = Math.max(lightDir.y, 0.12);
    lightDir.normalize();

    sun.color.copy(k.light);
    sun.intensity = k.lightI;
    hemi.color.copy(k.hemiS);
    hemi.groundColor.copy(k.hemiG);
    hemi.intensity = k.hemiI;
    scene.fog.color.copy(k.haze);

    const su = sky.material.uniforms;
    su.uZenith.value.copy(k.zenith);
    su.uHorizon.value.copy(k.horizon);
    su.uSunGlow.value.copy(k.glow);
    su.uSunDir.value.copy(sunDir);
    if (su.uMoonDir) su.uMoonDir.value.copy(moonDir);
    if (su.uNight) su.uNight.value = k.night;

    const cu = clouds.material.uniforms;
    cu.uSunDir.value.copy(lightDir);
    cu.uLit.value.copy(k.cloud[0]);
    cu.uShade.value.copy(k.cloud[1]);
    cu.uBelly.value.copy(k.cloud[2]);

    const wu = water.material.uniforms;
    wu.uSky.value.copy(k.sea);
    wu.uSunDir.value.copy(lightDir);
    if (wu.uTint) wu.uTint.value.copy(k.tint);

    const tu = terrain.userData.uniforms;
    if (tu) {
      tu.uSkyRefl.value.copy(k.sea);
      tu.uSunDir.value.copy(lightDir);
    }
    if (post.grade) post.grade.uniforms.uWarmth.value = k.warmth;

    stars.material.opacity = Math.max(0, k.night - 0.3) / 0.7;
    nightLights.material.uniforms.uNight.value = Math.max(0, (k.night - 0.1) / 0.9);
    for (const g of glowMats) g.mat.emissiveIntensity = g.base * (1 + k.night * 3.5);
    state.name = k.name;
    state.night = k.night;
  }

  apply(state.t);

  return {
    state,
    lightDir,
    /** Jump forward a few hours (eased) — the G key. */
    skip(hours = 3) {
      state.skipTo = (state.skipTo ?? state.t) + hours / 24;
    },
    update(dt, camera) {
      if (state.skipTo !== null) {
        const step = Math.min(dt * 0.06, state.skipTo - state.t);
        state.t += step;
        if (state.skipTo - state.t < 1e-4) state.skipTo = null;
      } else {
        state.t += (dt / DAY_SECONDS) * rate(state.t % 1);
      }
      if (state.t >= 1) {
        state.t -= 1;
        if (state.skipTo !== null) state.skipTo -= 1;
      }
      apply(state.t);
      stars.position.copy(camera.position);
    },
  };
}
