'use client';

import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import { useCanvasStore } from '@/stores/canvas-store';
import { useAppStore } from '@/stores/app-store';
import { isValidConnection } from '@/lib/port-types';
import { PlaceholderNode } from '@/components/canvas/nodes/PlaceholderNode';
import { TextInputNode } from '@/components/canvas/nodes/TextInputNode';
import { ImageImportNode } from '@/components/canvas/nodes/ImageImportNode';
import { ImageGeneratorNode } from '@/components/canvas/nodes/ImageGeneratorNode';
import { LLMAssistantNode } from '@/components/canvas/nodes/LLMAssistantNode';
import { ImageUpscaleNode } from '@/components/canvas/nodes/ImageUpscaleNode';
import { TextToVideoNode } from '@/components/canvas/nodes/TextToVideoNode';
import { TurboEdge } from '@/components/canvas/edges/TurboEdge';
import {
  ContextMenu,
  type ContextMenuPosition,
} from '@/components/canvas/ContextMenu';
import { CommandPalette } from '@/components/canvas/CommandPalette';
import type { NodeTemplate } from '@/lib/node-registry';
import type { NodeData } from '@/types/canvas';

// NOTE: When adding a new node type, also add its component here (registry handles everything else)
const nodeTypes = { placeholder: PlaceholderNode, textInput: TextInputNode, imageImport: ImageImportNode, imageGenerator: ImageGeneratorNode, llmAssistant: LLMAssistantNode, imageUpscale: ImageUpscaleNode, textToVideo: TextToVideoNode };
const edgeTypes = { turbo: TurboEdge };

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
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
    default: return '#666';
  }
}

export function Canvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useCanvasStore(
      useShallow((state) => ({
        nodes: state.nodes,
        edges: state.edges,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        onConnect: state.onConnect,
        addNode: state.addNode,
      }))
    );

  const { screenToFlowPosition } = useReactFlow();

  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const minimapVisible = useAppStore((s) => s.minimapVisible);

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
      const newNode: Node = {
        id: getNextNodeId(),
        type: template.nodeType,
        position,
        data: {
          label: template.label,
          type: template.nodeType,
          inputs: template.inputs,
          outputs: template.outputs,
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

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

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

      const newNode: Node = {
        id: getNextNodeId(),
        type: parsed.nodeType,
        position,
        data: {
          label: parsed.label,
          type: parsed.nodeType,
          inputs: parsed.inputs,
          outputs: parsed.outputs,
        } satisfies NodeData,
      };

      addNode(newNode);
    },
    [addNode, screenToFlowPosition]
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
      const newNode: Node = {
        id: getNextNodeId(),
        type: template.nodeType,
        position: { x: flowX, y: flowY },
        data: {
          label: template.label,
          type: template.nodeType,
          inputs: template.inputs,
          outputs: template.outputs,
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
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        connectionLineStyle={{
          stroke: '#666',
          strokeDasharray: '5 5',
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
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
    </div>
  );
}
