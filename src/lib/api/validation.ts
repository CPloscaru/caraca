// src/lib/api/validation.ts
import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError, z } from 'zod';

// --- Error Response Types ---

type ApiErrorBody = {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
};

// --- Error Helper ---

export function apiError(
  status: number,
  message: string,
  details?: Record<string, string[]>,
  code?: string,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: message };
  if (code) body.code = code;
  if (details && Object.keys(details).length > 0) body.details = details;
  return NextResponse.json(body, { status });
}

// --- Zod Error Formatter ---

function formatZodErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    if (!details[key]) details[key] = [];
    details[key].push(issue.message);
  }
  return details;
}

// --- Validation HOF ---

type RouteContext = { params: Promise<Record<string, string>> };

export function withValidation<T extends ZodSchema>(
  schema: T,
  handler: (
    request: NextRequest,
    body: z.infer<T>,
    context: RouteContext,
  ) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: RouteContext): Promise<NextResponse> => {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(400, 'Invalid JSON body', undefined, 'INVALID_JSON');
    }

    const result = schema.safeParse(rawBody);
    if (!result.success) {
      return apiError(
        400,
        'Validation failed',
        formatZodErrors(result.error),
        'VALIDATION_ERROR',
      );
    }

    try {
      return await handler(request, result.data, context);
    } catch (error) {
      console.error(`${request.method} ${request.nextUrl.pathname} error:`, error);
      return apiError(500, 'Internal server error', undefined, 'INTERNAL_ERROR');
    }
  };
}
