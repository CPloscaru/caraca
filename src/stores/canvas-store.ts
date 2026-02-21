import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import { isValidConnection } from '@/lib/port-types';

type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdge: (edgeId: string) => void;
  updateNodeData: (nodeId: string, partialData: Record<string, unknown>) => void;
};

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: [],
      edges: [],

      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
      },

      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },

      onConnect: (connection) => {
        // Validate port type compatibility before connecting
        if (!isValidConnection(connection)) return;
        set({ edges: addEdge({ ...connection, type: 'turbo' }, get().edges) });
      },

      addNode: (node) => {
        set({ nodes: [...get().nodes, node] });
      },

      setNodes: (nodes) => {
        set({ nodes });
      },

      setEdges: (edges) => {
        set({ edges });
      },

      deleteNode: (nodeId) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== nodeId),
          edges: get().edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId
          ),
        });
      },

      deleteEdge: (edgeId) => {
        set({ edges: get().edges.filter((e) => e.id !== edgeId) });
      },

      updateNodeData: (nodeId, partialData) => {
        set({
          nodes: get().nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, ...partialData } }
              : n
          ),
        });
      },
    }),
    {
      partialize: (state) => ({
        nodes: state.nodes.map((n) => ({
          ...n,
          data: { ...n.data, images: undefined },
        })),
        edges: state.edges,
      }),
      limit: 50,
      equality: (pastState, currentState) =>
        pastState.nodes === currentState.nodes &&
        pastState.edges === currentState.edges,
    },
  ),
);
