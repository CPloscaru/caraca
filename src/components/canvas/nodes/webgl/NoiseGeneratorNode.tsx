'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import { Waves } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import { getScalarOutput } from '@/lib/webgl/scalar-map';
import { NOISE_VERT, NOISE_SHADERS } from './noise-shaders';
import type { NoiseGeneratorData, NoiseType } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUniforms(
  scale: number,
  octaves: number,
  seed: number,
  dirX: number,
  dirY: number,
) {
  return {
    uTime: { value: 0 },
    uScale: { value: scale },
    uOctaves: { value: octaves },
    uSeed: { value: seed },
    uDirection: { value: new THREE.Vector2(dirX, dirY) },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function NoiseGeneratorNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as NoiseGeneratorData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  // Scalar edge keys for speed and scale overrides
  const speedEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-speed');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const scaleEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-scale');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const speedEdgeKeyRef = useRef(speedEdgeKey);
  const scaleEdgeKeyRef = useRef(scaleEdgeKey);
  useEffect(() => { speedEdgeKeyRef.current = speedEdgeKey; }, [speedEdgeKey]);
  useEffect(() => { scaleEdgeKeyRef.current = scaleEdgeKey; }, [scaleEdgeKey]);

  // Mutable refs for RAF
  const noiseTypeRef = useRef<NoiseType>(d.noiseType ?? 'perlin');
  const scaleRef = useRef(d.scale ?? 10);
  const octavesRef = useRef(d.octaves ?? 4);
  const speedRef = useRef(d.speed ?? 1);
  const seedRef = useRef(d.seed ?? 42);
  const directionXRef = useRef(d.directionX ?? 1);
  const directionYRef = useRef(d.directionY ?? 0);

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Sync refs
  useEffect(() => { noiseTypeRef.current = d.noiseType ?? 'perlin'; }, [d.noiseType]);
  useEffect(() => { scaleRef.current = d.scale ?? 10; }, [d.scale]);
  useEffect(() => { octavesRef.current = d.octaves ?? 4; }, [d.octaves]);
  useEffect(() => { speedRef.current = d.speed ?? 1; }, [d.speed]);
  useEffect(() => { seedRef.current = d.seed ?? 42; }, [d.seed]);
  useEffect(() => { directionXRef.current = d.directionX ?? 1; }, [d.directionX]);
  useEffect(() => { directionYRef.current = d.directionY ?? 0; }, [d.directionY]);

  // Rebuild material when noise type changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const mesh = sceneRef.current?.children[0] as THREE.Mesh | undefined;
    if (!mesh) return;

    const type = d.noiseType ?? 'perlin';
    const newMat = new THREE.ShaderMaterial({
      vertexShader: NOISE_VERT,
      fragmentShader: NOISE_SHADERS[type],
      uniforms: buildUniforms(
        scaleRef.current,
        octavesRef.current,
        seedRef.current,
        directionXRef.current,
        directionYRef.current,
      ),
    });
    mesh.material = newMat;
    materialRef.current = newMat;
    mat.dispose();
  }, [d.noiseType]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();
    const rt = checkout(512, 512);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const type = noiseTypeRef.current;
    const material = new THREE.ShaderMaterial({
      vertexShader: NOISE_VERT,
      fragmentShader: NOISE_SHADERS[type],
      uniforms: buildUniforms(
        scaleRef.current,
        octavesRef.current,
        seedRef.current,
        directionXRef.current,
        directionYRef.current,
      ),
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: 512, height: 512 });

    registerCallback(id, (time) => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      const sek = speedEdgeKeyRef.current;
      const scalarSpeed = sek ? getScalarOutput(sek) : undefined;
      const effectiveSpeed = scalarSpeed !== undefined ? scalarSpeed : speedRef.current;
      mat.uniforms.uTime.value = time * effectiveSpeed * 0.001;

      const sck = scaleEdgeKeyRef.current;
      const scalarScale = sck ? getScalarOutput(sck) : undefined;
      mat.uniforms.uScale.value = scalarScale !== undefined ? scalarScale * 100 : scaleRef.current;
      mat.uniforms.uOctaves.value = octavesRef.current;
      mat.uniforms.uSeed.value = seedRef.current;
      (mat.uniforms.uDirection.value as THREE.Vector2).set(
        directionXRef.current,
        directionYRef.current,
      );

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
      geometryRef.current = null;
      rtRef.current = null;
    };
  }, [id]);

  // UI callbacks
  const handleNoiseTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { noiseType: e.target.value as NoiseType });
    },
    [id, updateNodeData],
  );

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { scale: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleOctavesChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { octaves: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { speed: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleSeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { seed: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleDirXChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { directionX: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const handleDirYChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { directionY: Number(e.target.value) });
    },
    [id, updateNodeData],
  );

  const noiseType = d.noiseType ?? 'perlin';
  const scale = d.scale ?? 10;
  const octaves = d.octaves ?? 4;
  const speed = d.speed ?? 1;
  const seed = d.seed ?? 42;
  const directionX = d.directionX ?? 1;
  const directionY = d.directionY ?? 0;

  const sliderClass =
    'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400';

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
        <Waves size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Noise Generator
        </span>
      </div>

      {/* Noise type */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Type
        </span>
        <select
          className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          value={noiseType}
          onChange={handleNoiseTypeChange}
        >
          <option value="perlin">Perlin</option>
          <option value="simplex">Simplex</option>
          <option value="worley">Worley</option>
          <option value="cellular">Cellular</option>
        </select>
      </div>

      {/* Scale */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Scale
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={1}
            max={100}
            step={1}
            value={scale}
            onChange={handleScaleChange}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {scale}
          </span>
        </div>
      </div>

      {/* Octaves */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Octaves
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={1}
            max={8}
            step={1}
            value={octaves}
            onChange={handleOctavesChange}
          />
          <span className="w-4 text-right text-[10px] tabular-nums text-gray-400">
            {octaves}
          </span>
        </div>
      </div>

      {/* Speed */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Speed
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={5}
            step={0.1}
            value={speed}
            onChange={handleSpeedChange}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {speed.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Seed */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Seed
        </span>
        <input
          type="number"
          className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          min={0}
          max={9999}
          value={seed}
          onChange={handleSeedChange}
        />
      </div>

      {/* Direction X */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Direction X
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={-1}
            max={1}
            step={0.1}
            value={directionX}
            onChange={handleDirXChange}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {directionX.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Direction Y */}
      <div className="mb-1">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Direction Y
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={-1}
            max={1}
            step={0.1}
            value={directionY}
            onChange={handleDirYChange}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {directionY.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Scalar input ports */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-speed"
        handleId="scalar-target-speed"
        index={1}
        label="Speed"
        style={{ top: '80%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-scale"
        handleId="scalar-target-scale"
        index={2}
        label="Scale"
        style={{ top: '90%' }}
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

export const NoiseGeneratorNode = withNodeErrorBoundary(NoiseGeneratorNodeInner);
export default NoiseGeneratorNode;
