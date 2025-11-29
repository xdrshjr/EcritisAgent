/**
 * ChatMessage Component
 * Displays individual chat messages with role-based styling
 * Supports user and assistant messages with proper formatting
 * Renders Markdown content for AI responses
 */

'use client';

import { useState } from 'react';
import { Bot, User, Copy, Languages, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import MCPToolExecutionDisplay from './MCPToolExecutionDisplay';
import { logger } from '@/lib/logger';
import { buildApiUrl } from '@/lib/apiConfig';
import { getDefaultModel } from '@/lib/modelConfig';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import 'highlight.js/styles/github-dark.css';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  mcpExecutionSteps?: any[];
  isMcpStreaming?: boolean; // Indicates if MCP steps are still being streamed
}

const ChatMessage = ({ role, content, timestamp, mcpExecutionSteps, isMcpStreaming = false }: ChatMessageProps) => {
  const isUser = role === 'user';
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLines, setTranslationLines] = useState<string[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [hasTranslation, setHasTranslation] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

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
        contentLength: content.length,
      }, 'ChatMessage');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      logger.error('Failed to copy message content', {
        error: error instanceof Error ? error.message : 'Unknown error',
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

  const handleKeyDown = (event: React.KeyboardEvent, handler: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };

  return (
    <div
      className={`flex gap-4 mb-6 animate-fadeIn ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
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
        {/* MCP Execution Steps (for assistant messages only) */}
        {!isUser && mcpExecutionSteps && mcpExecutionSteps.length > 0 && (
          <MCPToolExecutionDisplay
            steps={mcpExecutionSteps}
            isComplete={!isMcpStreaming}
          />
        )}

        <div
          className={`relative px-4 py-3 shadow-sm transition-all hover:shadow-md ${!isUser ? 'group' : ''} ${
            isUser
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
              : 'bg-muted/80 text-foreground border border-border/50'
          }`}
        >
          {/* Action Buttons - Top Corner (Only for assistant messages) */}
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
          {isUser ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[#0d1117] prose-pre:text-gray-100 prose-code:text-pink-500 prose-code:before:content-[''] prose-code:after:content-['']">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Custom rendering for code blocks
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-muted/60 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Custom rendering for links
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
                  // Custom rendering for paragraphs
                  p: ({ node, children, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props}>
                      {children}
                    </p>
                  ),
                  // Custom rendering for lists
                  ul: ({ node, children, ...props }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ node, children, ...props }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ol>
                  ),
                  // Custom rendering for headings
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
                  // Custom rendering for blockquotes
                  blockquote: ({ node, children, ...props }) => (
                    <blockquote className="border-l-4 border-gray-400 pl-3 italic my-2" {...props}>
                      {children}
                    </blockquote>
                  ),
                  // Custom rendering for tables
                  table: ({ node, children, ...props }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse border border-gray-300" {...props}>
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ node, children, ...props }) => (
                    <th className="border border-gray-300 px-2 py-1 bg-gray-100 dark:bg-gray-800 font-semibold" {...props}>
                      {children}
                    </th>
                  ),
                  td: ({ node, children, ...props }) => (
                    <td className="border border-gray-300 px-2 py-1" {...props}>
                      {children}
                    </td>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}

          {/* Translation Display */}
          {showTranslation && hasTranslation && translationLines.length > 0 && (
            <div className={`mt-3 pt-3 border-t ${
              isUser ? 'border-blue-400/40' : 'border-border/60'
            }`}>
              <div className={`text-xs mb-2.5 font-medium ${
                isUser ? 'text-blue-100/90' : 'text-muted-foreground/80'
              }`}>
                Translation:
              </div>
              <div className={`text-sm leading-relaxed ${
                isUser ? 'text-blue-50/95' : 'text-muted-foreground/90'
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
        </div>

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
    </div>
  );
};

export default ChatMessage;

