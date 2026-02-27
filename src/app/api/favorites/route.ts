import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { favoriteModels } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withValidation, apiError } from '@/lib/api/validation';

const favoriteSchema = z.object({ endpoint_id: z.string().min(1) }).strict();

export async function GET() {
  try {
    const rows = await db
      .select({ endpoint_id: favoriteModels.endpoint_id })
      .from(favoriteModels);

    return NextResponse.json({
      endpoint_ids: rows.map((r) => r.endpoint_id),
    });
  } catch (error) {
    console.error('GET /api/favorites error:', error);
    return apiError(500, 'Failed to fetch favorites', undefined, 'INTERNAL_ERROR');
  }
}

export const POST = withValidation(favoriteSchema, async (_request, body) => {
  await db
    .insert(favoriteModels)
    .values({ endpoint_id: body.endpoint_id, created_at: Date.now() })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
});

export const DELETE = withValidation(favoriteSchema, async (_request, body) => {
  await db
    .delete(favoriteModels)
    .where(eq(favoriteModels.endpoint_id, body.endpoint_id));

  return NextResponse.json({ ok: true });
});
