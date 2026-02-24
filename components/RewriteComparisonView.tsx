/**
 * RewriteComparisonView Component
 * Displays original and processed text side by side
 * Allows user to accept or reject the processed text
 * Used for both rewrite and polish operations
 */

'use client';

import { Check, X } from 'lucide-react';
import { logger } from '@/lib/logger';

interface RewriteComparisonViewProps {
  originalText: string;
  processedText: string;
  type: 'rewrite' | 'polish';
  position: {
    top: number;
    left: number;
  };
  onAccept: () => void;
  onReject: () => void;
}

const RewriteComparisonView = ({
  originalText,
  processedText,
  type,
  position,
  onAccept,
  onReject,
}: RewriteComparisonViewProps) => {
  const handleAccept = () => {
    logger.info(`${type === 'rewrite' ? 'Rewrite' : 'Polish'} accepted`, undefined, 'RewriteComparisonView');
    onAccept();
  };

  const handleReject = () => {
    logger.info(`${type === 'rewrite' ? 'Rewrite' : 'Polish'} rejected`, undefined, 'RewriteComparisonView');
    onReject();
  };

  const title = type === 'rewrite' ? '重写对比' : '润色对比';
  const processedLabel = type === 'rewrite' ? '重写后' : '润色后';

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${position.top}px`,
    left: `${position.left}px`,
    transform: 'translateX(-50%)',
    zIndex: 1001,
  };

  return (
    <div
      className="bg-card border border-border rounded shadow-lg p-4 rewrite-comparison-view max-w-2xl"
      style={panelStyle}
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              className="px-3 py-1.5 bg-primary text-primary-foreground border border-border rounded-md shadow-sm flex items-center gap-2 transition-all"
              aria-label="Accept rewrite"
              title="接受"
            >
              <Check className="w-4 h-4" />
              <span className="text-sm font-medium">接受</span>
            </button>
            <button
              onClick={handleReject}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground border border-border rounded-md shadow-sm flex items-center gap-2 transition-all"
              aria-label="Reject rewrite"
              title="放弃"
            >
              <X className="w-4 h-4" />
              <span className="text-sm font-medium">放弃</span>
            </button>
          </div>
        </div>

        {/* Comparison Content */}
        <div className="grid grid-cols-2 gap-4">
          {/* Original Text */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              原文
            </div>
            <div className="p-3 bg-muted rounded border border-border text-sm text-foreground max-h-48 overflow-y-auto">
              {originalText}
            </div>
          </div>

          {/* Processed Text */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {processedLabel}
            </div>
            <div className="p-3 bg-primary/10 rounded border border-primary text-sm text-foreground max-h-48 overflow-y-auto">
              {processedText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RewriteComparisonView;

