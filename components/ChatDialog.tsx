/**
 * ChatDialog Component
 * Main chat interface with message history and streaming support
 * Displays above the floating chat button
 */

'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Loader2, Trash2, Trash, Bot } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import AgentStatusPanel, { type AgentStatus, type TodoItem } from './AgentStatusPanel';
import { logger } from '@/lib/logger';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, type ModelConfig } from '@/lib/modelConfig';

export interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  welcomeMessage?: string;
  getDocumentContent?: () => string;
  updateDocumentContent?: (content: string) => void;
}

interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
}

const ChatDialog = forwardRef<HTMLDivElement, ChatDialogProps>(({ 
  isOpen, 
  onClose, 
  title = 'AI Assistant',
  welcomeMessage = 'Hello! I\'m your AI assistant. How can I help you today?',
  getDocumentContent,
  updateDocumentContent,
}, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [viewportHeight, setViewportHeight] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Agent mode state
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // Track viewport height for responsive dialog sizing
  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.innerHeight;
      setViewportHeight(height);
      logger.debug('Viewport height updated', { 
        height, 
        calculatedChatHeight: Math.floor(height * 0.8) 
      }, 'ChatDialog');
    };

    // Initialize viewport height
    updateViewportHeight();
    logger.info('Chat dialog viewport tracking initialized', { 
      initialHeight: window.innerHeight 
    }, 'ChatDialog');

    // Add resize listener with debouncing for performance
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateViewportHeight();
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      logger.debug('Chat dialog viewport tracking cleaned up', undefined, 'ChatDialog');
    };
  }, []);

  // Load available models on mount
  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      logger.info('Loading available models for selection', undefined, 'ChatDialog');
      
      try {
        const configList = await loadModelConfigs();
        const enabledModels = configList.models.filter(m => m.isEnabled !== false);
        
        logger.info('Models loaded for selector', {
          totalModels: configList.models.length,
          enabledModels: enabledModels.length,
        }, 'ChatDialog');
        
        setAvailableModels(enabledModels);
        
        // Set default model as selected
        const defaultModel = await getDefaultModel();
        if (defaultModel) {
          setSelectedModel(defaultModel);
          logger.info('Default model selected', {
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          }, 'ChatDialog');
        } else if (enabledModels.length > 0) {
          setSelectedModel(enabledModels[0]);
          logger.info('No default model, selected first enabled model', {
            modelId: enabledModels[0].id,
            modelName: enabledModels[0].name,
          }, 'ChatDialog');
        } else {
          logger.warn('No enabled models available', undefined, 'ChatDialog');
        }
      } catch (error) {
        logger.error('Failed to load models for selector', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'ChatDialog');
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    loadModels();
  }, []);

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
      };
      setMessages([welcomeMsg]);
      logger.component('ChatDialog', 'initialized with welcome message');
    }
  }, [isOpen, messages.length, welcomeMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  const handleAgentExecution = async (command: string) => {
    logger.info('Starting new agent execution', { 
      command: command.substring(0, 100),
      hasExistingStatus: !!agentStatus,
      existingPhase: agentStatus?.phase,
    }, 'ChatDialog');
    
    // Clear previous status and start new execution
    // Previous execution record will be replaced by new one
    setIsAgentRunning(true);
    setAgentStatus({
      phase: 'planning',
      message: 'Initializing agent...',
    });
    
    logger.debug('Agent status reset for new execution', {
      previousPhase: agentStatus?.phase,
      note: 'Previous execution record will be replaced',
    }, 'ChatDialog');

    try {
      // Get appropriate API URL
      const apiUrl = await buildApiUrl('/api/agent-validation');
      logger.debug('Using agent validation API URL', { apiUrl }, 'ChatDialog');

      // Get document content from parent
      const documentContent = getDocumentContent ? getDocumentContent() : "";
      
      if (!documentContent || documentContent.trim().length === 0) {
        throw new Error('No document loaded. Please upload a document first.');
      }
      
      logger.debug('Got document content for agent', { contentLength: documentContent.length }, 'ChatDialog');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          content: documentContent,
          language: 'en', // TODO: Get from language context
          modelId: selectedModel?.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent validation failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          logger.info('Agent execution stream completed', undefined, 'ChatDialog');
          break;
        }

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
              
              logger.debug('Agent event received', { type: data.type }, 'ChatDialog');

              // Update agent status based on event type
              if (data.type === 'status') {
                logger.debug('[Agent Event] Status update', { 
                  phase: data.phase, 
                  message: data.message?.substring(0, 50),
                  currentStep: data.current_step,
                  totalSteps: data.total_steps,
                }, 'ChatDialog');
                
                setAgentStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    phase: data.phase,
                    message: data.message,
                    currentStep: data.current_step,
                    totalSteps: data.total_steps,
                    stepDescription: data.step_description,
                  };
                });
              } else if (data.type === 'todo_list') {
                logger.info('[Agent Event] TODO list received', { 
                  todoCount: data.todo_list?.length || 0,
                  message: data.message,
                }, 'ChatDialog');
                
                setAgentStatus(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    todoList: data.todo_list,
                    message: data.message,
                  };
                });
              } else if (data.type === 'tool_result') {
                logger.info('[Agent Event] Tool result', { 
                  step: data.step,
                  tool: data.tool,
                  success: data.result?.success || data.result?.found,
                  message: data.result?.message?.substring(0, 100),
                }, 'ChatDialog');
                // Tool result is now handled by todo_item_update event
              } else if (data.type === 'todo_item_update') {
                logger.info('[Agent Event] TODO item status update', { 
                  todo_id: data.todo_id,
                  status: data.status,
                  step: data.step,
                  has_result: !!data.result,
                  has_error: !!data.error,
                }, 'ChatDialog');
                
                // Update specific todo item status
                setAgentStatus(prev => {
                  if (!prev || !prev.todoList) return prev;
                  const updatedList = [...prev.todoList];
                  const todoIndex = updatedList.findIndex(t => t.id === data.todo_id);
                  
                  if (todoIndex >= 0) {
                    logger.debug('[Agent Event] Updating TODO item in list', {
                      todoIndex,
                      todo_id: data.todo_id,
                      old_status: updatedList[todoIndex].status,
                      new_status: data.status,
                    }, 'ChatDialog');
                    
                    updatedList[todoIndex] = {
                      ...updatedList[todoIndex],
                      status: data.status as 'pending' | 'in_progress' | 'completed' | 'failed',
                      result: data.result || updatedList[todoIndex].result,
                      error: data.error || updatedList[todoIndex].error,
                    };
                  } else {
                    logger.warn('[Agent Event] TODO item not found in list', {
                      todo_id: data.todo_id,
                      available_ids: updatedList.map(t => t.id),
                    }, 'ChatDialog');
                  }
                  
                  return {
                    ...prev,
                    todoList: updatedList,
                  };
                });
              } else if (data.type === 'document_update') {
                logger.info('[Agent Event] Document update received', { 
                  step: data.step,
                  contentLength: data.updated_content?.length || 0,
                  message: data.message,
                  hasUpdateHandler: !!updateDocumentContent,
                  hasContent: !!data.updated_content,
                }, 'ChatDialog');
                
                // Update document in editor
                if (updateDocumentContent && data.updated_content) {
                  try {
                    logger.debug('[Agent Event] Calling updateDocumentContent', {
                      contentLengthBefore: data.updated_content.length,
                      contentPreview: data.updated_content.substring(0, 100),
                    }, 'ChatDialog');
                    
                    updateDocumentContent(data.updated_content);
                    
                    logger.success('[Agent Event] Document updated successfully in editor', { 
                      step: data.step,
                      contentLength: data.updated_content.length,
                    }, 'ChatDialog');
                  } catch (updateError) {
                    logger.error('[Agent Event] Failed to update document', {
                      error: updateError instanceof Error ? updateError.message : 'Unknown error',
                      step: data.step,
                    }, 'ChatDialog');
                  }
                } else {
                  logger.error('[Agent Event] Cannot update document - missing handler or content', {
                    hasHandler: !!updateDocumentContent,
                    hasContent: !!data.updated_content,
                    contentLength: data.updated_content?.length || 0,
                  }, 'ChatDialog');
                }
              } else if (data.type === 'complete') {
                logger.success('[Agent Event] Agent workflow completed', {
                  message: data.message,
                  hasSummary: !!data.summary,
                  summaryLength: data.summary?.length || 0,
                }, 'ChatDialog');
                
                const completedStatus: AgentStatus = {
                  phase: 'complete',
                  message: data.message,
                  summary: data.summary,
                  todoList: agentStatus?.todoList,
                };
                
                setAgentStatus(completedStatus);
                
                logger.info('Agent execution completed, status will be collapsed', {
                  hasTodoList: !!completedStatus.todoList,
                  todoCount: completedStatus.todoList?.length || 0,
                  hasSummary: !!completedStatus.summary,
                }, 'ChatDialog');
                
                // Add completion message
                const completionMsg: Message = {
                  id: `agent-complete-${Date.now()}`,
                  role: 'assistant',
                  content: `✓ Task completed!\n\n${data.summary}`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, completionMsg]);
              } else if (data.type === 'error') {
                logger.error('[Agent Event] Agent error received', {
                  message: data.message,
                  errorDetails: data.error_details || data.error,
                }, 'ChatDialog');
                
                setAgentStatus({
                  phase: 'error',
                  message: data.message,
                  error: data.error_details || data.message,
                });
                
                // Add error message
                const errorMsg: Message = {
                  id: `agent-error-${Date.now()}`,
                  role: 'assistant',
                  content: `✗ Error: ${data.message}`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, errorMsg]);
              } else {
                logger.debug('[Agent Event] Other event type', { 
                  type: data.type,
                }, 'ChatDialog');
              }
              
            } catch (parseError) {
              logger.warn('Failed to parse agent SSE chunk', {
                error: parseError instanceof Error ? parseError.message : 'Unknown error',
              }, 'ChatDialog');
            }
          }
        }
      }

    } catch (error) {
      logger.error('Agent execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'ChatDialog');

      const errorStatus: AgentStatus = {
        phase: 'error',
        message: 'Agent execution failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        todoList: agentStatus?.todoList, // Preserve existing TODO list
      };
      
      setAgentStatus(errorStatus);
      
      logger.info('Agent execution failed, error status will be collapsed', {
        phase: 'error',
        hasTodoList: !!errorStatus.todoList,
        todoCount: errorStatus.todoList?.length || 0,
      }, 'ChatDialog');

      const errorMsg: Message = {
        id: `agent-error-${Date.now()}`,
        role: 'assistant',
        content: `✗ Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAgentRunning(false);
      
      logger.info('Agent execution cleanup completed', {
        hasStatus: !!agentStatus,
        currentPhase: agentStatus?.phase,
        note: 'Execution record kept in collapsed state for user reference',
      }, 'ChatDialog');
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading || isAgentRunning) {
      logger.debug('Message send blocked', { 
        hasContent: !!content.trim(), 
        isLoading,
        isAgentRunning,
      }, 'ChatDialog');
      return;
    }
    
    // If agent mode is enabled, use agent execution
    if (isAgentMode) {
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      
      await handleAgentExecution(content);
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Add user message immediately so it's visible
    setMessages((prev) => [...prev, userMessage]);
    
    logger.info('User message added to chat', {
      messageId: userMessage.id,
      messageCount: messages.length + 1,
      content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
    }, 'ChatDialog');
    
    setIsLoading(true);
    setStreamingContent('');

    logger.info('Sending chat message to API', { messageLength: content.length }, 'ChatDialog');

    try {
      // Sync model configurations to cookies before API call
      await syncModelConfigsToCookies();
      
      // Prepare messages for API (without id and timestamp)
      const apiMessages: ChatMessageType[] = messages
        .filter(msg => msg.id !== 'welcome') // Exclude welcome message
        .map(({ role, content }) => ({ role, content }));
      
      apiMessages.push({ role: 'user', content });

      // Get appropriate API URL based on environment
      const apiUrl = await buildApiUrl('/api/chat');
      logger.debug('Using API URL for chat', { apiUrl }, 'ChatDialog');

      // Prepare request body with selected model ID
      const requestBody = {
        messages: apiMessages,
        modelId: selectedModel?.id || null,
      };

      logger.info('Sending chat request with model selection', {
        modelId: selectedModel?.id || 'default',
        modelName: selectedModel?.name || 'default',
        messageCount: apiMessages.length,
      }, 'ChatDialog');

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
          }, 'ChatDialog');
        }
        
        logger.error('API request failed', { 
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        }, 'ChatDialog');
        
        const errorMessage = errorData.details || errorData.error || `Failed to get response (${response.status} ${response.statusText})`;
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      logger.info('Starting to process streaming response', {
        hasResponseBody: !!response.body,
        messageCount: messages.length,
        responseStatus: response.status,
        contentType: response.headers.get('content-type'),
      }, 'ChatDialog');

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
      
      logger.debug('Stream reader initialized', {
        messageCount: messages.length,
        streamStartTime,
      }, 'ChatDialog');

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
            }, 'ChatDialog');
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
            }, 'ChatDialog');
            break;
          }

          // Validate chunk
          if (!value || value.length === 0) {
            emptyChunkCount++;
            logger.warn('Received empty chunk from stream', {
              chunkIndex: chunkCount,
              emptyChunkCount,
            }, 'ChatDialog');
            continue;
          }

          chunkCount++;
          
          // Log first chunk received for debugging
          if (chunkCount === 1) {
            logger.info('First stream chunk received', {
              chunkSize: value.length,
              timeSinceStart: `${Date.now() - streamStartTime}ms`,
            }, 'ChatDialog');
          }
          
          try {
            buffer += decoder.decode(value, { stream: true });
          } catch (decodeError) {
            logger.error('Failed to decode chunk', {
              error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
              chunkIndex: chunkCount,
              chunkSize: value.length,
            }, 'ChatDialog');
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
                
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  const wasEmpty = assistantContent.length === 0;
                  assistantContent += chunk;
                  
                  // Log first content received
                  if (wasEmpty && assistantContent.length > 0) {
                    logger.info('First content chunk received and displaying', {
                      firstChunkLength: chunk.length,
                      timeSinceStreamStart: `${Date.now() - streamStartTime}ms`,
                      currentMessagesVisible: messages.length,
                      userMessagePresent: messages.some(m => m.role === 'user'),
                    }, 'ChatDialog');
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
                    }, 'ChatDialog');
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
                    }, 'ChatDialog');
                    lastProgressLog = now;
                  }
                } else if (data.choices?.[0]?.finish_reason) {
                  logger.debug('Stream finished', {
                    finishReason: data.choices[0].finish_reason,
                    contentLength: assistantContent.length,
                  }, 'ChatDialog');
                }
              } catch (parseError) {
                parseErrorCount++;
                logger.warn('Failed to parse SSE chunk', {
                  error: parseError instanceof Error ? parseError.message : 'Unknown error',
                  linePreview: trimmedLine.substring(0, 100),
                  parseErrorCount,
                  chunkIndex: chunkCount,
                }, 'ChatDialog');
                
                // Fail if too many parse errors
                if (parseErrorCount >= maxParseErrors) {
                  logger.error('Too many parse errors, aborting stream', {
                    parseErrorCount,
                    maxParseErrors,
                    chunkCount,
                  }, 'ChatDialog');
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
          }, 'ChatDialog');
        }
      } finally {
        try {
          reader.releaseLock();
          logger.debug('Stream reader released', {
            chunkCount,
            parseErrorCount,
          }, 'ChatDialog');
        } catch (releaseError) {
          logger.warn('Failed to release reader', {
            error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
          }, 'ChatDialog');
        }
      }

      // Add complete assistant message
      if (assistantContent) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
        };

        // CRITICAL: Use functional update to ensure we have the latest messages
        // including the user message that was just added
        setMessages((prev) => {
          const updatedMessages = [...prev, assistantMessage];
          logger.success('Chat response completed and added', { 
            contentLength: assistantContent.length,
            totalMessagesNow: updatedMessages.length,
            userMessagesCount: updatedMessages.filter(m => m.role === 'user').length,
            lastUserMessage: updatedMessages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 50),
          }, 'ChatDialog');
          return updatedMessages;
        });
      }

      setStreamingContent('');

    } catch (error) {
      logger.error('Failed to send chat message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ChatDialog');

      // Provide more informative error message to user
      let userFriendlyError = 'Sorry, I encountered an error. Please try again.';
      
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

      setMessages((prev) => [...prev, errorMessage]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    logger.component('ChatDialog', 'closed');
    onClose();
  };

  const handleClearChat = () => {
    const currentMessageCount = messages.length;
    logger.info('Clearing chat context (adding cleared indicator)', { 
      messageCount: currentMessageCount,
    }, 'ChatDialog');
    
    // Add a cleared indicator message but keep history
    const clearedMessage: Message = {
      id: `cleared-${Date.now()}`,
      role: 'assistant',
      content: '✓ Chat cleared',
      timestamp: new Date(),
    };
    
    setMessages([...messages, clearedMessage]);
    setStreamingContent('');
    
    logger.debug('Chat context cleared', { 
      previousMessageCount: currentMessageCount,
      currentMessageCount: messages.length + 1 
    }, 'ChatDialog');
  };

  const handleClearAll = () => {
    const currentMessageCount = messages.length;
    logger.info('Clearing all chat messages', { 
      messageCount: currentMessageCount,
    }, 'ChatDialog');
    
    // Reset to only the welcome message
    const welcomeMsg: Message = {
      id: 'welcome',
      role: 'assistant',
      content: welcomeMessage,
      timestamp: new Date(),
    };
    
    setMessages([welcomeMsg]);
    setStreamingContent('');
    
    logger.info('All messages cleared, reset to welcome message', { 
      previousMessageCount: currentMessageCount,
      currentMessageCount: 1 
    }, 'ChatDialog');
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
      }, 'ChatDialog');
    } else {
      logger.warn('Selected model not found', { modelId }, 'ChatDialog');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  // Calculate chat dialog height as 80% of viewport height
  // Minimum height of 300px to ensure usability
  const calculatedHeight = viewportHeight > 0 
    ? Math.max(Math.floor(viewportHeight * 0.8), 300)
    : 720; // Default fallback height

  logger.debug('Chat dialog height calculated', {
    viewportHeight,
    calculatedHeight,
    percentage: '80%'
  }, 'ChatDialog');

  return (
    <div
      ref={ref}
      className="fixed bottom-24 right-6 w-[576px] bg-background border-2 border-border rounded-lg shadow-xl flex flex-col z-50 animate-slideUp"
      style={{ height: `${calculatedHeight}px` }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label={title}
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          aria-label="Close chat"
          tabIndex={0}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-1"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role as 'user' | 'assistant'}
            content={message.content}
            timestamp={message.timestamp}
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
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Model Selector and Clear Buttons */}
      <div className="px-6 py-3 border-t border-border/50 bg-background/50 flex items-center justify-between gap-4">
        {/* Model Selector - Left */}
        <div className="flex items-center gap-2">
          <label htmlFor="dialog-model-selector" className="text-sm text-muted-foreground font-medium whitespace-nowrap">
            Model:
          </label>
          <select
            id="dialog-model-selector"
            value={selectedModel?.id || ''}
            onChange={handleModelChange}
            disabled={isLoadingModels || availableModels.length === 0 || isLoading}
            className="px-3 py-1.5 text-sm bg-background border border-input rounded-md hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Select AI model"
          >
            {availableModels.length === 0 ? (
              <option value="">No models configured</option>
            ) : (
              availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            )}
          </select>
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
            <span className="font-medium">Clear</span>
          </button>
          
          <button
            onClick={handleClearAll}
            disabled={messages.length <= 1 || isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-destructive/50"
            aria-label="Clear all messages"
            tabIndex={0}
          >
            <Trash className="w-4 h-4" />
            <span className="font-medium">Clear All</span>
          </button>
        </div>
      </div>

      {/* Agent Mode Toggle */}
      <div className="px-6 py-3 border-t border-border/50 bg-background/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bot className="w-4 h-4 text-muted-foreground" />
          <label htmlFor="agent-mode-toggle" className="text-sm font-medium text-foreground cursor-pointer">
            Agent Mode
          </label>
          <button
            id="agent-mode-toggle"
            onClick={() => {
              setIsAgentMode(!isAgentMode);
              logger.info('Agent mode toggled', { enabled: !isAgentMode }, 'ChatDialog');
            }}
            disabled={isLoading || isAgentRunning}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isAgentMode ? 'bg-primary' : 'bg-muted'
            }`}
            role="switch"
            aria-checked={isAgentMode}
            aria-label="Toggle Agent Mode"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isAgentMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          {isAgentMode && (
            <span className="text-xs text-primary font-medium">Enabled</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isAgentMode 
            ? 'Agent will plan and execute document modifications' 
            : 'Normal chat mode'}
        </p>
      </div>

      {/* Agent Status Panel - Last Execution */}
      {isAgentMode && agentStatus && (
        <div className="px-6 pb-3 max-h-96 overflow-y-auto">
          <AgentStatusPanel 
            status={agentStatus} 
            isActive={isAgentRunning}
            defaultCollapsed={false}
          />
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isLoading || isAgentRunning}
        placeholder={isAgentMode 
          ? "Describe what you want to do with the document..." 
          : "Type your message..."}
      />
    </div>
  );
});

ChatDialog.displayName = 'ChatDialog';

export default ChatDialog;

