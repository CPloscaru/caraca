import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'OPENROUTER_KEY not configured' },
      { status: 503 },
    );
  }

  let body: { model: string; messages: unknown[]; max_tokens?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body.model || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: 'Missing required fields: model, messages' },
      { status: 400 },
    );
  }

  try {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to proxy chat request';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
