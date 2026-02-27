import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { apiError } from '@/lib/api/validation';
import { ensureDir } from '@/lib/api/serve-static';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return apiError(400, 'No file provided.', undefined, 'VALIDATION_ERROR');
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return apiError(
        400,
        'Invalid file type. Only PNG, JPG, and WebP are supported.',
        undefined,
        'VALIDATION_ERROR',
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiError(
        400,
        'File too large. Maximum size is 10MB.',
        undefined,
        'VALIDATION_ERROR',
      );
    }

    const uploadDir = path.join('storage', projectId, 'upload');
    await ensureDir(uploadDir);

    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(filePath, buffer);

    return NextResponse.json({
      id: filename,
      url: `/api/storage/${projectId}/upload/${filename}`,
    });
  } catch {
    return apiError(500, 'Upload failed.', undefined, 'INTERNAL_ERROR');
  }
}
