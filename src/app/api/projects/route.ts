import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { withValidation, apiError } from '@/lib/api/validation';

const projectCreateSchema = z.object({
  title: z.string().optional(),
  workflow_json: z.unknown().optional(),
  is_template: z.boolean().optional(),
  template_source: z.string().optional(),
  template_description: z.string().optional(),
}).strict();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const templatesOnly = searchParams.get('templates') === 'true';

    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        thumbnail_path: projects.thumbnail_path,
        updated_at: projects.updated_at,
        ...(templatesOnly
          ? {
              workflow_json: projects.workflow_json,
              template_description: projects.template_description,
              template_source: projects.template_source,
            }
          : {}),
      })
      .from(projects)
      .where(
        and(
          eq(projects.is_archived, false),
          eq(projects.is_template, templatesOnly),
        ),
      )
      .orderBy(desc(projects.updated_at));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return apiError(500, 'Failed to fetch projects', undefined, 'INTERNAL_ERROR');
  }
}

export const POST = withValidation(projectCreateSchema, async (_request, body) => {
  const id = crypto.randomUUID();
  const now = Date.now();

  const defaultWorkflow = {
    nodes: [] as Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
    edges: [] as Array<{ id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; type: string }>,
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  const newProject = {
    id,
    title: body.title || 'Untitled Project',
    workflow_json: (body.workflow_json as typeof defaultWorkflow) ?? defaultWorkflow,
    updated_at: now,
    is_archived: false,
    is_template: body.is_template ?? false,
    template_source: body.template_source ?? null,
    template_description: body.template_description ?? null,
  };

  await db.insert(projects).values(newProject);

  return NextResponse.json(newProject, { status: 201 });
});
