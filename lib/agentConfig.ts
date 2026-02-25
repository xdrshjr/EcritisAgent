/**
 * Agent Configuration Management
 * Manages Agent mode settings persisted in localStorage:
 * - Default working directory
 * - Recent directories list (max 10, auto-dedup)
 */

import { logger } from '@/lib/logger';

const STORAGE_KEY_WORKDIR = 'aidocmaster.agentWorkDir';
const STORAGE_KEY_RECENT = 'aidocmaster.agentRecentDirs';
const MAX_RECENT_DIRS = 10;

export const AGENT_CONFIG_UPDATED_EVENT = 'aidocmaster_agent_config_updated';

export interface AgentConfig {
  workDir: string;
  recentDirs: string[];
}

/**
 * Load agent configuration from localStorage.
 */
export const loadAgentConfig = (): AgentConfig => {
  const workDir = localStorage.getItem(STORAGE_KEY_WORKDIR) || '';
  let recentDirs: string[] = [];

  const saved = localStorage.getItem(STORAGE_KEY_RECENT);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        recentDirs = parsed.filter((d): d is string => typeof d === 'string');
      }
    } catch {
      logger.warn('Failed to parse recent dirs from localStorage', undefined, 'agentConfig');
    }
  }

  return { workDir, recentDirs };
};

/**
 * Save the working directory and add it to the recent dirs list.
 */
export const saveAgentWorkDir = (path: string): void => {
  const trimmed = path.trim();
  if (!trimmed) return;

  localStorage.setItem(STORAGE_KEY_WORKDIR, trimmed);

  // Update recent dirs: prepend, dedup, limit
  const current = loadRecentDirs();
  const updated = [trimmed, ...current.filter(d => d !== trimmed)].slice(0, MAX_RECENT_DIRS);
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));

  window.dispatchEvent(new CustomEvent(AGENT_CONFIG_UPDATED_EVENT));
  logger.info('Agent work dir saved', { path: trimmed, recentCount: updated.length }, 'agentConfig');
};

/**
 * Load the recent directories list.
 */
export const loadRecentDirs = (): string[] => {
  const saved = localStorage.getItem(STORAGE_KEY_RECENT);
  if (!saved) return [];

  try {
    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed)) {
      return parsed.filter((d): d is string => typeof d === 'string');
    }
  } catch {
    // ignore
  }
  return [];
};

/**
 * Remove a single directory from the recent list.
 */
export const removeRecentDir = (path: string): void => {
  const current = loadRecentDirs();
  const updated = current.filter(d => d !== path);
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(updated));

  window.dispatchEvent(new CustomEvent(AGENT_CONFIG_UPDATED_EVENT));
  logger.info('Recent dir removed', { path, remaining: updated.length }, 'agentConfig');
};

/**
 * Clear all recent directories.
 */
export const clearRecentDirs = (): void => {
  localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify([]));

  window.dispatchEvent(new CustomEvent(AGENT_CONFIG_UPDATED_EVENT));
  logger.info('All recent dirs cleared', undefined, 'agentConfig');
};
