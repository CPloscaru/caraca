'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import { Shapes } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import { getScalarOutput } from '@/lib/webgl/scalar-map';
import {
  SHAPE_VERTEX_SHADER,
  SHAPE_FRAGMENT_SHADERS,
} from './shape-shaders';
import type { ShapeGeneratorData, ShapeType } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Uniform builders per shape type
// ---------------------------------------------------------------------------

function hexToVec3(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

function buildCommonUniforms(d: ShapeGeneratorData) {
  const bgC = new THREE.Color(d.bgColor ?? '#000000');
  return {
    uFillColor: { value: hexToVec3(d.fillColor ?? '#ffffff') },
    uFillAlpha: { value: d.fillAlpha ?? 1 },
    uBorderColor: { value: hexToVec3(d.borderColor ?? '#000000') },
    uBorderWidth: { value: d.borderWidth ?? 0 },
    uOpacity: { value: d.opacity ?? 1 },
    uRotation: { value: ((d.rotation ?? 0) * Math.PI) / 180 },
    uOffsetX: { value: d.offsetX ?? 0 },
    uOffsetY: { value: d.offsetY ?? 0 },
    uBgColor: { value: new THREE.Vector4(bgC.r, bgC.g, bgC.b, d.bgAlpha ?? 0) },
    uResolution: { value: new THREE.Vector2(512, 512) },
  };
}

function buildRectUniforms(d: ShapeGeneratorData) {
  return {
    ...buildCommonUniforms(d),
    uWidth: { value: d.width ?? 0.4 },
    uHeight: { value: d.height ?? 0.4 },
    uCornerTL: { value: d.cornerTL ?? 0 },
    uCornerTR: { value: d.cornerTR ?? 0 },
    uCornerBL: { value: d.cornerBL ?? 0 },
    uCornerBR: { value: d.cornerBR ?? 0 },
  };
}

function buildCircleUniforms(d: ShapeGeneratorData) {
  return {
    ...buildCommonUniforms(d),
    uRadius: { value: d.radius ?? 0.3 },
  };
}

function buildPolygonUniforms(d: ShapeGeneratorData) {
  return {
    ...buildCommonUniforms(d),
    uPolyRadius: { value: d.polyRadius ?? 0.3 },
    uSides: { value: d.sides ?? 6 },
    uStarMode: { value: d.starMode ?? false },
    uInnerRadius: { value: d.innerRadius ?? 0.15 },
  };
}

function buildUniforms(d: ShapeGeneratorData) {
  const type = d.shapeType ?? 'rectangle';
  if (type === 'circle') return buildCircleUniforms(d);
  if (type === 'polygon') return buildPolygonUniforms(d);
  return buildRectUniforms(d);
}

// ---------------------------------------------------------------------------
// Slider UI helper
// ---------------------------------------------------------------------------

const SLIDER_CLS =
  'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ShapeGeneratorNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ShapeGeneratorData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const edges = useEdges();

  // Scalar edge key for rotation override
  const rotationEdgeKey = useMemo(() => {
    const edge = edges.find(e => e.target === id && e.targetHandle === 'scalar-target-rotation');
    return edge ? `${edge.source}:${edge.sourceHandle}` : null;
  }, [edges, id]);
  const rotationEdgeKeyRef = useRef(rotationEdgeKey);
  useEffect(() => { rotationEdgeKeyRef.current = rotationEdgeKey; }, [rotationEdgeKey]);

  // Mutable refs for RAF -- never setState in the render callback
  const shapeTypeRef = useRef<ShapeType>(d.shapeType ?? 'rectangle');
  const fillColorRef = useRef(d.fillColor ?? '#ffffff');
  const fillAlphaRef = useRef(d.fillAlpha ?? 1);
  const borderColorRef = useRef(d.borderColor ?? '#000000');
  const borderWidthRef = useRef(d.borderWidth ?? 0);
  const opacityRef = useRef(d.opacity ?? 1);
  const rotationRef = useRef(d.rotation ?? 0);
  const offsetXRef = useRef(d.offsetX ?? 0);
  const offsetYRef = useRef(d.offsetY ?? 0);
  const bgColorRef = useRef(d.bgColor ?? '#000000');
  const bgAlphaRef = useRef(d.bgAlpha ?? 0);
  // Rectangle
  const widthRef = useRef(d.width ?? 0.4);
  const heightRef = useRef(d.height ?? 0.4);
  const cornerTLRef = useRef(d.cornerTL ?? 0);
  const cornerTRRef = useRef(d.cornerTR ?? 0);
  const cornerBLRef = useRef(d.cornerBL ?? 0);
  const cornerBRRef = useRef(d.cornerBR ?? 0);
  // Circle
  const radiusRef = useRef(d.radius ?? 0.3);
  // Polygon
  const sidesRef = useRef(d.sides ?? 6);
  const starModeRef = useRef(d.starMode ?? false);
  const innerRadiusRef = useRef(d.innerRadius ?? 0.15);
  const polyRadiusRef = useRef(d.polyRadius ?? 0.3);

  // Three.js object refs
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const geometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Sync refs when props change
  useEffect(() => { shapeTypeRef.current = d.shapeType ?? 'rectangle'; }, [d.shapeType]);
  useEffect(() => { fillColorRef.current = d.fillColor ?? '#ffffff'; }, [d.fillColor]);
  useEffect(() => { fillAlphaRef.current = d.fillAlpha ?? 1; }, [d.fillAlpha]);
  useEffect(() => { borderColorRef.current = d.borderColor ?? '#000000'; }, [d.borderColor]);
  useEffect(() => { borderWidthRef.current = d.borderWidth ?? 0; }, [d.borderWidth]);
  useEffect(() => { opacityRef.current = d.opacity ?? 1; }, [d.opacity]);
  useEffect(() => { rotationRef.current = d.rotation ?? 0; }, [d.rotation]);
  useEffect(() => { offsetXRef.current = d.offsetX ?? 0; }, [d.offsetX]);
  useEffect(() => { offsetYRef.current = d.offsetY ?? 0; }, [d.offsetY]);
  useEffect(() => { bgColorRef.current = d.bgColor ?? '#000000'; }, [d.bgColor]);
  useEffect(() => { bgAlphaRef.current = d.bgAlpha ?? 0; }, [d.bgAlpha]);
  useEffect(() => { widthRef.current = d.width ?? 0.4; }, [d.width]);
  useEffect(() => { heightRef.current = d.height ?? 0.4; }, [d.height]);
  useEffect(() => { cornerTLRef.current = d.cornerTL ?? 0; }, [d.cornerTL]);
  useEffect(() => { cornerTRRef.current = d.cornerTR ?? 0; }, [d.cornerTR]);
  useEffect(() => { cornerBLRef.current = d.cornerBL ?? 0; }, [d.cornerBL]);
  useEffect(() => { cornerBRRef.current = d.cornerBR ?? 0; }, [d.cornerBR]);
  useEffect(() => { radiusRef.current = d.radius ?? 0.3; }, [d.radius]);
  useEffect(() => { sidesRef.current = d.sides ?? 6; }, [d.sides]);
  useEffect(() => { starModeRef.current = d.starMode ?? false; }, [d.starMode]);
  useEffect(() => { innerRadiusRef.current = d.innerRadius ?? 0.15; }, [d.innerRadius]);
  useEffect(() => { polyRadiusRef.current = d.polyRadius ?? 0.3; }, [d.polyRadius]);

  // Rebuild material when shape type changes
  useEffect(() => {
    const mat = materialRef.current;
    if (!mat) return;
    const mesh = sceneRef.current?.children[0] as THREE.Mesh | undefined;
    if (!mesh) return;

    const type = d.shapeType ?? 'rectangle';
    const newMat = new THREE.ShaderMaterial({
      vertexShader: SHAPE_VERTEX_SHADER,
      fragmentShader: SHAPE_FRAGMENT_SHADERS[type],
      uniforms: buildUniforms(d as ShapeGeneratorData),
      transparent: true,
    });
    mesh.material = newMat;
    materialRef.current = newMat;
    mat.dispose();
  }, [d.shapeType]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebGL setup & RAF registration
  useEffect(() => {
    const renderer = acquireRenderer();
    rendererRef.current = renderer;

    const rt = checkout(512, 512);
    rtRef.current = rt;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const geometry = new THREE.PlaneGeometry(2, 2);
    geometryRef.current = geometry;

    const type = shapeTypeRef.current;
    const material = new THREE.ShaderMaterial({
      vertexShader: SHAPE_VERTEX_SHADER,
      fragmentShader: SHAPE_FRAGMENT_SHADERS[type],
      uniforms: buildUniforms(d as ShapeGeneratorData),
      transparent: true,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: 512, height: 512 });

    registerCallback(id, () => {
      const mat = materialRef.current;
      if (!mat || !rtRef.current) return;

      // Update common uniforms from refs
      const fillC = new THREE.Color(fillColorRef.current);
      (mat.uniforms.uFillColor.value as THREE.Vector3).set(fillC.r, fillC.g, fillC.b);
      mat.uniforms.uFillAlpha.value = fillAlphaRef.current;

      const borderC = new THREE.Color(borderColorRef.current);
      (mat.uniforms.uBorderColor.value as THREE.Vector3).set(borderC.r, borderC.g, borderC.b);
      mat.uniforms.uBorderWidth.value = borderWidthRef.current;

      mat.uniforms.uOpacity.value = opacityRef.current;
      const rek = rotationEdgeKeyRef.current;
      const scalarRot = rek ? getScalarOutput(rek) : undefined;
      const effectiveRotation = scalarRot !== undefined ? scalarRot * 360 : rotationRef.current;
      mat.uniforms.uRotation.value = (effectiveRotation * Math.PI) / 180;
      mat.uniforms.uOffsetX.value = offsetXRef.current;
      mat.uniforms.uOffsetY.value = offsetYRef.current;

      const bgC = new THREE.Color(bgColorRef.current);
      (mat.uniforms.uBgColor.value as THREE.Vector4).set(bgC.r, bgC.g, bgC.b, bgAlphaRef.current);

      // Shape-specific uniforms
      const st = shapeTypeRef.current;
      if (st === 'rectangle') {
        mat.uniforms.uWidth.value = widthRef.current;
        mat.uniforms.uHeight.value = heightRef.current;
        mat.uniforms.uCornerTL.value = cornerTLRef.current;
        mat.uniforms.uCornerTR.value = cornerTRRef.current;
        mat.uniforms.uCornerBL.value = cornerBLRef.current;
        mat.uniforms.uCornerBR.value = cornerBRRef.current;
      } else if (st === 'circle') {
        mat.uniforms.uRadius.value = radiusRef.current;
      } else {
        mat.uniforms.uPolyRadius.value = polyRadiusRef.current;
        mat.uniforms.uSides.value = sidesRef.current;
        mat.uniforms.uStarMode.value = starModeRef.current;
        mat.uniforms.uInnerRadius.value = innerRadiusRef.current;
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
      cameraRef.current = null;
      geometryRef.current = null;
      rtRef.current = null;
      rendererRef.current = null;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- UI callbacks ---

  const handleChange = useCallback(
    (field: string, value: string | number | boolean) => {
      updateNodeData(id, { [field]: value });
    },
    [id, updateNodeData],
  );

  const onSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => handleChange('shapeType', e.target.value),
    [handleChange],
  );
  const onFillColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('fillColor', e.target.value),
    [handleChange],
  );
  const onFillAlpha = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('fillAlpha', Number(e.target.value)),
    [handleChange],
  );
  const onBorderColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('borderColor', e.target.value),
    [handleChange],
  );
  const onBorderWidth = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('borderWidth', Number(e.target.value)),
    [handleChange],
  );
  const onOpacity = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('opacity', Number(e.target.value)),
    [handleChange],
  );
  const onRotation = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('rotation', Number(e.target.value)),
    [handleChange],
  );
  const onOffsetX = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('offsetX', Number(e.target.value)),
    [handleChange],
  );
  const onOffsetY = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('offsetY', Number(e.target.value)),
    [handleChange],
  );
  const onBgColor = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('bgColor', e.target.value),
    [handleChange],
  );
  const onBgAlpha = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('bgAlpha', Number(e.target.value)),
    [handleChange],
  );
  // Rectangle
  const onWidth = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('width', Number(e.target.value)),
    [handleChange],
  );
  const onHeight = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('height', Number(e.target.value)),
    [handleChange],
  );
  const onCornerTL = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('cornerTL', Number(e.target.value)),
    [handleChange],
  );
  const onCornerTR = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('cornerTR', Number(e.target.value)),
    [handleChange],
  );
  const onCornerBL = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('cornerBL', Number(e.target.value)),
    [handleChange],
  );
  const onCornerBR = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('cornerBR', Number(e.target.value)),
    [handleChange],
  );
  // Circle
  const onRadius = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('radius', Number(e.target.value)),
    [handleChange],
  );
  // Polygon
  const onSides = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('sides', Number(e.target.value)),
    [handleChange],
  );
  const onStarMode = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('starMode', e.target.checked),
    [handleChange],
  );
  const onInnerRadius = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('innerRadius', Number(e.target.value)),
    [handleChange],
  );
  const onPolyRadius = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => handleChange('polyRadius', Number(e.target.value)),
    [handleChange],
  );

  // Read values for UI
  const shapeType = (d.shapeType ?? 'rectangle') as ShapeType;
  const fillColor = d.fillColor ?? '#ffffff';
  const fillAlpha = d.fillAlpha ?? 1;
  const borderColor = d.borderColor ?? '#000000';
  const borderWidth = d.borderWidth ?? 0;
  const opacity = d.opacity ?? 1;
  const rotation = d.rotation ?? 0;
  const offsetX = d.offsetX ?? 0;
  const offsetY = d.offsetY ?? 0;
  const bgColor = d.bgColor ?? '#000000';
  const bgAlpha = d.bgAlpha ?? 0;

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 230,
        maxWidth: 270,
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
        <Shapes size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Shape Generator
        </span>
      </div>

      {/* Shape type dropdown */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Shape
        </span>
        <select
          className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          value={shapeType}
          onChange={onSelect}
        >
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="polygon">Polygon</option>
        </select>
      </div>

      {/* Fill color + alpha */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Fill
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            value={fillColor}
            onChange={onFillColor}
          />
          <input type="range" className={SLIDER_CLS} min={0} max={1} step={0.01} value={fillAlpha} onChange={onFillAlpha} />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {fillAlpha.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Border color + width */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Border
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            value={borderColor}
            onChange={onBorderColor}
          />
          <input type="range" className={SLIDER_CLS} min={0} max={0.05} step={0.001} value={borderWidth} onChange={onBorderWidth} />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {borderWidth.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Opacity */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Opacity
        </span>
        <div className="flex items-center gap-2">
          <input type="range" className={SLIDER_CLS} min={0} max={1} step={0.01} value={opacity} onChange={onOpacity} />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {opacity.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Rotation */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Rotation
        </span>
        <div className="flex items-center gap-2">
          <input type="range" className={SLIDER_CLS} min={0} max={360} step={1} value={rotation} onChange={onRotation} />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {rotation}&deg;
          </span>
        </div>
      </div>

      {/* Offset X / Y */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Offset
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-500">X</span>
          <input type="range" className={SLIDER_CLS} min={-0.5} max={0.5} step={0.01} value={offsetX} onChange={onOffsetX} />
          <span className="w-10 text-right text-[10px] tabular-nums text-gray-400">
            {offsetX.toFixed(2)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[9px] text-gray-500">Y</span>
          <input type="range" className={SLIDER_CLS} min={-0.5} max={0.5} step={0.01} value={offsetY} onChange={onOffsetY} />
          <span className="w-10 text-right text-[10px] tabular-nums text-gray-400">
            {offsetY.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Background color + alpha */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Background
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            value={bgColor}
            onChange={onBgColor}
          />
          <input type="range" className={SLIDER_CLS} min={0} max={1} step={0.01} value={bgAlpha} onChange={onBgAlpha} />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {bgAlpha.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Rectangle-specific controls */}
      {shapeType === 'rectangle' && (
        <>
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Size
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">W</span>
              <input type="range" className={SLIDER_CLS} min={0.1} max={1} step={0.01} value={d.width ?? 0.4} onChange={onWidth} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.width ?? 0.4).toFixed(2)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[9px] text-gray-500">H</span>
              <input type="range" className={SLIDER_CLS} min={0.1} max={1} step={0.01} value={d.height ?? 0.4} onChange={onHeight} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.height ?? 0.4).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Corner Radius
            </span>
            <div className="flex items-center gap-2">
              <span className="w-5 text-[9px] text-gray-500">TL</span>
              <input type="range" className={SLIDER_CLS} min={0} max={0.5} step={0.01} value={d.cornerTL ?? 0} onChange={onCornerTL} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.cornerTL ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="w-5 text-[9px] text-gray-500">TR</span>
              <input type="range" className={SLIDER_CLS} min={0} max={0.5} step={0.01} value={d.cornerTR ?? 0} onChange={onCornerTR} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.cornerTR ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="w-5 text-[9px] text-gray-500">BL</span>
              <input type="range" className={SLIDER_CLS} min={0} max={0.5} step={0.01} value={d.cornerBL ?? 0} onChange={onCornerBL} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.cornerBL ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="w-5 text-[9px] text-gray-500">BR</span>
              <input type="range" className={SLIDER_CLS} min={0} max={0.5} step={0.01} value={d.cornerBR ?? 0} onChange={onCornerBR} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.cornerBR ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Circle-specific controls */}
      {shapeType === 'circle' && (
        <div className="mb-1.5">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Radius
          </span>
          <div className="flex items-center gap-2">
            <input type="range" className={SLIDER_CLS} min={0.05} max={0.5} step={0.01} value={d.radius ?? 0.3} onChange={onRadius} />
            <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
              {(d.radius ?? 0.3).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Polygon-specific controls */}
      {shapeType === 'polygon' && (
        <>
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Sides
            </span>
            <div className="flex items-center gap-2">
              <input type="range" className={SLIDER_CLS} min={3} max={12} step={1} value={d.sides ?? 6} onChange={onSides} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {d.sides ?? 6}
              </span>
            </div>
          </div>
          <div className="mb-1.5">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
              Radius
            </span>
            <div className="flex items-center gap-2">
              <input type="range" className={SLIDER_CLS} min={0.05} max={0.5} step={0.01} value={d.polyRadius ?? 0.3} onChange={onPolyRadius} />
              <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                {(d.polyRadius ?? 0.3).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="mb-1.5 flex items-center gap-2">
            <input
              type="checkbox"
              className="nodrag nowheel h-3 w-3 cursor-pointer accent-orange-500"
              checked={d.starMode ?? false}
              onChange={onStarMode}
            />
            <span className="text-[10px] font-medium text-gray-400">
              Star mode
            </span>
          </div>
          {(d.starMode ?? false) && (
            <div className="mb-1.5">
              <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
                Inner Radius
              </span>
              <div className="flex items-center gap-2">
                <input type="range" className={SLIDER_CLS} min={0.05} max={0.5} step={0.01} value={d.innerRadius ?? 0.15} onChange={onInnerRadius} />
                <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
                  {(d.innerRadius ?? 0.15).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Input ports (composition) */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-0"
        index={0}
        style={{ top: '25%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-1"
        index={1}
        style={{ top: '40%' }}
      />
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="webgl"
        portId="webgl-target-2"
        index={2}
        style={{ top: '55%' }}
      />
      {/* Scalar input port: Rotation */}
      <TypedHandle
        type="target"
        position={Position.Left}
        portType="scalar"
        portId="scalar-target-rotation"
        handleId="scalar-target-rotation"
        index={3}
        label="Rotation"
        style={{ top: '85%' }}
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

export const ShapeGeneratorNode = withNodeErrorBoundary(ShapeGeneratorNodeInner);
export default ShapeGeneratorNode;
