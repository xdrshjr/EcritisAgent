/**
 * AgentStatusPanel Component
 * Displays real-time status of agent execution
 * Shows: planning, todo list, execution progress, and results
 * After completion, displays collapsed summary that can be expanded
 * Summary supports Markdown rendering for better formatting
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ListTodo, Brain, Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { logger } from '@/lib/logger';

export interface TodoItem {
  id: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export interface AgentStatus {
  phase: 'planning' | 'executing' | 'summarizing' | 'complete' | 'error' | 'intent' | 'parameterizing' | 'outlining' | 'writing' | 'delivering' | 'routing';
  message: string;
  selectedAgent?: string;
  routingConfidence?: number;
  todoList?: TodoItem[];
  currentStep?: number;
  totalSteps?: number;
  stepDescription?: string;
  summary?: string;
  error?: string;
  timeline?: Array<{
    id: string;
    label: string;
    state: 'complete' | 'active' | 'upcoming';
  }>;
}

interface AgentStatusPanelProps {
  status: AgentStatus | null;
  isActive: boolean;
  defaultCollapsed?: boolean;
}

const AgentStatusPanel = ({ status, isActive, defaultCollapsed = false }: AgentStatusPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  
  // Auto-collapse when execution completes
  useEffect(() => {
    if (status && !isActive && (status.phase === 'complete' || status.phase === 'error')) {
      logger.info('Agent execution finished, collapsing panel', {
        phase: status.phase,
        wasActive: isActive,
      }, 'AgentStatusPanel');
      setIsCollapsed(true);
    }
  }, [status?.phase, isActive]);

  // Auto-scroll to bottom when new content arrives (only when expanded and active)
  useEffect(() => {
    if (panelRef.current && status && isActive && !isCollapsed) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [status, isActive, isCollapsed]);

  useEffect(() => {
    logger.debug('AgentStatusPanel state changed', { 
      isActive, 
      hasStatus: !!status,
      phase: status?.phase,
      isCollapsed,
    }, 'AgentStatusPanel');
  }, [isActive, status, isCollapsed]);

  if (!status) {
    return null;
  }
  
  const handleToggleCollapse = () => {
    const newCollapsedState = !isCollapsed;
    setIsCollapsed(newCollapsedState);
    logger.debug('Agent status panel toggled', {
      isCollapsed: newCollapsedState,
      phase: status?.phase,
    }, 'AgentStatusPanel');
  };

  const getPhaseIcon = () => {
    switch (status.phase) {
      case 'routing':
        return <Brain className="w-5 h-5 text-cyan-500 animate-pulse" />;
      case 'intent':
        return <Brain className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'parameterizing':
      case 'outlining':
        return <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />;
      case 'writing':
        return <Wrench className="w-5 h-5 text-orange-500 animate-spin" />;
      case 'delivering':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-pulse" />;
      case 'planning':
        return <Brain className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'executing':
        return <Wrench className="w-5 h-5 text-orange-500 animate-pulse" />;
      case 'summarizing':
        return <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />;
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Loader2 className="w-5 h-5 animate-spin" />;
    }
  };

  const getPhaseLabel = () => {
    switch (status.phase) {
      case 'routing':
        return 'Routing';
      case 'intent':
        return 'Intent';
      case 'parameterizing':
        return 'Parameters';
      case 'outlining':
        return 'Outlining';
      case 'writing':
        return 'Writing';
      case 'delivering':
        return 'Delivering';
      case 'planning':
        return 'Planning';
      case 'executing':
        return 'Executing';
      case 'summarizing':
        return 'Summarizing';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Processing';
    }
  };

  // Determine if panel should be collapsible (completed or error)
  const isCollapsible = status.phase === 'complete' || status.phase === 'error';

  return (
    <div className="mb-4 p-4 border-2 border-border rounded-lg bg-muted/30">
      <div 
        className={`flex items-center gap-3 ${isCollapsible ? 'cursor-pointer hover:bg-muted/50 -m-4 p-4 rounded-lg transition-colors' : ''}`}
        onClick={isCollapsible ? handleToggleCollapse : undefined}
        role={isCollapsible ? 'button' : undefined}
        aria-expanded={isCollapsible ? !isCollapsed : undefined}
        aria-label={isCollapsible ? (isCollapsed ? 'Expand agent execution history' : 'Collapse agent execution history') : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        onKeyDown={isCollapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleCollapse();
          }
        } : undefined}
      >
        {getPhaseIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{getPhaseLabel()}</h3>
            <div className="flex items-center gap-2">
              {status.phase === 'executing' && status.currentStep && status.totalSteps && (
                <span className="text-sm text-muted-foreground">
                  Step {status.currentStep}/{status.totalSteps}
                </span>
              )}
              {isCollapsible && (
                <div className="text-muted-foreground">
                  {isCollapsed ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronUp className="w-4 h-4" />
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{status.message}</p>
        </div>
      </div>
      
      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="mt-3">
          {status.timeline && status.timeline.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4" aria-label="Execution timeline">
              {status.timeline.map((item, index) => {
                const baseClasses = 'px-3 py-1 text-xs font-semibold transition-colors border-2';
                const stateClasses =
                  item.state === 'complete'
                    ? 'bg-green-500/10 text-green-600 border-green-500/50'
                    : item.state === 'active'
                    ? 'bg-primary/10 text-primary border-primary/50'
                    : 'bg-muted text-muted-foreground border-border';
                return (
                  <div key={item.id} className="flex items-center gap-2">
                    <span className={`${baseClasses} ${stateClasses}`}>{item.label}</span>
                    {index < status.timeline!.length - 1 && <span className="h-px w-6 bg-border hidden sm:block" />}
                  </div>
                );
              })}
            </div>
          )}
          {/* Current Step Description */}
          {status.stepDescription && (
            <div className="mb-3 p-3 bg-background/50 rounded border border-border">
              <p className="text-sm text-foreground">{status.stepDescription}</p>
            </div>
          )}

          {/* TODO List */}
          {status.todoList && status.todoList.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <ListTodo className="w-4 h-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-foreground">Action Plan</h4>
              </div>
              <div ref={panelRef} className="max-h-64 overflow-y-auto space-y-2">
                {status.todoList.map((todo, index) => {
                  const itemStatus = todo.status || 'pending';
                  
                  let statusIcon;
                  let statusColor;
                  
                  switch (itemStatus) {
                    case 'completed':
                      statusIcon = <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
                      statusColor = 'border-green-500/20 bg-green-500/5';
                      break;
                    case 'in_progress':
                      statusIcon = <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />;
                      statusColor = 'border-blue-500/20 bg-blue-500/5';
                      break;
                    case 'failed':
                      statusIcon = <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
                      statusColor = 'border-red-500/20 bg-red-500/5';
                      break;
                    default:
                      statusIcon = <div className="w-4 h-4 rounded-full border-2 border-muted flex-shrink-0" />;
                      statusColor = 'border-border bg-background/50';
                  }

                  return (
                    <div
                      key={todo.id || index}
                      className={`p-3 rounded border-2 ${statusColor} transition-all`}
                    >
                      <div className="flex items-start gap-2">
                        {statusIcon}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground break-words">{todo.description}</p>
                          {todo.tool && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Tool: <span className="font-mono">{todo.tool}</span>
                            </p>
                          )}
                          {todo.result && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              ✓ {todo.result}
                            </p>
                          )}
                          {todo.error && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              ✗ {todo.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary with Markdown rendering */}
          {status.summary && (
            <div className="mt-4 p-3 bg-green-500/10 border-2 border-green-500/20 rounded">
              <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                Summary
              </h4>
              <div className="text-sm text-foreground prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-ul:my-2 prose-ol:my-2 prose-p:my-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom rendering for paragraphs
                    p: ({ node, children, ...props }) => (
                      <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
                        {children}
                      </p>
                    ),
                    // Custom rendering for lists
                    ul: ({ node, children, ...props }) => (
                      <ul className="list-disc list-inside mb-2 space-y-1 pl-2" {...props}>
                        {children}
                      </ul>
                    ),
                    ol: ({ node, children, ...props }) => (
                      <ol className="list-decimal list-inside mb-2 space-y-1 pl-2" {...props}>
                        {children}
                      </ol>
                    ),
                    // Custom rendering for list items
                    li: ({ node, children, ...props }) => (
                      <li className="leading-relaxed" {...props}>
                        {children}
                      </li>
                    ),
                    // Custom rendering for strong/bold
                    strong: ({ node, children, ...props }) => (
                      <strong className="font-bold text-green-800 dark:text-green-200" {...props}>
                        {children}
                      </strong>
                    ),
                    // Custom rendering for emphasis/italic
                    em: ({ node, children, ...props }) => (
                      <em className="italic" {...props}>
                        {children}
                      </em>
                    ),
                    // Custom rendering for headings
                    h1: ({ node, children, ...props }) => (
                      <h1 className="text-base font-bold mb-2 mt-2" {...props}>
                        {children}
                      </h1>
                    ),
                    h2: ({ node, children, ...props }) => (
                      <h2 className="text-sm font-bold mb-1 mt-2" {...props}>
                        {children}
                      </h2>
                    ),
                    h3: ({ node, children, ...props }) => (
                      <h3 className="text-sm font-semibold mb-1 mt-1" {...props}>
                        {children}
                      </h3>
                    ),
                    // Custom rendering for code
                    code: ({ node, inline, children, ...props }: any) => {
                      return inline ? (
                        <code className="bg-green-500/20 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-green-500/20 p-2 rounded text-xs font-mono my-2" {...props}>
                          {children}
                        </code>
                      );
                    },
                    // Custom rendering for blockquotes
                    blockquote: ({ node, children, ...props }) => (
                      <blockquote className="border-l-4 border-green-500 pl-3 italic my-2 text-foreground/80" {...props}>
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {status.summary}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Error */}
          {status.error && (
            <div className="mt-4 p-3 bg-red-500/10 border-2 border-red-500/20 rounded">
              <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
                Error
              </h4>
              <p className="text-sm text-foreground">{status.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentStatusPanel;

