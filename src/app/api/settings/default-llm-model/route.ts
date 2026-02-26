import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { withValidation, apiError } from '@/lib/api/validation';

const KEY = 'default_llm_model';

const llmModelSchema = z.object({ model: z.string().min(1) }).strict();

export async function GET() {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) {
    return NextResponse.json({ model: null });
  }
  return NextResponse.json({ model: row.value });
}

export const PUT = withValidation(llmModelSchema, async (_request, body) => {
  db.insert(settings)
    .values({ key: KEY, value: body.model })
    .onConflictDoUpdate({ target: settings.key, set: { value: body.model } })
    .run();

  return NextResponse.json({ model: body.model });
});
