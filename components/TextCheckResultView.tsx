/**
 * TextCheckResultView Component
 * Displays text check results in a beautiful panel
 * Shows all issues found during text checking
 * Uses fixed positioning with viewport boundary constraints and drag support
 */

'use client';

import { X, AlertCircle, CheckCircle2, AlertTriangle, Lightbulb, GripVertical } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useDraggablePopup } from '@/lib/useDraggablePopup';

interface CheckIssue {
  type: 'grammar' | 'spelling' | 'style' | 'other';
  message: string;
  suggestion?: string;
}

interface TextCheckResultViewProps {
  issues: CheckIssue[];
  position: {
    top: number;
    left: number;
  };
  onClose: () => void;
}

const TextCheckResultView = ({
  issues,
  position: initialPosition,
  onClose,
}: TextCheckResultViewProps) => {
  const { position, isDragging, panelRef, handleDragStart } = useDraggablePopup(initialPosition);

  const handleClose = () => {
    logger.info('Text check result view closed', undefined, 'TextCheckResultView');
    onClose();
  };

  const getIssueTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      grammar: '语法',
      spelling: '拼写',
      style: '风格',
      other: '其他',
    };
    return labels[type] || type;
  };

  const getIssueTypeConfig = (type: string) => {
    // 参考ValidationResultPanel的配色方案
    // grammar -> high (red), spelling -> high (red), style -> medium (amber), other -> low (blue)
    const configs: Record<string, {
      bgColor: string;
      textColor: string;
      borderColor: string;
      iconColor: string;
      iconBgColor: string;
      badgeColor: string;
    }> = {
      grammar: {
        bgColor: 'bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/20',
        textColor: 'text-red-900 dark:text-red-100',
        borderColor: 'border-red-500 dark:border-red-600',
        iconColor: 'text-red-600 dark:text-red-400',
        iconBgColor: 'bg-red-100 dark:bg-red-900/40',
        badgeColor: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      },
      spelling: {
        bgColor: 'bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/20',
        textColor: 'text-red-900 dark:text-red-100',
        borderColor: 'border-red-500 dark:border-red-600',
        iconColor: 'text-red-600 dark:text-red-400',
        iconBgColor: 'bg-red-100 dark:bg-red-900/40',
        badgeColor: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
      },
      style: {
        bgColor: 'bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-950/30 dark:to-amber-950/20',
        textColor: 'text-amber-900 dark:text-amber-100',
        borderColor: 'border-amber-500 dark:border-amber-600',
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBgColor: 'bg-amber-100 dark:bg-amber-900/40',
        badgeColor: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      },
      other: {
        bgColor: 'bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/30 dark:to-blue-950/20',
        textColor: 'text-blue-900 dark:text-blue-100',
        borderColor: 'border-blue-500 dark:border-blue-600',
        iconColor: 'text-blue-600 dark:text-blue-400',
        iconBgColor: 'bg-blue-100 dark:bg-blue-900/40',
        badgeColor: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      },
    };
    return configs[type] || configs.other;
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${position.top}px`,
    left: `${position.left}px`,
    zIndex: 99999,
    cursor: isDragging ? 'grabbing' : 'default',
    userSelect: isDragging ? 'none' : 'auto',
  };

  logger.debug('Rendering TextCheckResultView', {
    issueCount: issues.length,
    position,
    isDragging,
  }, 'TextCheckResultView');

  return (
    <div
      ref={panelRef}
      className={`bg-card border border-border rounded-xl shadow-2xl text-check-result-view max-w-2xl w-full backdrop-blur-sm animate-slideUp ${isDragging ? 'select-none' : ''}`}
      style={panelStyle}
    >
      <div className="flex flex-col gap-4 p-5">
        {/* Header - Draggable */}
        <div
          className="flex items-center justify-between border-b border-border/50 pb-3 cursor-grab active:cursor-grabbing"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-3 flex-1">
            {/* Drag Handle */}
            <div className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>

            {issues.length === 0 ? (
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/20 rounded-full blur-md" />
                <CheckCircle2 className="w-6 h-6 text-green-500 relative" />
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-yellow-500/20 rounded-full blur-md" />
                <AlertCircle className="w-6 h-6 text-yellow-500 relative" />
              </div>
            )}
            <div className="flex flex-col">
              <h3 className="text-base font-bold text-foreground leading-tight">
                {issues.length === 0 ? '检查完成' : '检查结果'}
              </h3>
              {issues.length > 0 && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  发现 {issues.length} 个问题
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-lg transition-all duration-200 flex-shrink-0 group"
            aria-label="关闭检查结果"
            title="关闭"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClose();
              }
            }}
          >
            <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        {/* Results Content */}
        <div className="max-h-[32rem] overflow-y-auto pr-1 custom-scrollbar">
          {issues.length === 0 ? (
            <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border border-green-300 dark:border-green-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-green-900 dark:text-green-100 mb-1">
                    检查通过
                  </h4>
                  <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                    未发现任何问题，文本检查通过！
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {issues.map((issue, index) => {
                const config = getIssueTypeConfig(issue.type);
                return (
                  <div
                    key={index}
                    className={`relative ${config.bgColor} border-l ${config.borderColor} rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden`}
                  >
                    <div className={`absolute inset-0 ${config.bgColor} opacity-50`} />
                    <div className="relative px-4 pt-5 pb-4">
                      <div className="flex items-start gap-3">
                        {/* Issue Icon */}
                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${config.iconBgColor} flex items-center justify-center`}>
                          <AlertTriangle className={`w-4 h-4 ${config.iconColor}`} />
                        </div>

                        {/* Issue Content */}
                        <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                          {/* Issue Header with Type Badge */}
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 ${config.badgeColor} rounded-lg border text-xs font-bold uppercase tracking-wide flex-shrink-0`}>
                              {getIssueTypeLabel(issue.type)}
                            </div>
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full ${config.iconBgColor} flex items-center justify-center text-xs font-bold ${config.textColor}`}>
                              {index + 1}
                            </div>
                          </div>

                          {/* Issue Message */}
                          <div className={`${config.textColor} text-sm leading-relaxed font-medium`}>
                            {issue.message}
                          </div>

                          {/* Suggestion */}
                          {issue.suggestion && (
                            <div className={`mt-2 pl-3 border-l ${config.borderColor} ${config.textColor} opacity-90`}>
                              <div className="flex items-start gap-2">
                                <Lightbulb className={`w-4 h-4 ${config.iconColor} flex-shrink-0 mt-0.5`} />
                                <div className="flex-1">
                                  <div className="text-xs font-semibold mb-1 opacity-80">
                                    建议修改：
                                  </div>
                                  <div className="text-sm leading-relaxed">
                                    {issue.suggestion}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TextCheckResultView;
