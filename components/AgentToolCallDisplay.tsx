/**
 * AgentToolCallDisplay Component
 * Renders a single Agent tool call with expand/collapse, status indicator,
 * input parameters, and execution result.
 */

'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Loader2, Check, X, Wrench } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { AgentToolCall } from '@/lib/agentStreamParser';

interface AgentToolCallDisplayProps {
  toolCall: AgentToolCall;
}

const AgentToolCallDisplay = ({ toolCall }: AgentToolCallDisplayProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  const statusIcon = () => {
    switch (toolCall.status) {
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
      case 'complete':
        return <Check className="w-3.5 h-3.5 text-emerald-500" />;
      case 'error':
        return <X className="w-3.5 h-3.5 text-red-500" />;
    }
  };

  const statusText = () => {
    switch (toolCall.status) {
      case 'running':
        return dict.chat.agentToolRunning;
      case 'complete': {
        if (toolCall.startTime && toolCall.endTime) {
          const duration = toolCall.endTime - toolCall.startTime;
          return `${dict.chat.agentToolComplete} (${duration}ms)`;
        }
        return dict.chat.agentToolComplete;
      }
      case 'error':
        return dict.chat.agentToolError;
    }
  };

  const formatInput = (input: unknown): string => {
    if (typeof input === 'string') return input;
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  // Truncate result for display (max 500 chars when collapsed)
  const truncateResult = (text: string, maxLen = 500): string => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + '...';
  };

  return (
    <div className="my-1.5 border border-border/50 rounded-lg bg-muted/20 overflow-hidden">
      {/* Header: tool name + status + expand toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 transition-colors"
      >
        {/* Expand/collapse chevron */}
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}

        {/* Tool icon */}
        <Wrench className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />

        {/* Tool name */}
        <span className="text-xs font-medium text-foreground truncate">
          {toolCall.toolName}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Status */}
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {statusIcon()}
          <span className="text-xs text-muted-foreground">{statusText()}</span>
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          {/* Input parameters */}
          {toolCall.toolInput != null && (
            <div>
              <div className="text-xs text-muted-foreground font-medium mb-1">Input</div>
              <pre className="text-xs bg-[#0d1117] text-gray-100 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {formatInput(toolCall.toolInput)}
              </pre>
            </div>
          )}

          {/* Result */}
          {toolCall.result != null && (
            <div>
              <div className="text-xs text-muted-foreground font-medium mb-1">
                {toolCall.isError ? 'Error' : 'Result'}
              </div>
              <pre className={`text-xs rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-60 overflow-y-auto ${
                toolCall.isError
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-[#0d1117] text-gray-100'
              }`}>
                {truncateResult(toolCall.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentToolCallDisplay;
