/**
 * AgentWorkDirDialog Component
 * Modal dialog for selecting the working directory for Agent mode.
 * Supports Electron native dialog, Web File System Access API, and manual input.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { FolderOpen, X, Clock } from 'lucide-react';
import { logger } from '@/lib/logger';
import { loadRecentDirs, saveAgentWorkDir } from '@/lib/agentConfig';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface AgentWorkDirDialogProps {
  open: boolean;
  currentDir: string;
  onConfirm: (dir: string) => void;
  onCancel: () => void;
}

const AgentWorkDirDialog = ({ open, currentDir, onConfirm, onCancel }: AgentWorkDirDialogProps) => {
  const [inputDir, setInputDir] = useState(currentDir);
  const [recentDirs, setRecentDirs] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  // Load recent directories on open; fetch home dir as default if empty
  useEffect(() => {
    if (open) {
      setValidationError(null);
      setRecentDirs(loadRecentDirs());

      if (currentDir) {
        setInputDir(currentDir);
      } else {
        // Fetch user home directory as default
        const electronAPI = window.electronAPI;
        if (electronAPI?.getHomeDir) {
          electronAPI.getHomeDir().then(homeDir => {
            if (homeDir) setInputDir(homeDir);
          }).catch(() => { /* ignore, user can still type manually */ });
        } else {
          fetch('/api/agent-chat/home-dir')
            .then(r => r.json())
            .then(data => { if (data.homeDir) setInputDir(data.homeDir); })
            .catch(() => { /* ignore, user can still type manually */ });
        }
      }

      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, currentDir]);

  const handleSelectFolder = async () => {
    try {
      // Electron environment
      const electronAPI = window.electronAPI;
      if (electronAPI?.selectDirectory) {
        const selected = await electronAPI.selectDirectory();
        if (selected) {
          setInputDir(selected);
          setValidationError(null);
          logger.info('Directory selected via Electron', { path: selected }, 'AgentWorkDirDialog');
        }
        return;
      }

      // Web File System Access API (Chrome/Edge)
      if ('showDirectoryPicker' in window) {
        try {
          const dirHandle = await (window as unknown as { showDirectoryPicker: () => Promise<{ name: string }> }).showDirectoryPicker();
          // The File System Access API returns a handle, not a path.
          // In web mode, we set the directory name as a visual indicator.
          // Actual server-side path validation requires manual input.
          setInputDir(dirHandle.name);
          setValidationError(dict.chat.agentBrowserPathWarning);
          // Focus and select so user can immediately type the full path
          setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          }, 50);
          logger.info('Directory selected via File System Access API', { name: dirHandle.name }, 'AgentWorkDirDialog');
        } catch (err) {
          // User cancelled the picker
          if (err instanceof Error && err.name === 'AbortError') return;
          throw err;
        }
        return;
      }

      // Fallback: just focus the input for manual entry
      inputRef.current?.focus();
    } catch (error) {
      logger.error('Failed to select directory', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'AgentWorkDirDialog');
    }
  };

  const handleConfirm = async () => {
    const trimmed = inputDir.trim();
    if (!trimmed) {
      setValidationError(dict.chat.agentNoWorkDir);
      return;
    }

    // Validate the directory via API
    setValidating(true);
    setValidationError(null);

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
        // Use the resolved absolute path from server (handles relative paths)
        const confirmedPath = result.resolvedPath || trimmed;
        saveAgentWorkDir(confirmedPath);
        setRecentDirs(loadRecentDirs());
        onConfirm(confirmedPath);
        logger.info('Working directory confirmed', { path: confirmedPath }, 'AgentWorkDirDialog');
      } else {
        setValidationError(result.error || 'Invalid directory');
      }
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">{dict.chat.agentSetWorkDir}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Input row */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputDir}
              onChange={(e) => { setInputDir(e.target.value); setValidationError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="/path/to/project"
              className="flex-1 px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              disabled={validating}
            />
            <button
              onClick={handleSelectFolder}
              disabled={validating}
              className="px-3 py-2 rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50"
              title={dict.chat.agentSelectFolder}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </div>

          {/* Validation error / warning */}
          {validationError && (
            <p className={`text-xs ${validationError === dict.chat.agentBrowserPathWarning ? 'text-amber-500' : 'text-red-500'}`}>{validationError}</p>
          )}

          {/* Recent directories */}
          {recentDirs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-2">
                <Clock className="w-3.5 h-3.5" />
                <span>{dict.chat.agentRecentDirs}</span>
              </div>
              <div className="space-y-1">
                {recentDirs.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => { setInputDir(dir); setValidationError(null); }}
                    className="w-full text-left px-2 py-1.5 text-xs font-mono rounded hover:bg-muted/80 transition-colors truncate text-muted-foreground hover:text-foreground"
                    title={dir}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            disabled={validating}
            className="px-4 py-1.5 text-sm rounded-md border border-input hover:bg-muted transition-colors disabled:opacity-50"
          >
            {dict.settings.cancel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={validating || !inputDir.trim()}
            className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {validating ? '...' : dict.settings.save}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentWorkDirDialog;
