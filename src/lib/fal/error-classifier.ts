/**
 * fal.ai error classifier — pure logic, zero React dependencies.
 *
 * Categorizes fal.ai errors into actionable types with user-facing suggestions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FalErrorType =
  | 'validation'
  | 'auth'
  | 'rate_limit'
  | 'server'
  | 'timeout'
  | 'cancelled'
  | 'unknown';

export type ClassifiedError = {
  type: FalErrorType;
  retryable: boolean;
  message: string;
  suggestion: string;
};

// ---------------------------------------------------------------------------
// Status code mapping
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<
  number,
  { type: FalErrorType; retryable: boolean; suggestion: string }
> = {
  400: {
    type: 'validation',
    retryable: false,
    suggestion: 'Check your input parameters',
  },
  422: {
    type: 'validation',
    retryable: false,
    suggestion: 'Check your input parameters',
  },
  401: {
    type: 'auth',
    retryable: false,
    suggestion: 'Check your fal.ai API key in Settings',
  },
  403: {
    type: 'auth',
    retryable: false,
    suggestion: 'Check your fal.ai API key in Settings',
  },
  408: {
    type: 'timeout',
    retryable: true,
    suggestion: 'Request timed out. Try again or use a faster model',
  },
  429: {
    type: 'rate_limit',
    retryable: true,
    suggestion: 'Too many requests. Wait a moment and try again',
  },
  500: {
    type: 'server',
    retryable: true,
    suggestion: 'fal.ai server error. The request will auto-retry',
  },
  502: {
    type: 'server',
    retryable: true,
    suggestion: 'fal.ai server error. The request will auto-retry',
  },
  503: {
    type: 'server',
    retryable: true,
    suggestion: 'fal.ai server error. The request will auto-retry',
  },
  504: {
    type: 'server',
    retryable: true,
    suggestion: 'fal.ai server error. The request will auto-retry',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
}

function extractStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;

  // Direct status property
  const e = error as Record<string, unknown>;
  if (typeof e.status === 'number') return e.status;

  // Nested body.status (fal.ai error shape)
  if (
    typeof e.body === 'object' &&
    e.body !== null &&
    typeof (e.body as Record<string, unknown>).status === 'number'
  ) {
    return (e.body as Record<string, unknown>).status as number;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classifies a fal.ai error into an actionable type with a user-facing
 * suggestion and retryable flag.
 */
export function classifyFalError(error: unknown): ClassifiedError {
  const message = extractMessage(error);

  // Check for abort/cancellation first
  if (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return {
      type: 'cancelled',
      retryable: false,
      message,
      suggestion: 'Execution was cancelled',
    };
  }

  // Check HTTP status codes
  const status = extractStatus(error);
  if (status !== null && status in STATUS_MAP) {
    const mapping = STATUS_MAP[status];
    return {
      type: mapping.type,
      retryable: mapping.retryable,
      message,
      suggestion: mapping.suggestion,
    };
  }

  // Default: unknown
  return {
    type: 'unknown',
    retryable: false,
    message,
    suggestion: 'An unexpected error occurred',
  };
}
