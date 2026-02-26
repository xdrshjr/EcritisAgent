/**
 * AgentExecutionTimeline Component
 *
 * Renders agent execution blocks vertically with a left-edge
 * timeline connector line. Each block type has its own visual
 * representation.
 */

'use client';

import { useState, useMemo } from 'react';
import { Sparkles, Copy, Languages, Loader2 } from 'lucide-react';
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
  onCopy?: () => void;
  onTranslate?: () => void;
  copySuccess?: boolean;
  isTranslating?: boolean;
  showTranslation?: boolean;
  translationLines?: string[];
  hasTranslation?: boolean;
  fullContent?: string;
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

const AgentExecutionTimeline = ({ blocks, isStreaming, workDir, onCopy, onTranslate, copySuccess, isTranslating, showTranslation, translationLines, hasTranslation, fullContent }: AgentExecutionTimelineProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  if (!blocks.length) return null;

  // During streaming: render ALL blocks chronologically so tool calls appear
  // below content and are visible with auto-scroll. After streaming completes,
  // extract the last content block as a styled bubble (existing behavior).
  let lastContentIdx = -1;
  let lastContentBlock: AgentContentBlock | null = null;
  let hasLastContentBubble = false;
  let timelineBlocks: AgentExecutionBlock[];

  if (isStreaming) {
    // Streaming: everything in the timeline, no bubble
    timelineBlocks = blocks;
  } else {
    // Completed: extract last content as bubble
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (blocks[i].type === 'content') { lastContentIdx = i; break; }
    }
    lastContentBlock = lastContentIdx >= 0 ? (blocks[lastContentIdx] as AgentContentBlock) : null;
    hasLastContentBubble = !!(lastContentBlock && lastContentBlock.text.trim());
    timelineBlocks = blocks.filter((_, i) => i !== lastContentIdx);
  }

  return (
    <div className="mb-2">
      {/* Timeline section */}
      {timelineBlocks.length > 0 && (
        <div className="relative pl-4">
          <div className="absolute left-[3px] top-1 bottom-1 w-px bg-border/50" />

          {timelineBlocks.map((block) => (
            <div key={block.id} className="relative mb-1.5 last:mb-0">
              <div className="absolute -left-4 top-2 flex items-center justify-center">
                <TimelineDot type={block.type} />
              </div>
              {block.type === 'content' && <ContentBlockView block={block} />}
              {block.type === 'tool_use' && <AgentToolCallDisplay toolCall={toToolCall(block)} defaultExpanded={block.status === 'running'} />}
              {block.type === 'file_output' && (
                <AgentFileOutputCard filePath={block.filePath} operation={block.operation} workDir={workDir} />
              )}
              {block.type === 'thinking' && <ThinkingBlockView block={block} />}
              {block.type === 'turn_separator' && <TurnSeparatorView block={block} />}
            </div>
          ))}

          {/* Streaming activity indicator */}
          {isStreaming && (
            <div className="relative mb-1.5">
              <div className="absolute -left-4 top-2 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 py-1.5">
                <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
                <span className="text-xs text-purple-500 font-medium">{dict.chat.agentToolRunning}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Last content block rendered as a chat bubble */}
      {hasLastContentBubble && lastContentBlock && (
        <div className="relative px-2 py-1.5 shadow-sm transition-all hover:shadow-md group bg-card text-foreground border border-border/50 rounded-2xl rounded-bl-sm mt-1.5">
          {/* Action Buttons — Copy / Translate */}
          {(onCopy || onTranslate) && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
              {onCopy && (
                <button
                  onClick={onCopy}
                  className={`p-1.5 rounded-md transition-all duration-200 hover:bg-muted/90 text-muted-foreground/80 hover:text-foreground bg-background/50 backdrop-blur-sm border border-border/30 ${copySuccess ? 'bg-green-500/20' : ''} shadow-sm hover:shadow-md`}
                  aria-label="Copy message"
                  tabIndex={0}
                  title={copySuccess ? 'Copied!' : 'Copy message'}
                >
                  {copySuccess ? (
                    <span className="text-xs font-semibold">✓</span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
              {onTranslate && (
                <button
                  onClick={onTranslate}
                  disabled={isTranslating}
                  className={`p-1.5 rounded-md transition-all duration-200 hover:bg-muted/90 text-muted-foreground/80 hover:text-foreground bg-background/50 backdrop-blur-sm border border-border/30 ${showTranslation && hasTranslation ? 'bg-purple-500/20' : ''} disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md`}
                  aria-label={showTranslation ? 'Hide translation' : 'Translate message'}
                  tabIndex={0}
                  title={showTranslation ? 'Hide translation' : 'Translate message'}
                >
                  {isTranslating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Languages className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* Bubble content */}
          <div className="px-1.5 py-1">
            <ContentBlockView block={lastContentBlock} />
          </div>

          {/* Translation Display */}
          {showTranslation && hasTranslation && translationLines && translationLines.length > 0 && fullContent && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="text-xs mb-2.5 font-medium text-muted-foreground/80">
                Translation:
              </div>
              <div className="text-sm leading-relaxed text-muted-foreground/90">
                {fullContent.split('\n').map((originalLine, index) => {
                  const translationLine = translationLines[index] || '';
                  if (!originalLine.trim() && !translationLine.trim()) {
                    return <div key={index} className="h-2" />;
                  }
                  if (translationLine.trim()) {
                    return (
                      <div key={index} className="mb-1.5 whitespace-pre-wrap break-words">
                        {translationLine}
                      </div>
                    );
                  }
                  return <div key={index} className="h-2" />;
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default AgentExecutionTimeline;
