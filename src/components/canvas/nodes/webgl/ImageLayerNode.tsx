'use client';

import { useEffect, useRef } from 'react';
import { type NodeProps, Position, useEdges, useNodes } from '@xyflow/react';
import { ImageIcon } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import type { ImageLayerData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uHasTexture;
uniform vec2 uTexSize;
uniform vec2 uRTSize;

void main() {
  if (uHasTexture < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }
  // Cover-crop UV transform
  float rtAspect = uRTSize.x / uRTSize.y;
  float texAspect = uTexSize.x / uTexSize.y;
  vec2 uv = vUv;
  if (texAspect > rtAspect) {
    float scale = rtAspect / texAspect;
    uv.x = uv.x * scale + (1.0 - scale) * 0.5;
  } else {
    float scale = texAspect / rtAspect;
    uv.y = uv.y * scale + (1.0 - scale) * 0.5;
  }
  gl_FragColor = texture2D(uTexture, uv);
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ImageLayerNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ImageLayerData;
  const edges = useEdges();
  const nodes = useNodes();

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  // Resolve image URL from upstream connection
  const imageUrl = (() => {
    const inEdge = edges.find(
      (e) => e.target === id && e.targetHandle === 'image-target-0',
    );
    if (!inEdge) return d.imageUrl ?? null;

    const sourceNode = nodes.find((n) => n.id === inEdge.source);
    if (!sourceNode) return null;

    const sd = sourceNode.data as Record<string, unknown>;
    // Try common image URL fields from AI generator nodes
    if (typeof sd.imageUrl === 'string') return sd.imageUrl;
    // ImageGenerator stores results in images array — use selected image
    const images = sd.images as Array<{ url: string }> | undefined;
    const selectedIdx = (sd.selectedImageIndex as number) ?? 0;
    if (images && images.length > 0) {
      return images[selectedIdx]?.url ?? images[0].url;
    }
    if (typeof sd.__result === 'string') return sd.__result;
    return null;
  })();

  // Load texture when URL changes
  useEffect(() => {
    if (imageUrl === loadedUrlRef.current) return;
    if (!imageUrl) {
      loadedUrlRef.current = null;
      if (materialRef.current) {
        materialRef.current.uniforms.uHasTexture.value = 0.0;
      }
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      return;
    }

    loadedUrlRef.current = imageUrl;
    textureLoader.load(
      imageUrl,
      (tex) => {
        // Verify URL is still current (avoid stale loads)
        if (loadedUrlRef.current !== imageUrl) {
          tex.dispose();
          return;
        }
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;

        // Dispose previous texture
        if (textureRef.current) textureRef.current.dispose();
        textureRef.current = tex;

        const mat = materialRef.current;
        if (mat) {
          mat.uniforms.uTexture.value = tex;
          mat.uniforms.uHasTexture.value = 1.0;
          mat.uniforms.uTexSize.value.set(
            tex.image.width || 512,
            tex.image.height || 512,
          );
        }
      },
      undefined,
      () => {
        // Load error -- keep transparent
        if (loadedUrlRef.current === imageUrl) {
          loadedUrlRef.current = null;
        }
      },
    );
  }, [imageUrl]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();
    const w = 512;
    const h = 512;
    const rt = checkout(w, h);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      uniforms: {
        uTexture: { value: null },
        uHasTexture: { value: 0.0 },
        uTexSize: { value: new THREE.Vector2(512, 512) },
        uRTSize: { value: new THREE.Vector2(w, h) },
      },
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: w, height: h });

    registerCallback(id, () => {
      if (!materialRef.current || !rtRef.current) return;
      renderer.setRenderTarget(rtRef.current);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    });

    return () => {
      unregisterCallback(id);
      removeWebGLOutput(outputKey);
      checkin(rt);
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      material.dispose();
      geometry.dispose();
      scene.clear();
      releaseRenderer();
      materialRef.current = null;
      rtRef.current = null;
      loadedUrlRef.current = null;
    };
  }, [id]);

  // Display label
  const statusLabel = imageUrl
    ? imageUrl.length > 30
      ? `${imageUrl.slice(0, 27)}...`
      : imageUrl
    : 'No image connected';

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
        maxWidth: 240,
        position: 'relative',
        boxShadow: selected
          ? '0 0 0 2px #ff6b35, 0 0 12px rgba(255, 107, 53, 0.3)'
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          userSelect: 'none',
        }}
      >
        <ImageIcon size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Image Layer
        </span>
      </div>

      {/* Status */}
      <div
        style={{
          fontSize: 10,
          color: imageUrl ? '#9ca3af' : '#6b7280',
          wordBreak: 'break-all',
          lineHeight: 1.4,
        }}
      >
        {statusLabel}
      </div>

      {/* Input port */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="image"
        portId="image-target-0"
        index={0}
        style={{ top: '50%' }}
      />

      {/* Output port */}
      <TypedHandle
        type="source"
        position={Position.Right}
        portType="webgl"
        portId="webgl-source-0"
        index={0}
        style={{ top: '50%' }}
      />
    </div>
  );
}

export const ImageLayerNode = withNodeErrorBoundary(ImageLayerNodeInner);
export default ImageLayerNode;
