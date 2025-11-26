/**
 * ChatPanel Component
 * Right panel for AI Chat with message display and input
 * Shows conversation messages and provides input interface
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, Trash2, Bot, Trash } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import MCPToolSelector from './MCPToolSelector';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, type ModelConfig } from '@/lib/modelConfig';
import type { MCPConfig } from '@/lib/mcpConfig';

export interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
  isCleared?: boolean;
  mcpExecutionSteps?: any[]; // MCP execution steps for this message
}

interface ChatPanelProps {
  conversationId: string | null;
  messagesMap: Map<string, Message[]>;
  onMessagesMapChange: (messagesMap: Map<string, Message[]>) => void;
  onMessagesChange?: (messages: Message[]) => void;
}

const ChatPanel = ({ 
  conversationId, 
  messagesMap,
  onMessagesMapChange,
  onMessagesChange 
}: ChatPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [enabledMCPTools, setEnabledMCPTools] = useState<MCPConfig[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.component('ChatPanel', 'mounted', { 
      conversationId,
      messagesInConversation: conversationId ? (messagesMap.get(conversationId)?.length || 0) : 0,
    });
  }, [conversationId]);

  // Load available models on mount
  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      logger.info('Loading available models for selection', undefined, 'ChatPanel');
      
      try {
        const configList = await loadModelConfigs();
        const enabledModels = configList.models.filter(m => m.isEnabled !== false);
        
        logger.info('Models loaded for selector', {
          totalModels: configList.models.length,
          enabledModels: enabledModels.length,
        }, 'ChatPanel');
        
        setAvailableModels(enabledModels);
        
        // Set default model as selected
        const defaultModel = await getDefaultModel();
        if (defaultModel) {
          setSelectedModel(defaultModel);
          logger.info('Default model selected', {
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          }, 'ChatPanel');
        } else if (enabledModels.length > 0) {
          setSelectedModel(enabledModels[0]);
          logger.info('No default model, selected first enabled model', {
            modelId: enabledModels[0].id,
            modelName: enabledModels[0].name,
          }, 'ChatPanel');
        } else {
          logger.warn('No enabled models available', undefined, 'ChatPanel');
        }
      } catch (error) {
        logger.error('Failed to load models for selector', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'ChatPanel');
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    loadModels();
  }, []);

  // Get messages for current conversation
  const messages = conversationId ? (messagesMap.get(conversationId) || []) : [];

  // Initialize with welcome message when conversation changes
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      const welcomeMsg: Message = {
        id: `welcome-${conversationId}`,
        role: 'assistant',
        content: dict.chat.welcomeMessage,
        timestamp: new Date(),
      };
      const newMap = new Map(messagesMap);
      newMap.set(conversationId, [welcomeMsg]);
      onMessagesMapChange(newMap);
      logger.debug('Welcome message initialized', { conversationId }, 'ChatPanel');
    }
  }, [conversationId, messages.length, dict.chat.welcomeMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Notify parent of message changes
  // Use a ref to track previous messages length to avoid infinite loops
  const prevMessagesLengthRef = useRef<number>(0);
  
  useEffect(() => {
    // Only notify parent if messages actually changed (not on initial render or same content)
    if (onMessagesChange && messages.length !== prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = messages.length;
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) {
      logger.debug('Message send blocked', { 
        hasContent: !!content.trim(), 
        isLoading 
      }, 'ChatPanel');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    if (!conversationId) {
      logger.error('No active conversation', undefined, 'ChatPanel');
      return;
    }

    // Add user message to the conversation immediately so it's visible
    const newMapForUser = new Map(messagesMap);
    const currentMessages = newMapForUser.get(conversationId) || [];
    const messagesWithUser = [...currentMessages, userMessage];
    newMapForUser.set(conversationId, messagesWithUser);
    
    logger.info('User message added to conversation', {
      messageId: userMessage.id,
      conversationId,
      messageCountBefore: currentMessages.length,
      messageCountAfter: messagesWithUser.length,
      userMessagesCount: messagesWithUser.filter(m => m.role === 'user').length,
      content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
    }, 'ChatPanel');
    
    onMessagesMapChange(newMapForUser);
    
    logger.debug('MessagesMap updated with user message', {
      conversationId,
      mapSize: newMapForUser.size,
      messagesInConversation: newMapForUser.get(conversationId)?.length || 0,
    }, 'ChatPanel');
    
    setIsLoading(true);
    setStreamingContent('');
    
    // Store the updated map in a variable accessible to the async code below
    // This ensures we use the map that contains the user message
    let latestMessagesMap = newMapForUser;

    logger.info('Sending chat message', { 
      messageLength: content.length,
      conversationId 
    }, 'ChatPanel');

    try {
      // Sync model configurations to cookies before API call
      await syncModelConfigsToCookies();
      logger.debug('Model config synced to cookies', undefined, 'ChatPanel');
      
      // Prepare messages for API (without id, timestamp, and cleared messages)
      const apiMessages: ChatMessageType[] = messages
        .filter(msg => !msg.id.startsWith('welcome-') && !msg.isCleared)
        .map(({ role, content }) => ({ role, content }));
      
      apiMessages.push({ role: 'user', content });

      logger.debug('Prepared API messages', { 
        messageCount: apiMessages.length 
      }, 'ChatPanel');

      // Get appropriate API URL based on environment
      const apiUrl = await buildApiUrl('/api/chat');
      logger.debug('Using API URL for chat', { apiUrl }, 'ChatPanel');

      // Prepare request body with selected model ID and MCP tools
      const requestBody = {
        messages: apiMessages,
        modelId: selectedModel?.id || null,
        mcpEnabled: mcpEnabled && enabledMCPTools.length > 0,
        mcpTools: mcpEnabled ? enabledMCPTools.map(t => ({
          id: t.id,
          name: t.name,
          command: t.command,
          args: t.args,
          env: t.env || {},  // Include environment variables
        })) : [],
      };

      logger.info('Sending chat request with model selection and MCP tools', {
        modelId: selectedModel?.id || 'default',
        modelName: selectedModel?.name || 'default',
        messageCount: apiMessages.length,
        mcpEnabled: mcpEnabled && enabledMCPTools.length > 0,
        mcpToolCount: enabledMCPTools.length,
        mcpMasterEnabled: mcpEnabled,
        enabledToolsCount: enabledMCPTools.length,
        toolDetails: enabledMCPTools.map(t => ({ name: t.name, id: t.id })),
      }, 'ChatPanel');

      // Debug: Log the actual request body being sent
      logger.debug('Request body to be sent', {
        requestBody: JSON.stringify(requestBody),
        requestBodyKeys: Object.keys(requestBody),
        mcpEnabledInBody: requestBody.mcpEnabled,
        mcpToolsInBody: requestBody.mcpTools,
      }, 'ChatPanel');

      // Call streaming API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          errorData = await response.json();
        } catch (parseError) {
          logger.warn('Failed to parse error response', {
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          }, 'ChatPanel');
        }
        
        logger.error('API request failed', { 
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        }, 'ChatPanel');
        
        const errorMessage = errorData.details || errorData.error || `Failed to get response (${response.status} ${response.statusText})`;
        throw new Error(errorMessage);
      }

      if (!response.body) {
        logger.error('Response body is empty', undefined, 'ChatPanel');
        throw new Error('Response body is empty');
      }

      logger.info('Starting to process streaming response', {
        conversationId,
        hasResponseBody: !!response.body,
        responseStatus: response.status,
        contentType: response.headers.get('content-type'),
        currentMessageCount: messages.length,
        messagesIncludeUserMessage: messages.some(m => m.role === 'user'),
      }, 'ChatPanel');

      // Process streaming response with enhanced error handling
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      let chunkCount = 0;
      let parseErrorCount = 0;
      let emptyChunkCount = 0;
      let lastProgressLog = Date.now();
      const progressLogInterval = 3000; // Log progress every 3 seconds
      const maxParseErrors = 10; // Maximum allowed parse errors before failing
      const streamStartTime = Date.now();
      const mcpSteps: any[] = []; // Store MCP execution steps
      
      logger.debug('Stream reader initialized', {
        conversationId,
        streamStartTime,
      }, 'ChatPanel');

      try {
        while (true) {
          let readResult;
          
          try {
            readResult = await reader.read();
          } catch (readError) {
            logger.error('Failed to read from stream', {
              error: readError instanceof Error ? readError.message : 'Unknown error',
              chunkCount,
              contentLength: assistantContent.length,
            }, 'ChatPanel');
            throw readError;
          }

          const { done, value } = readResult;

          if (done) {
            logger.success('Stream completed successfully', { 
              totalLength: assistantContent.length,
              chunkCount,
              emptyChunkCount,
              parseErrorCount,
              duration: `${Date.now() - streamStartTime}ms`,
            }, 'ChatPanel');
            break;
          }

          // Validate chunk
          if (!value || value.length === 0) {
            emptyChunkCount++;
            logger.warn('Received empty chunk from stream', {
              chunkIndex: chunkCount,
              emptyChunkCount,
            }, 'ChatPanel');
            continue;
          }

          chunkCount++;
          
          // Log first chunk received for debugging
          if (chunkCount === 1) {
            logger.info('First stream chunk received', {
              chunkSize: value.length,
              conversationId,
              timeSinceStart: `${Date.now() - streamStartTime}ms`,
            }, 'ChatPanel');
          }
          
          try {
            buffer += decoder.decode(value, { stream: true });
          } catch (decodeError) {
            logger.error('Failed to decode chunk', {
              error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
              chunkIndex: chunkCount,
              chunkSize: value.length,
            }, 'ChatPanel');
            continue; // Skip this chunk but continue processing
          }

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
                
                // Handle MCP-specific events
                if (data.type === 'mcp_reasoning') {
                  logger.info('MCP reasoning received', {
                    reasoning: data.reasoning,
                  }, 'ChatPanel');
                  mcpSteps.push({
                    type: 'reasoning',
                    reasoning: data.reasoning,
                    timestamp: new Date(),
                  });
                } else if (data.type === 'mcp_tool_call') {
                  logger.info('MCP tool call started', {
                    toolName: data.tool_name,
                    parameters: data.parameters,
                  }, 'ChatPanel');
                  mcpSteps.push({
                    type: 'tool_call',
                    toolName: data.tool_name,
                    parameters: data.parameters,
                    status: data.status || 'running',
                    timestamp: new Date(),
                  });
                } else if (data.type === 'mcp_tool_result') {
                  logger.info('MCP tool result received', {
                    toolName: data.tool_name,
                    status: data.status,
                  }, 'ChatPanel');
                  mcpSteps.push({
                    type: 'tool_result',
                    toolName: data.tool_name,
                    result: data.result,
                    status: data.status,
                    error: data.error,
                    timestamp: new Date(),
                  });
                } else if (data.type === 'mcp_final_answer') {
                  logger.info('MCP generating final answer', undefined, 'ChatPanel');
                  mcpSteps.push({
                    type: 'final_answer',
                    timestamp: new Date(),
                  });
                }
                
                // Handle regular chat content
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  const wasEmpty = assistantContent.length === 0;
                  assistantContent += chunk;
                  
                  // Log first content received
                  if (wasEmpty && assistantContent.length > 0) {
                    logger.info('First content chunk received and displaying', {
                      firstChunkLength: chunk.length,
                      timeSinceStreamStart: `${Date.now() - streamStartTime}ms`,
                      conversationId,
                      currentMessagesVisible: messages.length,
                      userMessagePresent: messages.some(m => m.role === 'user'),
                      hasMCPSteps: mcpSteps.length > 0,
                    }, 'ChatPanel');
                  }
                  
                  // Use flushSync to ensure immediate rendering of streaming content
                  flushSync(() => {
                    setStreamingContent(assistantContent);
                  });
                  
                  // Log streaming update periodically
                  if (chunkCount % 10 === 0) {
                    logger.debug('Streaming content update', {
                      contentLength: assistantContent.length,
                      chunkNumber: chunkCount,
                      messagesInView: messages.length,
                      mcpStepsCount: mcpSteps.length,
                    }, 'ChatPanel');
                  }
                  
                  // Log progress periodically
                  const now = Date.now();
                  if (now - lastProgressLog >= progressLogInterval) {
                    logger.debug('Stream content accumulation progress', {
                      contentLength: assistantContent.length,
                      chunksProcessed: chunkCount,
                      parseErrors: parseErrorCount,
                      elapsed: `${now - streamStartTime}ms`,
                      averageChunkSize: Math.round(assistantContent.length / chunkCount),
                      mcpStepsCount: mcpSteps.length,
                    }, 'ChatPanel');
                    lastProgressLog = now;
                  }
                } else if (data.choices?.[0]?.finish_reason) {
                  logger.debug('Stream finished', {
                    finishReason: data.choices[0].finish_reason,
                    contentLength: assistantContent.length,
                    mcpStepsCount: mcpSteps.length,
                  }, 'ChatPanel');
                }
              } catch (parseError) {
                parseErrorCount++;
                logger.warn('Failed to parse SSE chunk', {
                  error: parseError instanceof Error ? parseError.message : 'Unknown error',
                  linePreview: trimmedLine.substring(0, 100),
                  parseErrorCount,
                  chunkIndex: chunkCount,
                }, 'ChatPanel');
                
                // Fail if too many parse errors
                if (parseErrorCount >= maxParseErrors) {
                  logger.error('Too many parse errors, aborting stream', {
                    parseErrorCount,
                    maxParseErrors,
                    chunkCount,
                  }, 'ChatPanel');
                  throw new Error(`Stream parsing failed: ${parseErrorCount} errors exceeded maximum of ${maxParseErrors}`);
                }
              }
            }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
          logger.debug('Processing remaining buffer content', {
            bufferLength: buffer.length,
            bufferPreview: buffer.substring(0, 100),
          }, 'ChatPanel');
        }
      } finally {
        try {
          reader.releaseLock();
          logger.debug('Stream reader released', {
            chunkCount,
            parseErrorCount,
          }, 'ChatPanel');
        } catch (releaseError) {
          logger.warn('Failed to release reader', {
            error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
          }, 'ChatPanel');
        }
      }

      // Add complete assistant message
      if (assistantContent && conversationId) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
          mcpExecutionSteps: mcpSteps.length > 0 ? mcpSteps : undefined,
        };

        // CRITICAL FIX: Use latestMessagesMap which contains the user message
        // The original 'messagesMap' prop is stale and doesn't include the user message
        const newMapForAssistant = new Map(latestMessagesMap);
        const currentMessagesInMap = newMapForAssistant.get(conversationId) || [];
        const updatedMessages = [...currentMessagesInMap, assistantMessage];
        newMapForAssistant.set(conversationId, updatedMessages);
        
        logger.debug('Adding assistant message to conversation', {
          conversationId,
          assistantContentLength: assistantContent.length,
          messagesBeforeAdd: currentMessagesInMap.length,
          messagesAfterAdd: updatedMessages.length,
          userMessagesInConversation: currentMessagesInMap.filter(m => m.role === 'user').length,
          assistantMessagesInConversation: currentMessagesInMap.filter(m => m.role === 'assistant').length,
        }, 'ChatPanel');
        
        // Update latestMessagesMap for potential error handling
        latestMessagesMap = newMapForAssistant;
        
        onMessagesMapChange(newMapForAssistant);
        
        logger.success('Chat response completed and added', { 
          contentLength: assistantContent.length,
          conversationId,
          totalMessagesNow: updatedMessages.length,
          userMessagesCount: updatedMessages.filter(m => m.role === 'user').length,
          assistantMessagesCount: updatedMessages.filter(m => m.role === 'assistant').length,
          lastUserMessage: updatedMessages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 50),
          mcpStepsCount: mcpSteps.length,
          usedMCP: mcpSteps.length > 0,
        }, 'ChatPanel');
      }

      setStreamingContent('');

    } catch (error) {
      logger.error('Failed to send chat message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        conversationId,
      }, 'ChatPanel');

      if (conversationId) {
        // Provide more informative error message to user
        let userFriendlyError = dict.chat.errorMessage;
        
        if (error instanceof Error) {
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('failed to connect') || errorMsg.includes('fetch failed')) {
            userFriendlyError = 'Unable to connect to the AI service. Please check your network connection and API configuration.';
          } else if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
            userFriendlyError = 'The request timed out. Please try again or check your network connection.';
          } else if (errorMsg.includes('api url') || errorMsg.includes('accessible')) {
            userFriendlyError = error.message; // Use the detailed error message from backend
          }
        }
        
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: userFriendlyError,
          timestamp: new Date(),
        };

        // Use latestMessagesMap to include the user message
        const newMapForError = new Map(latestMessagesMap);
        const currentMessages = newMapForError.get(conversationId) || [];
        const messagesWithError = [...currentMessages, errorMessage];
        newMapForError.set(conversationId, messagesWithError);
        
        logger.info('Error message added to conversation', {
          conversationId,
          messageCountBefore: currentMessages.length,
          messageCountAfter: messagesWithError.length,
          userMessagesInConversation: currentMessages.filter(m => m.role === 'user').length,
          errorPreview: userFriendlyError.substring(0, 100),
        }, 'ChatPanel');
        
        onMessagesMapChange(newMapForError);
      }
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (!conversationId) {
      logger.error('No active conversation to clear', undefined, 'ChatPanel');
      return;
    }

    logger.info('Clearing chat context', { 
      currentMessageCount: messages.length,
      conversationId 
    }, 'ChatPanel');
    
    // Add a cleared indicator message
    const clearedMessage: Message = {
      id: `cleared-${Date.now()}`,
      role: 'assistant',
      content: dict.chat.clearedMessage,
      timestamp: new Date(),
      isCleared: true,
    };
    
    // Keep all messages (including history) but add cleared indicator
    const newMapForClear = new Map(messagesMap);
    const currentMessages = newMapForClear.get(conversationId) || [];
    newMapForClear.set(conversationId, [...currentMessages, clearedMessage]);
    onMessagesMapChange(newMapForClear);
    
    setStreamingContent('');
    
    logger.debug('Chat context cleared', { 
      newMessageCount: messages.length + 1 
    }, 'ChatPanel');
  };

  const handleClearAll = () => {
    if (!conversationId) {
      logger.error('No active conversation to clear all', undefined, 'ChatPanel');
      return;
    }

    logger.info('Clearing all chat messages', { 
      currentMessageCount: messages.length,
      conversationId 
    }, 'ChatPanel');
    
    // Reset to only the welcome message
    const welcomeMsg: Message = {
      id: `welcome-${conversationId}`,
      role: 'assistant',
      content: dict.chat.welcomeMessage,
      timestamp: new Date(),
    };
    
    const newMapForClearAll = new Map(messagesMap);
    newMapForClearAll.set(conversationId, [welcomeMsg]);
    onMessagesMapChange(newMapForClearAll);
    
    setStreamingContent('');
    
    logger.info('All messages cleared, reset to welcome message', { 
      previousMessageCount: messages.length,
      conversationId 
    }, 'ChatPanel');
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    const model = availableModels.find(m => m.id === modelId);
    
    if (model) {
      setSelectedModel(model);
      logger.info('Model selection changed', {
        modelId: model.id,
        modelName: model.name,
        displayName: model.name,
      }, 'ChatPanel');
    } else {
      logger.warn('Selected model not found', { modelId }, 'ChatPanel');
    }
  };

  const handleMCPStateChange = (enabled: boolean, tools: MCPConfig[]) => {
    logger.info('MCP state change callback triggered', {
      enabled,
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
      toolDetails: tools.map(t => ({ 
        name: t.name, 
        id: t.id, 
        isEnabled: t.isEnabled,
        command: t.command 
      })),
    }, 'ChatPanel');
    
    setMcpEnabled(enabled);
    setEnabledMCPTools(tools);
    
    logger.info('MCP state updated in ChatPanel', {
      mcpEnabled: enabled,
      enabledMCPToolsCount: tools.length,
    }, 'ChatPanel');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm font-medium">Start a conversation...</p>
              <p className="text-xs mt-1 text-muted-foreground/70">Ask me anything!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role as 'user' | 'assistant'}
                content={message.content}
                timestamp={message.timestamp}
                mcpExecutionSteps={message.mcpExecutionSteps}
              />
            ))}

            {/* Streaming message with typing indicator */}
            {streamingContent && (
              <div className="relative">
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                />
                {/* Blinking cursor to indicate active streaming */}
                <div className="inline-block w-1.5 h-4 bg-purple-500 ml-1 animate-pulse rounded-sm" />
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && !streamingContent && (
              <div className="flex items-center gap-2.5 text-muted-foreground ml-14 mb-4">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                <span className="text-sm">{dict.chat.thinking}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Model Selector, MCP Tools, and Clear Buttons */}
      <div className="px-6 py-3 border-t border-border/50 bg-background/50 flex items-center justify-between gap-4">
        {/* Model Selector and MCP Tools - Left */}
        <div className="flex items-center gap-3">
          <label htmlFor="model-selector" className="text-sm text-muted-foreground font-medium whitespace-nowrap">
            {dict.chat.modelSelector}:
          </label>
          <select
            id="model-selector"
            value={selectedModel?.id || ''}
            onChange={handleModelChange}
            disabled={isLoadingModels || availableModels.length === 0 || isLoading}
            className="px-3 py-1.5 text-sm bg-background border border-input rounded-md hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Select AI model"
          >
            {availableModels.length === 0 ? (
              <option value="">{dict.chat.noModelsConfigured}</option>
            ) : (
              availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            )}
          </select>

          {/* MCP Tool Selector */}
          <MCPToolSelector
            disabled={isLoading}
            onMCPStateChange={handleMCPStateChange}
          />
        </div>

        {/* Clear Buttons - Right */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            disabled={messages.length <= 1 || isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-border/50"
            aria-label="Clear chat context"
            tabIndex={0}
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">{dict.chat.clearButton}</span>
          </button>
          
          <button
            onClick={handleClearAll}
            disabled={messages.length <= 1 || isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-destructive/50"
            aria-label="Clear all messages"
            tabIndex={0}
          >
            <Trash className="w-4 h-4" />
            <span className="font-medium">{dict.chat.clearAllButton}</span>
          </button>
        </div>
      </div>

      {/* Input Area */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isLoading}
        placeholder={dict.chat.inputPlaceholder}
      />
    </div>
  );
};

export default ChatPanel;

