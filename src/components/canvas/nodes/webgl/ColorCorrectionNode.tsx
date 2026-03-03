'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import { Palette, ChevronDown, ChevronRight } from 'lucide-react';
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
import {
  COLOR_CORRECTION_VERT,
  COLOR_CORRECTION_FRAG,
} from './color-correction-shaders';
import type { ColorCorrectionData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EFFECT_COLOR = '#00bcd4';
const RT_SIZE = 512;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type PresetValues = Pick<
  ColorCorrectionData,
  'hue' | 'saturation' | 'brightness' | 'contrast'
>;

const PRESETS: Record<string, PresetValues> = {
  Warm: { hue: 15, saturation: 0.1, brightness: 0.05, contrast: 0.1 },
  Cool: { hue: -15, saturation: 0, brightness: 0, contrast: 0.05 },
  Desaturate: { hue: 0, saturation: -0.8, brightness: 0, contrast: 0 },
  'High Contrast': { hue: 0, saturation: 0.2, brightness: 0, contrast: 0.5 },
  Vintage: { hue: 10, saturation: -0.3, brightness: -0.05, contrast: 0.2 },
};

// ---------------------------------------------------------------------------
// Slider + numeric input helper (same as BlurEffectNode)
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
// Collapsible section
// ---------------------------------------------------------------------------

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <button
        type="button"
        className="nodrag flex w-full cursor-pointer items-center gap-1 rounded px-0.5 py-0.5 text-[10px] font-semibold text-gray-300 hover:bg-white/5"
        onClick={onToggle}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="mt-0.5 pl-1">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ColorCorrectionNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ColorCorrectionData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  // Derive input key from edges
  const inputKey = useMemo(() => {
    const edge = edges.find(
      (e) => e.target === id && e.targetHandle === 'webgl-target-0',
    );
    if (!edge) return null;
    return `${edge.source}:${edge.sourceHandle}`;
  }, [edges, id]);

  // Scalar edge keys for hue and brightness overrides
  const hueEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-hue');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const brightnessEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-brightness');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const hueEdgeKeyRef = useRef(hueEdgeKey);
  const brightnessEdgeKeyRef = useRef(brightnessEdgeKey);
  useEffect(() => { hueEdgeKeyRef.current = hueEdgeKey; }, [hueEdgeKey]);
  useEffect(() => { brightnessEdgeKeyRef.current = brightnessEdgeKey; }, [brightnessEdgeKey]);

  // Mutable refs for RAF
  const bypassRef = useRef(d.bypass ?? false);
  const hueRef = useRef(d.hue ?? 0);
  const saturationRef = useRef(d.saturation ?? 0);
  const brightnessRef = useRef(d.brightness ?? 0);
  const contrastRef = useRef(d.contrast ?? 0);
  const inputKeyRef = useRef(inputKey);

  // Three.js refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Sync refs
  useEffect(() => { bypassRef.current = d.bypass ?? false; }, [d.bypass]);
  useEffect(() => { hueRef.current = d.hue ?? 0; }, [d.hue]);
  useEffect(() => { saturationRef.current = d.saturation ?? 0; }, [d.saturation]);
  useEffect(() => { brightnessRef.current = d.brightness ?? 0; }, [d.brightness]);
  useEffect(() => { contrastRef.current = d.contrast ?? 0; }, [d.contrast]);
  useEffect(() => { inputKeyRef.current = inputKey; }, [inputKey]);

  // Local collapse state
  const [colorOpen, setColorOpen] = useState(d.colorSectionOpen ?? true);
  const [levelsOpen, setLevelsOpen] = useState(d.levelsSectionOpen ?? true);

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

    const material = new THREE.ShaderMaterial({
      vertexShader: COLOR_CORRECTION_VERT,
      fragmentShader: COLOR_CORRECTION_FRAG,
      uniforms: {
        uInputTexture: { value: null as THREE.Texture | null },
        uHue: { value: hueRef.current },
        uSaturation: { value: saturationRef.current },
        uBrightness: { value: brightnessRef.current },
        uContrast: { value: contrastRef.current },
      },
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: RT_SIZE, height: RT_SIZE });

    registerCallback(id, () => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      const ik = inputKeyRef.current;
      if (!ik) {
        renderer.setRenderTarget(rtRef.current);
        renderer.clear();
        renderer.setRenderTarget(null);
        return;
      }

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
      const hek = hueEdgeKeyRef.current;
      const scalarHue = hek ? getScalarOutput(hek) : undefined;
      mat.uniforms.uHue.value = scalarHue !== undefined ? (scalarHue - 0.5) * 360 : hueRef.current;
      mat.uniforms.uSaturation.value = saturationRef.current;
      const bek = brightnessEdgeKeyRef.current;
      const scalarBrightness = bek ? getScalarOutput(bek) : undefined;
      mat.uniforms.uBrightness.value = scalarBrightness !== undefined ? (scalarBrightness - 0.5) * 2 : brightnessRef.current;
      mat.uniforms.uContrast.value = contrastRef.current;

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
      const vals = PRESETS[name];
      if (vals) {
        updateNodeData(id, { ...vals, preset: name });
      }
    },
    [id, updateNodeData],
  );

  // Read values for UI
  const bypass = d.bypass ?? false;
  const hue = d.hue ?? 0;
  const saturation = d.saturation ?? 0;
  const brightness = d.brightness ?? 0;
  const contrast = d.contrast ?? 0;
  const preset = d.preset ?? '';
  const hasInput = inputKey !== null;

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
        <Palette size={14} color={EFFECT_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Color Correction
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
              {Object.keys(PRESETS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Color section (hue, saturation) */}
          <Section
            title="Color"
            open={colorOpen}
            onToggle={() => {
              setColorOpen((v) => !v);
              handleChange('colorSectionOpen', !colorOpen);
            }}
          >
            <ParamSlider
              label="Hue"
              value={hue}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => handleChange('hue', v)}
            />
            <ParamSlider
              label="Saturation"
              value={saturation}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => handleChange('saturation', v)}
            />
          </Section>

          {/* Levels section (brightness, contrast) */}
          <Section
            title="Levels"
            open={levelsOpen}
            onToggle={() => {
              setLevelsOpen((v) => !v);
              handleChange('levelsSectionOpen', !levelsOpen);
            }}
          >
            <ParamSlider
              label="Brightness"
              value={brightness}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => handleChange('brightness', v)}
            />
            <ParamSlider
              label="Contrast"
              value={contrast}
              min={-1}
              max={1}
              step={0.01}
              onChange={(v) => handleChange('contrast', v)}
            />
          </Section>
        </>
      )}

      {/* Input port */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
        index={0}
        style={{ top: '35%' }}
      />
      {/* Scalar input ports */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-hue"
        handleId="scalar-target-hue"
        index={1}
        label="Hue"
        style={{ top: '80%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-brightness"
        handleId="scalar-target-brightness"
        index={2}
        label="Brightness"
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

export const ColorCorrectionNode = withNodeErrorBoundary(ColorCorrectionNodeInner);
export default ColorCorrectionNode;
