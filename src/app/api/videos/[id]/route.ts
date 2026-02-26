import { NextRequest } from 'next/server';
import { serveStaticFile } from '@/lib/api/serve-static';

const VIDEO_CONFIG = {
  storagePath: process.env.VIDEO_STORAGE_PATH || './storage/videos',
  mimeTypes: {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
  } as Record<string, string>,
  entityName: 'Video',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return serveStaticFile(request, id, VIDEO_CONFIG);
}
