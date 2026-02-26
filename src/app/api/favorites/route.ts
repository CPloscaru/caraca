import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { favoriteModels } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
    return NextResponse.json(
      { error: 'Failed to fetch favorites' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { endpoint_id } = (await request.json()) as {
      endpoint_id: string;
    };

    await db
      .insert(favoriteModels)
      .values({ endpoint_id, created_at: Date.now() })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('POST /api/favorites error:', error);
    return NextResponse.json(
      { error: 'Failed to add favorite' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { endpoint_id } = (await request.json()) as {
      endpoint_id: string;
    };

    await db
      .delete(favoriteModels)
      .where(eq(favoriteModels.endpoint_id, endpoint_id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('DELETE /api/favorites error:', error);
    return NextResponse.json(
      { error: 'Failed to remove favorite' },
      { status: 500 },
    );
  }
}
