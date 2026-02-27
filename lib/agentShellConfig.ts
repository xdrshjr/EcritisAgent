/**
 * Agent Shell Configuration
 *
 * Best-effort helper that expands pi-coding-agent's bash detection on Windows.
 * Locates bash dynamically via system commands (`where git.exe` / `where bash.exe`)
 * rather than relying on hardcoded paths, so it works regardless of install location.
 *
 * If found, persists the path to ~/.pi/agent/settings.json so pi-coding-agent's
 * getShellConfig() picks it up. Never throws.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from './logger';

/**
 * Try to locate bash on Windows and persist the path for pi-coding-agent.
 *
 * Best-effort — never throws. On non-Windows platforms this is a no-op.
 */
export const ensureShellConfigured = (): void => {
  if (process.platform !== 'win32') return;

  const piSettingsDir = path.join(os.homedir(), '.pi', 'agent');
  const piSettingsFile = path.join(piSettingsDir, 'settings.json');

  // 1. Check cached settings
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(piSettingsFile, 'utf-8'));
  } catch { /* no file yet */ }

  if (settings.shellPath && typeof settings.shellPath === 'string' && fs.existsSync(settings.shellPath)) {
    return;
  }

  // Helper: persist found bash path
  const persist = (bashPath: string): void => {
    logger.info('Bash found, persisting to settings', { path: bashPath }, 'AgentShellConfig');
    fs.mkdirSync(piSettingsDir, { recursive: true });
    fs.writeFileSync(piSettingsFile, JSON.stringify({ ...settings, shellPath: bashPath }, null, 2), 'utf-8');
  };

  // Helper: run `where` and return first result
  const whereFirst = (exe: string): string | null => {
    try {
      const line = execSync(`where ${exe}`, { encoding: 'utf-8', timeout: 5000 })
        .trim().split('\n')[0].trim();
      return (line && fs.existsSync(line)) ? line : null;
    } catch { return null; }
  };

  // 2. Derive bash from git.exe location (most reliable — works on any drive/path)
  //    Git for Windows layout: <root>/cmd/git.exe → bash at <root>/usr/bin/bash.exe
  const gitPath = whereFirst('git.exe');
  if (gitPath) {
    const gitRoot = path.dirname(path.dirname(gitPath));
    for (const rel of ['usr\\bin\\bash.exe', 'bin\\bash.exe']) {
      const bp = path.join(gitRoot, rel);
      if (fs.existsSync(bp)) { persist(bp); return; }
    }
  }

  // 3. Direct bash lookup on PATH
  const bashPath = whereFirst('bash.exe');
  if (bashPath) { persist(bashPath); return; }

  // 4. Fallback: standard install location (Git not added to PATH)
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  for (const rel of ['usr\\bin\\bash.exe', 'bin\\bash.exe']) {
    const bp = path.join(programFiles, 'Git', rel);
    if (fs.existsSync(bp)) { persist(bp); return; }
  }

  // Nothing found — let pi-coding-agent try its own detection
  logger.warn('Could not locate bash', undefined, 'AgentShellConfig');
};
