import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';

const KEY = 'default_llm_model';

export async function GET() {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) {
    return NextResponse.json({ model: null });
  }
  return NextResponse.json({ model: row.value });
}

export async function PUT(request: NextRequest) {
  let body: { model: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.model || typeof body.model !== 'string') {
    return NextResponse.json({ error: 'Missing model field' }, { status: 400 });
  }

  db.insert(settings)
    .values({ key: KEY, value: body.model })
    .onConflictDoUpdate({ target: settings.key, set: { value: body.model } })
    .run();

  return NextResponse.json({ model: body.model });
}
