/**
 * DAG walker for HTML export — collects shaders, uniforms, and scalar
 * connections from the upstream graph of a Preview node.
 *
 * Pure logic (no React hooks). Reads canvas store state synchronously.
 */

import { useCanvasStore } from '@/stores/canvas-store';
import { getUpstreamNodes } from '@/lib/dag';
import type { Node } from '@xyflow/react';
import type {
  GradientType,
  NoiseType,
  BlurType,
  DistortionType,
  ShapeType,
  BlendMode,
  LoopMode,
  CompositionLayer,
} from '@/types/canvas';

// Shader imports
import {
  LINEAR_GRADIENT_FRAG,
  RADIAL_GRADIENT_FRAG,
  MESH_GRADIENT_FRAG,
} from '@/components/canvas/nodes/webgl/gradient-shaders';
import { NOISE_SHADERS } from '@/components/canvas/nodes/webgl/noise-shaders';
import { SHAPE_FRAGMENT_SHADERS } from '@/components/canvas/nodes/webgl/shape-shaders';
import { BLUR_SHADERS } from '@/components/canvas/nodes/webgl/blur-shaders';
import { COLOR_CORRECTION_FRAG } from '@/components/canvas/nodes/webgl/color-correction-shaders';
import { DISTORTION_SHADERS } from '@/components/canvas/nodes/webgl/distortion-shaders';
import {
  COMPOSITION_BLEND_FRAG,
  COMPOSITION_COPY_FRAG,
} from '@/components/canvas/nodes/webgl/composition-shaders';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UniformValue =
  | number
  | number[]
  | boolean
  | string;

export type ExportPass = {
  nodeId: string;
  nodeType: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, UniformValue>;
  /** Which upstream pass index feeds into which sampler uniform */
  textureInputs: { uniformName: string; passIndex: number }[];
  /** Whether this pass needs time uniform */
  needsTime: boolean;
  /** Resolution hint for framebuffer */
  resolution?: { width: number; height: number };
};

export type TimeControlExport = {
  speed: number;
  loopMode: LoopMode;
  rangeStart: number;
  rangeEnd: number;
};

export type ScalarMapping = {
  sourceNodeType: string;
  sourceOutputId: string;
  targetParam: string;
};

export type ExportGraph = {
  passes: ExportPass[];
  width: number;
  height: number;
  fpsCap: number;
  timeControl: TimeControlExport | null;
  hasMouseInteraction: boolean;
  scalarMappings: ScalarMapping[];
};

// ---------------------------------------------------------------------------
// Shared fullscreen quad vertex shader (WebGL2 raw)
// ---------------------------------------------------------------------------

export const FULLSCREEN_QUAD_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Three.js vertex shader variant (uses Three.js builtins)
const THREEJS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Gradient shader map
// ---------------------------------------------------------------------------

const GRADIENT_FRAG_MAP: Record<GradientType, string> = {
  linear: LINEAR_GRADIENT_FRAG,
  radial: RADIAL_GRADIENT_FRAG,
  mesh: MESH_GRADIENT_FRAG,
};

// ---------------------------------------------------------------------------
// Solid color fragment shader (inline, matches SolidColorNode)
// ---------------------------------------------------------------------------

const SOLID_COLOR_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToVec3(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16) / 255,
    parseInt(c.substring(2, 4), 16) / 255,
    parseInt(c.substring(4, 6), 16) / 255,
  ];
}

function getNodeData(node: Node): Record<string, unknown> {
  return (node.data ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Build pass for each node type
// ---------------------------------------------------------------------------

function buildGradientPass(node: Node): ExportPass {
  const d = getNodeData(node);
  const gradientType = (d.gradientType as GradientType) ?? 'linear';
  const colorStops = (d.colorStops as Array<{ color: string; position: number }>) ?? [
    { color: '#ff0000', position: 0 },
    { color: '#0000ff', position: 1 },
  ];

  const colors: number[] = [];
  const positions: number[] = [];
  for (let i = 0; i < 8; i++) {
    const stop = colorStops[i] ?? colorStops[colorStops.length - 1];
    const [r, g, b] = hexToVec3(stop.color);
    colors.push(r, g, b);
    positions.push(stop.position);
  }

  return {
    nodeId: node.id,
    nodeType: 'gradientGenerator',
    vertexShader: THREEJS_VERT,
    fragmentShader: GRADIENT_FRAG_MAP[gradientType],
    uniforms: {
      uTime: 0,
      uAngle: (d.angle as number) ?? 0,
      uSpeed: (d.speed as number) ?? 1,
      uColors: colors,
      uPositions: positions,
      uColorCount: colorStops.length,
    },
    textureInputs: [],
    needsTime: true,
  };
}

function buildSolidColorPass(node: Node): ExportPass {
  const d = getNodeData(node);
  const color = (d.color as string) ?? '#ffffff';
  const alpha = (d.alpha as number) ?? 1;
  const [r, g, b] = hexToVec3(color);

  return {
    nodeId: node.id,
    nodeType: 'solidColor',
    vertexShader: THREEJS_VERT,
    fragmentShader: SOLID_COLOR_FRAG,
    uniforms: { uColor: [r, g, b], uAlpha: alpha },
    textureInputs: [],
    needsTime: false,
  };
}

function buildNoisePass(node: Node): ExportPass {
  const d = getNodeData(node);
  const noiseType = (d.noiseType as NoiseType) ?? 'perlin';

  return {
    nodeId: node.id,
    nodeType: 'noiseGenerator',
    vertexShader: THREEJS_VERT,
    fragmentShader: NOISE_SHADERS[noiseType],
    uniforms: {
      uTime: 0,
      uScale: (d.scale as number) ?? 4,
      uOctaves: (d.octaves as number) ?? 4,
      uSeed: (d.seed as number) ?? 0,
      uDirection: [(d.directionX as number) ?? 0.5, (d.directionY as number) ?? 0],
    },
    textureInputs: [],
    needsTime: true,
  };
}

function buildShapePass(node: Node): ExportPass {
  const d = getNodeData(node);
  const shapeType = (d.shapeType as ShapeType) ?? 'rectangle';
  const [fr, fg, fb] = hexToVec3((d.fillColor as string) ?? '#ffffff');
  const [br, bg, bb] = hexToVec3((d.borderColor as string) ?? '#000000');
  const [bgr, bgg, bgb] = hexToVec3((d.bgColor as string) ?? '#000000');
  const bgAlpha = (d.bgAlpha as number) ?? 0;

  const uniforms: Record<string, UniformValue> = {
    uFillColor: [fr, fg, fb],
    uFillAlpha: (d.fillAlpha as number) ?? 1,
    uBorderColor: [br, bg, bb],
    uBorderWidth: (d.borderWidth as number) ?? 0,
    uOpacity: (d.opacity as number) ?? 1,
    uRotation: (d.rotation as number) ?? 0,
    uOffsetX: (d.offsetX as number) ?? 0,
    uOffsetY: (d.offsetY as number) ?? 0,
    uBgColor: [bgr, bgg, bgb, bgAlpha],
    uResolution: [512, 512],
  };

  // Shape-specific uniforms
  if (shapeType === 'rectangle') {
    uniforms.uWidth = (d.width as number) ?? 0.6;
    uniforms.uHeight = (d.height as number) ?? 0.4;
    uniforms.uCornerTL = (d.cornerTL as number) ?? 0;
    uniforms.uCornerTR = (d.cornerTR as number) ?? 0;
    uniforms.uCornerBL = (d.cornerBL as number) ?? 0;
    uniforms.uCornerBR = (d.cornerBR as number) ?? 0;
  } else if (shapeType === 'circle') {
    uniforms.uRadius = (d.radius as number) ?? 0.3;
  } else {
    uniforms.uPolyRadius = (d.polyRadius as number) ?? 0.3;
    uniforms.uSides = (d.sides as number) ?? 5;
    uniforms.uStarMode = (d.starMode as boolean) ?? false;
    uniforms.uInnerRadius = (d.innerRadius as number) ?? 0.15;
  }

  return {
    nodeId: node.id,
    nodeType: 'shapeGenerator',
    vertexShader: THREEJS_VERT,
    fragmentShader: SHAPE_FRAGMENT_SHADERS[shapeType],
    uniforms,
    textureInputs: [],
    needsTime: false,
  };
}

function buildBlurPass(node: Node, blurPassDirection?: 'horizontal' | 'vertical'): ExportPass {
  const d = getNodeData(node);
  const blurType = (d.blurType as BlurType) ?? 'gaussian';

  const uniforms: Record<string, UniformValue> = {};

  if (blurType === 'gaussian') {
    uniforms.uRadius = (d.radius as number) ?? 5;
    uniforms.uResolution = [512, 512]; // Overridden at export time
    uniforms.uDirection = blurPassDirection === 'vertical' ? [0, 1] : [1, 0];
  } else if (blurType === 'radial') {
    uniforms.uCenter = [(d.centerX as number) ?? 0.5, (d.centerY as number) ?? 0.5];
    uniforms.uStrength = (d.strength as number) ?? 0.1;
  } else {
    // motion
    const angle = ((d.angle as number) ?? 0) * Math.PI / 180;
    uniforms.uMotionDirection = [Math.cos(angle), Math.sin(angle)];
    uniforms.uStrength = (d.strength as number) ?? 0.1;
  }

  return {
    nodeId: node.id,
    nodeType: 'blurEffect',
    vertexShader: THREEJS_VERT,
    fragmentShader: BLUR_SHADERS[blurType],
    uniforms,
    textureInputs: [],
    needsTime: false,
  };
}

function buildColorCorrectionPass(node: Node): ExportPass {
  const d = getNodeData(node);
  return {
    nodeId: node.id,
    nodeType: 'colorCorrection',
    vertexShader: THREEJS_VERT,
    fragmentShader: COLOR_CORRECTION_FRAG,
    uniforms: {
      uHue: (d.hue as number) ?? 0,
      uSaturation: (d.saturation as number) ?? 0,
      uBrightness: (d.brightness as number) ?? 0,
      uContrast: (d.contrast as number) ?? 0,
    },
    textureInputs: [],
    needsTime: false,
  };
}

function buildDistortionPass(node: Node): ExportPass {
  const d = getNodeData(node);
  const distortionType = (d.distortionType as DistortionType) ?? 'wave';

  const uniforms: Record<string, UniformValue> = { uTime: 0 };

  if (distortionType === 'wave') {
    uniforms.uAmplitude = (d.amplitude as number) ?? 0.02;
    uniforms.uFrequency = (d.frequency as number) ?? 10;
    uniforms.uSpeed = (d.speed as number) ?? 1;
  } else if (distortionType === 'twist') {
    uniforms.uStrength = (d.strength as number) ?? 1;
  } else if (distortionType === 'ripple') {
    uniforms.uAmplitude = (d.amplitude as number) ?? 0.02;
    uniforms.uFrequency = (d.frequency as number) ?? 15;
    uniforms.uSpeed = (d.speed as number) ?? 1;
  } else if (distortionType === 'displacement') {
    uniforms.uStrength = (d.strength as number) ?? 0.05;
  } else {
    // chromatic_aberration
    uniforms.uIntensity = (d.intensity as number) ?? 0.01;
    const aAngle = ((d.angle as number) ?? 0) * Math.PI / 180;
    uniforms.uOffset = [Math.cos(aAngle), Math.sin(aAngle)];
  }

  const needsTime = ['wave', 'twist', 'ripple'].includes(distortionType);

  return {
    nodeId: node.id,
    nodeType: 'distortionEffect',
    vertexShader: THREEJS_VERT,
    fragmentShader: DISTORTION_SHADERS[distortionType],
    uniforms,
    textureInputs: [],
    needsTime,
  };
}

// ---------------------------------------------------------------------------
// Main collector
// ---------------------------------------------------------------------------

/**
 * Walk upstream from the Preview node and collect all render passes
 * in topological order. Also discovers Time Control and Mouse Interaction
 * nodes via scalar edges.
 */
export function collectExportGraph(previewNodeId: string): ExportGraph {
  const { nodes, edges } = useCanvasStore.getState();

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const previewNode = nodeMap.get(previewNodeId);
  if (!previewNode) {
    return emptyGraph();
  }

  const previewData = getNodeData(previewNode);
  const resPreset = (previewData.resolutionPreset as string) ?? '720p';
  let width = 1280;
  let height = 720;
  if (resPreset === '1080p') { width = 1920; height = 1080; }
  else if (resPreset === '4k') { width = 3840; height = 2160; }
  else if (resPreset === 'custom') {
    width = (previewData.customWidth as number) ?? 1280;
    height = (previewData.customHeight as number) ?? 720;
  }
  const fpsCap = (previewData.fpsCap as number) ?? 30;

  // Get all node IDs and collect edges for DAG utils
  const allNodeIds = nodes.map((n) => n.id);
  const dagEdges = edges
    .filter((e) => e.source && e.target)
    .map((e) => ({
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? '',
      targetHandle: e.targetHandle ?? '',
    }));

  // Walk upstream from preview (all edge types)
  const upstreamIds = getUpstreamNodes(
    previewNodeId,
    allNodeIds,
    dagEdges,
  );

  // Discover Time Control and Mouse Interaction via scalar edges
  let timeControl: TimeControlExport | null = null;
  let hasMouseInteraction = false;
  const scalarMappings: ScalarMapping[] = [];

  for (const nId of upstreamIds) {
    const node = nodeMap.get(nId);
    if (!node) continue;
    const nodeType = (getNodeData(node).type as string) ?? node.type;

    if (nodeType === 'timeControl') {
      const d = getNodeData(node);
      timeControl = {
        speed: (d.speed as number) ?? 1,
        loopMode: (d.loopMode as LoopMode) ?? 'loop',
        rangeStart: (d.timeRangeStart as number) ?? 0,
        rangeEnd: (d.timeRangeEnd as number) ?? 10,
      };
    }

    if (nodeType === 'mouseInteraction') {
      hasMouseInteraction = true;
    }
  }

  // Collect scalar mappings: scalar edges connecting control nodes to webgl nodes
  for (const e of dagEdges) {
    if (!e.sourceHandle.startsWith('scalar-source-') || !e.targetHandle.startsWith('scalar-target-')) continue;
    const srcNode = nodeMap.get(e.source);
    if (!srcNode) continue;
    const srcType = (getNodeData(srcNode).type as string) ?? srcNode.type;
    if (srcType === 'timeControl' || srcType === 'mouseInteraction') {
      const targetParam = e.targetHandle.replace('scalar-target-', '');
      scalarMappings.push({
        sourceNodeType: srcType,
        sourceOutputId: e.sourceHandle,
        targetParam,
      });
    }
  }

  // Build passes for webgl nodes only (exclude preview, timeControl, mouseInteraction)
  const skipTypes = new Set(['webglPreview', 'timeControl', 'mouseInteraction']);
  const passes: ExportPass[] = [];
  /** Maps nodeId -> pass index (for wiring texture inputs) */
  const passIndexMap = new Map<string, number>();

  for (const nId of upstreamIds) {
    const node = nodeMap.get(nId);
    if (!node) continue;
    const nodeType = (getNodeData(node).type as string) ?? node.type;
    if (skipTypes.has(nodeType)) continue;

    const passList = buildPassesForNode(node, nodeType, dagEdges, nodeMap, width, height);
    for (const p of passList) {
      passIndexMap.set(`${p.nodeId}:${p.nodeType}`, passes.length);
      passes.push(p);
    }
    // Store last pass index for this node (for downstream wiring)
    if (passList.length > 0) {
      passIndexMap.set(nId, passes.length - 1);
    }
  }

  // Wire texture inputs based on webgl edges
  for (const e of dagEdges) {
    if (!e.sourceHandle.startsWith('webgl-source-') || !e.targetHandle.startsWith('webgl-target-')) continue;

    const srcPassIdx = passIndexMap.get(e.source);
    if (srcPassIdx === undefined) continue;

    // Find target passes belonging to this node
    const targetNode = nodeMap.get(e.target);
    if (!targetNode) continue;
    const targetType = (getNodeData(targetNode).type as string) ?? targetNode.type;
    if (skipTypes.has(targetType)) continue;

    // Determine the sampler uniform name based on node type and target handle
    const samplerName = getSamplerUniform(targetType, e.targetHandle);
    if (!samplerName) continue;

    // Find the first pass belonging to this target node
    for (const pass of passes) {
      if (pass.nodeId === e.target) {
        pass.textureInputs.push({ uniformName: samplerName, passIndex: srcPassIdx });
        break; // Wire to first pass of the target node
      }
    }
  }

  return {
    passes,
    width,
    height,
    fpsCap,
    timeControl,
    hasMouseInteraction,
    scalarMappings,
  };
}

// ---------------------------------------------------------------------------
// Per-node pass builder
// ---------------------------------------------------------------------------

function buildPassesForNode(
  node: Node,
  nodeType: string,
  dagEdges: Array<{ source: string; target: string; sourceHandle: string; targetHandle: string }>,
  nodeMap: Map<string, Node>,
  exportWidth: number,
  exportHeight: number,
): ExportPass[] {
  switch (nodeType) {
    case 'gradientGenerator':
      return [buildGradientPass(node)];
    case 'solidColor':
      return [buildSolidColorPass(node)];
    case 'noiseGenerator':
      return [buildNoisePass(node)];
    case 'shapeGenerator':
      return [buildShapePass(node)];
    case 'blurEffect': {
      const d = getNodeData(node);
      const blurType = (d.blurType as BlurType) ?? 'gaussian';
      if (blurType === 'gaussian') {
        // Gaussian requires 2 passes (H then V)
        const hPass = buildBlurPass(node, 'horizontal');
        hPass.uniforms.uResolution = [exportWidth, exportHeight];
        const vPass = buildBlurPass(node, 'vertical');
        vPass.uniforms.uResolution = [exportWidth, exportHeight];
        // V pass reads from H pass - wired after return
        return [hPass, vPass];
      }
      return [buildBlurPass(node)];
    }
    case 'colorCorrection':
      return [buildColorCorrectionPass(node)];
    case 'distortionEffect':
      return [buildDistortionPass(node)];
    case 'composition':
      return buildCompositionPasses(node, dagEdges, nodeMap);
    case 'imageLayer':
    case 'textLayer':
      // ImageLayer/TextLayer become simple copy passes (texture is baked)
      return [buildCopyPass(node, nodeType)];
    default:
      return [];
  }
}

function buildCopyPass(node: Node, nodeType: string): ExportPass {
  return {
    nodeId: node.id,
    nodeType,
    vertexShader: THREEJS_VERT,
    fragmentShader: COMPOSITION_COPY_FRAG,
    uniforms: {},
    textureInputs: [],
    needsTime: false,
  };
}

function buildCompositionPasses(
  node: Node,
  dagEdges: Array<{ source: string; target: string; sourceHandle: string; targetHandle: string }>,
  _nodeMap: Map<string, Node>,
): ExportPass[] {
  const d = getNodeData(node);
  const layers = (d.layers as CompositionLayer[]) ?? [];

  // Find connected layer edges (sorted by layer order)
  const layerEdges = dagEdges
    .filter((e) => e.target === node.id && e.targetHandle.startsWith('webgl-target-layer-'))
    .sort((a, b) => {
      const aIdx = layers.findIndex((l) => a.targetHandle === `webgl-target-layer-${l.id}`);
      const bIdx = layers.findIndex((l) => b.targetHandle === `webgl-target-layer-${l.id}`);
      return aIdx - bIdx;
    });

  if (layerEdges.length === 0) return [];

  const passes: ExportPass[] = [];

  // First layer: copy pass
  const firstLayer = layers.find((l) =>
    layerEdges[0]?.targetHandle === `webgl-target-layer-${l.id}`,
  );
  passes.push({
    nodeId: node.id,
    nodeType: 'composition_copy',
    vertexShader: THREEJS_VERT,
    fragmentShader: COMPOSITION_COPY_FRAG,
    uniforms: {},
    textureInputs: [], // Will be wired by caller
    needsTime: false,
  });

  // Subsequent layers: blend passes
  for (let i = 1; i < layerEdges.length; i++) {
    const layer = layers.find((l) =>
      layerEdges[i]?.targetHandle === `webgl-target-layer-${l.id}`,
    );
    const blendMode = layer?.blendMode ?? 'normal';
    const opacity = layer?.opacity ?? 1;
    const blendModeInt = ({ normal: 0, multiply: 1, screen: 2, add: 3 } as Record<BlendMode, number>)[blendMode] ?? 0;

    passes.push({
      nodeId: node.id,
      nodeType: 'composition_blend',
      vertexShader: THREEJS_VERT,
      fragmentShader: COMPOSITION_BLEND_FRAG,
      uniforms: {
        uBlendMode: blendModeInt,
        uOpacity: opacity,
      },
      textureInputs: [
        // uBase = previous pass output (wired later)
        // uLayer = this layer's source (wired later)
      ],
      needsTime: false,
    });
  }

  // Handle unused firstLayer var to satisfy lint
  void firstLayer;

  return passes;
}

// ---------------------------------------------------------------------------
// Sampler uniform mapping
// ---------------------------------------------------------------------------

function getSamplerUniform(nodeType: string, targetHandle: string): string | null {
  // Effects and composition all use uInputTexture for their primary input
  if (targetHandle === 'webgl-target-0') {
    switch (nodeType) {
      case 'blurEffect':
      case 'colorCorrection':
      case 'distortionEffect':
        return 'uInputTexture';
      default:
        return 'uSource';
    }
  }

  // Distortion displacement input
  if (targetHandle === 'webgl-target-1' && nodeType === 'distortionEffect') {
    return 'uDisplacementTexture';
  }

  // Composition layer handles
  if (targetHandle.startsWith('webgl-target-layer-')) {
    return 'uLayer'; // Composition blend pass
  }

  return null;
}

// ---------------------------------------------------------------------------
// Empty graph fallback
// ---------------------------------------------------------------------------

function emptyGraph(): ExportGraph {
  return {
    passes: [],
    width: 1280,
    height: 720,
    fpsCap: 30,
    timeControl: null,
    hasMouseInteraction: false,
    scalarMappings: [],
  };
}
