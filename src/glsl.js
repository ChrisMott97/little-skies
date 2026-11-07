// Shared GLSL snippets.

// 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
export const GLSL_NOISE = /* glsl */ `
vec3 _permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = _permute(_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

// The plane's prop wash on the ground and water. Needs uTime declared first.
// Returns x: rings spreading out behind the plane, y: a swirl right underneath it.
export const GLSL_WASH = /* glsl */ `
  uniform vec4 uWash[6];   // footprints: x, z, age, strength
  uniform vec4 uPlaneWash; // plane xyz, strength
  vec2 propWash(vec2 p) {
    float rings = 0.0;
    for (int i = 0; i < 6; i++) {
      vec4 w = uWash[i];
      if (w.z > 1.6 || w.w <= 0.0) continue;
      float d = length(p - w.xy);
      float r = 2.0 + w.z * 15.0;
      float width = 1.6 + w.z * 3.0;
      rings += (1.0 - smoothstep(0.0, width, abs(d - r))) * w.w * (1.0 - smoothstep(0.5, 1.6, w.z));
    }
    vec2 dp = p - uPlaneWash.xz;
    float dist = length(dp);
    float swirl = (1.0 - smoothstep(1.0, 11.0, dist)) * uPlaneWash.w;
    swirl *= 0.55 + 0.45 * sin(atan(dp.y, dp.x) * 5.0 - uTime * 14.0 + dist * 0.9);
    return vec2(clamp(rings, 0.0, 1.2), swirl);
  }
`;
