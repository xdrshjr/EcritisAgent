/**
 * DocUpdateBlockDisplay Component
 *
 * Renders a document update operation block inside the AgentExecutionTimeline.
 * Shows the operation type, section info, and sync status.
 */

'use client';

import { FileText, ImageIcon, Plus, Trash2, PenLine, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { DocUpdateBlock } from '@/lib/agentExecutionBlock';

interface DocUpdateBlockDisplayProps {
  block: DocUpdateBlock;
}

const DocUpdateBlockDisplay = ({ block }: DocUpdateBlockDisplayProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  const operationConfig = getOperationConfig(block.operation, dict);

  return (
    <div className="my-1 px-3 py-2 rounded-md bg-amber-500/5 border border-amber-500/15 text-sm">
      <div className="flex items-center gap-2">
        <operationConfig.icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="font-medium text-amber-700 dark:text-amber-300 text-xs">
          {operationConfig.label}
        </span>
      </div>

      <div className="mt-1 text-xs text-muted-foreground">
        {block.operation === 'insert_image' ? (
          <>
            <span>{dict.chat.docUpdateSection} {block.sectionIndex}</span>
            {block.imageUrl && (
              <span className="ml-1 text-muted-foreground/60 truncate max-w-[200px] inline-block align-bottom">
                {block.imageUrl.substring(0, 60)}...
              </span>
            )}
          </>
        ) : (
          <>
            <span>{dict.chat.docUpdateSection} {block.sectionIndex}</span>
            {block.title && (
              <span className="ml-1 text-foreground/70">
                &quot;{block.title}&quot;
              </span>
            )}
          </>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3 h-3" />
        <span>{dict.chat.docUpdateSynced}</span>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

interface OperationInfo {
  label: string;
  icon: typeof FileText;
}

const getOperationConfig = (
  operation: DocUpdateBlock['operation'],
  dict: ReturnType<typeof getDictionary>,
): OperationInfo => {
  switch (operation) {
    case 'replace':
      return { label: dict.chat.docUpdateReplace, icon: PenLine };
    case 'append':
      return { label: dict.chat.docUpdateAppend, icon: Plus };
    case 'insert':
      return { label: dict.chat.docUpdateInsert, icon: Plus };
    case 'delete':
      return { label: dict.chat.docUpdateDelete, icon: Trash2 };
    case 'insert_image':
      return { label: dict.chat.docUpdateInsertImage, icon: ImageIcon };
    default:
      return { label: 'Document Update', icon: FileText };
  }
};

export default DocUpdateBlockDisplay;
