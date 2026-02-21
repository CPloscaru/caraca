import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads', 'projects', id);
    await fs.mkdir(uploadDir, { recursive: true });

    // Save thumbnail
    const filePath = path.join(uploadDir, 'thumbnail.png');
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Update project record
    const thumbnailPath = `uploads/projects/${id}/thumbnail.png`;
    await db
      .update(projects)
      .set({ thumbnail_path: thumbnailPath, updated_at: Date.now() })
      .where(eq(projects.id, id));

    return NextResponse.json({ thumbnail_path: thumbnailPath });
  } catch (error) {
    console.error('POST /api/projects/[id]/thumbnail error:', error);
    return NextResponse.json(
      { error: 'Failed to upload thumbnail' },
      { status: 500 },
    );
  }
}
