// ---------------------------------------------------------------------------
// Shared node utilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Execution status border
// ---------------------------------------------------------------------------

export function getStatusBorderClass(status?: string): string {
  switch (status) {
    case 'pending':
      return 'border-gray-600';
    case 'running':
      return 'border-blue-500 animate-pulse';
    case 'done':
      return 'border-green-500';
    case 'error':
      return 'border-red-500';
    default:
      return 'border-[#2a2a2a]';
  }
}

// ---------------------------------------------------------------------------
// Shimmer loading animation component
// ---------------------------------------------------------------------------

export function ShimmerPlaceholder() {
  return (
    <div
      className="shimmer-loading w-full overflow-hidden rounded-md"
      style={{ height: 120 }}
    />
  );
}
