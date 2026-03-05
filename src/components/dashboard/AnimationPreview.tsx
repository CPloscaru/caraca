'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';

// ---------------------------------------------------------------------------
// Simplified shader sources for template preview thumbnails
// ---------------------------------------------------------------------------

const GRADIENT_FRAG = `
precision highp float;
uniform float u_time;
varying vec2 vUv;

void main() {
  float t = u_time * 0.3;
  vec3 c1 = vec3(1.0, 0.42, 0.42);   // #ff6b6b
  vec3 c2 = vec3(0.31, 0.80, 0.77);  // #4ecdc4
  vec3 c3 = vec3(0.95, 0.77, 0.06);  // #f2c40f
  float angle = t + vUv.x * 3.14159;
  float mix1 = sin(angle) * 0.5 + 0.5;
  float mix2 = cos(angle + vUv.y * 2.0) * 0.5 + 0.5;
  vec3 color = mix(mix(c1, c2, mix1), c3, mix2 * 0.4);
  gl_FragColor = vec4(color, 1.0);
}
`;

const NOISE_FRAG = `
precision highp float;
uniform float u_time;
varying vec2 vUv;

// Simplex-like hash noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  float t = u_time * 0.2;
  vec2 uv = vUv * 4.0;
  float n = snoise(uv + t) * 0.5 + 0.5;
  float n2 = snoise(uv * 2.0 - t * 0.7) * 0.5 + 0.5;
  vec3 c1 = vec3(0.63, 0.55, 0.82);  // purple
  vec3 c2 = vec3(0.98, 0.76, 0.92);  // pink
  vec3 color = mix(c1, c2, n * n2);
  gl_FragColor = vec4(color, 1.0);
}
`;

const AI_BRIDGE_FRAG = `
precision highp float;
uniform float u_time;
varying vec2 vUv;

void main() {
  float t = u_time * 0.15;
  float d = length(vUv - 0.5);
  vec3 c1 = vec3(0.94, 0.58, 0.98);  // #f093fb
  vec3 c2 = vec3(0.96, 0.34, 0.42);  // #f5576c
  float wave = sin(d * 10.0 - t * 3.0) * 0.5 + 0.5;
  vec3 color = mix(c1, c2, wave * 0.6 + d * 0.4);
  gl_FragColor = vec4(color, 1.0);
}
`;

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Shader selection by template ID
// ---------------------------------------------------------------------------

function getFragmentShader(templateId: string): string {
  if (templateId.includes('gradient') || templateId === 'wf9') return GRADIENT_FRAG;
  if (templateId.includes('noise') || templateId.includes('generative') || templateId === 'wf10') return NOISE_FRAG;
  return AI_BRIDGE_FRAG;
}

// ---------------------------------------------------------------------------
// Inner component (client-only, uses WebGL)
// ---------------------------------------------------------------------------

type AnimationPreviewInnerProps = {
  templateId: string;
  width?: number;
  height?: number;
};

function AnimationPreviewInner({
  templateId,
  width = 280,
  height = 160,
}: AnimationPreviewInnerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visibleRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // IntersectionObserver: only render when visible
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.01 },
    );
    observer.observe(canvas);

    // Set up Three.js resources
    const renderer = acquireRenderer();
    const rt = new THREE.WebGLRenderTarget(width, height);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: getFragmentShader(templateId),
      uniforms: { u_time: { value: 0 } },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    scene.add(mesh);

    // Pixel buffer for readPixels blit
    const pixelBuf = new Uint8Array(width * height * 4);

    // 2D canvas context for display
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const startTime = performance.now();

    // 10 FPS interval (100ms)
    const intervalId = setInterval(() => {
      if (!visibleRef.current || !ctx) return;

      material.uniforms.u_time.value = (performance.now() - startTime) / 1000;

      renderer.setRenderTarget(rt);
      renderer.setSize(width, height, false);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);

      // Read pixels and blit to 2D canvas
      renderer.readRenderTargetPixels(rt, 0, 0, width, height, pixelBuf);

      // Flip vertically (WebGL is bottom-up)
      const rowSize = width * 4;
      const halfH = (height / 2) | 0;
      const tempRow = new Uint8Array(rowSize);
      for (let y = 0; y < halfH; y++) {
        const top = y * rowSize;
        const bottom = (height - 1 - y) * rowSize;
        tempRow.set(pixelBuf.subarray(top, top + rowSize));
        pixelBuf.copyWithin(top, bottom, bottom + rowSize);
        pixelBuf.set(tempRow, bottom);
      }

      const clamped = new Uint8ClampedArray(pixelBuf.length);
      clamped.set(pixelBuf);
      ctx.putImageData(new ImageData(clamped, width, height), 0, 0);
    }, 100);

    cleanupRef.current = () => {
      clearInterval(intervalId);
      observer.disconnect();
      rt.dispose();
      material.dispose();
      mesh.geometry.dispose();
      releaseRenderer();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [templateId, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: height,
        borderRadius: 0,
        display: 'block',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Public component — dynamic import wrapper (SSR-safe)
// ---------------------------------------------------------------------------

const AnimationPreviewDynamic = dynamic(
  () => Promise.resolve(AnimationPreviewInner),
  { ssr: false },
);

export type AnimationPreviewProps = {
  templateId: string;
  width?: number;
  height?: number;
};

export function AnimationPreview(props: AnimationPreviewProps) {
  return <AnimationPreviewDynamic {...props} />;
}
