/**
 * AgentExecutionTimeline Component
 *
 * Renders agent execution blocks vertically with a left-edge
 * timeline connector line. Each block type has its own visual
 * representation.
 */

'use client';

import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import AgentToolCallDisplay from './AgentToolCallDisplay';
import AgentFileOutputCard from './AgentFileOutputCard';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type {
  AgentExecutionBlock,
  AgentContentBlock,
  AgentToolUseBlock,
  AgentThinkingBlock,
  AgentTurnSeparatorBlock,
} from '@/lib/agentExecutionBlock';
import type { AgentToolCall } from '@/lib/agentStreamParser';

interface AgentExecutionTimelineProps {
  blocks: AgentExecutionBlock[];
  isStreaming?: boolean;
  workDir?: string;
}

/** Convert a tool-use block to the AgentToolCall shape expected by AgentToolCallDisplay */
const toToolCall = (block: AgentToolUseBlock): AgentToolCall => ({
  id: block.toolCallId,
  toolName: block.toolName,
  toolInput: block.toolInput,
  status: block.status,
  result: block.result,
  isError: block.isError,
  startTime: block.startTime,
  endTime: block.endTime,
});

// ── Sub-components for each block type ───────────────────────────────────────

const ContentBlockView = ({ block }: { block: AgentContentBlock }) => {
  const content = useMemo(() => {
    if (!block.text.trim()) return null;
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          /* eslint-disable @typescript-eslint/no-explicit-any */
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code className="bg-muted/60 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="relative my-1">
                <pre className="bg-[#0d1117] rounded-md p-2 overflow-x-auto">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },
          /* eslint-enable @typescript-eslint/no-explicit-any */
          a: ({ node: _n, children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline underline-offset-2">
              {children}
            </a>
          ),
          p: ({ node: _n, children, ...props }) => (
            <p className="mb-2 last:mb-0" {...props}>{children}</p>
          ),
          ul: ({ node: _n, children, ...props }) => (
            <ul className="list-disc list-outside mb-2 space-y-1 pl-5" {...props}>{children}</ul>
          ),
          ol: ({ node: _n, children, ...props }) => (
            <ol className="list-decimal list-outside mb-2 space-y-1 pl-5" {...props}>{children}</ol>
          ),
          blockquote: ({ node: _n, children, ...props }) => (
            <blockquote className="border-l-4 border-gray-400 pl-3 italic my-2" {...props}>{children}</blockquote>
          ),
        }}
      >
        {block.text}
      </ReactMarkdown>
    );
  }, [block.text]);

  if (!content) return null;

  return (
    <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[#0d1117] prose-pre:text-gray-100 prose-code:text-pink-500 prose-code:before:content-[''] prose-code:after:content-['']">
      {content}
    </div>
  );
};

const ThinkingBlockView = ({ block }: { block: AgentThinkingBlock }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!block.text.trim()) return null;

  return (
    <div className="my-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-purple-500/80 hover:text-purple-500 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        <span className="font-medium">Thinking</span>
        <span className="text-muted-foreground/60">{isExpanded ? '(collapse)' : '(expand)'}</span>
      </button>
      {isExpanded && (
        <div className="mt-1.5 px-3 py-2 rounded-md bg-purple-500/5 border border-purple-500/10 text-xs text-muted-foreground whitespace-pre-wrap">
          {block.text}
        </div>
      )}
    </div>
  );
};

const TurnSeparatorView = ({ block }: { block: AgentTurnSeparatorBlock }) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  return (
    <div className="flex items-center gap-2 my-2">
      <div className="flex-1 border-t border-border/40" />
      <span className="text-[10px] text-muted-foreground/60 font-medium">
        {dict.chat.agentTurn} {block.turnNumber}
      </span>
      <div className="flex-1 border-t border-border/40" />
    </div>
  );
};

// ── Timeline icon dots ───────────────────────────────────────────────────────

const TimelineDot = ({ type }: { type: AgentExecutionBlock['type'] }) => {
  const colorMap: Record<AgentExecutionBlock['type'], string> = {
    content: 'bg-foreground/40',
    tool_use: 'bg-blue-500',
    file_output: 'bg-emerald-500',
    thinking: 'bg-purple-400',
    turn_separator: 'bg-border',
  };

  return (
    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colorMap[type]}`} />
  );
};

// ── Main timeline component ──────────────────────────────────────────────────

const AgentExecutionTimeline = ({ blocks, isStreaming, workDir }: AgentExecutionTimelineProps) => {
  if (!blocks.length) return null;

  return (
    <div className="relative pl-4 mb-2">
      {/* Timeline connector line */}
      <div className="absolute left-[3px] top-1 bottom-1 w-px bg-border/50" />

      {blocks.map((block) => (
        <div key={block.id} className="relative mb-1.5 last:mb-0">
          {/* Timeline dot */}
          <div className="absolute -left-4 top-2 flex items-center justify-center">
            <TimelineDot type={block.type} />
          </div>

          {/* Block content */}
          {block.type === 'content' && (
            <ContentBlockView block={block} />
          )}

          {block.type === 'tool_use' && (
            <AgentToolCallDisplay toolCall={toToolCall(block)} />
          )}

          {block.type === 'file_output' && (
            <AgentFileOutputCard
              filePath={block.filePath}
              operation={block.operation}
              workDir={workDir}
            />
          )}

          {block.type === 'thinking' && (
            <ThinkingBlockView block={block} />
          )}

          {block.type === 'turn_separator' && (
            <TurnSeparatorView block={block} />
          )}
        </div>
      ))}

      {/* Streaming pulse indicator */}
      {isStreaming && (
        <div className="absolute -left-4 bottom-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default AgentExecutionTimeline;
