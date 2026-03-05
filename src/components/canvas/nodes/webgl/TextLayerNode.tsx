'use client';

import { useCallback, useEffect, useRef } from 'react';
import { type NodeProps, Position } from '@xyflow/react';
import { Type } from 'lucide-react';
import * as THREE from 'three';
import { TypedHandle } from '@/components/canvas/handles/TypedHandle';
import { useCanvasStore } from '@/stores/canvas-store';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { registerCallback, unregisterCallback } from '@/lib/webgl/animation-loop';
import { acquireRenderer, releaseRenderer } from '@/lib/webgl/renderer';
import { checkout, checkin } from '@/lib/webgl/render-target-pool';
import { setWebGLOutput, removeWebGLOutput } from '@/lib/webgl/output-map';
import type { TextLayerData } from '@/types/canvas';

// ---------------------------------------------------------------------------
// Canvas2D text renderer
// ---------------------------------------------------------------------------

function renderTextToCanvas(
  canvas: HTMLCanvasElement,
  opts: {
    text: string;
    fontFamily: string;
    fontSize: number;
    fontColor: string;
    alignment: CanvasTextAlign;
    bold: boolean;
    italic: boolean;
    outlineColor: string;
    outlineWidth: number;
    shadowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowBlur: number;
    textBoxWidth: number;
    offsetX: number;
    offsetY: number;
    bgColor: string;
    bgAlpha: number;
  },
): void {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Background fill
  if (opts.bgAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = opts.bgAlpha;
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Font
  const weight = opts.bold ? 'bold ' : '';
  const style = opts.italic ? 'italic ' : '';
  ctx.font = `${style}${weight}${opts.fontSize}px ${opts.fontFamily}`;
  ctx.fillStyle = opts.fontColor;
  ctx.textAlign = opts.alignment;
  ctx.textBaseline = 'top';

  // Word-wrap
  const lines = wordWrap(ctx, opts.text, opts.textBoxWidth);
  const lineHeight = opts.fontSize * 1.3;
  const totalTextHeight = lines.length * lineHeight;

  // Position: center in canvas, then apply offsets
  let baseX = w / 2;
  if (opts.alignment === 'left') baseX = (w - opts.textBoxWidth) / 2;
  else if (opts.alignment === 'right') baseX = (w + opts.textBoxWidth) / 2;

  const baseY = (h - totalTextHeight) / 2;
  const px = opts.offsetX * w;
  const py = opts.offsetY * h;

  // Shadow setup
  if (opts.shadowBlur > 0) {
    ctx.shadowColor = opts.shadowColor;
    ctx.shadowOffsetX = opts.shadowOffsetX;
    ctx.shadowOffsetY = opts.shadowOffsetY;
    ctx.shadowBlur = opts.shadowBlur;
  }

  for (let i = 0; i < lines.length; i++) {
    const x = baseX + px;
    const y = baseY + py + i * lineHeight;

    // Outline
    if (opts.outlineWidth > 0) {
      ctx.strokeStyle = opts.outlineColor;
      ctx.lineWidth = opts.outlineWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(lines[i], x, y);
    }

    ctx.fillText(lines[i], x, y);
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function wordWrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (para === '') {
      result.push('');
      continue;
    }
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        result.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TextLayerNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextLayerData;
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  // Defaults
  const text = d.text ?? 'Hello World';
  const fontFamily = d.fontFamily ?? 'Arial';
  const fontSize = d.fontSize ?? 48;
  const fontColor = d.fontColor ?? '#ffffff';
  const alignment = d.alignment ?? 'center';
  const bold = d.bold ?? false;
  const italic = d.italic ?? false;
  const outlineColor = d.outlineColor ?? '#000000';
  const outlineWidth = d.outlineWidth ?? 0;
  const shadowColor = d.shadowColor ?? '#000000';
  const shadowOffsetX = d.shadowOffsetX ?? 2;
  const shadowOffsetY = d.shadowOffsetY ?? 2;
  const shadowBlur = d.shadowBlur ?? 0;
  const textBoxWidth = d.textBoxWidth ?? 400;
  const offsetX = d.offsetX ?? 0;
  const offsetY = d.offsetY ?? 0;
  const bgColor = d.bgColor ?? '#000000';
  const bgAlpha = d.bgAlpha ?? 0;

  // Refs for RAF
  const dirtyRef = useRef(true);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const canvasTexRef = useRef<THREE.CanvasTexture | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rtRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Param refs for RAF
  const paramsRef = useRef({
    text, fontFamily, fontSize, fontColor, alignment, bold, italic,
    outlineColor, outlineWidth, shadowColor, shadowOffsetX, shadowOffsetY,
    shadowBlur, textBoxWidth, offsetX, offsetY, bgColor, bgAlpha,
  });

  // Sync params & mark dirty
  useEffect(() => {
    paramsRef.current = {
      text, fontFamily, fontSize, fontColor, alignment, bold, italic,
      outlineColor, outlineWidth, shadowColor, shadowOffsetX, shadowOffsetY,
      shadowBlur, textBoxWidth, offsetX, offsetY, bgColor, bgAlpha,
    };
    dirtyRef.current = true;
  }, [
    text, fontFamily, fontSize, fontColor, alignment, bold, italic,
    outlineColor, outlineWidth, shadowColor, shadowOffsetX, shadowOffsetY,
    shadowBlur, textBoxWidth, offsetX, offsetY, bgColor, bgAlpha,
  ]);

  // WebGL setup & RAF
  useEffect(() => {
    const renderer = acquireRenderer();
    const w = 512;
    const h = 512;
    const rt = checkout(w, h);
    rtRef.current = rt;

    // Offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    canvasElRef.current = offscreen;

    const canvasTexture = new THREE.CanvasTexture(offscreen);
    canvasTexture.minFilter = THREE.LinearFilter;
    canvasTexture.magFilter = THREE.LinearFilter;
    canvasTexRef.current = canvasTexture;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uCanvas;
        void main() {
          gl_FragColor = texture2D(uCanvas, vUv);
        }
      `,
      transparent: true,
      uniforms: {
        uCanvas: { value: canvasTexture },
      },
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const outputKey = `${id}:webgl-source-0`;
    setWebGLOutput(outputKey, { target: rt, width: w, height: h });

    // Initial render
    dirtyRef.current = true;

    registerCallback(id, () => {
      if (!materialRef.current || !rtRef.current) return;

      if (dirtyRef.current && canvasElRef.current && canvasTexRef.current) {
        renderTextToCanvas(canvasElRef.current, paramsRef.current);
        canvasTexRef.current.needsUpdate = true;
        dirtyRef.current = false;
      }

      renderer.setRenderTarget(rtRef.current);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    });

    return () => {
      unregisterCallback(id);
      removeWebGLOutput(outputKey);
      checkin(rt);
      canvasTexture.dispose();
      material.dispose();
      geometry.dispose();
      scene.clear();
      releaseRenderer();
      materialRef.current = null;
      rtRef.current = null;
      canvasElRef.current = null;
      canvasTexRef.current = null;
    };
  }, [id]);

  // UI callbacks
  const update = useCallback(
    (field: string, value: unknown) => updateNodeData(id, { [field]: value }),
    [id, updateNodeData],
  );

  const sliderClass =
    'nodrag nowheel h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400';

  return (
    <div
      style={{
        background: '#1a1a1a',
        border: `1px solid ${selected ? 'transparent' : '#2a2a2a'}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 240,
        maxWidth: 280,
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
        <Type size={14} color="#ff6b35" />
        <span style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 500 }}>
          Text Layer
        </span>
      </div>

      {/* Text input */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Text
        </span>
        <textarea
          className="nodrag nowheel nopan w-full resize-y rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          rows={3}
          value={text}
          onChange={(e) => update('text', e.target.value)}
        />
      </div>

      {/* Font family */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Font
        </span>
        <select
          className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
          value={fontFamily}
          onChange={(e) => update('fontFamily', e.target.value)}
        >
          <option value="Arial">Arial</option>
          <option value="Helvetica">Helvetica</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Georgia">Georgia</option>
          <option value="Courier New">Courier New</option>
          <option value="Verdana">Verdana</option>
          <option value="monospace">Monospace</option>
          <option value="sans-serif">Sans-serif</option>
          <option value="serif">Serif</option>
        </select>
      </div>

      {/* Font size */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Size
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={12}
            max={200}
            step={1}
            value={fontSize}
            onChange={(e) => update('fontSize', Number(e.target.value))}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {fontSize}
          </span>
        </div>
      </div>

      {/* Font color + alignment row */}
      <div className="mb-1.5 flex items-end gap-2">
        <div className="flex-1">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Color
          </span>
          <input
            type="color"
            className="nodrag nowheel h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            value={fontColor}
            onChange={(e) => update('fontColor', e.target.value)}
          />
        </div>
        <div className="flex-1">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
            Align
          </span>
          <select
            className="nodrag nowheel w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-200 outline-none focus:border-white/20"
            value={alignment}
            onChange={(e) => update('alignment', e.target.value)}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      </div>

      {/* Bold + Italic */}
      <div className="mb-1.5 flex items-center gap-3">
        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input
            type="checkbox"
            className="nodrag nowheel accent-orange-500"
            checked={bold}
            onChange={(e) => update('bold', e.target.checked)}
          />
          Bold
        </label>
        <label className="flex items-center gap-1 text-[10px] text-gray-400">
          <input
            type="checkbox"
            className="nodrag nowheel accent-orange-500"
            checked={italic}
            onChange={(e) => update('italic', e.target.checked)}
          />
          Italic
        </label>
      </div>

      {/* Outline */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Outline
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
            value={outlineColor}
            onChange={(e) => update('outlineColor', e.target.value)}
          />
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={20}
            step={1}
            value={outlineWidth}
            onChange={(e) => update('outlineWidth', Number(e.target.value))}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {outlineWidth}
          </span>
        </div>
      </div>

      {/* Shadow */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Shadow
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
            value={shadowColor}
            onChange={(e) => update('shadowColor', e.target.value)}
          />
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={30}
            step={1}
            value={shadowBlur}
            onChange={(e) => update('shadowBlur', Number(e.target.value))}
          />
          <span className="w-6 text-right text-[10px] tabular-nums text-gray-400">
            {shadowBlur}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] text-gray-500">X</span>
          <input
            type="range"
            className={sliderClass}
            min={-20}
            max={20}
            step={1}
            value={shadowOffsetX}
            onChange={(e) => update('shadowOffsetX', Number(e.target.value))}
          />
          <span className="text-[10px] text-gray-500">Y</span>
          <input
            type="range"
            className={sliderClass}
            min={-20}
            max={20}
            step={1}
            value={shadowOffsetY}
            onChange={(e) => update('shadowOffsetY', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Text box width */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Box Width
        </span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            className={sliderClass}
            min={100}
            max={1024}
            step={1}
            value={textBoxWidth}
            onChange={(e) => update('textBoxWidth', Number(e.target.value))}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {textBoxWidth}
          </span>
        </div>
      </div>

      {/* Offset X/Y */}
      <div className="mb-1.5">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Offset
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">X</span>
          <input
            type="range"
            className={sliderClass}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={offsetX}
            onChange={(e) => update('offsetX', Number(e.target.value))}
          />
          <span className="text-[10px] text-gray-500">Y</span>
          <input
            type="range"
            className={sliderClass}
            min={-0.5}
            max={0.5}
            step={0.01}
            value={offsetY}
            onChange={(e) => update('offsetY', Number(e.target.value))}
          />
        </div>
      </div>

      {/* Background */}
      <div className="mb-1">
        <span className="mb-0.5 block text-[10px] font-medium text-gray-400">
          Background
        </span>
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="nodrag nowheel h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
            value={bgColor}
            onChange={(e) => update('bgColor', e.target.value)}
          />
          <input
            type="range"
            className={sliderClass}
            min={0}
            max={1}
            step={0.01}
            value={bgAlpha}
            onChange={(e) => update('bgAlpha', Number(e.target.value))}
          />
          <span className="w-8 text-right text-[10px] tabular-nums text-gray-400">
            {bgAlpha.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Input port (fill texture -- future use) */}
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

export const TextLayerNode = withNodeErrorBoundary(TextLayerNodeInner);
export default TextLayerNode;
