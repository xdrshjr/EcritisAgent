/**
 * ChatMessage Component
 * Displays individual chat messages with role-based styling
 * Supports user and assistant messages with proper formatting
 * Renders Markdown content for AI responses
 * Provides context menu functionality for copy, edit, and delete operations
 */

'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { Bot, User, Copy, Languages, Loader2, ChevronDown, ChevronUp, BookOpen, Edit, Trash2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import MCPToolExecutionDisplay from './MCPToolExecutionDisplay';
import NetworkSearchExecutionDisplay from './NetworkSearchExecutionDisplay';
import AgentToolCallDisplay from './AgentToolCallDisplay';
import AgentExecutionTimeline from './AgentExecutionTimeline';
import ContextMenu from './ContextMenu';
import { logger } from '@/lib/logger';
import { buildApiUrl } from '@/lib/apiConfig';
import { getDefaultModel } from '@/lib/modelConfig';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import type { AgentToolCall } from '@/lib/agentStreamParser';
import type { AgentExecutionBlock } from '@/lib/agentExecutionBlock';
import 'highlight.js/styles/github-dark.css';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  mcpExecutionSteps?: any[];
  networkSearchExecutionSteps?: any[]; // Network search steps
  isMcpStreaming?: boolean;
  isNetworkSearchStreaming?: boolean;
  references?: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
  }>; // References for auto-writer agent
  agentToolCalls?: AgentToolCall[]; // Agent mode tool call records (legacy)
  agentExecutionBlocks?: AgentExecutionBlock[]; // Ordered execution blocks (new)
  agentWorkDir?: string; // Agent working directory for file downloads
  messageId?: string; // Unique identifier for the message
  context?: string; // Advanced mode context
  onEditMessage?: (messageId: string, newContent: string) => void; // Callback for editing messages
  onDeleteMessage?: (messageId: string) => void; // Callback for deleting messages
  onResendMessage?: (messageId: string, content: string) => void; // Callback for resending messages
  onOpenWorkDir?: () => void; // Callback for opening agent work directory
}

const ChatMessage = ({
  role,
  content,
  timestamp,
  mcpExecutionSteps,
  networkSearchExecutionSteps,
  isMcpStreaming = false,
  isNetworkSearchStreaming = false,
  references,
  agentToolCalls,
  agentExecutionBlocks,
  agentWorkDir,
  messageId,
  context,
  onEditMessage,
  onDeleteMessage,
  onResendMessage,
  onOpenWorkDir
}: ChatMessageProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const isUser = role === 'user';
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLines, setTranslationLines] = useState<string[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [hasTranslation, setHasTranslation] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [codeBlockCopyStates, setCodeBlockCopyStates] = useState<Record<string, boolean>>({});
  const [isReferencesExpanded, setIsReferencesExpanded] = useState(false); // Default collapsed
  const [isContextExpanded, setIsContextExpanded] = useState(false); // Default collapsed for context
  
  // Context menu state
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const messageRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  const handleFormatTimestamp = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
      return 'Just now';
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      logger.info('Message content copied to clipboard', {
        role: isUser ? 'user' : 'assistant',
        contentLength: content.length,
        contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      }, 'ChatMessage');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      logger.error('Failed to copy message content', {
        role: isUser ? 'user' : 'assistant',
        contentLength: content.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ChatMessage');
    }
  };

  const handleTranslate = async () => {
    // If translation already exists, just toggle visibility
    if (hasTranslation) {
      logger.debug('Toggling translation visibility', {
        showTranslation: !showTranslation,
      }, 'ChatMessage');
      setShowTranslation(!showTranslation);
      return;
    }

    // If no translation exists, fetch it
    setIsTranslating(true);
    logger.info('Starting translation request', {
      contentLength: content.length,
    }, 'ChatMessage');

    try {
      // Get default model
      const defaultModel = await getDefaultModel();
      if (!defaultModel) {
        throw new Error('No default model configured');
      }

      logger.debug('Using default model for translation', {
        modelId: defaultModel.id,
        modelName: defaultModel.name,
      }, 'ChatMessage');

      // Split content into lines for line-by-line translation
      const originalLines = content.split('\n');
      const nonEmptyLines = originalLines.filter(line => line.trim().length > 0);
      
      if (nonEmptyLines.length === 0) {
        logger.warn('No content to translate', undefined, 'ChatMessage');
        setIsTranslating(false);
        return;
      }

      // Create translation prompt that emphasizes line-by-line translation
      const translationPrompt = `Please translate the following text line by line. Maintain the exact same number of lines as the original text. Each line of the original should correspond to exactly one line of translation. Do not add explanations, comments, or extra text. Just provide the translations, one per line, in the same order as the original lines.\n\nOriginal text:\n${content}\n\nTranslation:`;

      // Prepare messages for API
      const apiMessages: ChatMessageType[] = [
        {
          role: 'user',
          content: translationPrompt,
        },
      ];

      // Get API URL
      const apiUrl = await buildApiUrl('/api/chat');

      logger.debug('Sending translation request to API', {
        apiUrl,
        modelId: defaultModel.id,
        lineCount: originalLines.length,
      }, 'ChatMessage');

      // Call API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: apiMessages,
          modelId: defaultModel.id,
        }),
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          errorData = await response.json();
        } catch (parseError) {
          logger.warn('Failed to parse error response', {
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          }, 'ChatMessage');
        }
        
        logger.error('Translation API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        }, 'ChatMessage');
        
        throw new Error(errorData.details || errorData.error || `Translation failed (${response.status})`);
      }

      if (!response.body) {
        logger.error('Translation response body is empty', undefined, 'ChatMessage');
        throw new Error('Translation response body is empty');
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let translationContent = '';
      let buffer = '';

      logger.debug('Processing translation stream', undefined, 'ChatMessage');

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          logger.debug('Translation stream completed', {
            contentLength: translationContent.length,
          }, 'ChatMessage');
          break;
        }

        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
              continue;
            }

            if (trimmedLine.startsWith('data: ')) {
              try {
                const jsonStr = trimmedLine.slice(6);
                const data = JSON.parse(jsonStr);
                
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  translationContent += chunk;
                }
              } catch (parseError) {
                logger.warn('Failed to parse translation chunk', {
                  error: parseError instanceof Error ? parseError.message : 'Unknown error',
                }, 'ChatMessage');
              }
            }
          }
        }
      }

      // Split translation into lines to match original
      // Remove any leading/trailing whitespace and split by newlines
      const cleanedTranslation = translationContent.trim();
      const translationLinesArray = cleanedTranslation.split('\n').map(line => line.trim());
      
      // Match translation lines to original lines
      // For each original line, find the corresponding translation line
      const finalTranslationLines: string[] = [];
      
      // If translation has the same number of lines, use direct mapping
      if (translationLinesArray.length === originalLines.length) {
        finalTranslationLines.push(...translationLinesArray);
      } else {
        // Otherwise, try to match lines intelligently
        // For empty original lines, keep translation empty
        // For non-empty original lines, try to match with translation lines
        let translationIndex = 0;
        for (let i = 0; i < originalLines.length; i++) {
          if (originalLines[i].trim().length === 0) {
            // Empty line in original - keep empty in translation
            finalTranslationLines.push('');
          } else {
            // Non-empty line - use next available translation line
            if (translationIndex < translationLinesArray.length) {
              finalTranslationLines.push(translationLinesArray[translationIndex]);
              translationIndex++;
            } else {
              // No more translation lines - use empty
              finalTranslationLines.push('');
            }
          }
        }
      }

      logger.success('Translation completed', {
        originalLineCount: originalLines.length,
        translationLineCount: finalTranslationLines.length,
      }, 'ChatMessage');

      setTranslationLines(finalTranslationLines);
      setHasTranslation(true);
      setShowTranslation(true);
    } catch (error) {
      logger.error('Translation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ChatMessage');
    } finally {
      setIsTranslating(false);
    }
  };

  /**
   * Extract text content from React children (code block content)
   */
  const extractCodeText = useCallback((children: React.ReactNode): string => {
    if (typeof children === 'string') {
      return children;
    }
    if (typeof children === 'number') {
      return String(children);
    }
    if (Array.isArray(children)) {
      return children.map(child => extractCodeText(child)).join('');
    }
    if (children && typeof children === 'object' && 'props' in children) {
      return extractCodeText((children as any).props?.children || '');
    }
    return '';
  }, []);

  /**
   * Handle copying code block content to clipboard
   */
  const handleCopyCodeBlock = useCallback(async (codeText: string, codeBlockId: string, language?: string) => {
    logger.info('Starting code block copy', {
      codeBlockId,
      codeLength: codeText.length,
      language: language || 'unknown',
    }, 'ChatMessage');

    try {
      await navigator.clipboard.writeText(codeText);
      logger.success('Code block copied to clipboard', {
        codeBlockId,
        codeLength: codeText.length,
        language: language || 'unknown',
      }, 'ChatMessage');

      // Set success state for this specific code block
      setCodeBlockCopyStates(prev => ({ ...prev, [codeBlockId]: true }));
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setCodeBlockCopyStates(prev => {
          const newState = { ...prev };
          delete newState[codeBlockId];
          return newState;
        });
        logger.debug('Code block copy success state reset', {
          codeBlockId,
        }, 'ChatMessage');
      }, 2000);
    } catch (error) {
      logger.error('Failed to copy code block', {
        codeBlockId,
        codeLength: codeText.length,
        language: language || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ChatMessage');
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, handler: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  }, []);

  // Context menu functionality
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // Get selected text
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    
    logger.debug('Context menu triggered', {
      role: isUser ? 'user' : 'assistant',
      hasSelection: selectedText.length > 0,
      selectionLength: selectedText.length,
      messageId,
      mouseX: event.clientX,
      mouseY: event.clientY,
    }, 'ChatMessage');

    setSelectedText(selectedText);
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }, [isUser, messageId]);

  const handleCloseContextMenu = useCallback(() => {
    logger.debug('Context menu closed', undefined, 'ChatMessage');
    setContextMenuPosition(null);
    setSelectedText('');
  }, []);

  const handleCopySelectedText = useCallback(() => {
    if (selectedText) {
      navigator.clipboard.writeText(selectedText).then(() => {
        logger.info('Selected text copied to clipboard', {
          textLength: selectedText.length,
          textPreview: selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''),
        }, 'ChatMessage');
      }).catch((error) => {
        logger.error('Failed to copy selected text', {
          error: error instanceof Error ? error.message : 'Unknown error',
          textLength: selectedText.length,
        }, 'ChatMessage');
      });
    } else {
      // If no text selected, copy entire message content
      navigator.clipboard.writeText(content).then(() => {
        logger.info('Message content copied to clipboard via context menu', {
          role: isUser ? 'user' : 'assistant',
          contentLength: content.length,
          contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        }, 'ChatMessage');
      }).catch((error) => {
        logger.error('Failed to copy message content via context menu', {
          error: error instanceof Error ? error.message : 'Unknown error',
          role: isUser ? 'user' : 'assistant',
          contentLength: content.length,
        }, 'ChatMessage');
      });
    }
  }, [selectedText, content, isUser]);

  const handleEditMessage = useCallback(() => {
    if (messageId && onEditMessage) {
      logger.info('Starting message edit', {
        messageId,
        originalContentLength: content.length,
      }, 'ChatMessage');
      setIsEditing(true);
      setEditContent(content);
    } else {
      logger.warn('Edit message requested but no handler available', {
        hasMessageId: !!messageId,
        hasEditHandler: !!onEditMessage,
      }, 'ChatMessage');
    }
  }, [messageId, onEditMessage, content]);

  const handleSaveEdit = useCallback(() => {
    if (messageId && onEditMessage && editContent.trim() !== content.trim()) {
      logger.info('Saving message edit', {
        messageId,
        originalLength: content.length,
        newLength: editContent.length,
        contentChanged: editContent.trim() !== content.trim(),
      }, 'ChatMessage');
      
      onEditMessage(messageId, editContent);
      setIsEditing(false);
    } else {
      logger.debug('Message edit cancelled or no changes', {
        messageId,
        contentChanged: editContent.trim() !== content.trim(),
      }, 'ChatMessage');
      setIsEditing(false);
    }
  }, [messageId, onEditMessage, editContent, content]);

  const handleCancelEdit = useCallback(() => {
    logger.debug('Message edit cancelled', {
      messageId,
    }, 'ChatMessage');
    setIsEditing(false);
    setEditContent(content);
  }, [messageId, content]);

  const handleDeleteMessage = useCallback(() => {
    if (messageId && onDeleteMessage) {
      logger.info('Deleting message', {
        messageId,
        role: isUser ? 'user' : 'assistant',
        contentLength: content.length,
      }, 'ChatMessage');

      onDeleteMessage(messageId);
    } else {
      logger.warn('Delete message requested but no handler available', {
        hasMessageId: !!messageId,
        hasDeleteHandler: !!onDeleteMessage,
      }, 'ChatMessage');
    }
  }, [messageId, onDeleteMessage, isUser, content]);

  const handleResendMessage = useCallback(() => {
    if (messageId && onResendMessage) {
      logger.info('Resending message', {
        messageId,
        role: isUser ? 'user' : 'assistant',
        contentLength: content.length,
        contentPreview: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      }, 'ChatMessage');

      onResendMessage(messageId, content);
    } else {
      logger.warn('Resend message requested but no handler available', {
        hasMessageId: !!messageId,
        hasResendHandler: !!onResendMessage,
      }, 'ChatMessage');
    }
  }, [messageId, onResendMessage, isUser, content]);

  const markdownContent = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code: ({ node, inline, className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : undefined;
          
          if (inline) {
            return (
              <code className="bg-muted/60 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          }

          // Block code - add copy button
          const codeText = extractCodeText(children);
          // Generate unique ID for this code block
          // Use content hash + position to ensure uniqueness and stability
          const contentHash = codeText.length > 0 
            ? `${codeText.substring(0, 10).replace(/\s/g, '')}-${codeText.length}`
            : 'empty';
          const position = node?.position ? `${node.position.start.line}:${node.position.start.column}` : 'unknown';
          const codeBlockId = `code-block-${contentHash}-${position}`;
          const isCopied = codeBlockCopyStates[codeBlockId] || false;

          logger.debug('Rendering code block', {
            codeBlockId,
            codeLength: codeText.length,
            language: language || 'unknown',
          }, 'ChatMessage');

          return (
            <div className="relative group/codeblock my-1">
              <pre className="bg-[#0d1117] rounded-md p-2 overflow-x-auto">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
              <button
                onClick={() => handleCopyCodeBlock(codeText, codeBlockId, language)}
                onKeyDown={(e) => handleKeyDown(e, () => handleCopyCodeBlock(codeText, codeBlockId, language))}
                className={`absolute bottom-2 right-2 p-1.5 rounded-md transition-all duration-200 opacity-0 group-hover/codeblock:opacity-100 hover:bg-muted/90 text-muted-foreground/80 hover:text-foreground bg-background/80 backdrop-blur-sm border border-border/30 ${
                  isCopied ? 'bg-green-500/20 opacity-100' : ''
                } shadow-sm hover:shadow-md z-10`}
                aria-label="Copy code block"
                tabIndex={0}
                title={isCopied ? 'Copied!' : 'Copy code block'}
              >
                {isCopied ? (
                  <span className="text-xs font-semibold">✓</span>
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        },
        a: ({ node, children, ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-600 underline underline-offset-2"
          >
            {children}
          </a>
        ),
        p: ({ node, children, ...props }) => (
          <p className="mb-2 last:mb-0" {...props}>
            {children}
          </p>
        ),
        ul: ({ node, children, ...props }) => (
          <ul className="list-disc list-outside mb-2 space-y-1 pl-5" {...props}>
            {children}
          </ul>
        ),
        ol: ({ node, children, ...props }) => (
          <ol className="list-decimal list-outside mb-2 space-y-1 pl-5" {...props}>
            {children}
          </ol>
        ),
        h1: ({ node, children, ...props }) => (
          <h1 className="text-lg font-bold mb-2 mt-2" {...props}>
            {children}
          </h1>
        ),
        h2: ({ node, children, ...props }) => (
          <h2 className="text-base font-bold mb-2 mt-2" {...props}>
            {children}
          </h2>
        ),
        h3: ({ node, children, ...props }) => (
          <h3 className="text-sm font-bold mb-1 mt-1" {...props}>
            {children}
          </h3>
        ),
        blockquote: ({ node, children, ...props }) => (
          <blockquote className="border-l-4 border-gray-400 pl-3 italic my-2" {...props}>
            {children}
          </blockquote>
        ),
        table: ({ node, children, ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-border" {...props}>
              {children}
            </table>
          </div>
        ),
        th: ({ node, children, ...props }) => (
          <th className="border border-border px-2 py-1 bg-muted font-semibold" {...props}>
            {children}
          </th>
        ),
        td: ({ node, children, ...props }) => (
          <td className="border border-border px-2 py-1" {...props}>
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  ), [content, codeBlockCopyStates, handleCopyCodeBlock, handleKeyDown]);

  // Prepare context menu items
  const contextMenuItems = [
    {
      id: 'copy',
      label: selectedText ? 'Copy Selected' : 'Copy Message',
      icon: <Copy className="w-4 h-4" />,
      action: handleCopySelectedText,
    },
    ...(isUser && onResendMessage && messageId ? [{
      id: 'resend',
      label: dict.chat.resendMessage,
      icon: <Send className="w-4 h-4" />,
      action: handleResendMessage,
    }] : []),
    ...(onEditMessage && messageId ? [{
      id: 'edit',
      label: 'Edit Message',
      icon: <Edit className="w-4 h-4" />,
      action: handleEditMessage,
      disabled: isEditing,
    }] : []),
    ...(onDeleteMessage && messageId ? [{
      id: 'delete',
      label: 'Delete Message',
      icon: <Trash2 className="w-4 h-4 text-red-500" />,
      action: handleDeleteMessage,
    }] : []),
  ];

  return (
    <div
      ref={messageRef}
      className={`flex gap-4 mb-6 animate-fadeIn ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
      onContextMenu={handleContextMenu}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
            : 'bg-gradient-to-br from-purple-500 to-purple-600 text-white'
        }`}
        aria-label={isUser ? 'User' : 'AI Assistant'}
      >
        {isUser ? (
          <User className="w-5 h-5" />
        ) : (
          <Bot className="w-5 h-5" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex-1 max-w-[80%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Network Search Execution Steps (for assistant messages only) */}
        {!isUser && networkSearchExecutionSteps && networkSearchExecutionSteps.length > 0 && (
          <NetworkSearchExecutionDisplay
            steps={networkSearchExecutionSteps}
            isComplete={!isNetworkSearchStreaming}
          />
        )}

        {/* MCP Execution Steps (for assistant messages only) */}
        {!isUser && mcpExecutionSteps && mcpExecutionSteps.length > 0 && (
          <MCPToolExecutionDisplay
            steps={mcpExecutionSteps}
            isComplete={!isMcpStreaming}
          />
        )}

        {/* Agent Execution Timeline (new ordered blocks) */}
        {!isUser && agentExecutionBlocks && agentExecutionBlocks.length > 0 && (
          <AgentExecutionTimeline
            blocks={agentExecutionBlocks}
            workDir={agentWorkDir}
            onCopy={handleCopy}
            onTranslate={handleTranslate}
            copySuccess={copySuccess}
            isTranslating={isTranslating}
            showTranslation={showTranslation}
            translationLines={translationLines}
            hasTranslation={hasTranslation}
            fullContent={content}
            onOpenWorkDir={onOpenWorkDir}
          />
        )}

        {/* Legacy: Agent Tool Calls (for old saved messages without execution blocks) */}
        {!isUser && !agentExecutionBlocks && agentToolCalls && agentToolCalls.length > 0 && (
          <div className="mb-2">
            {agentToolCalls.map((tc) => (
              <AgentToolCallDisplay key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Hide content bubble when agent execution blocks are present (timeline handles display) */}
        {!(agentExecutionBlocks && agentExecutionBlocks.length > 0 && !isUser) && (
        <div
          className={`relative px-2 py-1.5 shadow-sm transition-all hover:shadow-md group ${
            isUser
              ? 'bg-primary/5 text-foreground rounded-2xl rounded-br-sm'
              : 'bg-card text-foreground border border-border/50 rounded-2xl rounded-bl-sm'
          }`}
        >
          {/* Action Buttons - Top Corner */}
          {!isUser && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
              <button
                onClick={handleCopy}
                onKeyDown={(e) => handleKeyDown(e, handleCopy)}
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
              <button
                onClick={handleTranslate}
                onKeyDown={(e) => handleKeyDown(e, handleTranslate)}
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
            </div>
          )}
          {/* Copy Button for User Messages */}
          {isUser && (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
              <button
                onClick={handleCopy}
                onKeyDown={(e) => handleKeyDown(e, handleCopy)}
                className={`p-1.5 rounded-md transition-all duration-200 hover:bg-foreground/10 text-foreground/60 hover:text-foreground bg-foreground/5 border border-foreground/20 ${copySuccess ? 'bg-green-500/20 border-green-400/50' : ''} shadow-sm hover:shadow-md`}
                aria-label="Copy message"
                tabIndex={0}
                title={copySuccess ? 'Copied!' : 'Copy message'}
              >
                {copySuccess ? (
                  <span className="text-xs font-semibold text-foreground">✓</span>
                ) : (
                  <Copy className="w-3.5 h-3.5 text-foreground/70" />
                )}
              </button>
            </div>
          )}
          {isUser ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words chat-message-user-content">
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full bg-transparent border border-foreground/15 rounded px-2 py-1 text-sm resize-none focus:outline-none focus:border-foreground/30"
                    rows={Math.max(2, editContent.split('\n').length)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="px-2 py-1 text-xs bg-foreground/10 hover:bg-foreground/20 rounded border border-foreground/15 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-2 py-1 text-xs bg-foreground/5 hover:bg-foreground/10 rounded border border-foreground/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>{content}</div>
                  {/* Context display for advanced mode */}
                  {context && (
                    <div className="mt-3 border-t border-black/15 pt-2">
                      <button 
                        onClick={() => setIsContextExpanded(!isContextExpanded)}
                        className="flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors w-full text-left font-medium mb-1"
                      >
                        <span className={`transform transition-transform ${isContextExpanded ? 'rotate-90' : ''}`}>▶</span>
                        Context
                      </button>
                      
                      {isContextExpanded && (
                        <div className="bg-emerald-400/20 rounded px-2 py-1.5 text-xs text-foreground whitespace-pre-wrap font-mono mt-1 border border-emerald-300/30">
                          {context}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[#0d1117] prose-pre:text-gray-100 prose-code:text-pink-500 prose-code:before:content-[''] prose-code:after:content-[''] px-1.5 py-1 chat-message-content-wrapper">
              {markdownContent}
            </div>
          )}

          {/* Translation Display */}
          {showTranslation && hasTranslation && translationLines.length > 0 && (
            <div className={`mt-3 pt-3 border-t ${
              isUser ? 'border-foreground/15' : 'border-border/60'
            }`}>
              <div className={`text-xs mb-2.5 font-medium ${
                isUser ? 'text-foreground/70' : 'text-muted-foreground/80'
              }`}>
                Translation:
              </div>
              <div className={`text-sm leading-relaxed ${
                isUser ? 'text-foreground/95' : 'text-muted-foreground/90'
              }`}>
                {content.split('\n').map((originalLine, index) => {
                  const translationLine = translationLines[index] || '';
                  // Skip empty lines in both original and translation
                  if (!originalLine.trim() && !translationLine.trim()) {
                    return <div key={index} className="h-2" />;
                  }
                  // Show translation line if it exists
                  if (translationLine.trim()) {
                    return (
                      <div key={index} className="mb-1.5 whitespace-pre-wrap break-words">
                        {translationLine}
                      </div>
                    );
                  }
                  // If original line exists but no translation, show empty space
                  return <div key={index} className="h-2" />;
                })}
              </div>
            </div>
          )}

          {/* References Display (for auto-writer agent) */}
          {!isUser && references && references.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                  <div className="text-xs font-medium text-muted-foreground/80">
                    参考文献 ({references.length} 篇)
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsReferencesExpanded(prev => {
                      const newState = !prev;
                      logger.debug('Toggled references expansion', {
                        expanded: newState,
                        referenceCount: references.length,
                      }, 'ChatMessage');
                      return newState;
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setIsReferencesExpanded(prev => !prev);
                    }
                  }}
                  className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground text-xs"
                  aria-label={isReferencesExpanded ? '折叠参考文献' : '展开参考文献'}
                  aria-expanded={isReferencesExpanded}
                  tabIndex={0}
                >
                  {isReferencesExpanded ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      <span>折叠</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>展开</span>
                    </>
                  )}
                </button>
              </div>
              {isReferencesExpanded && (
                <div className="mt-2 space-y-2">
                  {references.map((ref, idx) => (
                    <div
                      key={idx}
                      className="bg-muted/40 rounded p-3 border border-border/30 hover:border-border/50 transition-colors"
                    >
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline block mb-2"
                        onClick={() => {
                          logger.info('Reference link clicked', {
                            title: ref.title,
                            url: ref.url,
                            index: idx + 1,
                          }, 'ChatMessage');
                        }}
                      >
                        {ref.title || '无标题'}
                      </a>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-2">
                        {ref.content || '无内容摘要'}
                      </p>
                      <div className="flex items-center justify-between">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-300 truncate max-w-[70%]"
                          onClick={() => {
                            logger.debug('Reference URL clicked', {
                              url: ref.url,
                              index: idx + 1,
                            }, 'ChatMessage');
                          }}
                        >
                          {ref.url}
                        </a>
                        {ref.score !== undefined && (
                          <span className="text-xs text-muted-foreground/70 px-2 py-0.5 bg-muted/60 rounded">
                            相关性: {(ref.score * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div
            className={`text-xs text-muted-foreground/70 mt-1.5 px-2 ${
              isUser ? 'text-right' : 'text-left'
            }`}
          >
            {handleFormatTimestamp(timestamp)}
          </div>
        )}
      </div>
      
      {/* Context Menu */}
      <ContextMenu
        items={contextMenuItems}
        position={contextMenuPosition}
        onClose={handleCloseContextMenu}
      />
    </div>
  );
};

export default ChatMessage;

