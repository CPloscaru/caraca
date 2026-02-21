'use client';

import { useCallback, type DragEvent } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
} from '@xyflow/react';
import { useShallow } from 'zustand/shallow';
import { useCanvasStore } from '@/stores/canvas-store';
import { isValidConnection } from '@/lib/port-types';
import { PlaceholderNode } from '@/components/canvas/nodes/PlaceholderNode';
import { TurboEdge } from '@/components/canvas/edges/TurboEdge';
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

      // Get canvas-relative position from the drop event
      const reactFlowBounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const newNode: Node = {
        id: getNextNodeId(),
        type: 'placeholder',
        position: {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        },
        data: {
          label: parsed.label,
          type: parsed.nodeType,
          inputs: parsed.inputs,
          outputs: parsed.outputs,
        } satisfies NodeData,
      };

      addNode(newNode);
    },
    [addNode]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
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
    </div>
  );
}
