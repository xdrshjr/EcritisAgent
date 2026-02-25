/**
 * Agent File Download API Route
 *
 * GET /api/agent-file?path=...&workDir=...
 *
 * Downloads a file created/modified by the agent.
 * Enforces path traversal protection: the resolved file path
 * must be inside the resolved working directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.csv': 'text/csv',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.zip': 'application/zip',
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const filePath = searchParams.get('path');
  const workDir = searchParams.get('workDir');

  if (!filePath || !workDir) {
    return NextResponse.json(
      { error: 'Missing required parameters: path and workDir' },
      { status: 400 },
    );
  }

  // Resolve both paths to absolute form
  const resolvedWorkDir = path.resolve(workDir);
  const resolvedPath = path.resolve(filePath);

  // Path traversal protection — must equal workDir or be inside it
  // (plain startsWith would let /foo/bar pass for /foo/bartrick/...)
  const isInside =
    resolvedPath === resolvedWorkDir ||
    resolvedPath.startsWith(resolvedWorkDir + path.sep);
  if (!isInside) {
    logger.warn('Agent file download blocked: path traversal attempt', {
      filePath,
      workDir,
      resolvedPath,
      resolvedWorkDir,
    }, 'AgentFileRoute');

    return NextResponse.json(
      { error: 'Access denied: file is outside the working directory' },
      { status: 403 },
    );
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      return NextResponse.json(
        { error: 'Path is not a file' },
        { status: 400 },
      );
    }

    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileName = path.basename(resolvedPath);

    logger.info('Agent file download served', {
      fileName,
      size: stat.size,
      contentType,
    }, 'AgentFileRoute');

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(stat.size),
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 },
      );
    }

    logger.error('Agent file download failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      filePath: resolvedPath,
    }, 'AgentFileRoute');

    return NextResponse.json(
      { error: 'Failed to read file' },
      { status: 500 },
    );
  }
}
