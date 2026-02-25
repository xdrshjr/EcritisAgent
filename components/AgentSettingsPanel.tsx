/**
 * AgentSettingsPanel Component
 * Settings panel for Agent mode configuration: default working directory and recent directories.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, FolderOpen, X } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadAgentConfig,
  saveAgentWorkDir,
  loadRecentDirs,
  removeRecentDir,
  clearRecentDirs,
} from '@/lib/agentConfig';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface AgentSettingsPanelProps {
  className?: string;
}

const AgentSettingsPanel = ({ className }: AgentSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [workDir, setWorkDir] = useState('');
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    logger.component('AgentSettingsPanel', 'mounted');
    const config = loadAgentConfig();
    setWorkDir(config.workDir);
    setRecentDirs(config.recentDirs);
  }, []);

  const handleSelectFolder = async () => {
    try {
      // Electron environment
      const electronAPI = window.electronAPI;
      if (electronAPI?.selectDirectory) {
        const selected = await electronAPI.selectDirectory();
        if (selected) {
          setWorkDir(selected);
          setError('');
          logger.info('Directory selected via Electron', { path: selected }, 'AgentSettingsPanel');
        }
        return;
      }

      // Web File System Access API
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<{ name: string }> }).showDirectoryPicker();
          setWorkDir(dirHandle.name);
          setError(dict.chat.agentBrowserPathWarning);
          // Focus and select so user can immediately type the full path
          setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }, 50);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          throw err;
        }
        return;
      }
    } catch (err) {
      logger.error('Failed to select directory', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'AgentSettingsPanel');
    }
  };

  const handleSave = async () => {
    const trimmed = workDir.trim();
    if (!trimmed) {
      setError(dict.chat.agentNoWorkDir);
      return;
    }

    setValidating(true);
    setError('');
    setSuccess('');

    try {
      const electronAPI = window.electronAPI;
      let result;
      if (electronAPI?.validateDirectory) {
        result = await electronAPI.validateDirectory(trimmed);
      } else {
        const response = await fetch(`/api/agent-chat/validate-dir?path=${encodeURIComponent(trimmed)}`);
        result = await response.json();
      }

      if (result.valid) {
        const confirmedPath = result.resolvedPath || trimmed;
        saveAgentWorkDir(confirmedPath);
        setWorkDir(confirmedPath);
        setRecentDirs(loadRecentDirs());
        setSuccess(dict.settings.agentSettings?.saveSuccess || 'Agent settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
        logger.info('Agent settings saved', { workDir: confirmedPath }, 'AgentSettingsPanel');
      } else {
        setError(result.error || 'Invalid directory');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveRecent = (path: string) => {
    removeRecentDir(path);
    setRecentDirs(loadRecentDirs());
  };

  const handleClearAll = () => {
    clearRecentDirs();
    setRecentDirs([]);
  };

  return (
    <div className={cn('h-full flex flex-col overflow-hidden p-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Terminal className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-bold text-foreground">
          {dict.settings.agentSettings?.title || 'Agent Settings'}
        </h3>
      </div>

      {/* Messages */}
      {error && (
        <div className={cn(
          "mb-4 p-3 border border-border text-sm rounded",
          error === dict.chat.agentBrowserPathWarning
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'bg-destructive text-destructive-foreground'
        )}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-secondary border border-border text-secondary-foreground text-sm rounded">
          {success}
        </div>
      )}

      {/* Settings */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6">
          {/* Default Working Directory */}
          <div className="bg-card border border-border shadow-sm p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <FolderOpen className="w-5 h-5 text-primary" />
              <h4 className="text-md font-bold text-foreground">
                {dict.settings.agentSettings?.defaultWorkDir || 'Default Working Directory'}
              </h4>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {dict.settings.agentSettings?.defaultWorkDirHint || 'The default directory used when Agent mode is activated.'}
            </p>

            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={workDir}
                onChange={(e) => { setWorkDir(e.target.value); setError(''); }}
                placeholder="/path/to/project"
                className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
                disabled={validating}
              />
              <button
                onClick={handleSelectFolder}
                disabled={validating}
                className="px-3 py-2 rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
                title={dict.chat.agentSelectFolder}
                aria-label={dict.chat.agentSelectFolder}
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>

            {/* Save Button */}
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSave}
                disabled={validating || !workDir.trim()}
                className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {validating ? '...' : (dict.settings.save || 'Save')}
              </button>
            </div>
          </div>

          {/* Recent Directories */}
          <div className="bg-card border border-border shadow-sm p-6 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Terminal className="w-5 h-5 text-primary" />
                <h4 className="text-md font-bold text-foreground">
                  {dict.settings.agentSettings?.recentDirs || 'Recent Directories'}
                </h4>
              </div>
              {recentDirs.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={dict.settings.agentSettings?.clearAll || 'Clear all'}
                >
                  {dict.settings.agentSettings?.clearAll || 'Clear All'}
                </button>
              )}
            </div>

            {recentDirs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {dict.settings.agentSettings?.noRecentDirs || 'No recent directories.'}
              </p>
            ) : (
              <div className="space-y-1">
                {recentDirs.map((dir) => (
                  <div
                    key={dir}
                    className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-sm font-mono text-muted-foreground truncate flex-1 mr-2" title={dir}>
                      {dir}
                    </span>
                    <button
                      onClick={() => handleRemoveRecent(dir)}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={`Remove ${dir}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsPanel;
