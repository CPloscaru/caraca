import { create } from 'zustand';
import type { NodeStatus } from '@/lib/dag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeExecutionState = {
  status: NodeStatus;
  result?: Record<string, unknown>;
  error?: string;
  requestId?: string; // fal.ai queue request ID for cancellation
  queueLogs?: Array<{ message: string; timestamp: string }>;
  queuePosition?: number;
  generationStartedAt?: number; // Date.now() when status becomes 'running'
};

type ExecutionStore = {
  nodeStates: Record<string, NodeExecutionState>;
  isRunning: boolean;
  abortController: AbortController | null;
  batchProgress: Record<string, { current: number; total: number; accumulatedCost: number; currentItemText: string }>;

  // Actions
  setNodeStatus: (nodeId: string, status: NodeStatus) => void;
  setNodeResult: (nodeId: string, result: Record<string, unknown>) => void;
  setNodeError: (nodeId: string, error: string) => void;
  setNodeRequestId: (nodeId: string, requestId: string) => void;
  setNodeQueueStatus: (
    nodeId: string,
    status: {
      status: string;
      logs?: Array<{ message: string }>;
      queue_position?: number;
    },
  ) => void;
  clearNodeQueueLogs: (nodeId: string) => void;
  setBatchProgress: (nodeId: string, current: number, total: number, accumulatedCost?: number, currentItemText?: string) => void;
  clearBatchProgress: (nodeId: string) => void;
  startExecution: () => AbortController;
  cancelExecution: () => void;
  clearAll: () => void;
  clearNode: (nodeId: string) => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrCreateNodeState(
  states: Record<string, NodeExecutionState>,
  nodeId: string,
): NodeExecutionState {
  return states[nodeId] ?? { status: 'idle' as const };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  nodeStates: {},
  isRunning: false,
  abortController: null,
  batchProgress: {},

  setNodeStatus: (nodeId, status) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: {
          ...getOrCreateNodeState(state.nodeStates, nodeId),
          status,
          ...(status === 'running' ? { generationStartedAt: Date.now() } : {}),
        },
      },
    }));
  },

  setNodeResult: (nodeId, result) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: { ...getOrCreateNodeState(state.nodeStates, nodeId), result },
      },
    }));
  },

  setNodeError: (nodeId, error) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: {
          ...getOrCreateNodeState(state.nodeStates, nodeId),
          error,
          status: 'error' as const,
        },
      },
    }));
  },

  setNodeRequestId: (nodeId, requestId) => {
    set((state) => ({
      nodeStates: {
        ...state.nodeStates,
        [nodeId]: {
          ...getOrCreateNodeState(state.nodeStates, nodeId),
          requestId,
        },
      },
    }));
  },

  setNodeQueueStatus: (nodeId, queueStatus) => {
    set((state) => {
      const existing = getOrCreateNodeState(state.nodeStates, nodeId);
      const newLogs = queueStatus.logs
        ? [
            ...(existing.queueLogs ?? []),
            ...queueStatus.logs.map((l) => ({
              message: l.message,
              timestamp: new Date().toISOString(),
            })),
          ]
        : existing.queueLogs;
      return {
        nodeStates: {
          ...state.nodeStates,
          [nodeId]: {
            ...existing,
            queueLogs: newLogs,
            ...(queueStatus.queue_position !== undefined
              ? { queuePosition: queueStatus.queue_position }
              : {}),
          },
        },
      };
    });
  },

  clearNodeQueueLogs: (nodeId) => {
    set((state) => {
      const existing = getOrCreateNodeState(state.nodeStates, nodeId);
      const { queueLogs: _, queuePosition: __, generationStartedAt: ___, ...rest } = existing;
      return {
        nodeStates: {
          ...state.nodeStates,
          [nodeId]: rest as NodeExecutionState,
        },
      };
    });
  },

  setBatchProgress: (nodeId, current, total, accumulatedCost?, currentItemText?) => {
    set((state) => ({
      batchProgress: {
        ...state.batchProgress,
        [nodeId]: {
          current,
          total,
          accumulatedCost: accumulatedCost ?? state.batchProgress[nodeId]?.accumulatedCost ?? 0,
          currentItemText: currentItemText ?? state.batchProgress[nodeId]?.currentItemText ?? '',
        },
      },
    }));
  },

  clearBatchProgress: (nodeId) => {
    set((state) => {
      const { [nodeId]: _, ...rest } = state.batchProgress;
      return { batchProgress: rest };
    });
  },

  startExecution: () => {
    // Cancel previous execution if still running
    const prev = get().abortController;
    if (prev) prev.abort();

    const controller = new AbortController();
    set({ isRunning: true, abortController: controller });
    return controller;
  },

  cancelExecution: () => {
    const controller = get().abortController;
    if (controller) controller.abort();
    // Keep completed results — only stop running state
    set({ isRunning: false, abortController: null, batchProgress: {} });
  },

  clearAll: () => {
    set({ nodeStates: {}, isRunning: false, abortController: null, batchProgress: {} });
  },

  clearNode: (nodeId) => {
    set((state) => {
      const { [nodeId]: _, ...rest } = state.nodeStates;
      return { nodeStates: rest };
    });
  },
}));
