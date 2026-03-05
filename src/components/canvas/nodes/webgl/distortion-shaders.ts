import type { DistortionType } from '@/types/canvas';

/** Fullscreen quad vertex shader -- passes UV to fragment */
export const DISTORTION_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Wave distortion — sin/cos UV displacement
// ---------------------------------------------------------------------------

const WAVE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform float uAmplitude;   // 0 - 0.1
uniform float uFrequency;   // 1 - 20
uniform float uSpeed;       // 0 - 5
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  uv.x += sin(uv.y * uFrequency + uTime * uSpeed) * uAmplitude;
  uv.y += cos(uv.x * uFrequency + uTime * uSpeed) * uAmplitude;
  gl_FragColor = texture2D(uInputTexture, uv);
}
`;

// ---------------------------------------------------------------------------
// Twist distortion — UV rotation proportional to distance from center
// ---------------------------------------------------------------------------

const TWIST_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform float uStrength; // 0 - 3
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 center = vec2(0.5);
  vec2 delta = vUv - center;
  float dist = length(delta);
  float angle = dist * uStrength * (1.0 + sin(uTime * 0.5) * 0.2);

  float cosA = cos(angle);
  float sinA = sin(angle);
  vec2 rotated = vec2(
    delta.x * cosA - delta.y * sinA,
    delta.x * sinA + delta.y * cosA
  );

  gl_FragColor = texture2D(uInputTexture, center + rotated);
}
`;

// ---------------------------------------------------------------------------
// Ripple distortion — concentric waves from center
// ---------------------------------------------------------------------------

const RIPPLE_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform float uAmplitude;  // 0 - 0.05
uniform float uFrequency;  // 5 - 30
uniform float uSpeed;      // 0 - 5
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 center = vec2(0.5);
  vec2 delta = vUv - center;
  float dist = length(delta);
  vec2 dir = normalize(delta + vec2(0.0001)); // avoid div by zero

  float offset = sin(dist * uFrequency - uTime * uSpeed) * uAmplitude;
  vec2 uv = vUv + dir * offset;

  gl_FragColor = texture2D(uInputTexture, uv);
}
`;

// ---------------------------------------------------------------------------
// Displacement — read R channel of displacement texture as UV offset
// ---------------------------------------------------------------------------

const DISPLACEMENT_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform sampler2D uDisplacementTexture;
uniform float uStrength; // 0 - 0.2

varying vec2 vUv;

void main() {
  vec4 dispSample = texture2D(uDisplacementTexture, vUv);
  // Use R and G channels for x/y displacement
  vec2 displacement = (dispSample.rg - 0.5) * 2.0 * uStrength;
  vec2 uv = vUv + displacement;
  gl_FragColor = texture2D(uInputTexture, uv);
}
`;

// ---------------------------------------------------------------------------
// Chromatic Aberration — split RGB channels with offset
// ---------------------------------------------------------------------------

const CHROMATIC_ABERRATION_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform float uIntensity; // 0 - 0.05
uniform vec2 uOffset;     // direction of aberration

varying vec2 vUv;

void main() {
  vec2 dir = uOffset * uIntensity;
  float r = texture2D(uInputTexture, vUv + dir).r;
  float g = texture2D(uInputTexture, vUv).g;
  float b = texture2D(uInputTexture, vUv - dir).b;
  float a = texture2D(uInputTexture, vUv).a;
  gl_FragColor = vec4(r, g, b, a);
}
`;

// ---------------------------------------------------------------------------
// Shader map
// ---------------------------------------------------------------------------

export const DISTORTION_SHADERS: Record<DistortionType, string> = {
  wave: WAVE_FRAG,
  twist: TWIST_FRAG,
  ripple: RIPPLE_FRAG,
  displacement: DISPLACEMENT_FRAG,
  chromatic_aberration: CHROMATIC_ABERRATION_FRAG,
};
