/**
 * DocAgentPanel Component
 *
 * Right-side panel for the document agent. Manages conversation with the
 * pi-agent document loop, renders messages with AgentExecutionTimeline,
 * and dispatches doc_update events to the TipTap editor.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, Trash2, Send, Bot } from 'lucide-react';
import AgentExecutionTimeline from './AgentExecutionTimeline';
import AgentThinkingIndicator from './AgentThinkingIndicator';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, getModelConfigsUpdatedEventName, type ModelConfig } from '@/lib/modelConfig';
import { getAgentLLMConfig } from '@/lib/agentLlmAdapter';
import { processDocAgentSSEStream, type DocUpdatePayload } from '@/lib/docAgentStreamParser';
import type { AgentToolCall } from '@/lib/agentStreamParser';
import {
  type AgentExecutionBlock,
  type AgentContentBlock,
  type AgentToolUseBlock,
  resetBlockCounter,
  createBlock,
} from '@/lib/agentExecutionBlock';

// ── Types ───────────────────────────────────────────────────────────────────

interface DocAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: number;
  agentExecutionBlocks?: AgentExecutionBlock[];
}

interface DocAgentPanelProps {
  /** Get the current TipTap editor HTML content. */
  getDocumentContent: () => string;
  /** Apply a section-level update to the editor. */
  updateSectionContent: (
    operation: string,
    sectionIndex: number,
    title?: string,
    content?: string,
  ) => void;
  /** Insert an image after a section in the editor. */
  insertImageAfterSection: (
    sectionIndex: number,
    imageUrl: string,
    imageDescription: string,
  ) => boolean;
  /** Currently selected model ID (from parent). */
  selectedModelId: string | null;
}

// ── History preparation ──────────────────────────────────────────────────────

interface SimplifiedHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Prepare conversation history for the doc agent API.
 *
 * - Filters out error messages
 * - Strips UI-only fields (id, agentExecutionBlocks)
 * - Only keeps role, content, and timestamp
 * - Excludes messages with empty content
 */
const prepareDocAgentHistory = (messages: DocAgentMessage[]): SimplifiedHistoryMessage[] => {
  return messages
    .filter(m => m.role !== 'error' && m.content.trim().length > 0)
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp,
    }));
};

// ── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'aidocmaster.docAgentMessages';

const saveMessages = (messages: DocAgentMessage[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch (err) {
    logger.warn('Failed to save doc agent messages to localStorage', {
      error: err instanceof Error ? err.message : 'Unknown error',
      messageCount: messages.length,
    }, 'DocAgentPanel');
  }
};

const loadMessages = (): DocAgentMessage[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

// ── Component ───────────────────────────────────────────────────────────────

const DocAgentPanel = ({
  getDocumentContent,
  updateSectionContent,
  insertImageAfterSection,
  selectedModelId,
}: DocAgentPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  // Messages
  const [messages, setMessages] = useState<DocAgentMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingBlocks, setStreamingBlocks] = useState<AgentExecutionBlock[]>([]);

  // Input
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  // Abort
  const abortControllerRef = useRef<AbortController | null>(null);

  // Model
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);

  // ── Load messages from localStorage ─────────────────────────────────────

  useEffect(() => {
    const saved = loadMessages();
    if (saved.length > 0) {
      setMessages(saved);
    }
  }, []);

  // ── Persist messages ────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  // ── Load model ──────────────────────────────────────────────────────────

  useEffect(() => {
    const loadModel = async () => {
      try {
        const configList = await loadModelConfigs();
        const enabledModels = configList.models.filter(m => m.isEnabled !== false);

        if (selectedModelId) {
          const found = enabledModels.find(m => m.id === selectedModelId);
          if (found) {
            setSelectedModel(found);
            return;
          }
        }

        const defaultModel = await getDefaultModel();
        if (defaultModel) {
          setSelectedModel(defaultModel);
        } else if (enabledModels.length > 0) {
          setSelectedModel(enabledModels[0]);
        }
      } catch (err) {
        logger.error('Failed to load models for doc agent', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'DocAgentPanel');
      }
    };

    loadModel();

    const handleModelUpdate = () => { loadModel(); };
    window.addEventListener(getModelConfigsUpdatedEventName(), handleModelUpdate);
    return () => window.removeEventListener(getModelConfigsUpdatedEventName(), handleModelUpdate);
  }, [selectedModelId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    if (shouldAutoScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, streamingBlocks, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    shouldAutoScrollRef.current = isNearBottom;
  }, []);

  // ── Handle doc_update event ─────────────────────────────────────────────

  const handleDocUpdate = useCallback((update: DocUpdatePayload) => {
    logger.info('Doc update received', {
      operation: update.operation,
      sectionIndex: update.sectionIndex,
    }, 'DocAgentPanel');

    switch (update.operation) {
      case 'replace':
      case 'append':
      case 'insert':
      case 'delete':
        updateSectionContent(
          update.operation,
          update.sectionIndex,
          update.title,
          update.content,
        );
        break;
      case 'insert_image':
        if (update.imageUrl && update.imageDescription) {
          insertImageAfterSection(
            update.sectionIndex,
            update.imageUrl,
            update.imageDescription,
          );
        }
        break;
    }
  }, [updateSectionContent, insertImageAfterSection]);

  // ── Send message ────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;

    if (!selectedModel) {
      logger.error('No model selected for doc agent', undefined, 'DocAgentPanel');
      return;
    }

    // Add user message
    const userMessage: DocAgentMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingBlocks([]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Track execution blocks
    resetBlockCounter();
    const blocks: AgentExecutionBlock[] = [];
    let currentContentBlock: AgentContentBlock | null = null;
    let assistantContent = '';
    const toolCalls: AgentToolCall[] = [];
    let turnNumber = 1;

    const closeContentBlock = () => {
      if (currentContentBlock && currentContentBlock.text.trim()) {
        blocks.push(currentContentBlock);
      }
      currentContentBlock = null;
    };

    const flushBlocks = () => {
      flushSync(() => {
        setStreamingBlocks([...blocks]);
      });
    };

    try {
      // Build LLM config
      const llmConfig = await getAgentLLMConfig(selectedModel);

      // Get current editor content
      const documentContent = getDocumentContent();

      // Prepare conversation history (filter errors, strip tool call details).
      // The API route reconstructs proper AgentMessage objects from this
      // simplified format before feeding them to agent.replaceMessages().
      const history = prepareDocAgentHistory(messages);

      const requestBody = {
        message: content,
        documentContent,
        history: history.length > 0 ? history : undefined,
        llmConfig: {
          model: llmConfig.model,
          streamOptions: llmConfig.streamOptions,
        },
      };

      const apiUrl = await buildApiUrl('/api/doc-agent-chat');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Doc agent API error (${response.status}): ${errorText}`);
      }

      if (!response.body) throw new Error('Response body is empty');

      await processDocAgentSSEStream(response.body, {
        onAgentStart: () => {
          logger.debug('Doc agent started', undefined, 'DocAgentPanel');
        },

        onContent: (text) => {
          assistantContent += text;
          if (!currentContentBlock) {
            currentContentBlock = createBlock({ type: 'content', text: '' }) as AgentContentBlock;
          }
          currentContentBlock.text += text;

          flushSync(() => {
            setStreamingContent(assistantContent);
            setStreamingBlocks([...blocks, currentContentBlock!]);
          });
        },

        onThinking: (text) => {
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock && lastBlock.type === 'thinking') {
            blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
          } else {
            closeContentBlock();
            blocks.push(createBlock({ type: 'thinking', text }));
          }
          flushBlocks();
        },

        onToolUse: (tool) => {
          closeContentBlock();

          if (!toolCalls.find(tc => tc.id === tool.toolId)) {
            toolCalls.push({
              id: tool.toolId,
              toolName: tool.toolName,
              toolInput: tool.toolInput,
              status: 'running',
              startTime: Date.now(),
            });

            blocks.push(createBlock({
              type: 'tool_use',
              toolCallId: tool.toolId,
              toolName: tool.toolName,
              toolInput: tool.toolInput,
              status: 'running',
              startTime: Date.now(),
            }));

            flushSync(() => {
              setStreamingBlocks([...blocks]);
            });
          }
        },

        onToolUpdate: (update) => {
          const tc = toolCalls.find(t => t.id === update.toolId);
          if (tc) {
            tc.result = (tc.result || '') + update.content;
          }
          const idx = blocks.findIndex(
            (b): b is AgentToolUseBlock => b.type === 'tool_use' && b.toolCallId === update.toolId,
          );
          if (idx !== -1) {
            const old = blocks[idx] as AgentToolUseBlock;
            blocks[idx] = { ...old, result: (old.result || '') + update.content };
          }
          flushSync(() => {
            setStreamingBlocks([...blocks]);
          });
        },

        onToolResult: (result) => {
          const tc = toolCalls.find(t => t.id === result.toolId);
          if (tc) {
            tc.status = result.isError ? 'error' : 'complete';
            tc.result = result.content;
            tc.isError = result.isError;
            tc.endTime = Date.now();
          }
          const idx = blocks.findIndex(
            (b): b is AgentToolUseBlock => b.type === 'tool_use' && b.toolCallId === result.toolId,
          );
          if (idx !== -1) {
            const old = blocks[idx] as AgentToolUseBlock;
            blocks[idx] = {
              ...old,
              status: result.isError ? 'error' : 'complete',
              result: result.content,
              isError: result.isError,
              endTime: Date.now(),
            };
          }
          flushSync(() => {
            setStreamingBlocks([...blocks]);
          });
        },

        onDocUpdate: (update) => {
          // 1. Apply to editor
          handleDocUpdate(update);

          // 2. Add doc_update block to timeline
          closeContentBlock();
          blocks.push(createBlock({
            type: 'doc_update',
            operation: update.operation,
            sectionIndex: update.sectionIndex,
            title: update.title,
            imageUrl: update.imageUrl,
          }));
          flushBlocks();
        },

        onTurnEnd: () => {
          closeContentBlock();
          blocks.push(createBlock({
            type: 'turn_separator',
            turnNumber,
          }));
          turnNumber++;
          flushBlocks();
        },

        onComplete: () => {
          closeContentBlock();
          logger.info('Doc agent loop completed', {
            contentLength: assistantContent.length,
            blockCount: blocks.length,
          }, 'DocAgentPanel');
        },

        onError: (error) => {
          logger.error('Doc agent stream error', { error }, 'DocAgentPanel');
        },
      });

      // Add assistant message
      if (assistantContent || blocks.length > 0) {
        const assistantMessage: DocAgentMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: Date.now(),
          agentExecutionBlocks: blocks.length > 0 ? blocks : undefined,
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      const isAbort = error instanceof Error &&
        (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));

      if (isAbort) {
        logger.info('Doc agent request aborted', undefined, 'DocAgentPanel');
        closeContentBlock();
        if (assistantContent.trim() || blocks.length > 0) {
          setMessages(prev => [...prev, {
            id: `assistant-${Date.now()}-aborted`,
            role: 'assistant',
            content: assistantContent,
            timestamp: Date.now(),
            agentExecutionBlocks: blocks.length > 0 ? blocks : undefined,
          }]);
        }
      } else {
        logger.error('Doc agent send failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'DocAgentPanel');

        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'error',
          content: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        }]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingBlocks([]);
      abortControllerRef.current = null;
    }
  }, [inputValue, isStreaming, selectedModel, messages, getDocumentContent, handleDocUpdate]);

  // ── Stop streaming ──────────────────────────────────────────────────────

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      logger.info('Doc agent stream stopped by user', undefined, 'DocAgentPanel');
    }
  }, []);

  // ── Clear history ───────────────────────────────────────────────────────

  const handleClearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    logger.info('Doc agent history cleared', undefined, 'DocAgentPanel');
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{dict.chat.docAgentTitle}</span>
        </div>
        <button
          onClick={handleClearHistory}
          disabled={isStreaming || messages.length === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={dict.chat.docAgentClearHistory}
          title={dict.chat.docAgentClearHistory}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{dict.chat.docAgentClearHistory}</span>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        onScroll={handleScroll}
      >
        {messages.map((message) => (
          <div key={message.id}>
            {message.role === 'user' && (
              <div className="flex justify-end mb-4">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm whitespace-pre-wrap break-words">
                  {message.content}
                </div>
              </div>
            )}

            {message.role === 'assistant' && (
              <div className="flex gap-3 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  {message.agentExecutionBlocks && message.agentExecutionBlocks.length > 0 ? (
                    <AgentExecutionTimeline
                      blocks={message.agentExecutionBlocks}
                    />
                  ) : message.content.trim() ? (
                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-card text-foreground border border-border/50 text-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {message.role === 'error' && (
              <div className="flex gap-3 mb-4">
                <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1 max-w-[85%]">
                  <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-destructive/10 text-destructive border border-destructive/20 text-sm">
                    {message.content}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Streaming: execution timeline */}
        {isStreaming && streamingBlocks.length > 0 && (
          <div className="flex gap-3 mb-4">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 max-w-[85%]">
              <AgentExecutionTimeline
                blocks={streamingBlocks}
                isStreaming={true}
              />
            </div>
          </div>
        )}

        {/* Thinking indicator (before any blocks appear) */}
        {isStreaming && streamingBlocks.length === 0 && !streamingContent && (
          <AgentThinkingIndicator />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={dict.chat.docAgentPlaceholder}
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px] max-h-[120px]"
            style={{ height: 'auto', overflow: 'auto' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="flex-shrink-0 p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
              aria-label="Stop"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || !selectedModel}
              className="flex-shrink-0 p-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocAgentPanel;
