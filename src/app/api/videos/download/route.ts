import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import crypto from "node:crypto";

const STORAGE_PATH =
  process.env.VIDEO_STORAGE_PATH || "./storage/videos";

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid url" },
        { status: 400 }
      );
    }

    // Generate filename: YYYY-MM-DD_shortId.mp4
    const date = new Date().toISOString().slice(0, 10);
    const shortId = crypto.randomBytes(3).toString("hex");
    const filename = `${date}_${shortId}.mp4`;

    // Ensure storage directory exists
    await mkdir(STORAGE_PATH, { recursive: true });

    // Fetch video from CDN
    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to download video", cdnUrl: url },
        { status: 500 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(`${STORAGE_PATH}/${filename}`, buffer);

    return NextResponse.json({
      id: filename,
      localUrl: `/api/videos/${filename}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to download video" },
      { status: 500 }
    );
  }
}
