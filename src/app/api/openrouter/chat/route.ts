import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withValidation, apiError } from '@/lib/api/validation';

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  max_tokens: z.number().int().positive().optional(),
}).strict();

export const POST = withValidation(chatSchema, async (_request, body) => {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return apiError(503, 'OPENROUTER_KEY not configured', undefined, 'SERVICE_UNAVAILABLE');
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': appUrl,
      'X-Title': 'Caraca',
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      ...(body.max_tokens != null && { max_tokens: body.max_tokens }),
      stream: false,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  return NextResponse.json(data);
});
