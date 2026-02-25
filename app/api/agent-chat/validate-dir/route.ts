/**
 * Directory Validation API
 *
 * GET /api/agent-chat/validate-dir?path=...
 * Validates that the given path exists, is a directory, and is readable.
 * Relative paths are resolved against the user's home directory.
 * Returns the resolved absolute path so the frontend can store it correctly.
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const dirPath = request.nextUrl.searchParams.get('path');

  if (!dirPath) {
    return Response.json({ valid: false, error: 'path parameter is required' }, { status: 400 });
  }

  // Resolve relative paths against user home directory
  const resolvedPath = path.isAbsolute(dirPath)
    ? dirPath
    : path.resolve(os.homedir(), dirPath);

  logger.debug('Validating directory', { path: dirPath, resolved: resolvedPath }, 'API:AgentChat:ValidateDir');

  try {
    const stat = await fs.stat(resolvedPath);

    if (!stat.isDirectory()) {
      return Response.json({ valid: false, error: 'Path is not a directory' });
    }

    // Check readable by attempting to list contents
    await fs.readdir(resolvedPath);

    logger.debug('Directory validated', { path: resolvedPath }, 'API:AgentChat:ValidateDir');
    return Response.json({ valid: true, resolvedPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.debug('Directory validation failed', { path: resolvedPath, error: message }, 'API:AgentChat:ValidateDir');
    return Response.json({ valid: false, error: `Path is not accessible: ${message}` });
  }
}
