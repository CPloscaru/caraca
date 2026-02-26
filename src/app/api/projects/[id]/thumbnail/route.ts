import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import path from 'path';
import { apiError } from '@/lib/api/validation';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const IMAGE_SIGNATURES: Array<{
  ext: Set<string>;
  bytes: number[];
  offset?: number;
}> = [
  { ext: new Set(['.jpg', '.jpeg']), bytes: [0xff, 0xd8, 0xff] },
  { ext: new Set(['.png']), bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: new Set(['.gif']), bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: new Set(['.webp']), bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header
];

// Extra check for WebP: bytes 8-11 must be "WEBP" (to distinguish from WAV/AVI)
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

function isValidImage(buffer: Buffer, ext: string): boolean {
  const sig = IMAGE_SIGNATURES.find((s) => s.ext.has(ext));
  if (!sig) return false;
  if (buffer.length < sig.bytes.length) return false;
  const headerMatch = sig.bytes.every((byte, i) => buffer[i] === byte);
  if (!headerMatch) return false;

  // Extra WebP validation: check RIFF subtype
  if (ext === '.webp') {
    if (buffer.length < 12) return false;
    return WEBP_MARKER.every((byte, i) => buffer[8 + i] === byte);
  }

  return true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError(400, 'No file provided', undefined, 'VALIDATION_ERROR');
    }

    // Validate extension
    const ext = path.extname(file.name || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      console.warn(
        `[SECURITY] Thumbnail rejected: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, reason=invalid-extension, ext=${ext}, project=${id}, type=upload-validation`,
      );
      return apiError(403, 'Fichier invalide', undefined, 'FORBIDDEN');
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      console.warn(
        `[SECURITY] Thumbnail rejected: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, reason=size-exceeded, size=${file.size}, project=${id}, type=upload-validation`,
      );
      return apiError(403, 'Fichier invalide', undefined, 'FORBIDDEN');
    }

    // Validate magic bytes
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isValidImage(buffer, ext)) {
      console.warn(
        `[SECURITY] Thumbnail rejected: ip=${request.headers.get('x-forwarded-for') ?? 'local'}, reason=magic-bytes-mismatch, ext=${ext}, project=${id}, type=upload-validation`,
      );
      return apiError(403, 'Fichier invalide', undefined, 'FORBIDDEN');
    }

    // Ensure uploads directory exists
    const uploadDir = path.join(process.cwd(), 'uploads', 'projects', id);
    await fs.mkdir(uploadDir, { recursive: true });

    // Save thumbnail
    const filePath = path.join(uploadDir, 'thumbnail.png');
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
    return apiError(500, 'Failed to upload thumbnail', undefined, 'INTERNAL_ERROR');
  }
}
