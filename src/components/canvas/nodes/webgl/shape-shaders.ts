/** Fullscreen quad vertex shader — passes UV to fragment */
export const SHAPE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Shared SDF helpers (inlined into each fragment shader)
// ---------------------------------------------------------------------------

const SDF_COMMON = /* glsl */ `
precision highp float;

uniform vec3 uFillColor;
uniform float uFillAlpha;
uniform vec3 uBorderColor;
uniform float uBorderWidth;
uniform float uOpacity;
uniform float uRotation;
uniform float uOffsetX;
uniform float uOffsetY;
uniform vec4 uBgColor;     // rgb + alpha
uniform vec2 uResolution;

varying vec2 vUv;

/** Apply rotation to UV coords around center */
vec2 rotateUV(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c) * p;
}

/** Render shape from SDF distance with fill, border, and background */
vec4 renderSDF(float d) {
  float aa = fwidth(d);

  // Fill region: d < 0 (inside shape), shrunk by border width
  float innerD = d + uBorderWidth;
  float fillMask = 1.0 - smoothstep(-aa, aa, innerD);

  // Border region: between inner edge and outer edge
  float outerMask = 1.0 - smoothstep(-aa, aa, d);
  float borderMask = outerMask - fillMask;
  borderMask = max(borderMask, 0.0);

  // Compose layers
  vec4 fill = vec4(uFillColor, uFillAlpha) * fillMask;
  vec4 border = vec4(uBorderColor, 1.0) * borderMask;
  vec4 bg = uBgColor;

  // Blend: background <- fill <- border
  vec4 result = bg;
  result = mix(result, fill, fill.a);
  result = mix(result, border, border.a);
  result.a *= uOpacity;

  return result;
}
`;

// ---------------------------------------------------------------------------
// Rectangle fragment shader — SDF with per-corner rounding (Inigo Quilez)
// ---------------------------------------------------------------------------

export const RECTANGLE_FRAG = /* glsl */ `
${SDF_COMMON}

uniform float uWidth;
uniform float uHeight;
uniform float uCornerTL;
uniform float uCornerTR;
uniform float uCornerBL;
uniform float uCornerBR;

float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
  // r.x = top-right, r.y = bottom-right, r.z = bottom-left, r.w = top-left
  r.xy = (p.x > 0.0) ? r.xy : r.wz;
  r.x  = (p.y > 0.0) ? r.x  : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

void main() {
  vec2 p = vUv - 0.5;
  p += vec2(uOffsetX, uOffsetY);
  p = rotateUV(p, uRotation);

  // Corner radii: TR, BR, BL, TL
  vec4 corners = vec4(uCornerTR, uCornerBR, uCornerBL, uCornerTL);
  float d = sdRoundedBox(p, vec2(uWidth, uHeight) * 0.5, corners);

  gl_FragColor = renderSDF(d);
}
`;

// ---------------------------------------------------------------------------
// Circle fragment shader
// ---------------------------------------------------------------------------

export const CIRCLE_FRAG = /* glsl */ `
${SDF_COMMON}

uniform float uRadius;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

void main() {
  vec2 p = vUv - 0.5;
  p += vec2(uOffsetX, uOffsetY);
  p = rotateUV(p, uRotation);

  float d = sdCircle(p, uRadius);
  gl_FragColor = renderSDF(d);
}
`;

// ---------------------------------------------------------------------------
// Polygon fragment shader — regular polygon + star mode
// ---------------------------------------------------------------------------

export const POLYGON_FRAG = /* glsl */ `
${SDF_COMMON}

uniform float uPolyRadius;
uniform int uSides;
uniform bool uStarMode;
uniform float uInnerRadius;

float sdPolygon(vec2 p, float r, int n) {
  float an = 3.141593 / float(n);
  float he = r * cos(an);
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= vec2(he, 0.0);
  p.y += clamp(-p.y, 0.0, r * sin(an));
  return length(p) * sign(p.x);
}

float sdStar(vec2 p, float outerR, float innerR, int n) {
  float angle = atan(p.y, p.x);
  float segAngle = 3.141593 * 2.0 / float(n);
  float halfSeg = segAngle * 0.5;
  float a = mod(angle + halfSeg, segAngle) - halfSeg;
  float dist = length(p);

  // Interpolate between outer and inner radius based on angle within segment
  float t = abs(a) / halfSeg; // 0 at vertex, 1 at midpoint
  float edgeR = mix(outerR, innerR, t);

  // Approximate SDF: distance from the interpolated edge
  return dist - edgeR;
}

void main() {
  vec2 p = vUv - 0.5;
  p += vec2(uOffsetX, uOffsetY);
  p = rotateUV(p, uRotation);

  float d;
  if (uStarMode) {
    d = sdStar(p, uPolyRadius, uInnerRadius, uSides);
  } else {
    d = sdPolygon(p, uPolyRadius, uSides);
  }

  gl_FragColor = renderSDF(d);
}
`;

// ---------------------------------------------------------------------------
// Export map keyed by shape type
// ---------------------------------------------------------------------------

export type ShapeType = 'rectangle' | 'circle' | 'polygon';

export const SHAPE_FRAGMENT_SHADERS: Record<ShapeType, string> = {
  rectangle: RECTANGLE_FRAG,
  circle: CIRCLE_FRAG,
  polygon: POLYGON_FRAG,
};
