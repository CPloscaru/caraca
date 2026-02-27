import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { apiError } from '@/lib/api/validation';
import { ensureDir } from '@/lib/api/serve-static';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; path: string[] }> },
) {
  const { projectId, path: segments } = await params;
  const relativePath = segments.join('/');

  // Build and resolve storage directory for this project
  const storageDir = path.resolve('storage', projectId);
  const filePath = path.resolve('storage', projectId, relativePath);

  // Path traversal check: resolved path must stay within project storage
  if (!filePath.startsWith(storageDir + path.sep) && filePath !== storageDir) {
    console.warn(
      `[SECURITY] Path traversal blocked: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, path=${relativePath}, project=${projectId}, type=path-traversal`,
    );
    return apiError(403, 'Forbidden', undefined, 'FORBIDDEN');
  }

  await ensureDir(storageDir);

  const ext = path.extname(relativePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return apiError(404, 'File not found', undefined, 'NOT_FOUND');
  }
}
