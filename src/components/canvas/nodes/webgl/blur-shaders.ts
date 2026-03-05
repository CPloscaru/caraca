import type { BlurType } from '@/types/canvas';

/** Fullscreen quad vertex shader -- passes UV to fragment */
export const BLUR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Gaussian blur (separable 2-pass) — same shader, uDirection switches axis
// ---------------------------------------------------------------------------

const GAUSSIAN_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform vec2 uResolution;
uniform vec2 uDirection;
uniform float uRadius;

varying vec2 vUv;

void main() {
  float sigma = max(uRadius * 0.5, 0.001);
  float twoSigmaSq = 2.0 * sigma * sigma;
  vec2 texelSize = 1.0 / uResolution;

  vec4 color = vec4(0.0);
  float weightSum = 0.0;

  int iRadius = int(ceil(uRadius));

  for (int i = -30; i <= 30; i++) {
    if (abs(i) > iRadius) continue;
    float fi = float(i);
    float w = exp(-fi * fi / twoSigmaSq);
    vec2 offset = uDirection * fi * texelSize;
    color += texture2D(uInputTexture, vUv + offset) * w;
    weightSum += w;
  }

  gl_FragColor = color / weightSum;
}
`;

// ---------------------------------------------------------------------------
// Radial blur — single pass, samples toward/away from center
// ---------------------------------------------------------------------------

const RADIAL_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform vec2 uCenter;
uniform float uStrength;

varying vec2 vUv;

const int SAMPLES = 16;

void main() {
  vec2 dir = vUv - uCenter;
  vec4 color = vec4(0.0);

  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1);
    float offset = (t - 0.5) * uStrength;
    vec2 sampleUV = vUv + dir * offset;
    color += texture2D(uInputTexture, sampleUV);
  }

  gl_FragColor = color / float(SAMPLES);
}
`;

// ---------------------------------------------------------------------------
// Motion blur — single pass, samples along direction vector
// ---------------------------------------------------------------------------

const MOTION_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform vec2 uMotionDirection;
uniform float uStrength;

varying vec2 vUv;

const int SAMPLES = 16;

void main() {
  vec4 color = vec4(0.0);
  vec2 step = uMotionDirection * uStrength;

  for (int i = 0; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1) - 0.5;
    vec2 sampleUV = vUv + step * t;
    color += texture2D(uInputTexture, sampleUV);
  }

  gl_FragColor = color / float(SAMPLES);
}
`;

// ---------------------------------------------------------------------------
// Shader map
// ---------------------------------------------------------------------------

export const BLUR_SHADERS: Record<BlurType, string> = {
  gaussian: GAUSSIAN_FRAG,
  radial: RADIAL_FRAG,
  motion: MOTION_FRAG,
};
