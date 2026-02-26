import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { withValidation, apiError } from '@/lib/api/validation';

const projectUpdateSchema = z.object({
  title: z.string().optional(),
  workflow_json: z.unknown().optional(),
  thumbnail_path: z.string().optional(),
}).strict();

const projectSaveSchema = z.object({
  workflow_json: z.unknown().optional(),
}).strict();

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
      return apiError(404, 'Project not found', undefined, 'NOT_FOUND');
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error);
    return apiError(500, 'Failed to fetch project', undefined, 'INTERNAL_ERROR');
  }
}

export const PUT = withValidation(projectUpdateSchema, async (_request, body, context) => {
  const { id } = await context.params;

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
    return apiError(404, 'Project not found', undefined, 'NOT_FOUND');
  }

  return NextResponse.json(result[0]);
});

// POST handler for sendBeacon (tab close / navigation saves)
// sendBeacon only sends POST requests, so we mirror the PUT update logic here.
export const POST = withValidation(projectSaveSchema, async (_request, body, context) => {
  const { id } = await context.params;

  const updateData: Record<string, unknown> = {
    updated_at: Date.now(),
  };

  if (body.workflow_json !== undefined)
    updateData.workflow_json = body.workflow_json;

  await db
    .update(projects)
    .set(updateData)
    .where(and(eq(projects.id, id), eq(projects.is_archived, false)));

  return NextResponse.json({ ok: true });
});

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
      return apiError(404, 'Project not found', undefined, 'NOT_FOUND');
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
    return apiError(500, 'Failed to delete project', undefined, 'INTERNAL_ERROR');
  }
}
