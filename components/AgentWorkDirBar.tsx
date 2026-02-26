/**
 * AgentWorkDirBar Component
 * Displays the current working directory when Agent mode is active.
 * Shows directory path (truncated), validity indicator, and change button.
 */

'use client';

import { FolderOpen, ExternalLink, Check, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface AgentWorkDirBarProps {
  workDir: string;
  isValid?: boolean;
  onChangeDir: () => void;
  onOpenDir?: () => void;
  disabled?: boolean;
}

const AgentWorkDirBar = ({ workDir, isValid = true, onChangeDir, onOpenDir, disabled = false }: AgentWorkDirBarProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border-t border-emerald-500/20">
      {/* Validity indicator */}
      {isValid ? (
        <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
      )}

      {/* Path display */}
      <span
        className="text-xs text-muted-foreground truncate flex-1 font-mono"
        title={workDir || dict.chat.agentNoWorkDir}
      >
        {workDir || dict.chat.agentNoWorkDir}
      </span>

      {/* Open directory in file manager */}
      {onOpenDir && workDir && (
        <button
          onClick={onOpenDir}
          disabled={disabled}
          className="flex-shrink-0 p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={dict.chat.agentOpenWorkDir}
          title={dict.chat.agentOpenWorkDir}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Change directory button */}
      <button
        onClick={onChangeDir}
        disabled={disabled}
        className="flex-shrink-0 p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={dict.chat.agentSelectFolder}
        title={dict.chat.agentSelectFolder}
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default AgentWorkDirBar;
