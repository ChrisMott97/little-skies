import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Shared uniforms (time drives wind sway, water, clouds...)
export const shared = {
  uTime: { value: 0 },
};

// Toon ramps: each value is the light level of one band.
function makeRamp(levels, smooth = false) {
  const data = new Uint8Array(levels.length * 4);
  levels.forEach((v, i) => {
    data.set([v, v, v, 255], i * 4);
  });
  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Crisp, cel-shaded ramp for characters/props (the plane, buildings)
export const celRamp = makeRamp([120, 200, 255]);
// Softer, painterly ramp for landscape
export const landRamp = makeRamp([150, 190, 225, 255], true);

/**
 * Toon material with a soft rim glow and optional wind sway.
 * opts: { color, ramp, rim, rimColor, wind, vertexColors, emissive }
 */
/** Emissive materials (windows, lamps) that the day cycle brightens after dark. */
export const glowMats = [];

export function toon(opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    gradientMap: opts.ramp ?? celRamp,
    vertexColors: !!opts.vertexColors,
    emissive: opts.emissive ?? 0x000000,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive) glowMats.push({ mat, base: 1 });
  const rim = opts.rim ?? 0.35;
  const rimColor = new THREE.Color(opts.rimColor ?? 0xfff3d6);
  const wind = opts.wind ?? 0;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uRimColor = { value: rimColor };
    shader.uniforms.uWind = { value: wind };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWind;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         if (uWind > 0.0) {
           #ifdef USE_INSTANCING
             vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           #else
             vec3 ip = vec3(0.0);
           #endif
           float h = max(position.y, 0.0);
           float s = sin(uTime * 1.3 + ip.x * 0.045 + ip.z * 0.06) * 0.6
                   + sin(uTime * 2.7 + ip.z * 0.11) * 0.25;
           transformed.x += s * uWind * h;
           transformed.z += s * 0.5 * uWind * h;
         }`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uRim;
         uniform vec3 uRimColor;`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
           float rimDot = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
           float rimAmt = smoothstep(0.6, 0.85, rimDot) * uRim * (0.55 + 0.45 * normal.y);
           outgoingLight += uRimColor * rimAmt;
         }
         #include <opaque_fragment>`
      );
  };
  // Make sure differently-configured materials don't share a cached program incorrectly
  mat.customProgramCacheKey = () => `toon-${wind > 0 ? 'w' : 'n'}`;
  return mat;
}

/** Average normals of coincident vertices so hard-edged shapes (boxes) get unbroken outlines. */
export function ensureSmoothNormals(geo) {
  if (geo.attributes.smoothNormal) return geo;
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const map = new Map();
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
    keys[i] = k;
    let acc = map.get(k);
    if (!acc) map.set(k, (acc = [0, 0, 0]));
    acc[0] += nrm.getX(i);
    acc[1] += nrm.getY(i);
    acc[2] += nrm.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(keys[i]);
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

/** Inverted-hull ink outline (fades with fog so distant lines stay soft). */
export function outlineMaterial(thickness = 0.04, color = 0x4a3438) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uThickness: { value: thickness },
        uColor: { value: new THREE.Color(color) },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute vec3 smoothNormal;
      uniform float uThickness;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * smoothNormal);
        mvPosition.xyz += n * uThickness;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Add an outline shell to every mesh under `root` flagged with userData.outline !== false */
export function addOutlines(root, thickness = 0.04, color) {
  const mat = outlineMaterial(thickness, color);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && o.userData.outline !== false && !o.userData.isOutline) meshes.push(o);
  });
  for (const m of meshes) {
    const shell = new THREE.Mesh(ensureSmoothNormals(m.geometry), mat);
    shell.userData.isOutline = true;
    shell.castShadow = false;
    shell.receiveShadow = false;
    m.add(shell);
  }
}

/**
 * Collects many small geometries and merges them per material, so a whole
 * village is a handful of draw calls.
 */
export class MergeBuilder {
  constructor() {
    this.buckets = new Map(); // material -> geometries
  }

  add(geometry, material, matrix) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (matrix) g.applyMatrix4(matrix);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }

  /** Returns a Group of merged meshes (with outlines unless outline === false). */
  build({ outline = 0.05, shadows = true } = {}) {
    const group = new THREE.Group();
    for (const [mat, geos] of this.buckets) {
      const merged = mergeGeometries(geos);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      if (mat.userData.noOutline) mesh.userData.outline = false;
      group.add(mesh);
    }
    if (outline) addOutlines(group, outline);
    return group;
  }
}
