import * as THREE from 'three';
import { shared } from '../materials.js';
import { WORLD, createDepthTexture } from './terrain.js';

export function createWater(sunDir) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uDepth: { value: null },
      uSize: { value: WORLD.size },
      uSunDir: { value: sunDir.clone() },
      uShallow: { value: new THREE.Color('#86dcc6') },
      uMid: { value: new THREE.Color('#45a9b4') },
      uDeep: { value: new THREE.Color('#2f6fa3') },
      uSky: { value: new THREE.Color('#d9ecf5') },
      uFoam: { value: new THREE.Color('#ffffff') },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    },
  ]);
  uniforms.uTime = shared.uTime;
  uniforms.uDepth.value = createDepthTexture(1024);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    depthWrite: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform sampler2D uDepth;
      uniform float uSize;
      uniform vec3 uSunDir;
      uniform vec3 uShallow, uMid, uDeep, uSky, uFoam;
      uniform vec3 uTint;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                   mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }

      void main() {
        vec2 uv = vWorld.xz / uSize + 0.5;
        float depth = texture2D(uDepth, uv).r;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) depth = 1.0;

        // painted depth bands
        vec3 col = mix(uShallow, uMid, smoothstep(0.02, 0.25, depth));
        col = mix(col, uDeep, smoothstep(0.3, 0.9, depth));

        // drifting, cel-style ripple highlights
        vec2 p = vWorld.xz * 0.07;
        float n = vnoise(p + vec2(uTime * 0.06, uTime * 0.04))
                + 0.5 * vnoise(p * 2.7 - vec2(uTime * 0.05, -uTime * 0.07));
        n /= 1.5;
        float band = smoothstep(0.60, 0.63, n) * (1.0 - smoothstep(0.66, 0.70, n));
        col = mix(col, uSky, band * 0.3 * (1.0 - smoothstep(300.0, 1500.0, length(cameraPosition - vWorld))));

        // view-dependent sky reflection (fresnel)
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        col = mix(col, uSky, fres * 0.45);

        col *= uTint; // time-of-day light on the water
        // sun sparkles: perturbed normal + hard threshold
        vec3 N = normalize(vec3((n - 0.5) * 0.35, 1.0, (vnoise(p * 3.1 + uTime * 0.1) - 0.5) * 0.35));
        vec3 R = reflect(-uSunDir, N);
        float spec = pow(max(dot(R, V), 0.0), 120.0);
        col += vec3(1.0, 0.9, 0.7) * step(0.5, spec) * 1.2;

        // shoreline foam: a solid lip plus lapping lines
        float lap = sin(depth * 260.0 - uTime * 1.6 + n * 5.0);
        float foam = smoothstep(0.012, 0.004, depth)
                   + step(0.88, lap) * smoothstep(0.05, 0.015, depth) * 0.8;
        col = mix(col, uFoam * uTint, clamp(foam, 0.0, 1.0));

        float alpha = mix(0.6, 1.0, smoothstep(0.0, 0.25, depth));
        alpha = max(alpha, clamp(foam, 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WORLD.seaLevel;
  mesh.name = 'water';
  mesh.renderOrder = 1;
  return mesh;
}
