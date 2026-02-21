'use client';

import { useCallback, useState, type DragEvent, type MouseEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import { useCanvasStore } from '@/stores/canvas-store';
import { isValidConnection } from '@/lib/port-types';
import { PlaceholderNode } from '@/components/canvas/nodes/PlaceholderNode';
import { TurboEdge } from '@/components/canvas/edges/TurboEdge';
import {
  ContextMenu,
  type ContextMenuPosition,
  type NodeTemplate,
} from '@/components/canvas/ContextMenu';
import type { NodeData } from '@/types/canvas';

const nodeTypes = { placeholder: PlaceholderNode };
const edgeTypes = { turbo: TurboEdge };

let nodeIdCounter = 0;
function getNextNodeId() {
  return `node_${Date.now()}_${nodeIdCounter++}`;
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
        type: 'placeholder',
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
        type: 'placeholder',
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
      </ReactFlow>
      <ContextMenu
        position={contextMenu}
        onClose={closeContextMenu}
        onAddNode={onContextMenuAddNode}
      />
    </div>
  );
}
