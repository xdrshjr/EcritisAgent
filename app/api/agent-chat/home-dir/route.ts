/**
 * Home Directory API
 *
 * GET /api/agent-chat/home-dir
 * Returns the user's home directory path as a default working directory.
 */

import os from 'node:os';

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ homeDir: os.homedir() });
}
