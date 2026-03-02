import type { NoiseType } from '@/types/canvas';

/** Fullscreen quad vertex shader -- passes UV to fragment */
export const NOISE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Common uniforms & fBm wrapper used by all noise shaders
// ---------------------------------------------------------------------------

const COMMON_HEADER = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uScale;
uniform int   uOctaves;
uniform float uSeed;
uniform vec2  uDirection;

varying vec2 vUv;
`;

const FBM_FUNCTION = /* glsl */ `
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= uOctaves) break;
    value += amplitude * noiseFunc(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`;

const MAIN_FUNCTION = /* glsl */ `
void main() {
  vec2 p = vUv * uScale + uDirection * uTime + uSeed;
  float n = fbm(p) * 0.5 + 0.5;
  gl_FragColor = vec4(vec3(n), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Permute helper (shared by perlin & simplex)
// ---------------------------------------------------------------------------

const PERMUTE = /* glsl */ `
vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
`;

// ---------------------------------------------------------------------------
// Perlin noise (2D, Gustavson / Ashima Arts)
// ---------------------------------------------------------------------------

const PERLIN_FRAG = /* glsl */ `
${COMMON_HEADER}

${PERMUTE}

vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float noiseFunc(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod(Pi, 289.0);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = 2.0 * fract(i * 0.0243902439) - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 *
    vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  float n_xy = mix(n_x.x, n_x.y, fade_xy.y);
  return 2.3 * n_xy;
}

${FBM_FUNCTION}
${MAIN_FUNCTION}
`;

// ---------------------------------------------------------------------------
// Simplex noise (2D, Gustavson / Ashima Arts)
// ---------------------------------------------------------------------------

const SIMPLEX_FRAG = /* glsl */ `
${COMMON_HEADER}

${PERMUTE}

float noiseFunc(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
    0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
   -0.577350269189626,   // -1.0 + 2.0 * C.x
    0.024390243902439    // 1.0 / 41.0
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
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

${FBM_FUNCTION}
${MAIN_FUNCTION}
`;

// ---------------------------------------------------------------------------
// Worley noise (Voronoi F1 distance)
// ---------------------------------------------------------------------------

const WORLEY_FRAG = /* glsl */ `
${COMMON_HEADER}

// Hash function for cell jittering
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float noiseFunc(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);

  float minDist = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      minDist = min(minDist, d);
    }
  }
  return sqrt(minDist);
}

${FBM_FUNCTION}
${MAIN_FUNCTION}
`;

// ---------------------------------------------------------------------------
// Cellular noise (Voronoi F2-F1)
// ---------------------------------------------------------------------------

const CELLULAR_FRAG = /* glsl */ `
${COMMON_HEADER}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float noiseFunc(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);

  float f1 = 1.0;
  float f2 = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash2(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return sqrt(f2) - sqrt(f1);
}

${FBM_FUNCTION}
${MAIN_FUNCTION}
`;

// ---------------------------------------------------------------------------
// Shader map
// ---------------------------------------------------------------------------

export const NOISE_SHADERS: Record<NoiseType, string> = {
  perlin: PERLIN_FRAG,
  simplex: SIMPLEX_FRAG,
  worley: WORLEY_FRAG,
  cellular: CELLULAR_FRAG,
};
