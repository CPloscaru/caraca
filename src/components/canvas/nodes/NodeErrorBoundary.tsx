'use client';

import { type ComponentType } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { AlertTriangle } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';

function NodeFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-red-500/50 bg-[#1a1a1a] p-4 text-white"
      style={{ minWidth: 280 }}
    >
      <div className="flex items-center gap-2 text-red-400">
        <AlertTriangle size={16} />
        <span className="text-sm font-semibold">Render Error</span>
      </div>
      <p className="truncate text-xs text-gray-400">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="mt-1 rounded bg-red-500/20 px-3 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/30"
      >
        Retry
      </button>
    </div>
  );
}

export function withNodeErrorBoundary<P extends NodeProps>(
  Component: ComponentType<P>,
): ComponentType<P> {
  const Wrapped = (props: P) => (
    <ErrorBoundary
      FallbackComponent={NodeFallback}
      resetKeys={[props.id]}
    >
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name})`;
  return Wrapped;
}
