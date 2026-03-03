'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NodeProps,
  Position,
  useEdges,
  useNodes,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { Layers, Plus, GripVertical, X } from 'lucide-react';
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
import {
  COMPOSITION_VERT,
  COMPOSITION_BLEND_FRAG,
  COMPOSITION_COPY_FRAG,
} from './composition-shaders';
import type { BlendMode, CompositionData, CompositionLayer } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPOSITION_COLOR = '#9c27b0';
const RT_SIZE = 512;

const BLEND_MODE_OPTIONS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'add', label: 'Add' },
];

const BLEND_MODE_INT: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  add: 3,
};

// ---------------------------------------------------------------------------
// Default layers
// ---------------------------------------------------------------------------

let layerCounter = 0;
function nextLayerId(): string {
  return `layer_${Date.now()}_${layerCounter++}`;
}

function defaultLayers(): CompositionLayer[] {
  return [
    { id: nextLayerId(), blendMode: 'normal', opacity: 1 },
    { id: nextLayerId(), blendMode: 'normal', opacity: 1 },
  ];
}

// ---------------------------------------------------------------------------
// Slider (matching effect node pattern)
// ---------------------------------------------------------------------------

const SLIDER_CLS =
  'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-purple-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CompositionNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as CompositionData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const edges = useEdges();
  const nodes = useNodes();

  const layers: CompositionLayer[] = d.layers ?? defaultLayers();

  // Mutable refs for RAF
  const layersRef = useRef(layers);
  const edgesRef = useRef(edges);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // Three.js refs
  const blendMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const copyMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtARef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rtBRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Drag & drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragLayerIndex = useRef<number | null>(null);

  // ------ Layer mutations ------

  const setLayers = useCallback(
    (newLayers: CompositionLayer[]) => {
      updateNodeData(id, { layers: newLayers });
      // Schedule handle re-measurement after React renders new handles
      requestAnimationFrame(() => updateNodeInternals(id));
    },
    [id, updateNodeData, updateNodeInternals],
  );

  const addLayer = useCallback(() => {
    const newLayer: CompositionLayer = {
      id: nextLayerId(),
      blendMode: 'normal',
      opacity: 1,
    };
    setLayers([...layers, newLayer]);
  }, [layers, setLayers]);

  const removeLayer = useCallback(
    (layerId: string) => {
      // Find and remove edge connected to this layer's handle
      const handleId = `webgl-target-layer-${layerId}`;
      const edge = edges.find(
        (e) => e.target === id && e.targetHandle === handleId,
      );
      if (edge) {
        useCanvasStore
          .getState()
          .onEdgesChange([{ type: 'remove', id: edge.id }]);
      }
      setLayers(layers.filter((l) => l.id !== layerId));
    },
    [id, edges, layers, setLayers],
  );

  const updateLayer = useCallback(
    (layerId: string, field: keyof CompositionLayer, value: string | number) => {
      const newLayers = layers.map((l) =>
        l.id === layerId ? { ...l, [field]: value } : l,
      );
      updateNodeData(id, { layers: newLayers });
    },
    [id, layers, updateNodeData],
  );

  // ------ Drag & drop reordering ------

  const handleDragStart = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      dragStartY.current = e.clientY;
      dragLayerIndex.current = index;
      setDragIndex(index);
      setHoverIndex(index);

      let finalTarget = index;

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - dragStartY.current;
        const rowHeight = 64; // approximate row height
        const offset = Math.round(delta / rowHeight);
        finalTarget = Math.max(0, Math.min(layers.length - 1, index + offset));
        setHoverIndex(finalTarget);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        setDragIndex(null);
        setHoverIndex(null);

        if (finalTarget !== index) {
          const newLayers = [...layers];
          const [moved] = newLayers.splice(index, 1);
          newLayers.splice(finalTarget, 0, moved);
          setLayers(newLayers);
        }
        dragLayerIndex.current = null;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [layers, setLayers],
  );

  // ------ Resolve source names from edges ------

  const sourceNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const layer of layers) {
      const handleId = `webgl-target-layer-${layer.id}`;
      const edge = edges.find(
        (e) => e.target === id && e.targetHandle === handleId,
      );
      if (edge) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        names[layer.id] =
          (sourceNode?.data as Record<string, unknown>)?.label as string ??
          'Source';
      }
    }
    return names;
  }, [id, edges, nodes, layers]);

  // ------ WebGL setup & RAF ------

  useEffect(() => {
    const renderer = acquireRenderer();

    const rtA = checkout(RT_SIZE, RT_SIZE);
    const rtB = checkout(RT_SIZE, RT_SIZE);
    rtARef.current = rtA;
    rtBRef.current = rtB;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const blendMat = new THREE.ShaderMaterial({
      vertexShader: COMPOSITION_VERT,
      fragmentShader: COMPOSITION_BLEND_FRAG,
      uniforms: {
        uBase: { value: null },
        uLayer: { value: null },
        uBlendMode: { value: 0 },
        uOpacity: { value: 1.0 },
      },
    });
    blendMatRef.current = blendMat;

    const copyMat = new THREE.ShaderMaterial({
      vertexShader: COMPOSITION_VERT,
      fragmentShader: COMPOSITION_COPY_FRAG,
      uniforms: {
        uSource: { value: null },
      },
    });
    copyMatRef.current = copyMat;

    const mesh = new THREE.Mesh(geometry, copyMat);
    meshRef.current = mesh;
    scene.add(mesh);

    const cameraRef = camera;
    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rtA, width: RT_SIZE, height: RT_SIZE });

    registerCallback(id, () => {
      const curLayers = layersRef.current;
      const curEdges = edgesRef.current;
      const bMat = blendMatRef.current;
      const cMat = copyMatRef.current;
      const m = meshRef.current;
      if (!bMat || !cMat || !m || !rtARef.current || !rtBRef.current) return;

      // Collect connected layers in order (first layer = base, bottom-to-top)
      const connected: { texture: THREE.Texture; blendMode: BlendMode; opacity: number }[] = [];
      for (const layer of curLayers) {
        const handleId = `webgl-target-layer-${layer.id}`;
        const edge = curEdges.find(
          (e) => e.target === id && e.targetHandle === handleId,
        );
        if (!edge) continue;
        const upstreamKey = `${edge.source}:${edge.sourceHandle}`;
        const upstream = getWebGLOutput(upstreamKey);
        if (!upstream) continue;
        connected.push({
          texture: upstream.target.texture,
          blendMode: layer.blendMode,
          opacity: layer.opacity,
        });
      }

      if (connected.length === 0) {
        // Render transparent black
        renderer.setRenderTarget(rtARef.current);
        renderer.clear();
        renderer.setRenderTarget(null);
        setWebGLOutput(outputKey, { target: rtARef.current!, width: RT_SIZE, height: RT_SIZE });
        return;
      }

      if (connected.length === 1) {
        // Single layer: copy to rtA
        m.material = cMat;
        cMat.uniforms.uSource.value = connected[0].texture;
        renderer.setRenderTarget(rtARef.current);
        renderer.render(scene, cameraRef);
        renderer.setRenderTarget(null);
        setWebGLOutput(outputKey, { target: rtARef.current!, width: RT_SIZE, height: RT_SIZE });
        return;
      }

      // Multi-layer: ping-pong blending
      // Copy first layer to rtA
      m.material = cMat;
      cMat.uniforms.uSource.value = connected[0].texture;
      renderer.setRenderTarget(rtARef.current);
      renderer.render(scene, cameraRef);
      renderer.setRenderTarget(null);

      // Blend subsequent layers
      let readRT = rtARef.current!;
      let writeRT = rtBRef.current!;

      for (let i = 1; i < connected.length; i++) {
        const c = connected[i];
        m.material = bMat;
        bMat.uniforms.uBase.value = readRT.texture;
        bMat.uniforms.uLayer.value = c.texture;
        bMat.uniforms.uBlendMode.value = BLEND_MODE_INT[c.blendMode];
        bMat.uniforms.uOpacity.value = c.opacity;

        renderer.setRenderTarget(writeRT);
        renderer.render(scene, cameraRef);
        renderer.setRenderTarget(null);

        // Swap for next pass
        const tmp = readRT;
        readRT = writeRT;
        writeRT = tmp;
      }

      // readRT now holds the final result
      setWebGLOutput(outputKey, { target: readRT, width: RT_SIZE, height: RT_SIZE });
    });

    return () => {
      unregisterCallback(id);
      removeWebGLOutput(outputKey);
      checkin(rtA);
      checkin(rtB);
      blendMat.dispose();
      copyMat.dispose();
      geometry.dispose();
      scene.clear();
      releaseRenderer();
      blendMatRef.current = null;
      copyMatRef.current = null;
      sceneRef.current = null;
      meshRef.current = null;
      geometryRef.current = null;
      rtARef.current = null;
      rtBRef.current = null;
    };
  }, [id]);

  // ------ Render ------

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 260,
        maxWidth: 300,
        position: 'relative',
        boxShadow: selected
          ? `0 0 0 2px ${COMPOSITION_COLOR}, 0 0 12px rgba(156, 39, 176, 0.3)`
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
        <Layers size={14} color={COMPOSITION_COLOR} />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500, flex: 1 }}>
          Composition
        </span>
      </div>

      {/* Layer list */}
      <div className="nodrag mb-2 space-y-1">
        {layers.map((layer, i) => {
          const connected = !!sourceNames[layer.id];
          const isDragging = dragIndex === i;
          const isHoverTarget = hoverIndex === i && dragIndex !== null && dragIndex !== i;

          return (
            <div
              key={layer.id}
              className="group relative rounded border border-white/5 bg-white/[0.03] px-2 py-1.5"
              style={{
                opacity: isDragging ? 0.5 : 1,
                borderColor: isHoverTarget
                  ? 'rgba(156, 39, 176, 0.5)'
                  : undefined,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            >
              {/* Layer header row */}
              <div className="mb-1 flex items-center gap-1">
                {/* Drag handle */}
                <button
                  className="nodrag cursor-grab p-0.5 text-gray-600 hover:text-gray-400 active:cursor-grabbing"
                  onMouseDown={(e) => handleDragStart(e, i)}
                  title="Drag to reorder"
                >
                  <GripVertical size={10} />
                </button>

                {/* Layer label */}
                <span className="flex-1 truncate text-[10px] text-gray-400">
                  {connected ? sourceNames[layer.id] : `Layer ${i + 1}`}
                </span>

                {/* Remove button (only if more than 1 layer) */}
                {layers.length > 1 && (
                  <button
                    className="nodrag p-0.5 text-gray-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    onClick={() => removeLayer(layer.id)}
                    title="Remove layer"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>

              {/* Blend mode */}
              <select
                className="nodrag nowheel mb-1 w-full rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-200 outline-none focus:border-white/20"
                value={layer.blendMode}
                onChange={(e) =>
                  updateLayer(layer.id, 'blendMode', e.target.value)
                }
              >
                {BLEND_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Opacity slider */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500">Op</span>
                <input
                  type="range"
                  className={SLIDER_CLS}
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.opacity}
                  onChange={(e) =>
                    updateLayer(layer.id, 'opacity', Number(e.target.value))
                  }
                />
                <input
                  type="number"
                  className="nodrag nowheel w-10 rounded border border-white/10 bg-white/5 px-0.5 py-0.5 text-right text-[9px] tabular-nums text-gray-300 outline-none focus:border-white/20"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.opacity}
                  onChange={(e) => {
                    const v = Math.min(1, Math.max(0, Number(e.target.value)));
                    updateLayer(layer.id, 'opacity', v);
                  }}
                />
              </div>

              {/* Dynamic input handle for this layer */}
              <TypedHandle
                type="target"
                position={Position.Left}
                portType="webgl"
                portId={`webgl-target-layer-${layer.id}`}
                index={i}
                style={{
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Add layer button */}
      <button
        className="nodrag flex w-full items-center justify-center gap-1 rounded border border-dashed border-white/10 px-2 py-1 text-[10px] text-gray-500 transition-colors hover:border-white/20 hover:text-gray-300"
        onClick={addLayer}
      >
        <Plus size={10} />
        Add layer
      </button>

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

export const CompositionNode = withNodeErrorBoundary(CompositionNodeInner);
export default CompositionNode;
