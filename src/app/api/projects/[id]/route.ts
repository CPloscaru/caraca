import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.is_archived, false)));

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {
      updated_at: Date.now(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.workflow_json !== undefined)
      updateData.workflow_json = body.workflow_json;
    if (body.thumbnail_path !== undefined)
      updateData.thumbnail_path = body.thumbnail_path;

    const result = await db
      .update(projects)
      .set(updateData)
      .where(and(eq(projects.id, id), eq(projects.is_archived, false)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('PUT /api/projects/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const result = await db
      .update(projects)
      .set({ is_archived: true, updated_at: Date.now() })
      .where(and(eq(projects.id, id), eq(projects.is_archived, false)))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Rename uploads folder to archived (if exists)
    const uploadsDir = path.join(process.cwd(), 'uploads', 'projects', id);
    const archivedDir = path.join(
      process.cwd(),
      'uploads',
      'projects',
      `${id}_archived`,
    );

    try {
      await fs.access(uploadsDir);
      await fs.rename(uploadsDir, archivedDir);
    } catch {
      // Folder doesn't exist — skip rename
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/projects/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 },
    );
  }
}
