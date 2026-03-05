/** Fullscreen quad vertex shader -- passes UV to fragment */
export const COLOR_CORRECTION_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Color Correction fragment shader
// Uniforms: uInputTexture, uHue, uSaturation, uBrightness, uContrast
// ---------------------------------------------------------------------------

export const COLOR_CORRECTION_FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInputTexture;
uniform float uHue;        // -180 to 180 (degrees)
uniform float uSaturation; // -1 to 1 (additive)
uniform float uBrightness; // -1 to 1
uniform float uContrast;   // -1 to 1

varying vec2 vUv;

// Standard RGB -> HSL conversion
vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;

  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

// Standard HSL -> RGB conversion
vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

void main() {
  vec4 texColor = texture2D(uInputTexture, vUv);

  // 1. Convert to HSL
  vec3 hsl = rgb2hsl(texColor.rgb);

  // 2. Shift hue (convert degrees to 0-1 range)
  hsl.x = mod(hsl.x + uHue / 360.0, 1.0);

  // 3. Adjust saturation (additive, clamped)
  hsl.y = clamp(hsl.y + uSaturation, 0.0, 1.0);

  // 4. Convert back to RGB
  vec3 rgb = hsl2rgb(hsl);

  // 5. Apply brightness (additive)
  rgb = rgb + uBrightness;

  // 6. Apply contrast (around midpoint)
  rgb = (rgb - 0.5) * (1.0 + uContrast) + 0.5;

  // 7. Clamp final output
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), texColor.a);
}
`;
