import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/validation';

export async function GET() {
  const key = process.env.OPENROUTER_KEY;
  return NextResponse.json({ configured: !!key });
}

export async function POST() {
  const key = process.env.OPENROUTER_KEY;
  if (!key) {
    return NextResponse.json({ configured: false, valid: false });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (res.status === 401) {
      return NextResponse.json({ configured: true, valid: false });
    }

    const valid = res.ok;
    return NextResponse.json({ configured: true, valid });
  } catch {
    return apiError(502, 'Cannot validate OpenRouter key', undefined, 'SERVICE_UNAVAILABLE');
  }
}
