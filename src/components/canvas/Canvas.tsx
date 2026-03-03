'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  SelectionMode,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import { Hand, Loader2, MousePointer2 } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAppStore } from '@/stores/app-store';
import { useFavoritesStore } from '@/stores/favorites-store';
import { isValidConnection } from '@/lib/port-types';
import { PlaceholderNode } from '@/components/canvas/nodes/PlaceholderNode';
import { TextInputNode } from '@/components/canvas/nodes/TextInputNode';
import { ImageImportNode } from '@/components/canvas/nodes/ImageImportNode';
import { ImageGeneratorNode } from '@/components/canvas/nodes/ImageGeneratorNode';
import { LLMAssistantNode } from '@/components/canvas/nodes/LLMAssistantNode';
import { ImageUpscaleNode } from '@/components/canvas/nodes/ImageUpscaleNode';
import { TextToVideoNode } from '@/components/canvas/nodes/TextToVideoNode';
import { ImageToVideoNode } from '@/components/canvas/nodes/ImageToVideoNode';
import { BatchParameterNode } from '@/components/canvas/nodes/BatchParameterNode';
import { NoteNode } from '@/components/canvas/nodes/NoteNode';
import { TextDisplayNode } from '@/components/canvas/nodes/TextDisplayNode';
import { withNodeErrorBoundary } from '@/components/canvas/nodes/NodeErrorBoundary';
import { webglDynamic } from '@/lib/webgl/dynamic';
import { TurboEdge } from '@/components/canvas/edges/TurboEdge';
import { AnnotationEdge } from '@/components/canvas/edges/AnnotationEdge';
import {
  ContextMenu,
  type ContextMenuPosition,
} from '@/components/canvas/ContextMenu';
import { CommandPalette } from '@/components/canvas/CommandPalette';
import { getRegistryEntry, type NodeTemplate } from '@/lib/node-registry';
import { useExecutionStore } from '@/stores/execution-store';
import type { NodeData } from '@/types/canvas';

// WebGL nodes — dynamically imported with SSR disabled
const GradientGeneratorNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/GradientGeneratorNode'),
);
const WebGLPreviewNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/WebGLPreviewNode'),
);
const SolidColorNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/SolidColorNode'),
);
const NoiseGeneratorNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/NoiseGeneratorNode'),
);
const ImageLayerNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/ImageLayerNode'),
);
const TextLayerNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/TextLayerNode'),
);
const ShapeGeneratorNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/ShapeGeneratorNode'),
);
const BlurEffectNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/BlurEffectNode'),
);
const ColorCorrectionNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/ColorCorrectionNode'),
);
const DistortionEffectNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/DistortionEffectNode'),
);
const CompositionNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/CompositionNode'),
);
const TimeControlNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/TimeControlNode'),
);
const MouseInteractionNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/MouseInteractionNode'),
);
const WebGLSnapshotNode = webglDynamic(
  () => import('@/components/canvas/nodes/webgl/WebGLSnapshotNode'),
);

// NOTE: When adding a new node type, also add its component here (registry handles everything else)
const nodeTypes = {
  placeholder: PlaceholderNode,
  textInput: withNodeErrorBoundary(TextInputNode),
  imageImport: withNodeErrorBoundary(ImageImportNode),
  imageGenerator: withNodeErrorBoundary(ImageGeneratorNode),
  llmAssistant: withNodeErrorBoundary(LLMAssistantNode),
  imageUpscale: withNodeErrorBoundary(ImageUpscaleNode),
  textToVideo: withNodeErrorBoundary(TextToVideoNode),
  imageToVideo: withNodeErrorBoundary(ImageToVideoNode),
  batchParameter: withNodeErrorBoundary(BatchParameterNode),
  canvasNote: withNodeErrorBoundary(NoteNode),
  textDisplay: withNodeErrorBoundary(TextDisplayNode),
  gradientGenerator: GradientGeneratorNode,
  solidColor: SolidColorNode,
  noiseGenerator: NoiseGeneratorNode,
  imageLayer: ImageLayerNode,
  textLayer: TextLayerNode,
  shapeGenerator: ShapeGeneratorNode,
  blurEffect: BlurEffectNode,
  colorCorrection: ColorCorrectionNode,
  distortionEffect: DistortionEffectNode,
  composition: CompositionNode,
  timeControl: TimeControlNode,
  mouseInteraction: MouseInteractionNode,
  webglSnapshot: WebGLSnapshotNode,
  webglPreview: WebGLPreviewNode,
};
const edgeTypes = { turbo: TurboEdge, annotationEdge: AnnotationEdge };

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
}

/** Build extra props for note nodes (initial size + default data fields) */
function getNoteNodeExtras(nodeType: string): { style?: Record<string, number>; extraData?: Record<string, unknown> } {
  if (nodeType === 'canvasNote') {
    return {
      style: { width: 300, height: 200 },
      extraData: { noteTitle: '', noteBody: '' },
    };
  }
  if (nodeType === 'textDisplay') {
    return {
      style: { width: 280, height: 200 },
      extraData: { displayText: null },
    };
  }
  if (nodeType === 'gradientGenerator') {
    return {
      extraData: {
        gradientType: 'linear',
        colorStops: [
          { color: '#6366f1', position: 0 },
          { color: '#ec4899', position: 1 },
        ],
        angle: 45,
        speed: 1,
        width: 512,
        height: 512,
      },
    };
  }
  if (nodeType === 'solidColor') {
    return {
      extraData: {
        color: '#ffffff',
        alpha: 1,
      },
    };
  }
  if (nodeType === 'noiseGenerator') {
    return {
      extraData: {
        noiseType: 'perlin',
        scale: 10,
        octaves: 4,
        speed: 1,
        seed: 42,
        directionX: 1,
        directionY: 0,
      },
    };
  }
  if (nodeType === 'shapeGenerator') {
    return {
      extraData: {
        shapeType: 'rectangle',
        fillColor: '#ffffff',
        fillAlpha: 1,
        borderColor: '#000000',
        borderWidth: 0,
        opacity: 1,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        bgColor: '#000000',
        bgAlpha: 0,
        width: 0.4,
        height: 0.4,
        cornerTL: 0,
        cornerTR: 0,
        cornerBL: 0,
        cornerBR: 0,
        radius: 0.3,
        sides: 6,
        starMode: false,
        innerRadius: 0.15,
        polyRadius: 0.3,
      },
    };
  }
  if (nodeType === 'imageLayer') {
    return {
      extraData: {
        imageUrl: null,
      },
    };
  }
  if (nodeType === 'textLayer') {
    return {
      extraData: {
        text: 'Hello World',
        fontFamily: 'Arial',
        fontSize: 48,
        fontColor: '#ffffff',
        alignment: 'center',
        bold: false,
        italic: false,
        outlineColor: '#000000',
        outlineWidth: 0,
        shadowColor: '#000000',
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowBlur: 0,
        textBoxWidth: 400,
        offsetX: 0,
        offsetY: 0,
        bgColor: '#000000',
        bgAlpha: 0,
      },
    };
  }
  if (nodeType === 'blurEffect') {
    return {
      extraData: {
        blurType: 'gaussian',
        bypass: false,
        radius: 10,
        strength: 0.2,
        centerX: 0.5,
        centerY: 0.5,
        angle: 0,
        preset: '',
      },
    };
  }
  if (nodeType === 'colorCorrection') {
    return {
      extraData: {
        bypass: false,
        preset: '',
        hue: 0,
        saturation: 0,
        brightness: 0,
        contrast: 0,
        colorSectionOpen: true,
        levelsSectionOpen: true,
      },
    };
  }
  if (nodeType === 'distortionEffect') {
    return {
      extraData: {
        distortionType: 'wave',
        bypass: false,
        preset: '',
        amplitude: 0.02,
        frequency: 5,
        speed: 1,
        strength: 0.5,
        intensity: 0.01,
        angle: 0,
      },
    };
  }
  if (nodeType === 'timeControl') {
    return {
      extraData: {
        speed: 1,
        loopMode: 'loop',
        timeRangeStart: 0,
        timeRangeEnd: 10,
        isPlaying: true,
        positionSectionOpen: true,
      },
    };
  }
  if (nodeType === 'mouseInteraction') {
    return {
      extraData: {
        clickStateMode: 'momentary',
        easingPreset: 'linear',
        rangeMappings: {
          X: { preset: '0-1', min: 0, max: 1 },
          Y: { preset: '0-1', min: 0, max: 1 },
          Distance: { preset: '0-1', min: 0, max: 1 },
          Angle: { preset: '0-360', min: 0, max: 360 },
        },
        positionSectionOpen: true,
        gesturesSectionOpen: false,
        rangeMappingSectionOpen: false,
        smoothingSectionOpen: false,
      },
    };
  }
  if (nodeType === 'composition') {
    return {
      extraData: {
        layers: [
          { id: `layer_init_1`, blendMode: 'normal', opacity: 1 },
          { id: `layer_init_2`, blendMode: 'normal', opacity: 1 },
        ],
      },
    };
  }
  if (nodeType === 'webglSnapshot') {
    return {
      extraData: {
        scrubTime: 0.5,
        capturedImageUrl: null,
      },
    };
  }
  if (nodeType === 'webglPreview') {
    return {
      style: { width: 300, height: 200 },
      extraData: {
        fpsCap: 30,
        resolutionPreset: '720p',
        customWidth: 1280,
        customHeight: 720,
        isPlaying: false,
        activeSourceIndex: 0,
      },
    };
  }
  return {};
}

function getNodeColor(node: Node): string {
  const t = (node.data as Record<string, unknown>)?.type as string | undefined;
  switch (t) {
    case 'imageGenerator': return '#ae53ba';
    case 'textInput': return '#ae53ba';
    case 'imageImport': return '#2a8af6';
    case 'llmAssistant': return '#22c55e';
    case 'imageUpscale': return '#ae53ba';
    case 'textToVideo': return '#f59e0b';
    case 'imageToVideo': return '#f59e0b';
    case 'canvasNote': return '#ae53ba';
    case 'textDisplay': return '#6b7280';
    case 'gradientGenerator': return '#ff6b35';
    case 'solidColor': return '#ff6b35';
    case 'noiseGenerator': return '#ff6b35';
    case 'imageLayer': return '#ff6b35';
    case 'textLayer': return '#ff6b35';
    case 'shapeGenerator': return '#ff6b35';
    case 'blurEffect': return '#00bcd4';
    case 'colorCorrection': return '#00bcd4';
    case 'distortionEffect': return '#00bcd4';
    case 'composition': return '#9c27b0';
    case 'timeControl': return '#4caf50';
    case 'mouseInteraction': return '#4caf50';
    case 'webglSnapshot': return '#4caf50';
    case 'webglPreview': return '#ff6b35';
    default: return '#666';
  }
}

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, updateNodeData } =
    useCanvasStore(
      useShallow((state) => ({
        nodes: state.nodes,
        edges: state.edges,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        onConnect: state.onConnect,
        addNode: state.addNode,
        updateNodeData: state.updateNodeData,
      }))
    );

  const { screenToFlowPosition } = useReactFlow();

  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const minimapVisible = useAppStore((s) => s.minimapVisible);
  const schemaLoadingCount = useAppStore((s) => s.schemaLoadingCount);
  const schemaLoading = schemaLoadingCount > 0;

  // Force React Flow to recalculate edge positions after handles mount.
  // Edges may reference handles that don't exist yet at restore time:
  //  - Static handles (TextInput): need nodes measured first
  //  - Dynamic handles (ImageGenerator prompt): need schema loaded first
  // We bump the edges reference after initial mount and after schema loading
  // finishes so React Flow picks up newly registered handles.
  const hasRefreshedEdgesRef = useRef(false);
  useEffect(() => {
    // After initial node mount — refresh edges for static handles
    if (!hasRefreshedEdgesRef.current && nodes.length > 0) {
      hasRefreshedEdgesRef.current = true;
      requestAnimationFrame(() => {
        const { edges: currentEdges } = useCanvasStore.getState();
        if (currentEdges.length > 0) {
          useCanvasStore.getState().setEdges([...currentEdges]);
        }
      });
    }
  }, [nodes]);

  const prevSchemaLoadingRef = useRef(schemaLoadingCount);
  useEffect(() => {
    const prev = prevSchemaLoadingRef.current;
    prevSchemaLoadingRef.current = schemaLoadingCount;

    // Schema loading → done: refresh edges for dynamic handles
    if (prev > 0 && schemaLoadingCount === 0) {
      requestAnimationFrame(() => {
        const { edges: currentEdges } = useCanvasStore.getState();
        if (currentEdges.length > 0) {
          useCanvasStore.getState().setEdges([...currentEdges]);
        }
      });
    }
  }, [schemaLoadingCount]);

  // Interaction mode: 'pan' (hand drag) or 'select' (box selection)
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');

  // Load favorites from SQLite on mount
  useEffect(() => {
    useFavoritesStore.getState().loadFavorites();
  }, []);

  // Ensure edges render above selected nodes (z-index 1000)
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.react-flow__edges');
    if (el) el.style.zIndex = '1001';
  });

  // Keyboard shortcut: / opens command palette (unless typing in an input)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === '/') {
        e.preventDefault();
        openCommandPalette();
      }
      if (e.key === 'v' || e.key === 'V') {
        setInteractionMode('select');
      }
      if (e.key === 'h' || e.key === 'H') {
        setInteractionMode('pan');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openCommandPalette]);

  const onCommandPaletteAddNode = useCallback(
    (template: NodeTemplate) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const { style, extraData } = getNoteNodeExtras(template.nodeType);
      const newNode: Node = {
        id: getNextNodeId(),
        type: template.nodeType,
        position,
        ...(style ? { style } : {}),
        data: {
          label: template.label,
          type: template.nodeType,
          inputs: template.inputs,
          outputs: template.outputs,
          ...extraData,
        } satisfies NodeData,
      };
      addNode(newNode);
    },
    [addNode, screenToFlowPosition],
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      // Sidebar palette drag
      const data = event.dataTransfer.getData('application/reactflow');
      if (data) {
        let parsed: { nodeType: string; label: string; inputs: NodeData['inputs']; outputs: NodeData['outputs'] };
        try {
          parsed = JSON.parse(data);
        } catch {
          return;
        }

        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        const { style, extraData } = getNoteNodeExtras(parsed.nodeType);
        const newNode: Node = {
          id: getNextNodeId(),
          type: parsed.nodeType,
          position,
          ...(style ? { style } : {}),
          data: {
            label: parsed.label,
            type: parsed.nodeType,
            inputs: parsed.inputs,
            outputs: parsed.outputs,
            ...extraData,
          } satisfies NodeData,
        };

        addNode(newNode);
        return;
      }

      // Filesystem image drop
      const files = Array.from(event.dataTransfer.files);
      const imageFiles = files.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
      if (imageFiles.length === 0) return;

      const entry = getRegistryEntry('imageImport');
      if (!entry) return;

      const dropPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      imageFiles.forEach((file, index) => {
        const nodeId = getNextNodeId();
        const newNode: Node = {
          id: nodeId,
          type: 'imageImport',
          position: { x: dropPosition.x, y: dropPosition.y + index * 220 },
          data: {
            label: entry.label,
            type: 'imageImport',
            inputs: entry.inputs,
            outputs: entry.outputs,
          } satisfies NodeData,
        };
        addNode(newNode);

        const formData = new FormData();
        formData.append('file', file);
        const pid = useExecutionStore.getState().projectId;
        fetch(pid ? `/api/storage/${pid}/upload` : '/api/images/upload', { method: 'POST', body: formData })
          .then(res => res.json())
          .then((result: { url: string }) => {
            updateNodeData(nodeId, { imageUrl: result.url, fileName: file.name });
          })
          .catch(() => {
            // Node stays with imageUrl: null — user can re-drop manually
          });
      });
    },
    [addNode, updateNodeData, screenToFlowPosition]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const flowPos = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    [screenToFlowPosition]
  );

  const onContextMenuAddNode = useCallback(
    (template: NodeTemplate, flowX: number, flowY: number) => {
      const { style, extraData } = getNoteNodeExtras(template.nodeType);
      const newNode: Node = {
        id: getNextNodeId(),
        type: template.nodeType,
        position: { x: flowX, y: flowY },
        ...(style ? { style } : {}),
        data: {
          label: template.label,
          type: template.nodeType,
          inputs: template.inputs,
          outputs: template.outputs,
          ...extraData,
        } satisfies NodeData,
      };
      addNode(newNode);
    },
    [addNode]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ type: 'turbo', animated: false }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneContextMenu={onPaneContextMenu}
        onMoveStart={closeContextMenu}
        fitView
        panOnDrag={interactionMode === 'pan'}
        selectionOnDrag={interactionMode === 'select'}
        selectionMode={SelectionMode.Partial}
        zoomOnScroll
        zoomOnPinch
        connectionLineStyle={{
          stroke: '#666',
          strokeDasharray: '5 5',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
        <Controls
          position="top-left"
          showInteractive={false}
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <button
            className={`react-flow__controls-button${interactionMode === 'pan' ? ' active' : ''}`}
            title="Pan (H)"
            onClick={() => setInteractionMode('pan')}
          >
            <Hand size={14} />
          </button>
          <button
            className={`react-flow__controls-button${interactionMode === 'select' ? ' active' : ''}`}
            title="Select (V)"
            onClick={() => setInteractionMode('select')}
          >
            <MousePointer2 size={14} />
          </button>
        </Controls>
        {minimapVisible && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={getNodeColor}
            bgColor="#0a0a0a"
            maskColor="rgba(0, 0, 0, 0.6)"
            style={{ width: 200, height: 140 }}
          />
        )}
      </ReactFlow>
      <ContextMenu
        position={contextMenu}
        onClose={closeContextMenu}
        onAddNode={onContextMenuAddNode}
      />
      {commandPaletteOpen && (
        <CommandPalette onAddNode={onCommandPaletteAddNode} />
      )}
      {/* Schema loading overlay */}
      {schemaLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            background: 'rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a1a]/90 px-6 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Loading model schema…</span>
          </div>
        </div>
      )}
    </div>
  );
}
