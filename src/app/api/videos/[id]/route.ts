import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const STORAGE_PATH =
  process.env.VIDEO_STORAGE_PATH || "./storage/videos";

const MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

let storageInitialized = false;

async function ensureStorageDir() {
  if (storageInitialized) return;
  await mkdir(STORAGE_PATH, { recursive: true });
  storageInitialized = true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Canonical path traversal protection
  const storageDir = path.resolve(STORAGE_PATH);
  const filePath = path.resolve(STORAGE_PATH, id);
  if (!filePath.startsWith(storageDir + path.sep) && filePath !== storageDir) {
    console.warn(
      `[SECURITY] Path traversal blocked: ip=${request.headers.get("x-forwarded-for") ?? "local"}, path=${id}, type=path-traversal`
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureStorageDir();
  const ext = path.extname(id).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Video not found" },
      { status: 404 }
    );
  }
}
