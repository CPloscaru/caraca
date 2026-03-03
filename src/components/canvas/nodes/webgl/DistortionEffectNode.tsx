'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useEdges, useUpdateNodeInternals } from '@xyflow/react';
import { Wand2 } from 'lucide-react';
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
import { getScalarOutput } from '@/lib/webgl/scalar-map';
import { DISTORTION_VERT, DISTORTION_SHADERS } from './distortion-shaders';
import type { DistortionEffectData, DistortionType } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EFFECT_COLOR = '#00bcd4';
const RT_SIZE = 512;

const DISTORTION_LABELS: Record<DistortionType, string> = {
  wave: 'Wave',
  twist: 'Twist',
  ripple: 'Ripple',
  displacement: 'Displacement',
  chromatic_aberration: 'Chromatic Aberration',
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type PresetValues = Partial<
  Pick<DistortionEffectData, 'amplitude' | 'frequency' | 'speed' | 'strength' | 'intensity' | 'angle'>
>;

const PRESETS: Record<DistortionType, Record<string, PresetValues>> = {
  wave: {
    'Gentle Wave': { amplitude: 0.02, frequency: 5, speed: 1 },
    Ocean: { amplitude: 0.06, frequency: 10, speed: 2 },
  },
  twist: {
    'Light Twist': { strength: 0.5 },
    Vortex: { strength: 2.5 },
  },
  ripple: {
    Puddle: { amplitude: 0.01, frequency: 10, speed: 2 },
    Sonar: { amplitude: 0.03, frequency: 20, speed: 3 },
  },
  displacement: {
    Subtle: { strength: 0.03 },
    Strong: { strength: 0.15 },
  },
  chromatic_aberration: {
    Film: { intensity: 0.01, angle: 0 },
    Glitch: { intensity: 0.04, angle: 45 },
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

function buildWaveUniforms(amp: number, freq: number, speed: number) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uAmplitude: { value: amp },
    uFrequency: { value: freq },
    uSpeed: { value: speed },
    uTime: { value: 0 },
  };
}

function buildTwistUniforms(strength: number) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uStrength: { value: strength },
    uTime: { value: 0 },
  };
}

function buildRippleUniforms(amp: number, freq: number, speed: number) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uAmplitude: { value: amp },
    uFrequency: { value: freq },
    uSpeed: { value: speed },
    uTime: { value: 0 },
  };
}

function buildDisplacementUniforms(strength: number) {
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uDisplacementTexture: { value: null as THREE.Texture | null },
    uStrength: { value: strength },
  };
}

function buildChromaticUniforms(intensity: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  return {
    uInputTexture: { value: null as THREE.Texture | null },
    uIntensity: { value: intensity },
    uOffset: { value: new THREE.Vector2(Math.cos(rad), Math.sin(rad)) },
  };
}

function buildUniforms(type: DistortionType, d: {
  amplitude: number;
  frequency: number;
  speed: number;
  strength: number;
  intensity: number;
  angle: number;
}) {
  switch (type) {
    case 'wave': return buildWaveUniforms(d.amplitude, d.frequency, d.speed);
    case 'twist': return buildTwistUniforms(d.strength);
    case 'ripple': return buildRippleUniforms(d.amplitude, d.frequency, d.speed);
    case 'displacement': return buildDisplacementUniforms(d.strength);
    case 'chromatic_aberration': return buildChromaticUniforms(d.intensity, d.angle);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DistortionEffectNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as DistortionEffectData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();

  const distortionType = d.distortionType ?? 'wave';

  // Derive input keys from edges
  const inputKey = useMemo(() => {
    const edge = edges.find(
      (e) => e.target === id && e.targetHandle === 'webgl-target-0',
    );
    if (!edge) return null;
    return `${edge.source}:${edge.sourceHandle}`;
  }, [edges, id]);

  const displacementKey = useMemo(() => {
    if (distortionType !== 'displacement') return null;
    const edge = edges.find(
      (e) => e.target === id && e.targetHandle === 'webgl-target-1',
    );
    if (!edge) return null;
    return `${edge.source}:${edge.sourceHandle}`;
  }, [edges, id, distortionType]);

  // Scalar edge keys for speed and amplitude overrides
  const speedEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-speed');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const amplitudeEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-amplitude');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const speedEdgeKeyRef = useRef(speedEdgeKey);
  const amplitudeEdgeKeyRef = useRef(amplitudeEdgeKey);
  useEffect(() => { speedEdgeKeyRef.current = speedEdgeKey; }, [speedEdgeKey]);
  useEffect(() => { amplitudeEdgeKeyRef.current = amplitudeEdgeKey; }, [amplitudeEdgeKey]);

  // Mutable refs for RAF
  const distortionTypeRef = useRef<DistortionType>(distortionType);
  const bypassRef = useRef(d.bypass ?? false);
  const amplitudeRef = useRef(d.amplitude ?? 0.02);
  const frequencyRef = useRef(d.frequency ?? 5);
  const speedRef = useRef(d.speed ?? 1);
  const strengthRef = useRef(d.strength ?? 0.5);
  const intensityRef = useRef(d.intensity ?? 0.01);
  const angleRef = useRef(d.angle ?? 0);
  const inputKeyRef = useRef(inputKey);
  const displacementKeyRef = useRef(displacementKey);

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Sync refs
  useEffect(() => { distortionTypeRef.current = distortionType; }, [distortionType]);
  useEffect(() => { bypassRef.current = d.bypass ?? false; }, [d.bypass]);
  useEffect(() => { amplitudeRef.current = d.amplitude ?? 0.02; }, [d.amplitude]);
  useEffect(() => { frequencyRef.current = d.frequency ?? 5; }, [d.frequency]);
  useEffect(() => { speedRef.current = d.speed ?? 1; }, [d.speed]);
  useEffect(() => { strengthRef.current = d.strength ?? 0.5; }, [d.strength]);
  useEffect(() => { intensityRef.current = d.intensity ?? 0.01; }, [d.intensity]);
  useEffect(() => { angleRef.current = d.angle ?? 0; }, [d.angle]);
  useEffect(() => { inputKeyRef.current = inputKey; }, [inputKey]);
  useEffect(() => { displacementKeyRef.current = displacementKey; }, [displacementKey]);

  // Clean up edges connected to displacement port when switching away from displacement
  const prevTypeRef = useRef(distortionType);
  useEffect(() => {
    const prev = prevTypeRef.current;
    prevTypeRef.current = distortionType;

    if (prev === 'displacement' && distortionType !== 'displacement') {
      // Find and remove any edge connected to webgl-target-1
      const dispEdge = edges.find(
        (e) => e.target === id && e.targetHandle === 'webgl-target-1',
      );
      if (dispEdge) {
        useCanvasStore.getState().onEdgesChange([{ type: 'remove', id: dispEdge.id }]);
      }
      // Re-measure handles
      updateNodeInternals(id);
    } else if (prev !== 'displacement' && distortionType === 'displacement') {
      // Re-measure handles when showing the new port
      updateNodeInternals(id);
    }
  }, [distortionType, edges, id, updateNodeInternals]);

  // Rebuild material when distortion type changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const mesh = sceneRef.current?.children[0] as THREE.Mesh | undefined;
    if (!mesh) return;

    const vals = {
      amplitude: amplitudeRef.current,
      frequency: frequencyRef.current,
      speed: speedRef.current,
      strength: strengthRef.current,
      intensity: intensityRef.current,
      angle: angleRef.current,
    };

    const newMat = new THREE.ShaderMaterial({
      vertexShader: DISTORTION_VERT,
      fragmentShader: DISTORTION_SHADERS[distortionType],
      uniforms: buildUniforms(distortionType, vals),
    });
    mesh.material = newMat;
    materialRef.current = newMat;
    mat.dispose();
  }, [distortionType]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();
    const rt = checkout(RT_SIZE, RT_SIZE);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const type = distortionTypeRef.current;
    const vals = {
      amplitude: amplitudeRef.current,
      frequency: frequencyRef.current,
      speed: speedRef.current,
      strength: strengthRef.current,
      intensity: intensityRef.current,
      angle: angleRef.current,
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: DISTORTION_VERT,
      fragmentShader: DISTORTION_SHADERS[type],
      uniforms: buildUniforms(type, vals),
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: RT_SIZE, height: RT_SIZE });

    registerCallback(id, (time) => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      const ik = inputKeyRef.current;
      if (!ik) return;

      const upstream = getWebGLOutput(ik);
      if (!upstream) return;

      // Bypass
      if (bypassRef.current) {
        setWebGLOutput(outputKey, upstream);
        return;
      }

      // Restore own output
      setWebGLOutput(outputKey, { target: rtRef.current!, width: RT_SIZE, height: RT_SIZE });

      mat.uniforms.uInputTexture.value = upstream.target.texture;

      const dt = distortionTypeRef.current;

      const sek = speedEdgeKeyRef.current;
      const scalarSpeed = sek ? getScalarOutput(sek) : undefined;
      const aek = amplitudeEdgeKeyRef.current;
      const scalarAmplitude = aek ? getScalarOutput(aek) : undefined;

      if (dt === 'wave') {
        mat.uniforms.uAmplitude.value = scalarAmplitude !== undefined ? scalarAmplitude * 0.1 : amplitudeRef.current;
        mat.uniforms.uFrequency.value = frequencyRef.current;
        mat.uniforms.uSpeed.value = scalarSpeed !== undefined ? scalarSpeed * 5 : speedRef.current;
        mat.uniforms.uTime.value = time;
      } else if (dt === 'twist') {
        mat.uniforms.uStrength.value = strengthRef.current;
        mat.uniforms.uTime.value = time;
      } else if (dt === 'ripple') {
        mat.uniforms.uAmplitude.value = scalarAmplitude !== undefined ? scalarAmplitude * 0.05 : amplitudeRef.current;
        mat.uniforms.uFrequency.value = frequencyRef.current;
        mat.uniforms.uSpeed.value = scalarSpeed !== undefined ? scalarSpeed * 5 : speedRef.current;
        mat.uniforms.uTime.value = time;
      } else if (dt === 'displacement') {
        mat.uniforms.uStrength.value = strengthRef.current;
        // Read displacement texture from second input
        const dk = displacementKeyRef.current;
        if (dk) {
          const dispUpstream = getWebGLOutput(dk);
          if (dispUpstream) {
            mat.uniforms.uDisplacementTexture.value = dispUpstream.target.texture;
          }
        }
      } else {
        // chromatic_aberration
        mat.uniforms.uIntensity.value = intensityRef.current;
        const rad = (angleRef.current * Math.PI) / 180;
        (mat.uniforms.uOffset.value as THREE.Vector2).set(
          Math.cos(rad),
          Math.sin(rad),
        );
      }

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
      const dt = distortionType;
      const vals = PRESETS[dt]?.[name];
      if (vals) {
        updateNodeData(id, { ...vals, preset: name });
      }
    },
    [id, distortionType, updateNodeData],
  );

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { distortionType: e.target.value as DistortionType, preset: '' });
    },
    [id, updateNodeData],
  );

  // Read values for UI
  const bypass = d.bypass ?? false;
  const amplitude = d.amplitude ?? 0.02;
  const frequency = d.frequency ?? 5;
  const speed = d.speed ?? 1;
  const strength = d.strength ?? 0.5;
  const intensity = d.intensity ?? 0.01;
  const angle = d.angle ?? 0;
  const preset = d.preset ?? '';
  const hasInput = inputKey !== null;

  const presetOptions = Object.keys(PRESETS[distortionType] ?? {});

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
        <Wand2 size={14} color={EFFECT_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Distortion Effect
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
          {/* Distortion type dropdown */}
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Type
            </span>
            <select
              className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
              value={distortionType}
              onChange={handleTypeChange}
            >
              {(Object.keys(DISTORTION_LABELS) as DistortionType[]).map((t) => (
                <option key={t} value={t}>
                  {DISTORTION_LABELS[t]}
                </option>
              ))}
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
          {distortionType === 'wave' && (
            <>
              <ParamSlider label="Amplitude" value={amplitude} min={0} max={0.1} step={0.001} onChange={(v) => handleChange('amplitude', v)} />
              <ParamSlider label="Frequency" value={frequency} min={1} max={20} step={0.5} onChange={(v) => handleChange('frequency', v)} />
              <ParamSlider label="Speed" value={speed} min={0} max={5} step={0.1} onChange={(v) => handleChange('speed', v)} />
            </>
          )}

          {distortionType === 'twist' && (
            <ParamSlider label="Strength" value={strength} min={0} max={3} step={0.05} onChange={(v) => handleChange('strength', v)} />
          )}

          {distortionType === 'ripple' && (
            <>
              <ParamSlider label="Amplitude" value={amplitude} min={0} max={0.05} step={0.001} onChange={(v) => handleChange('amplitude', v)} />
              <ParamSlider label="Frequency" value={frequency} min={5} max={30} step={1} onChange={(v) => handleChange('frequency', v)} />
              <ParamSlider label="Speed" value={speed} min={0} max={5} step={0.1} onChange={(v) => handleChange('speed', v)} />
            </>
          )}

          {distortionType === 'displacement' && (
            <ParamSlider label="Strength" value={strength} min={0} max={0.2} step={0.005} onChange={(v) => handleChange('strength', v)} />
          )}

          {distortionType === 'chromatic_aberration' && (
            <>
              <ParamSlider label="Intensity" value={intensity} min={0} max={0.05} step={0.001} onChange={(v) => handleChange('intensity', v)} />
              <ParamSlider label="Angle" value={angle} min={0} max={360} step={1} onChange={(v) => handleChange('angle', v)} />
            </>
          )}
        </>
      )}

      {/* Primary input port */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
        index={0}
        style={{ top: distortionType === 'displacement' ? '30%' : '35%' }}
      />

      {/* Conditional displacement map port */}
      {distortionType === 'displacement' && (
        <TypedHandle
          type="target"
          position={Position.Left}
          portType="webgl"
          portId="webgl-target-1"
          index={1}
          label="Displacement Map"
          style={{ top: '50%' }}
        />
      )}

      {/* Scalar input ports */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-speed"
        handleId="scalar-target-speed"
        index={2}
        label="Speed"
        style={{ top: '80%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-amplitude"
        handleId="scalar-target-amplitude"
        index={3}
        label="Amplitude"
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

export const DistortionEffectNode = withNodeErrorBoundary(DistortionEffectNodeInner);
export default DistortionEffectNode;
