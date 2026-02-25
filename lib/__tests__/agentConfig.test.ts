/**
 * Tests for lib/agentConfig.ts
 * Covers config load/save, recent dirs management, limit & dedup logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    component: vi.fn(),
    success: vi.fn(),
  },
}));

import {
  loadAgentConfig,
  saveAgentWorkDir,
  loadRecentDirs,
  removeRecentDir,
  clearRecentDirs,
  AGENT_CONFIG_UPDATED_EVENT,
} from '@/lib/agentConfig';

describe('agentConfig', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => storage[key] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      storage[key] = value;
    });
    vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
  });

  describe('loadAgentConfig', () => {
    it('returns empty defaults when nothing is stored', () => {
      const config = loadAgentConfig();
      expect(config.workDir).toBe('');
      expect(config.recentDirs).toEqual([]);
    });

    it('loads saved workDir and recentDirs', () => {
      storage['aidocmaster.agentWorkDir'] = '/home/user/project';
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/home/user/project', '/tmp/other']);

      const config = loadAgentConfig();
      expect(config.workDir).toBe('/home/user/project');
      expect(config.recentDirs).toEqual(['/home/user/project', '/tmp/other']);
    });

    it('handles invalid JSON in recentDirs gracefully', () => {
      storage['aidocmaster.agentRecentDirs'] = 'not-json';

      const config = loadAgentConfig();
      expect(config.recentDirs).toEqual([]);
    });

    it('filters out non-string entries in recentDirs', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/valid', 123, null, '/also-valid']);

      const config = loadAgentConfig();
      expect(config.recentDirs).toEqual(['/valid', '/also-valid']);
    });
  });

  describe('saveAgentWorkDir', () => {
    it('saves workDir to localStorage', () => {
      saveAgentWorkDir('/home/user/project');
      expect(storage['aidocmaster.agentWorkDir']).toBe('/home/user/project');
    });

    it('trims whitespace from path', () => {
      saveAgentWorkDir('  /home/user/project  ');
      expect(storage['aidocmaster.agentWorkDir']).toBe('/home/user/project');
    });

    it('does nothing for empty/whitespace-only path', () => {
      saveAgentWorkDir('   ');
      expect(storage['aidocmaster.agentWorkDir']).toBeUndefined();
    });

    it('adds path to recent dirs', () => {
      saveAgentWorkDir('/project-a');
      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toContain('/project-a');
    });

    it('deduplicates recent dirs', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/project-a', '/project-b']);
      saveAgentWorkDir('/project-a');

      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toEqual(['/project-a', '/project-b']);
      expect(recent.filter((d: string) => d === '/project-a')).toHaveLength(1);
    });

    it('prepends new dir to the front', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/project-a']);
      saveAgentWorkDir('/project-b');

      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent[0]).toBe('/project-b');
    });

    it('limits recent dirs to 10', () => {
      const existing = Array.from({ length: 10 }, (_, i) => `/dir-${i}`);
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(existing);

      saveAgentWorkDir('/new-dir');
      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toHaveLength(10);
      expect(recent[0]).toBe('/new-dir');
      expect(recent).not.toContain('/dir-9');
    });

    it('dispatches config updated event', () => {
      saveAgentWorkDir('/project');
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: AGENT_CONFIG_UPDATED_EVENT })
      );
    });
  });

  describe('loadRecentDirs', () => {
    it('returns empty array when nothing stored', () => {
      expect(loadRecentDirs()).toEqual([]);
    });

    it('returns stored dirs', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/a', '/b']);
      expect(loadRecentDirs()).toEqual(['/a', '/b']);
    });

    it('handles invalid JSON', () => {
      storage['aidocmaster.agentRecentDirs'] = 'broken';
      expect(loadRecentDirs()).toEqual([]);
    });
  });

  describe('removeRecentDir', () => {
    it('removes the specified directory', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/a', '/b', '/c']);
      removeRecentDir('/b');

      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toEqual(['/a', '/c']);
    });

    it('dispatches config updated event', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/a']);
      removeRecentDir('/a');
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: AGENT_CONFIG_UPDATED_EVENT })
      );
    });

    it('does nothing if path not found', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/a', '/b']);
      removeRecentDir('/nonexistent');

      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toEqual(['/a', '/b']);
    });
  });

  describe('clearRecentDirs', () => {
    it('clears all recent dirs', () => {
      storage['aidocmaster.agentRecentDirs'] = JSON.stringify(['/a', '/b', '/c']);
      clearRecentDirs();

      const recent = JSON.parse(storage['aidocmaster.agentRecentDirs']);
      expect(recent).toEqual([]);
    });

    it('dispatches config updated event', () => {
      clearRecentDirs();
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: AGENT_CONFIG_UPDATED_EVENT })
      );
    });
  });

  describe('AGENT_CONFIG_UPDATED_EVENT', () => {
    it('has the correct event name', () => {
      expect(AGENT_CONFIG_UPDATED_EVENT).toBe('aidocmaster_agent_config_updated');
    });
  });
});
