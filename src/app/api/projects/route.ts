import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rows = await db
      .select({
        id: projects.id,
        title: projects.title,
        thumbnail_path: projects.thumbnail_path,
        updated_at: projects.updated_at,
      })
      .from(projects)
      .where(
        and(eq(projects.is_archived, false), eq(projects.is_template, false)),
      )
      .orderBy(desc(projects.updated_at));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('GET /api/projects error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();

    // Accept optional body for template instantiation / import
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body or invalid JSON — use defaults
    }

    const defaultWorkflow = {
      nodes: [] as Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>,
      edges: [] as Array<{ id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null; type: string }>,
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    const newProject = {
      id,
      title: (body.title as string) || 'Untitled Project',
      workflow_json: (body.workflow_json as typeof defaultWorkflow) ?? defaultWorkflow,
      updated_at: now,
      is_archived: false,
      is_template: (body.is_template as boolean) ?? false,
      template_source: (body.template_source as string | null) ?? null,
      template_description: (body.template_description as string | null) ?? null,
    };

    await db.insert(projects).values(newProject);

    return NextResponse.json(newProject, { status: 201 });
  } catch (error) {
    console.error('POST /api/projects error:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 },
    );
  }
}
