'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import { Droplets } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import {
  getWebGLOutput,
  setWebGLOutput,
  removeWebGLOutput,
} from '@/lib/webgl/output-map';
import { BLUR_VERT, BLUR_SHADERS } from './blur-shaders';
import type { BlurEffectData, BlurType } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EFFECT_COLOR = '#00bcd4';
const RT_SIZE = 512;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type PresetValues = Partial<
  Pick<BlurEffectData, 'radius' | 'strength' | 'centerX' | 'centerY' | 'angle'>
>;

const PRESETS: Record<BlurType, Record<string, PresetValues>> = {
  gaussian: {
    Subtle: { radius: 3 },
    Medium: { radius: 10 },
    Heavy: { radius: 25 },
  },
  radial: {
    'Light Zoom': { strength: 0.2, centerX: 0.5, centerY: 0.5 },
    'Heavy Zoom': { strength: 0.7, centerX: 0.5, centerY: 0.5 },
  },
  motion: {
    Gentle: { strength: 0.02, angle: 0 },
    'Fast Motion': { strength: 0.08, angle: 0 },
  },
};

// ---------------------------------------------------------------------------
// Slider + numeric input helper
// ---------------------------------------------------------------------------

const SLIDER_CLS =
  'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400';

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="mb-1.5">
      <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className={SLIDER_CLS}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="nodrag nowheel w-12 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-right text-[10px] tabular-nums text-gray-300 outline-none focus:border-white/20"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uniform builders
// ---------------------------------------------------------------------------

function buildGaussianUniforms(radius: number) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(RT_SIZE, RT_SIZE) },
    uDirection: { value: new THREE.Vector2(1, 0) },
    uRadius: { value: radius },
  };
}

function buildRadialUniforms(
  strength: number,
  cx: number,
  cy: number,
) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uCenter: { value: new THREE.Vector2(cx, cy) },
    uStrength: { value: strength },
  };
}

function buildMotionUniforms(strength: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uMotionDirection: { value: new THREE.Vector2(Math.cos(rad), Math.sin(rad)) },
    uStrength: { value: strength },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function BlurEffectNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as BlurEffectData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  // Derive input key from edges targeting this node
  const inputKey = useMemo(() => {
    const edge = edges.find(
      (e) => e.target === id && e.targetHandle === 'webgl-target-0',
    );
    if (!edge) return null;
    return `${edge.source}:${edge.sourceHandle}`;
  }, [edges, id]);

  // Mutable refs for RAF access
  const blurTypeRef = useRef<BlurType>(d.blurType ?? 'gaussian');
  const bypassRef = useRef(d.bypass ?? false);
  const radiusRef = useRef(d.radius ?? 10);
  const strengthRef = useRef(d.strength ?? 0.2);
  const centerXRef = useRef(d.centerX ?? 0.5);
  const centerYRef = useRef(d.centerY ?? 0.5);
  const angleRef = useRef(d.angle ?? 0);
  const inputKeyRef = useRef(inputKey);

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtARef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rtBRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Sync refs
  useEffect(() => { blurTypeRef.current = d.blurType ?? 'gaussian'; }, [d.blurType]);
  useEffect(() => { bypassRef.current = d.bypass ?? false; }, [d.bypass]);
  useEffect(() => { radiusRef.current = d.radius ?? 10; }, [d.radius]);
  useEffect(() => { strengthRef.current = d.strength ?? 0.2; }, [d.strength]);
  useEffect(() => { centerXRef.current = d.centerX ?? 0.5; }, [d.centerX]);
  useEffect(() => { centerYRef.current = d.centerY ?? 0.5; }, [d.centerY]);
  useEffect(() => { angleRef.current = d.angle ?? 0; }, [d.angle]);
  useEffect(() => { inputKeyRef.current = inputKey; }, [inputKey]);

  // Rebuild material when blur type changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const mesh = sceneRef.current?.children[0] as THREE.Mesh | undefined;
    if (!mesh) return;

    const type = d.blurType ?? 'gaussian';
    let uniforms: Record<string, { value: unknown }>;
    if (type === 'gaussian') {
      uniforms = buildGaussianUniforms(radiusRef.current);
    } else if (type === 'radial') {
      uniforms = buildRadialUniforms(strengthRef.current, centerXRef.current, centerYRef.current);
    } else {
      uniforms = buildMotionUniforms(strengthRef.current, angleRef.current);
    }

    const newMat = new THREE.ShaderMaterial({
      vertexShader: BLUR_VERT,
      fragmentShader: BLUR_SHADERS[type],
      uniforms,
    });
    mesh.material = newMat;
    materialRef.current = newMat;
    mat.dispose();
  }, [d.blurType]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();

    // Gaussian needs 2 RTs (2-pass), radial/motion need 1 (but we always checkout 2 for simplicity)
    const rtA = checkout(RT_SIZE, RT_SIZE);
    const rtB = checkout(RT_SIZE, RT_SIZE);
    rtARef.current = rtA;
    rtBRef.current = rtB;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const type = blurTypeRef.current;
    let uniforms: Record<string, { value: unknown }>;
    if (type === 'gaussian') {
      uniforms = buildGaussianUniforms(radiusRef.current);
    } else if (type === 'radial') {
      uniforms = buildRadialUniforms(strengthRef.current, centerXRef.current, centerYRef.current);
    } else {
      uniforms = buildMotionUniforms(strengthRef.current, angleRef.current);
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: BLUR_VERT,
      fragmentShader: BLUR_SHADERS[type],
      uniforms,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    // Initially register rtB as output (gaussian pass 2 writes here; single-pass also writes here)
    setWebGLOutput(outputKey, { target: rtB, width: RT_SIZE, height: RT_SIZE });

    registerCallback(id, () => {
      const mat = materialRef.current;
      if (!mat || !rtARef.current || !rtBRef.current) return;

      const ik = inputKeyRef.current;
      if (!ik) return; // No input connected

      const upstream = getWebGLOutput(ik);
      if (!upstream) return;

      // Bypass mode — pass through upstream texture directly
      if (bypassRef.current) {
        setWebGLOutput(outputKey, upstream);
        return;
      }

      // Restore our own output in case bypass just turned off
      setWebGLOutput(outputKey, { target: rtBRef.current!, width: RT_SIZE, height: RT_SIZE });

      const bt = blurTypeRef.current;

      if (bt === 'gaussian') {
        // Pass 1: horizontal blur (upstream -> rtA)
        mat.uniforms.uInputTexture.value = upstream.target.texture;
        mat.uniforms.uRadius.value = radiusRef.current;
        (mat.uniforms.uDirection.value as THREE.Vector2).set(1, 0);
        (mat.uniforms.uResolution.value as THREE.Vector2).set(RT_SIZE, RT_SIZE);

        renderer.setRenderTarget(rtARef.current);
        renderer.render(scene, camera);

        // Pass 2: vertical blur (rtA -> rtB)
        mat.uniforms.uInputTexture.value = rtARef.current!.texture;
        (mat.uniforms.uDirection.value as THREE.Vector2).set(0, 1);

        renderer.setRenderTarget(rtBRef.current);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      } else if (bt === 'radial') {
        mat.uniforms.uInputTexture.value = upstream.target.texture;
        mat.uniforms.uStrength.value = strengthRef.current;
        (mat.uniforms.uCenter.value as THREE.Vector2).set(
          centerXRef.current,
          centerYRef.current,
        );

        renderer.setRenderTarget(rtBRef.current);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      } else {
        // motion
        mat.uniforms.uInputTexture.value = upstream.target.texture;
        mat.uniforms.uStrength.value = strengthRef.current;
        const rad = (angleRef.current * Math.PI) / 180;
        (mat.uniforms.uMotionDirection.value as THREE.Vector2).set(
          Math.cos(rad),
          Math.sin(rad),
        );

        renderer.setRenderTarget(rtBRef.current);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
      }
    });

    return () => {
      unregisterCallback(id);
      removeWebGLOutput(outputKey);
      checkin(rtA);
      checkin(rtB);
      material.dispose();
      geometry.dispose();
      scene.clear();
      releaseRenderer();
      materialRef.current = null;
      sceneRef.current = null;
      geometryRef.current = null;
      rtARef.current = null;
      rtBRef.current = null;
    };
  }, [id]);

  // UI callbacks
  const handleChange = useCallback(
    (field: string, value: string | number | boolean) => {
      updateNodeData(id, { [field]: value });
    },
    [id, updateNodeData],
  );

  const handlePreset = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const name = e.target.value;
      if (!name) return;
      const bt = d.blurType ?? 'gaussian';
      const vals = PRESETS[bt]?.[name];
      if (vals) {
        updateNodeData(id, { ...vals, preset: name });
      }
    },
    [id, d.blurType, updateNodeData],
  );

  const handleBlurTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { blurType: e.target.value as BlurType, preset: '' });
    },
    [id, updateNodeData],
  );

  // Read values for UI
  const blurType = d.blurType ?? 'gaussian';
  const bypass = d.bypass ?? false;
  const radius = d.radius ?? 10;
  const strength = d.strength ?? 0.2;
  const centerX = d.centerX ?? 0.5;
  const centerY = d.centerY ?? 0.5;
  const angle = d.angle ?? 0;
  const preset = d.preset ?? '';
  const hasInput = inputKey !== null;

  const presetOptions = Object.keys(PRESETS[blurType] ?? {});

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
        opacity: bypass ? 0.5 : 1,
        boxShadow: selected
          ? `0 0 0 2px ${EFFECT_COLOR}, 0 0 12px rgba(0, 188, 212, 0.3)`
          : 'none',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease, opacity 0.2s ease',
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
        <Droplets size={14} color={EFFECT_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Blur Effect
        </span>
        {/* Bypass toggle */}
        <label
          className="nodrag flex cursor-pointer items-center gap-1"
          title={bypass ? 'Bypass ON (pass-through)' : 'Bypass OFF (effect active)'}
        >
          <input
            type="checkbox"
            className="nodrag nowheel h-3 w-3 cursor-pointer accent-cyan-500"
            checked={bypass}
            onChange={(e) => handleChange('bypass', e.target.checked)}
          />
          <span className="text-[9px] text-gray-500">Bypass</span>
        </label>
      </div>

      {!hasInput ? (
        /* Placeholder when no input connected */
        <div
          style={{
            padding: '16px 8px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: 11,
          }}
        >
          No input connected
        </div>
      ) : (
        <>
          {/* Blur type dropdown */}
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Type
            </span>
            <select
              className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
              value={blurType}
              onChange={handleBlurTypeChange}
            >
              <option value="gaussian">Gaussian</option>
              <option value="radial">Radial</option>
              <option value="motion">Motion</option>
            </select>
          </div>

          {/* Preset dropdown */}
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Preset
            </span>
            <select
              className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
              value={preset}
              onChange={handlePreset}
            >
              <option value="">Custom</option>
              {presetOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Type-specific controls */}
          {blurType === 'gaussian' && (
            <ParamSlider
              label="Radius"
              value={radius}
              min={1}
              max={30}
              step={1}
              onChange={(v) => handleChange('radius', v)}
            />
          )}

          {blurType === 'radial' && (
            <>
              <ParamSlider
                label="Strength"
                value={strength}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleChange('strength', v)}
              />
              <ParamSlider
                label="Center X"
                value={centerX}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleChange('centerX', v)}
              />
              <ParamSlider
                label="Center Y"
                value={centerY}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => handleChange('centerY', v)}
              />
            </>
          )}

          {blurType === 'motion' && (
            <>
              <ParamSlider
                label="Strength"
                value={strength}
                min={0}
                max={0.1}
                step={0.001}
                onChange={(v) => handleChange('strength', v)}
              />
              <ParamSlider
                label="Angle"
                value={angle}
                min={0}
                max={360}
                step={1}
                onChange={(v) => handleChange('angle', v)}
              />
            </>
          )}
        </>
      )}

      {/* Input port */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
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

export const BlurEffectNode = withNodeErrorBoundary(BlurEffectNodeInner);
export default BlurEffectNode;
