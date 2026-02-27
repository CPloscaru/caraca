import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate project ID format (UUID)
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
  }

  const folderPath = path.resolve('storage', id);
  await mkdir(folderPath, { recursive: true });

  // Open folder in the OS file browser
  const cmd =
    process.platform === 'darwin'
      ? `open "${folderPath}"`
      : process.platform === 'win32'
        ? `explorer "${folderPath}"`
        : `xdg-open "${folderPath}"`;

  exec(cmd);

  return NextResponse.json({ ok: true });
}
