// ---------------------------------------------------------------------------
// Composition shaders — blend mode functions and 2-layer composition
// Used in multi-pass accumulation: blend one layer on top of a base per pass
// ---------------------------------------------------------------------------

/** Shared vertex shader for composition passes */
export const COMPOSITION_VERT = /* glsl */ `
precision highp float;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/**
 * Blend fragment shader — blends one layer on top of a base texture.
 * Uniforms:
 *   sampler2D uBase   — accumulated result (or first layer)
 *   sampler2D uLayer  — layer to blend on top
 *   int uBlendMode    — 0=normal, 1=multiply, 2=screen, 3=add
 *   float uOpacity    — layer opacity (0-1)
 */
export const COMPOSITION_BLEND_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uBase;
uniform sampler2D uLayer;
uniform int uBlendMode;
uniform float uOpacity;

varying vec2 vUv;

vec3 blendNormal(vec3 base, vec3 blend) {
  return blend;
}

vec3 blendMultiply(vec3 base, vec3 blend) {
  return base * blend;
}

vec3 blendScreen(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

vec3 blendAdd(vec3 base, vec3 blend) {
  return min(base + blend, 1.0);
}

void main() {
  vec4 base = texture2D(uBase, vUv);
  vec4 layer = texture2D(uLayer, vUv);

  vec3 blended;
  if (uBlendMode == 0) blended = blendNormal(base.rgb, layer.rgb);
  else if (uBlendMode == 1) blended = blendMultiply(base.rgb, layer.rgb);
  else if (uBlendMode == 2) blended = blendScreen(base.rgb, layer.rgb);
  else blended = blendAdd(base.rgb, layer.rgb);

  float a = layer.a * uOpacity;
  gl_FragColor = vec4(mix(base.rgb, blended, a), max(base.a, a));
}
`;

/**
 * Copy fragment shader — samples a single texture.
 * Used to initialize the accumulator with the first connected layer.
 */
export const COMPOSITION_COPY_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uSource;

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uSource, vUv);
}
`;
