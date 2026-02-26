'use client';

import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from 'react';
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
import { TurboEdge } from '@/components/canvas/edges/TurboEdge';
import { AnnotationEdge } from '@/components/canvas/edges/AnnotationEdge';
import {
  ContextMenu,
  type ContextMenuPosition,
} from '@/components/canvas/ContextMenu';
import { CommandPalette } from '@/components/canvas/CommandPalette';
import { getRegistryEntry, type NodeTemplate } from '@/lib/node-registry';
import type { NodeData } from '@/types/canvas';

// NOTE: When adding a new node type, also add its component here (registry handles everything else)
const nodeTypes = { placeholder: PlaceholderNode, textInput: TextInputNode, imageImport: ImageImportNode, imageGenerator: ImageGeneratorNode, llmAssistant: LLMAssistantNode, imageUpscale: ImageUpscaleNode, textToVideo: TextToVideoNode, imageToVideo: ImageToVideoNode, batchParameter: BatchParameterNode, canvasNote: NoteNode };
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
  const schemaLoading = useAppStore((s) => s.schemaLoadingCount > 0);

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
        fetch('/api/images/upload', { method: 'POST', body: formData })
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
