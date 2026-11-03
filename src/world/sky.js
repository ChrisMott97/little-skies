import * as THREE from 'three';
import { mulberry32, createNoise2D } from '../noise.js';

export const SKY = {
  zenith: new THREE.Color('#2f7fcf'),
  horizon: new THREE.Color('#cfe5f0'),
  haze: new THREE.Color('#a8c9e4'), // aerial perspective: distance turns blue
  sunGlow: new THREE.Color('#fff0cf'),
};

export function createSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uSunGlow: { value: SKY.sunGlow },
      uSunDir: { value: sunDir.clone() },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vec4(p.xy, p.w * 0.99999, p.w); // push to far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uSunGlow, uSunDir, uMoonDir;
      uniform float uNight;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, pow(h, 0.42)));
        col = mix(col, uHorizon * 1.08, smoothstep(0.06, 0.0, h) * 0.45); // soft haze on the horizon
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col = mix(col, uSunGlow, pow(s, 6.0) * 0.5);  // warm halo
        col = mix(col, vec3(1.0, 0.99, 0.94), smoothstep(0.9985, 0.9992, s) * smoothstep(-0.03, 0.01, uSunDir.y)); // sun disc
        float m = max(dot(d, normalize(uMoonDir)), 0.0);
        col += vec3(0.35, 0.42, 0.6) * pow(m, 40.0) * 0.35 * uNight; // moon halo
        col = mix(col, vec3(0.98, 0.96, 0.88), smoothstep(0.99955, 0.9997, m) * uNight); // moon
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  return mesh;
}

// ---- Fluffy cumulus clouds --------------------------------------------------

function lumpySphere() {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const noise = createNoise2D(7);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise(v.x * 1.3 + v.z * 0.7, v.y * 1.3 - v.z * 0.5) * 0.06;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function createClouds(sunDir, { count = 70, area = 9000 } = {}) {
  const rand = mulberry32(99);
  const puffs = [];
  const clouds = [];
  for (let c = 0; c < count; c++) {
    const cx = (rand() - 0.5) * area;
    const cz = (rand() - 0.5) * area;
    const base = 280 + rand() * 220;
    // a few towering summer cumulus among the fair-weather puffs
    const tower = rand() < 0.22;
    const size = tower ? 1.6 + rand() * 1.2 : 0.8 + rand() * 1.5;
    const cloud = { x: cx, z: cz, start: puffs.length };
    const n = tower ? 26 + Math.floor(rand() * 14) : 10 + Math.floor(rand() * 12);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand());
      const ox = Math.cos(a) * rr * 110 * size;
      const oz = Math.sin(a) * rr * 60 * size;
      const centreness = 1 - rr;
      const r = (22 + rand() * 22 + centreness * 30) * size;
      const oy = r * 0.35 + centreness * centreness * (tower ? 170 : 70) * size;
      puffs.push({ cloud: c, ox, oy, oz, r, base });
    }
    cloud.end = puffs.length;
    clouds.push(cloud);
  }

  const geo = lumpySphere();
  const baseAttr = new Float32Array(puffs.length);
  puffs.forEach((p, i) => (baseAttr[i] = p.base));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(baseAttr, 1));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunDir: { value: sunDir.clone() },
      uLit: { value: new THREE.Color('#ffffff') },
      uShade: { value: new THREE.Color('#b4c6e2') },
      uBelly: { value: new THREE.Color('#90a6c8') },
    },
  ]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      attribute float aBase;
      varying vec3 vN;
      varying vec3 vWorld;
      varying float vBase;
      #include <fog_pars_vertex>
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 wp = m * vec4(position, 1.0);
        wp.y = max(wp.y, aBase); // flat cloud bellies
        vWorld = wp.xyz;
        vBase = aBase;
        vN = normalize(mat3(m) * normal);
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uLit, uShade, uBelly;
      varying vec3 vN;
      varying vec3 vWorld;
      varying float vBase;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 N = normalize(vN);
        float flat_ = step(vWorld.y, vBase + 0.5);
        N = normalize(mix(N, vec3(0.0, -1.0, 0.0), flat_));
        float ndl = dot(N, normalize(uSunDir));
        float lit = smoothstep(-0.2, 0.45, ndl);
        float height = smoothstep(vBase, vBase + 70.0, vWorld.y);
        vec3 col = mix(uShade, uLit, clamp(lit * 0.75 + height * 0.35, 0.0, 1.0));
        col = mix(uBelly, col, smoothstep(0.0, 0.25, height + lit * 0.2));
        vec3 V = normalize(cameraPosition - vWorld);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += vec3(1.0, 0.96, 0.88) * rim * 0.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // clouds stay crisp far away: a much lighter haze than the ground gets
        #ifdef USE_FOG
          float cloudFog = smoothstep(fogNear * 3.0, fogFar * 2.2, vFogDepth) * 0.75;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, cloudFog);
        #endif
      }`,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  mesh.frustumCulled = false;
  mesh.name = 'clouds';

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let drift = 0;
  const half = area / 2;

  function layout() {
    for (const c of clouds) {
      // wrap each cloud as a unit so it drifts across forever
      let x = c.x + drift;
      x = ((x + half) % area + area) % area - half;
      for (let i = c.start; i < c.end; i++) {
        const p = puffs[i];
        pos.set(x + p.ox, p.base + p.oy, c.z + p.oz);
        s.set(p.r, p.r * 0.85, p.r);
        m4.compose(pos, q, s);
        mesh.setMatrixAt(i, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  layout();

  mesh.userData.update = (dt) => {
    drift += dt * 4; // gentle breeze, metres per second
    layout();
  };
  return mesh;
}
