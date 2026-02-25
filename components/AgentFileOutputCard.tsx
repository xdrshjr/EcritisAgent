/**
 * AgentFileOutputCard Component
 *
 * Displays a card for files created or modified by the agent,
 * with a download button that fetches the file via /api/agent-file.
 */

'use client';

import { useCallback } from 'react';
import { FileCode, FileText, Download } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { logger } from '@/lib/logger';

interface AgentFileOutputCardProps {
  filePath: string;
  operation: 'write' | 'edit';
  workDir?: string;
}

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.sh', '.bash', '.zsh', '.ps1',
  '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.css',
  '.scss', '.less', '.sql', '.graphql',
]);

const AgentFileOutputCard = ({ filePath, operation, workDir }: AgentFileOutputCardProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop()!.toLowerCase() : '';
  const isCode = CODE_EXTENSIONS.has(ext);

  const relativePath = workDir && filePath.startsWith(workDir)
    ? filePath.slice(workDir.length).replace(/^[\\/]/, '')
    : filePath;

  const handleDownload = useCallback(() => {
    const params = new URLSearchParams({ path: filePath });
    if (workDir) params.set('workDir', workDir);

    const url = `/api/agent-file?${params.toString()}`;

    logger.info('Agent file download initiated', { filePath, operation }, 'AgentFileOutputCard');

    // Use a hidden anchor element to trigger the download.
    // window.open can be blocked by popup blockers.
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [filePath, workDir, operation]);

  const operationLabel = operation === 'write'
    ? dict.chat.agentFileCreated
    : dict.chat.agentFileModified;

  const operationColor = operation === 'write'
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';

  const FileIcon = isCode ? FileCode : FileText;

  return (
    <div className="my-1.5 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
      {/* File icon */}
      <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{fileName}</div>
        {relativePath !== fileName && (
          <div className="text-[10px] text-muted-foreground/70 truncate">{relativePath}</div>
        )}
      </div>

      {/* Operation badge */}
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${operationColor} flex-shrink-0`}>
        {operationLabel}
      </span>

      {/* Download button */}
      <button
        onClick={handleDownload}
        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        aria-label={dict.chat.agentFileDownload}
        title={dict.chat.agentFileDownload}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default AgentFileOutputCard;
