/**
 * TextSelectionToolbar Component
 * Floating toolbar that appears above selected text in the editor
 * Provides polish, rewrite, and check functionality
 */

'use client';

import { Sparkles, RefreshCw, CheckCircle2, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

interface TextSelectionToolbarProps {
  position: {
    top: number;
    left: number;
  };
  onPolish: () => void;
  onRewrite: () => void;
  onCheck: () => void;
  isProcessing?: boolean;
  processingType?: 'polish' | 'rewrite' | 'check' | null;
  onClose?: () => void;
}

const TextSelectionToolbar = ({
  position,
  onPolish,
  onRewrite,
  onCheck,
  isProcessing = false,
  processingType = null,
  onClose,
}: TextSelectionToolbarProps) => {
  const handlePolish = () => {
    logger.info('Polish button clicked', undefined, 'TextSelectionToolbar');
    onPolish();
  };

  const handleRewrite = () => {
    logger.info('Rewrite button clicked', undefined, 'TextSelectionToolbar');
    onRewrite();
  };

  const handleCheck = () => {
    logger.info('Check button clicked', undefined, 'TextSelectionToolbar');
    onCheck();
  };

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${position.top}px`,
    left: `${position.left}px`,
    transform: 'translateX(-50%)',
    zIndex: 1000,
  };

  return (
    <div
      className="bg-card border border-border rounded shadow-lg px-3 py-2 text-selection-toolbar whitespace-nowrap"
      style={panelStyle}
    >
      <div className="flex items-center gap-3">
        {/* Polish Button */}
        <button
          onClick={handlePolish}
          disabled={isProcessing}
          className={`px-3 py-1.5 border border-border transition-all rounded-md shadow-sm flex items-center gap-2 ${
            isProcessing && processingType === 'polish'
              ? 'bg-primary text-primary-foreground opacity-75'
              : 'bg-card hover:bg-primary hover:text-primary-foreground'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Polish selected text"
          title="润色"
        >
          {isProcessing && processingType === 'polish' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">润色</span>
        </button>

        {/* Rewrite Button */}
        <button
          onClick={handleRewrite}
          disabled={isProcessing}
          className={`px-3 py-1.5 border border-border transition-all rounded-md shadow-sm flex items-center gap-2 ${
            isProcessing && processingType === 'rewrite'
              ? 'bg-primary text-primary-foreground opacity-75'
              : 'bg-card hover:bg-primary hover:text-primary-foreground'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Rewrite selected text"
          title="重写"
        >
          {isProcessing && processingType === 'rewrite' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">重写</span>
        </button>

        {/* Check Button */}
        <button
          onClick={handleCheck}
          disabled={isProcessing}
          className={`px-3 py-1.5 border border-border transition-all rounded-md shadow-sm flex items-center gap-2 ${
            isProcessing && processingType === 'check'
              ? 'bg-primary text-primary-foreground opacity-75'
              : 'bg-card hover:bg-primary hover:text-primary-foreground'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label="Check selected text"
          title="检查"
        >
          {isProcessing && processingType === 'check' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">检查</span>
        </button>
      </div>
    </div>
  );
};

export default TextSelectionToolbar;

