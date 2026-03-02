'use client';

import { useCallback, useEffect, useRef } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Palette } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { ColorStopEditor } from './ColorStopEditor';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import {
  FULLSCREEN_VERT,
  LINEAR_GRADIENT_FRAG,
  RADIAL_GRADIENT_FRAG,
  MESH_GRADIENT_FRAG,
} from './gradient-shaders';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import type {
  ColorStop,
  GradientGeneratorData,
  GradientType,
} from '@/types/canvas';

// ---------------------------------------------------------------------------
// Shader lookup
// ---------------------------------------------------------------------------

const FRAG_BY_TYPE: Record<GradientType, string> = {
  linear: LINEAR_GRADIENT_FRAG,
  radial: RADIAL_GRADIENT_FRAG,
  mesh: MESH_GRADIENT_FRAG,
};

// ---------------------------------------------------------------------------
// Default data
// ---------------------------------------------------------------------------

const DEFAULT_STOPS: ColorStop[] = [
  { color: '#6366f1', position: 0 },
  { color: '#ec4899', position: 1 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function buildUniforms(stops: ColorStop[], angle: number, speed: number) {
  const colors: THREE.Vector3[] = [];
  const positions: number[] = [];
  for (let i = 0; i < 8; i++) {
    const s = stops[i] ?? stops[stops.length - 1];
    colors.push(hexToVec3(s.color));
    positions.push(s.position);
  }
  return {
    uTime: { value: 0 },
    uAngle: { value: angle },
    uSpeed: { value: speed },
    uColors: { value: colors },
    uPositions: { value: positions },
    uColorCount: { value: stops.length },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function GradientGeneratorNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as GradientGeneratorData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Mutable refs for RAF — never setState inside the render callback
  const gradientTypeRef = useRef<GradientType>(d.gradientType ?? 'linear');
  const colorStopsRef = useRef<ColorStop[]>(d.colorStops ?? DEFAULT_STOPS);
  const angleRef = useRef(d.angle ?? 0);
  const speedRef = useRef(d.speed ?? 1);
  const widthRef = useRef(d.width ?? 512);
  const heightRef = useRef(d.height ?? 512);

  // Three.js objects refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Sync refs when props change
  useEffect(() => { gradientTypeRef.current = d.gradientType ?? 'linear'; }, [d.gradientType]);
  useEffect(() => { colorStopsRef.current = d.colorStops ?? DEFAULT_STOPS; }, [d.colorStops]);
  useEffect(() => { angleRef.current = d.angle ?? 0; }, [d.angle]);
  useEffect(() => { speedRef.current = d.speed ?? 1; }, [d.speed]);

  // Rebuild material when gradient type changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const mesh = sceneRef.current?.children[0] as THREE.Mesh | undefined;
    if (!mesh) return;

    const type = d.gradientType ?? 'linear';
    const newMat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG_BY_TYPE[type],
      uniforms: buildUniforms(
        colorStopsRef.current,
        angleRef.current,
        speedRef.current,
      ),
    });
    mesh.material = newMat;
    materialRef.current = newMat;
    mat.dispose();
  }, [d.gradientType]);

  // WebGL setup & RAF registration
  useEffect(() => {
    const renderer = acquireRenderer();
    rendererRef.current = renderer;

    const w = widthRef.current;
    const h = heightRef.current;
    const rt = checkout(w, h);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const type = gradientTypeRef.current;
    const material = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: FRAG_BY_TYPE[type],
      uniforms: buildUniforms(
        colorStopsRef.current,
        angleRef.current,
        speedRef.current,
      ),
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Expose output for downstream nodes
    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: w, height: h });

    registerCallback(id, (time) => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      // Update uniforms from refs
      mat.uniforms.uTime.value = time;
      mat.uniforms.uAngle.value = angleRef.current;
      mat.uniforms.uSpeed.value = speedRef.current;

      const stops = colorStopsRef.current;
      const colors = mat.uniforms.uColors.value as THREE.Vector3[];
      const positions = mat.uniforms.uPositions.value as number[];
      for (let i = 0; i < 8; i++) {
        const s = stops[i] ?? stops[stops.length - 1];
        const c = new THREE.Color(s.color);
        colors[i].set(c.r, c.g, c.b);
        positions[i] = s.position;
      }
      mat.uniforms.uColorCount.value = stops.length;

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
      sceneRef.current = null;
      cameraRef.current = null;
      geometryRef.current = null;
      rtRef.current = null;
      rendererRef.current = null;
    };
  }, [id]);

  // --- UI callbacks ---

  const handleGradientTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { gradientType: e.target.value as GradientType });
    },
    [id, updateNodeData],
  );

  const handleColorStopsChange = useCallback(
    (stops: ColorStop[]) => {
      updateNodeData(id, { colorStops: stops });
    },
    [id, updateNodeData],
  );

  const handleAngleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { angle: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { speed: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const gradientType = d.gradientType ?? 'linear';
  const colorStops = d.colorStops ?? DEFAULT_STOPS;
  const angle = d.angle ?? 0;
  const speed = d.speed ?? 1;

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 220,
        maxWidth: 260,
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
        <Palette size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Gradient Generator
        </span>
      </div>

      {/* Gradient type dropdown */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Type
        </span>
        <select
          className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          value={gradientType}
          onChange={handleGradientTypeChange}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
          <option value="mesh">Mesh</option>
        </select>
      </div>

      {/* Color stops editor */}
      <ColorStopEditor
        colorStops={colorStops}
        onChange={handleColorStopsChange}
      />

      {/* Angle slider — linear only */}
      {gradientType === 'linear' && (
        <div className="mb-1.5">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Angle
          </span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              className="nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400"
              min={0}
              max={360}
              step={1}
              value={angle}
              onChange={handleAngleChange}
            />
            <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
              {angle}&deg;
            </span>
          </div>
        </div>
      )}

      {/* Speed slider */}
      <div className="mb-1">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Speed
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className="nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400"
            min={0}
            max={5}
            step={0.1}
            value={speed}
            onChange={handleSpeedChange}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {speed.toFixed(1)}
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

export const GradientGeneratorNode = withNodeErrorBoundary(GradientGeneratorNodeInner);

// Default export for webglDynamic() — avoids type-narrowing issues with .then()
export default GradientGeneratorNode;
