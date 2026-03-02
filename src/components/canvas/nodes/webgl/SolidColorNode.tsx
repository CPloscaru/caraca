'use client';

import { useCallback, useEffect, useRef } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Paintbrush } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import type { SolidColorData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Shader
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
uniform vec3 uColor;
uniform float uAlpha;

void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SolidColorNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as SolidColorData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Mutable refs for RAF
  const colorRef = useRef(d.color ?? '#ffffff');
  const alphaRef = useRef(d.alpha ?? 1);

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Sync refs
  useEffect(() => { colorRef.current = d.color ?? '#ffffff'; }, [d.color]);
  useEffect(() => { alphaRef.current = d.alpha ?? 1; }, [d.alpha]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();
    const rt = checkout(512, 512);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const c = new THREE.Color(colorRef.current);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
        uAlpha: { value: alphaRef.current },
      },
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: 512, height: 512 });

    registerCallback(id, () => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      const col = new THREE.Color(colorRef.current);
      (mat.uniforms.uColor.value as THREE.Vector3).set(col.r, col.g, col.b);
      mat.uniforms.uAlpha.value = alphaRef.current;

      renderer.setRenderTarget(rtRef.current);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    });

    return () => {
      unregisterCallback(id);
      removeWebGLOutput(outputKey);
      checkin(rt);
      material.dispose();
      geometry.dispose();
      scene.clear();
      releaseRenderer();
      materialRef.current = null;
      rtRef.current = null;
    };
  }, [id]);

  // UI callbacks
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { color: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleAlphaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { alpha: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const color = d.color ?? '#ffffff';
  const alpha = d.alpha ?? 1;

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
        <Paintbrush size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Solid Color
        </span>
      </div>

      {/* Color picker */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Color
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            value={color}
            onChange={handleColorChange}
          />
          <span className="text-[10px] tabular-nums text-gray-400">
            {color}
          </span>
        </div>
      </div>

      {/* Alpha slider */}
      <div className="mb-1">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Alpha
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400"
            min={0}
            max={1}
            step={0.01}
            value={alpha}
            onChange={handleAlphaChange}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {alpha.toFixed(2)}
          </span>
        </div>
      </div>

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

export const SolidColorNode = withNodeErrorBoundary(SolidColorNodeInner);
export default SolidColorNode;
