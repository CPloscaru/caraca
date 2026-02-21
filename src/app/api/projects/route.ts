import { NextResponse } from 'next/server';
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

export async function POST() {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();

    const newProject = {
      id,
      title: 'Untitled Project',
      workflow_json: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      updated_at: now,
      is_archived: false,
      is_template: false,
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
