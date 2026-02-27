import { NextRequest, NextResponse } from 'next/server';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { apiError } from './validation';

const initializedDirs = new Set<string>();

export async function ensureDir(dirPath: string) {
  if (initializedDirs.has(dirPath)) return;
  await mkdir(dirPath, { recursive: true });
  initializedDirs.add(dirPath);
}

interface StaticFileConfig {
  storagePath: string;
  mimeTypes: Record<string, string>;
  entityName: string;
}

export async function serveStaticFile(
  request: NextRequest,
  id: string,
  config: StaticFileConfig,
): Promise<NextResponse> {
  const storageDir = path.resolve(config.storagePath);
  const filePath = path.resolve(config.storagePath, id);
  if (!filePath.startsWith(storageDir + path.sep) && filePath !== storageDir) {
    console.warn(
      `[SECURITY] Path traversal blocked: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, path=${id}, type=path-traversal`,
    );
    return apiError(403, 'Forbidden', undefined, 'FORBIDDEN');
  }

  await ensureDir(config.storagePath);
  const ext = path.extname(id).toLowerCase();
  const contentType = config.mimeTypes[ext] || 'application/octet-stream';

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
    return apiError(404, `${config.entityName} not found`, undefined, 'NOT_FOUND');
  }
}
