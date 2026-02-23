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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Path traversal protection
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    return NextResponse.json(
      { error: "Invalid video ID" },
      { status: 400 }
    );
  }

  await ensureStorageDir();

  const filePath = path.join(STORAGE_PATH, id);
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
