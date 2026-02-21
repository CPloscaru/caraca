import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const STORAGE_PATH =
  process.env.IMAGE_STORAGE_PATH || './storage/images';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

let storageInitialized = false;

async function ensureStorageDir() {
  if (storageInitialized) return;
  await mkdir(STORAGE_PATH, { recursive: true });
  storageInitialized = true;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided.' },
        { status: 400 }
      );
    }

    // Validate file type
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPG, and WebP are supported.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    await ensureStorageDir();

    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(STORAGE_PATH, filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    await writeFile(filePath, buffer);

    return NextResponse.json({
      id: filename,
      url: `/api/images/${filename}`,
    });
  } catch {
    return NextResponse.json(
      { error: 'Upload failed.' },
      { status: 500 }
    );
  }
}
