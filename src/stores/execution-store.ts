import { create } from 'zustand';
import type { NodeStatus } from '@/lib/dag';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NodeExecutionState = {
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
  activeExecutions: Record<string, AbortController>;
  batchProgress: Record<string, { current: number; total: number; accumulatedCost: number; currentItemText: string }>;
  projectId: string | null;

  // Actions
  setProjectId: (id: string) => void;
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
  startExecution: (executionId: string) => AbortController;
  finishExecution: (executionId: string) => void;
  cancelExecution: (executionId?: string) => void;
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
  activeExecutions: {},
  batchProgress: {},
  projectId: null,

  setProjectId: (id) => set({ projectId: id }),

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
      const { queueLogs: _ql, queuePosition: _qp, generationStartedAt: _gs, ...rest } = existing;
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
      const { [nodeId]: _removed, ...rest } = state.batchProgress;
      return { batchProgress: rest };
    });
  },

  startExecution: (executionId) => {
    const controller = new AbortController();
    set((state) => ({
      activeExecutions: { ...state.activeExecutions, [executionId]: controller },
    }));
    return controller;
  },

  finishExecution: (executionId) => {
    set((state) => {
      const { [executionId]: _removed, ...rest } = state.activeExecutions;
      return { activeExecutions: rest };
    });
  },

  cancelExecution: (executionId?) => {
    if (executionId) {
      const controller = get().activeExecutions[executionId];
      if (controller) controller.abort();
      set((state) => {
        const { [executionId]: _removed, ...rest } = state.activeExecutions;
        return { activeExecutions: rest };
      });
    } else {
      // Cancel all
      for (const controller of Object.values(get().activeExecutions)) {
        controller.abort();
      }
      set({ activeExecutions: {}, batchProgress: {} });
    }
  },

  clearAll: () => {
    for (const controller of Object.values(get().activeExecutions)) {
      controller.abort();
    }
    set({ nodeStates: {}, activeExecutions: {}, batchProgress: {} });
  },

  clearNode: (nodeId) => {
    set((state) => {
      const { [nodeId]: _removed, ...rest } = state.nodeStates;
      return { nodeStates: rest };
    });
  },
}));
