/** Fullscreen quad vertex shader — passes UV to fragment */
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/**
 * Shared color-stop interpolation.
 * Iterates over up to 8 stops and mixes between the two surrounding colors.
 */
const COLOR_STOP_MIX = /* glsl */ `
vec3 sampleGradient(float t, vec3 colors[8], float positions[8], int count) {
  // Clamp t to [0, 1]
  t = clamp(t, 0.0, 1.0);

  // Before first stop
  if (t <= positions[0]) return colors[0];

  for (int i = 1; i < 8; i++) {
    if (i >= count) break;
    if (t <= positions[i]) {
      float range = positions[i] - positions[i - 1];
      float local = (range > 0.001) ? (t - positions[i - 1]) / range : 0.0;
      return mix(colors[i - 1], colors[i], local);
    }
  }

  // After last stop
  return colors[count - 1];
}
`;

/** Linear gradient with animated directional offset */
export const LINEAR_GRADIENT_FRAG = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform float uAngle;
uniform float uSpeed;
uniform vec3 uColors[8];
uniform float uPositions[8];
uniform int uColorCount;

varying vec2 vUv;

${COLOR_STOP_MIX}

void main() {
  float rad = uAngle * 3.14159265 / 180.0;
  vec2 dir = vec2(cos(rad), sin(rad));
  float t = dot(vUv - 0.5, dir) + 0.5;
  t = fract(t + uTime * uSpeed * 0.001);
  vec3 color = sampleGradient(t, uColors, uPositions, uColorCount);
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Radial gradient with animated distance offset */
export const RADIAL_GRADIENT_FRAG = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform float uAngle;
uniform float uSpeed;
uniform vec3 uColors[8];
uniform float uPositions[8];
uniform int uColorCount;

varying vec2 vUv;

${COLOR_STOP_MIX}

void main() {
  float dist = length(vUv - 0.5) * 2.0;
  float t = fract(dist + uTime * uSpeed * 0.001);
  vec3 color = sampleGradient(t, uColors, uPositions, uColorCount);
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Mesh-like gradient using simple 2D hash noise for organic blending */
export const MESH_GRADIENT_FRAG = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform float uAngle;
uniform float uSpeed;
uniform vec3 uColors[8];
uniform float uPositions[8];
uniform int uColorCount;

varying vec2 vUv;

${COLOR_STOP_MIX}

// Simple 2D hash for pseudo-random noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float anim = uTime * uSpeed * 0.001;
  vec2 p = vUv * 3.0;
  float n = noise(p + anim) * 0.5
          + noise(p * 2.0 - anim * 0.7) * 0.3
          + noise(p * 4.0 + anim * 0.3) * 0.2;
  vec3 color = sampleGradient(n, uColors, uPositions, uColorCount);
  gl_FragColor = vec4(color, 1.0);
}
`;
