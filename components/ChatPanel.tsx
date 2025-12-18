/**
 * ChatPanel Component
 * Right panel for AI Chat with message display and input
 * Shows conversation messages and provides input interface
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, Trash2, Bot, Trash } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput, { type UploadedFile } from './ChatInput';
import ChatStopButton from './ChatStopButton';
import ErrorDialog, { type ErrorDialogData } from './ErrorDialog';
import MCPToolSelector from './MCPToolSelector';
import NetworkSearchToggle from './NetworkSearchToggle';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { ChatMessage as ChatMessageType, StreamErrorEvent, isStreamErrorEvent } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, getModelConfigsUpdatedEventName, type ModelConfig } from '@/lib/modelConfig';
import type { MCPConfig } from '@/lib/mcpConfig';
import type { Conversation } from './ConversationList';
import { getChatBotById } from '@/lib/chatBotConfig';

export interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
  isCleared?: boolean;
  mcpExecutionSteps?: any[]; // MCP execution steps for this message
  networkSearchExecutionSteps?: any[]; // Network search execution steps for this message
}

interface ChatPanelProps {
  conversationId: string | null;
  conversation: Conversation | null;
  messagesMap: Map<string, Message[]>;
  onMessagesMapChange: (messagesMap: Map<string, Message[]>) => void;
  onMessagesChange?: (messages: Message[]) => void;
}

const ChatPanel = ({ 
  conversationId,
  conversation,
  messagesMap,
  onMessagesMapChange,
  onMessagesChange 
}: ChatPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingMcpSteps, setStreamingMcpSteps] = useState<any[]>([]); // Real-time MCP steps during streaming
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [mcpEnabled, setMcpEnabled] = useState(false);
  const [enabledMCPTools, setEnabledMCPTools] = useState<MCPConfig[]>([]);
  const [networkSearchEnabled, setNetworkSearchEnabled] = useState(false);
  const [streamingNetworkSearchSteps, setStreamingNetworkSearchSteps] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogData, setErrorDialogData] = useState<ErrorDialogData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadModels = useCallback(async () => {
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
        setSelectedModel(null);
        logger.warn('No enabled models available', undefined, 'ChatPanel');
      }
    } catch (error) {
      logger.error('Failed to load models for selector', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'ChatPanel');
      setAvailableModels([]);
      setSelectedModel(null);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    logger.component('ChatPanel', 'mounted', { 
      conversationId,
      messagesInConversation: conversationId ? (messagesMap.get(conversationId)?.length || 0) : 0,
    });
    logger.debug('ChatPanel padding configuration', {
      containerPadding: 'p-2 (8px with chat-panel-container class and !important in CSS)',
      messagesAreaPadding: 'px-3 pt-3 pb-2 (12px/12px/8px with chat-panel-messages class and !important in CSS)',
      toolbarPadding: 'px-3 (12px)',
      inputPadding: 'px-3 py-4 (12px/16px)',
      note: 'Using CSS classes with !important to override global reset styles. Padding reduced to half size.',
    }, 'ChatPanel');
  }, [conversationId]);

  // Load available models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Listen for model configuration update events (from Settings) and refresh models
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const eventName = getModelConfigsUpdatedEventName();

    const handleModelsUpdated = (event: Event) => {
      logger.info('[ModelSelection] Model configurations updated event received, reloading models', {
        eventType: event.type,
        eventName,
      }, 'ChatPanel');
      loadModels();
    };

    window.addEventListener(eventName, handleModelsUpdated);
    logger.debug('[ModelSelection] Subscribed to model configuration updated events', { eventName }, 'ChatPanel');

    return () => {
      window.removeEventListener(eventName, handleModelsUpdated);
      logger.debug('[ModelSelection] Unsubscribed from model configuration updated events', { eventName }, 'ChatPanel');
    };
  }, [loadModels]);

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

  // Check if user is near bottom of scroll container
  const isNearBottom = useCallback((container: HTMLElement, threshold = 100): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= threshold;
  }, []);

  // Handle scroll events to detect user scrolling
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      // Clear any existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Mark that user is scrolling
      isUserScrollingRef.current = true;
      logger.debug('User scroll detected', {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        clientHeight: container.clientHeight,
      }, 'ChatPanel');

      // Check if user scrolled away from bottom
      const nearBottom = isNearBottom(container);
      if (!nearBottom) {
        setShouldAutoScroll(false);
        logger.debug('Auto-scroll disabled - user scrolled away from bottom', {
          distanceFromBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        }, 'ChatPanel');
      } else {
        // User scrolled back to bottom, re-enable auto-scroll
        setShouldAutoScroll(true);
        logger.debug('Auto-scroll re-enabled - user scrolled to bottom', undefined, 'ChatPanel');
      }

      // Reset user scrolling flag after a delay
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    logger.debug('Scroll event listener attached to messages container', undefined, 'ChatPanel');

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      logger.debug('Scroll event listener removed from messages container', undefined, 'ChatPanel');
    };
  }, [isNearBottom]);

  // Auto-scroll to bottom on new messages (only if shouldAutoScroll is true)
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current && !isUserScrollingRef.current) {
      logger.debug('Auto-scrolling to bottom', {
        messageCount: messages.length,
        hasStreamingContent: !!streamingContent,
      }, 'ChatPanel');
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (!shouldAutoScroll) {
      logger.debug('Auto-scroll skipped - user has scrolled away', {
        messageCount: messages.length,
        hasStreamingContent: !!streamingContent,
      }, 'ChatPanel');
    }
  }, [messages, streamingContent, shouldAutoScroll]);

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

  const handleSendMessage = async (content: string, fileContext?: UploadedFile) => {
    if (!content.trim() || isLoading) {
      logger.debug('Message send blocked', { 
        hasContent: !!content.trim(), 
        isLoading 
      }, 'ChatPanel');
      return;
    }

    // User message only shows the question, not the file content
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content, // Only show user's question
      timestamp: new Date(),
    };

    if (fileContext) {
      logger.info('File context will be included in API request', {
        filename: fileContext.filename,
        contentLength: fileContext.content.length,
      }, 'ChatPanel');
    }

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
      hasFileContext: !!fileContext,
      fileContextFilename: fileContext?.filename,
      fileContextLength: fileContext?.content.length,
      note: 'User message shows only question; file context sent separately to API'
    }, 'ChatPanel');
    
    onMessagesMapChange(newMapForUser);
    
    logger.debug('MessagesMap updated with user message', {
      conversationId,
      mapSize: newMapForUser.size,
      messagesInConversation: newMapForUser.get(conversationId)?.length || 0,
    }, 'ChatPanel');
    
    setIsLoading(true);
    setStreamingContent('');
    setStreamingMcpSteps([]); // Clear previous MCP steps when starting new request
    setStreamingNetworkSearchSteps([]); // Clear previous network search steps when starting new request
    setIsStopping(false); // Reset stopping state
    setCurrentSessionId(null); // Will be set when session_start event is received
    
    logger.debug('Initialized streaming state for new request', {
      conversationId,
      networkSearchEnabled,
    }, 'ChatPanel');
    
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
      
      // If file context exists, add it as a system message before the user's question
      if (fileContext) {
        apiMessages.push({
          role: 'system',
          content: `[Document Context from ${fileContext.filename}]\n\n${fileContext.content}\n\n---\n\nPlease answer the following question based on the document context above.`
        });
        logger.debug('Added file context as system message to API request', {
          filename: fileContext.filename,
          apiMessagesCount: apiMessages.length + 1
        }, 'ChatPanel');
      }
      
      // Add user's question
      apiMessages.push({ role: 'user', content });

      logger.debug('Prepared API messages', { 
        messageCount: apiMessages.length 
      }, 'ChatPanel');

      // Get appropriate API URL based on environment
      const apiUrl = await buildApiUrl('/api/chat');
      logger.debug('Using API URL for chat', { apiUrl }, 'ChatPanel');

      // Prepare system prompt and model based on conversation type
      let systemPrompt: string | undefined = undefined;
      let conversationModelId: string | null = selectedModel?.id || null;

      if (conversation?.type === 'chatbot' && conversation.metadata?.chatbotId) {
        try {
          const chatbot = await getChatBotById(conversation.metadata.chatbotId);
          if (chatbot) {
            systemPrompt = chatbot.systemPrompt;
            conversationModelId = chatbot.modelId;
            logger.info('Using chat bot configuration', {
              chatbotId: chatbot.id,
              chatbotName: chatbot.name,
              modelId: chatbot.modelId,
              hasSystemPrompt: !!systemPrompt,
            }, 'ChatPanel');
          } else {
            logger.warn('Chat bot not found, using default settings', {
              chatbotId: conversation.metadata.chatbotId,
            }, 'ChatPanel');
          }
        } catch (error) {
          logger.error('Failed to load chat bot configuration', {
            error: error instanceof Error ? error.message : 'Unknown error',
            chatbotId: conversation.metadata.chatbotId,
          }, 'ChatPanel');
        }
      }

      // Prepare request body with selected model ID, system prompt, MCP tools, and network search
      const requestBody: any = {
        messages: apiMessages,
        modelId: conversationModelId,
        mcpEnabled: mcpEnabled && enabledMCPTools.length > 0,
        mcpTools: mcpEnabled ? enabledMCPTools.map(t => ({
          id: t.id,
          name: t.name,
          command: t.command,
          args: t.args,
          env: t.env || {},  // Include environment variables
        })) : [],
        networkSearchEnabled: networkSearchEnabled,
      };

      // Add system prompt if available
      if (systemPrompt) {
        requestBody.systemPrompt = systemPrompt;
        logger.debug('System prompt added to request', {
          systemPromptLength: systemPrompt.length,
        }, 'ChatPanel');
      }

      logger.info('[ModelSelection] Sending chat request with selected model, MCP tools, and network search', {
        selectedModelId: conversationModelId || 'no-model-selected',
        selectedModelName: selectedModel?.name || 'default',
        selectedModelApiName: selectedModel?.modelName || 'unknown',
        selectedModelApiUrl: selectedModel?.apiUrl || 'unknown',
        willUseModelId: conversationModelId,
        messageCount: apiMessages.length,
        mcpEnabled: mcpEnabled && enabledMCPTools.length > 0,
        mcpToolCount: enabledMCPTools.length,
        mcpMasterEnabled: mcpEnabled,
        enabledToolsCount: enabledMCPTools.length,
        toolDetails: enabledMCPTools.map(t => ({ name: t.name, id: t.id })),
        note: mcpEnabled ? 'All MCP tools are available. LLM will decide which tools to call based on user query.' : 'MCP tools disabled',
        networkSearchEnabled: networkSearchEnabled,
        conversationId,
        conversationType: conversation?.type || 'basic',
        hasSystemPrompt: !!systemPrompt,
      }, 'ChatPanel');

      // Debug: Log the actual request body being sent
      logger.debug('Request body to be sent', {
        requestBody: JSON.stringify(requestBody),
        requestBodyKeys: Object.keys(requestBody),
        mcpEnabledInBody: requestBody.mcpEnabled,
        mcpToolsInBody: requestBody.mcpTools,
      }, 'ChatPanel');

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      logger.debug('Created abort controller for streaming request', {
        conversationId,
      }, 'ChatPanel');

      // Call streaming API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        // Try to parse structured error response from backend
        let backendError: {
          error?: string;
          status_code?: number;
          message?: string;
          details?: string;
          user_message?: string;
          error_data?: any;
        } = {};
        
        try {
          backendError = await response.json();
        } catch (parseError) {
          logger.warn('Failed to parse error response', {
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          }, 'ChatPanel');
        }
        
        logger.error('API request failed with error response', { 
          status: response.status,
          statusText: response.statusText,
          conversationId,
          hasBackendError: !!backendError,
          backendErrorKeys: Object.keys(backendError),
          errorCode: backendError.error,
          hasUserMessage: !!backendError.user_message,
          hasStatusCode: !!backendError.status_code,
          hasDetails: !!backendError.details,
          hasErrorData: !!backendError.error_data,
        }, 'ChatPanel');
        
        logger.debug('Full backend error object', {
          conversationId,
          backendError,
        }, 'ChatPanel');
        
        // Check if we have structured error data from backend
        if (backendError.error && backendError.user_message) {
          // Create structured error data for ErrorDialog
          const structuredErrorData: ErrorDialogData = {
            errorCode: backendError.error,
            statusCode: backendError.status_code || response.status,
            message: backendError.message || `API error: ${response.status}`,
            details: backendError.details,
            userMessage: backendError.user_message,
            errorData: backendError.error_data,
          };
          
          logger.info('Creating error with structured backend data', {
            conversationId,
            errorCode: structuredErrorData.errorCode,
            statusCode: structuredErrorData.statusCode,
            userMessage: structuredErrorData.userMessage,
            hasDetails: !!structuredErrorData.details,
            hasErrorData: !!structuredErrorData.errorData,
          }, 'ChatPanel');
          
          // Throw error with structured data attached
          const error = new Error(backendError.user_message);
          (error as any).errorData = structuredErrorData;
          throw error;
        } else {
          // Fallback to generic error message
          logger.warn('Backend error missing structured data, using fallback', {
            conversationId,
            hasError: !!backendError.error,
            hasUserMessage: !!backendError.user_message,
            hasDetails: !!backendError.details,
          }, 'ChatPanel');
          
          const errorMessage = backendError.details || backendError.error || backendError.user_message || `Failed to get response (${response.status} ${response.statusText})`;
          throw new Error(errorMessage);
        }
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
      const networkSearchSteps: any[] = []; // Store network search execution steps
      
      logger.debug('Stream reader initialized', {
        conversationId,
        streamStartTime,
        networkSearchEnabled,
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
                
                // Handle session start event
                if (data.type === 'session_start') {
                  const sessionId = data.sessionId;
                  logger.info('Session ID received from backend', {
                    sessionId,
                  }, 'ChatPanel');
                  setCurrentSessionId(sessionId);
                }
                
                // Handle error event from backend
                if (data.type === 'error' && data.error_code) {
                  logger.error('Received error event from backend', {
                    errorCode: data.error_code,
                    statusCode: data.status_code,
                    message: data.message,
                    userMessage: data.user_message,
                    fullData: data,
                  }, 'ChatPanel');
                  
                  // Create error data for display
                  const errorData: ErrorDialogData = {
                    errorCode: data.error_code,
                    statusCode: data.status_code,
                    message: data.message,
                    details: data.details,
                    userMessage: data.user_message,
                    errorData: data.error_data,
                  };
                  
                  logger.info('Creating error with structured data', {
                    errorData,
                  }, 'ChatPanel');
                  
                  // Stop streaming and throw error with error data
                  const error = new Error(data.user_message);
                  (error as any).errorData = errorData;
                  
                  logger.info('About to throw error to stop streaming', {
                    errorMessage: error.message,
                    hasErrorData: !!(error as any).errorData,
                  }, 'ChatPanel');
                  
                  throw error;
                }
                
                // Handle stream stopped event
                if (data.type === 'stream_stopped') {
                  logger.info('Stream stopped event received', {
                    message: data.message,
                    chunksProcessed: data.chunksProcessed,
                  }, 'ChatPanel');
                  // Stream was stopped, exit the loop
                  break;
                }
                
                // Handle MCP-specific events
                if (data.type === 'mcp_reasoning') {
                  logger.info('MCP reasoning received', {
                    reasoning: data.reasoning,
                  }, 'ChatPanel');
                  const newStep = {
                    type: 'reasoning',
                    reasoning: data.reasoning,
                    timestamp: new Date(),
                  };
                  mcpSteps.push(newStep);
                  
                  // Update streaming MCP steps state immediately for real-time display
                  flushSync(() => {
                    setStreamingMcpSteps([...mcpSteps]);
                  });
                  
                  logger.debug('MCP reasoning step displayed in real-time', {
                    totalSteps: mcpSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'mcp_tool_call') {
                  logger.info('MCP tool call started', {
                    toolName: data.tool_name,
                    parameters: data.parameters,
                  }, 'ChatPanel');
                  const newStep = {
                    type: 'tool_call',
                    toolName: data.tool_name,
                    parameters: data.parameters,
                    status: data.status || 'running',
                    timestamp: new Date(),
                  };
                  mcpSteps.push(newStep);
                  
                  // Update streaming MCP steps state immediately for real-time display
                  flushSync(() => {
                    setStreamingMcpSteps([...mcpSteps]);
                  });
                  
                  logger.debug('MCP tool call step displayed in real-time', {
                    toolName: data.tool_name,
                    totalSteps: mcpSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'mcp_tool_result') {
                  logger.info('MCP tool result received', {
                    toolName: data.tool_name,
                    status: data.status,
                  }, 'ChatPanel');
                  
                  // Find and update the corresponding tool_call step to mark it as complete
                  const toolCallStepIndex = mcpSteps.findIndex(
                    step => step.type === 'tool_call' && 
                            step.toolName === data.tool_name && 
                            step.status === 'running'
                  );
                  
                  if (toolCallStepIndex !== -1) {
                    // Update the tool_call step status to reflect completion
                    mcpSteps[toolCallStepIndex].status = data.status;
                    mcpSteps[toolCallStepIndex].completedAt = new Date();
                    
                    logger.debug('Updated tool_call step status to complete', {
                      toolName: data.tool_name,
                      newStatus: data.status,
                      stepIndex: toolCallStepIndex,
                    }, 'ChatPanel');
                  }
                  
                  // Add the tool result step
                  const newStep = {
                    type: 'tool_result',
                    toolName: data.tool_name,
                    result: data.result,
                    status: data.status,
                    error: data.error,
                    timestamp: new Date(),
                  };
                  mcpSteps.push(newStep);
                  
                  // Update streaming MCP steps state immediately for real-time display
                  flushSync(() => {
                    setStreamingMcpSteps([...mcpSteps]);
                  });
                  
                  logger.debug('MCP tool result step displayed in real-time', {
                    toolName: data.tool_name,
                    status: data.status,
                    totalSteps: mcpSteps.length,
                    toolCallStepUpdated: toolCallStepIndex !== -1,
                  }, 'ChatPanel');
                } else if (data.type === 'mcp_final_answer') {
                  logger.info('MCP generating final answer', undefined, 'ChatPanel');
                  const newStep = {
                    type: 'final_answer',
                    timestamp: new Date(),
                  };
                  mcpSteps.push(newStep);
                  
                  // Update streaming MCP steps state immediately for real-time display
                  flushSync(() => {
                    setStreamingMcpSteps([...mcpSteps]);
                  });
                  
                  logger.debug('MCP final answer step displayed in real-time', {
                    totalSteps: mcpSteps.length,
                  }, 'ChatPanel');
                }
                
                // Handle network search-specific events
                if (data.type === 'network_search_query') {
                  logger.info('Network search query received', {
                    query: data.query,
                  }, 'ChatPanel');
                  const newStep = {
                    type: 'search_query',
                    query: data.query,
                    timestamp: new Date(),
                  };
                  networkSearchSteps.push(newStep);
                  
                  flushSync(() => {
                    setStreamingNetworkSearchSteps([...networkSearchSteps]);
                  });
                  
                  logger.debug('Network search query step displayed in real-time', {
                    totalSteps: networkSearchSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'network_search_execution') {
                  logger.info('Network search execution started', {
                    status: data.status,
                  }, 'ChatPanel');
                  const newStep = {
                    type: 'search_execution',
                    status: data.status || 'running',
                    error: data.error,
                    timestamp: new Date(),
                  };
                  networkSearchSteps.push(newStep);
                  
                  flushSync(() => {
                    setStreamingNetworkSearchSteps([...networkSearchSteps]);
                  });
                  
                  logger.debug('Network search execution step displayed in real-time', {
                    status: data.status,
                    totalSteps: networkSearchSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'network_search_results') {
                  logger.info('Network search results received', {
                    resultCount: data.results?.length || 0,
                  }, 'ChatPanel');
                  const newStep = {
                    type: 'search_results',
                    results: data.results,
                    timestamp: new Date(),
                  };
                  networkSearchSteps.push(newStep);
                  
                  flushSync(() => {
                    setStreamingNetworkSearchSteps([...networkSearchSteps]);
                  });
                  
                  logger.debug('Network search results step displayed in real-time', {
                    resultCount: data.results?.length || 0,
                    totalSteps: networkSearchSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'network_search_synthesizing') {
                  logger.info('Network search synthesizing', undefined, 'ChatPanel');
                  const newStep = {
                    type: 'synthesizing',
                    timestamp: new Date(),
                  };
                  networkSearchSteps.push(newStep);
                  
                  flushSync(() => {
                    setStreamingNetworkSearchSteps([...networkSearchSteps]);
                  });
                  
                  logger.debug('Network search synthesizing step displayed in real-time', {
                    totalSteps: networkSearchSteps.length,
                  }, 'ChatPanel');
                } else if (data.type === 'network_search_final_answer') {
                  logger.info('Network search generating final answer', undefined, 'ChatPanel');
                  const newStep = {
                    type: 'final_answer',
                    timestamp: new Date(),
                  };
                  networkSearchSteps.push(newStep);
                  
                  flushSync(() => {
                    setStreamingNetworkSearchSteps([...networkSearchSteps]);
                  });
                  
                  logger.debug('Network search final answer step displayed in real-time', {
                    totalSteps: networkSearchSteps.length,
                  }, 'ChatPanel');
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
          networkSearchExecutionSteps: networkSearchSteps.length > 0 ? networkSearchSteps : undefined,
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
      setStreamingMcpSteps([]); // Clear streaming MCP steps
      setStreamingNetworkSearchSteps([]); // Clear streaming network search steps
      setCurrentSessionId(null); // Clear session ID
      
      logger.debug('Cleared streaming state after message completion', {
        conversationId,
        mcpStepsCleared: mcpSteps.length,
        networkSearchStepsCleared: networkSearchSteps.length,
      }, 'ChatPanel');

    } catch (error) {
      // Check if error is due to abort
      if (error instanceof Error && error.name === 'AbortError') {
        logger.info('Streaming request was aborted by user', {
          conversationId,
        }, 'ChatPanel');
        
        // Don't show error message for user-initiated stops
        setStreamingContent('');
        setStreamingMcpSteps([]);
        setStreamingNetworkSearchSteps([]);
        setCurrentSessionId(null);
        return;
      }
      
      logger.error('Failed to send chat message - CATCH BLOCK ENTERED', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        conversationId,
        hasErrorData: !!(error instanceof Error && (error as any).errorData),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      }, 'ChatPanel');

      // Check if error has structured error data from backend
      const errorData = (error instanceof Error && (error as any).errorData) as ErrorDialogData | undefined;
      
      logger.info('Checking for structured error data', {
        hasErrorData: !!errorData,
        errorDataContent: errorData,
        conversationId,
      }, 'ChatPanel');
      
      if (errorData) {
        // Use structured error data from backend
        logger.info('Displaying structured error from backend in dialog', {
          errorCode: errorData.errorCode,
          statusCode: errorData.statusCode,
          userMessage: errorData.userMessage,
          conversationId,
        }, 'ChatPanel');
        
        setErrorDialogData(errorData);
        setErrorDialogOpen(true);
      } else {
        // Fallback to generic error handling
        let userFriendlyError = dict.chat.errorMessage;
        let errorCode = 'UNKNOWN_ERROR';
        
        if (error instanceof Error) {
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('failed to connect') || errorMsg.includes('fetch failed')) {
            userFriendlyError = 'Unable to connect to the AI service. Please check your network connection and API configuration.';
            errorCode = 'CONNECTION_ERROR';
          } else if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
            userFriendlyError = 'The request timed out. Please try again or check your network connection.';
            errorCode = 'TIMEOUT';
          } else if (errorMsg.includes('api url') || errorMsg.includes('accessible')) {
            userFriendlyError = error.message; // Use the detailed error message from backend
            errorCode = 'CONNECTION_ERROR';
          }
        }
        
        logger.info('Displaying generic error in dialog', {
          errorCode,
          userFriendlyError,
          conversationId,
        }, 'ChatPanel');
        
        setErrorDialogData({
          errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
          userMessage: userFriendlyError,
          details: error instanceof Error ? error.stack : undefined,
        });
        setErrorDialogOpen(true);
      }
      setStreamingContent('');
      setStreamingMcpSteps([]); // Clear streaming MCP steps on error
      setStreamingNetworkSearchSteps([]); // Clear streaming network search steps on error
      setCurrentSessionId(null); // Clear session ID
      
      logger.debug('Cleared streaming state after error', {
        conversationId,
      }, 'ChatPanel');
    } finally {
      setIsLoading(false);
      setIsStopping(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = async () => {
    if (!currentSessionId) {
      logger.warn('No active session to stop', undefined, 'ChatPanel');
      return;
    }

    if (isStopping) {
      logger.debug('Stop request already in progress', undefined, 'ChatPanel');
      return;
    }

    setIsStopping(true);
    logger.info('User requested to stop generation', {
      sessionId: currentSessionId,
    }, 'ChatPanel');

    try {
      // Get API URL for stop endpoint
      const apiUrl = await buildApiUrl('/api/chat');
      
      logger.debug('Sending stop request to backend', {
        sessionId: currentSessionId,
        apiUrl,
      }, 'ChatPanel');

      // Send stop request to backend
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        logger.success('Stop request sent successfully', {
          sessionId: currentSessionId,
        }, 'ChatPanel');
        
        // Also abort the fetch request on client side
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          logger.debug('Aborted client-side fetch request', undefined, 'ChatPanel');
        }
      } else {
        logger.warn('Stop request failed or session not found', {
          sessionId: currentSessionId,
          result,
        }, 'ChatPanel');
        
        // Still try to abort on client side
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }
    } catch (error) {
      logger.error('Failed to send stop request', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: currentSessionId,
      }, 'ChatPanel');
      
      // Try to abort on client side as fallback
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        logger.debug('Aborted client-side fetch request as fallback', undefined, 'ChatPanel');
      }
    } finally {
      // Clean up state
      setIsStopping(false);
      setIsLoading(false);
      setStreamingContent('');
      setStreamingMcpSteps([]);
      setStreamingNetworkSearchSteps([]);
      setCurrentSessionId(null);
      abortControllerRef.current = null;
      
      logger.debug('Cleaned up after stop request', undefined, 'ChatPanel');
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
      logger.info('[ModelSelection] Model selection changed by user', {
        selectedModelId: model.id,
        selectedModelName: model.name,
        selectedModelDisplayName: model.name,
        selectedModelApiName: model.modelName,
        apiUrl: model.apiUrl,
        availableModelsCount: availableModels.length,
        conversationId,
      }, 'ChatPanel');
    } else {
      logger.warn('[ModelSelection] Selected model not found in available models', { 
        requestedModelId: modelId,
        availableModelIds: availableModels.map(m => m.id),
        availableModelsCount: availableModels.length,
      }, 'ChatPanel');
    }
  };

  const handleMCPStateChange = useCallback((enabled: boolean, tools: MCPConfig[]) => {
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
  }, []);

  return (
    <div className="h-full flex flex-col bg-background p-2 chat-panel-container">
      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 pt-3 pb-2 space-y-1 chat-panel-messages"
      >
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
                networkSearchExecutionSteps={message.networkSearchExecutionSteps}
              />
            ))}

            {/* Streaming message with typing indicator */}
            {streamingContent && (
              <div className="relative">
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                  mcpExecutionSteps={streamingMcpSteps.length > 0 ? streamingMcpSteps : undefined}
                  networkSearchExecutionSteps={streamingNetworkSearchSteps.length > 0 ? streamingNetworkSearchSteps : undefined}
                  isMcpStreaming={isLoading}
                  isNetworkSearchStreaming={isLoading}
                />
                {/* Blinking cursor to indicate active streaming */}
                <div className="inline-block w-1.5 h-4 bg-purple-500 ml-1 animate-pulse rounded-sm" />
              </div>
            )}
            
            {/* Show MCP steps or network search steps even before content starts streaming */}
            {!streamingContent && (streamingMcpSteps.length > 0 || streamingNetworkSearchSteps.length > 0) && isLoading && (
              <div className="relative">
                <ChatMessage
                  role="assistant"
                  content=""
                  mcpExecutionSteps={streamingMcpSteps}
                  networkSearchExecutionSteps={streamingNetworkSearchSteps}
                  isMcpStreaming={true}
                  isNetworkSearchStreaming={true}
                />
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

      {/* Stop Button - shown when AI is generating */}
      {isLoading && currentSessionId && (
        <ChatStopButton 
          onStop={handleStopGeneration}
          disabled={isStopping}
        />
      )}

      {/* Model Selector, MCP Tools, and Clear Buttons */}
      <div className="px-3 py-3 border-t border-border/50 bg-background/50 flex items-center justify-between gap-4">
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

          {/* Network Search Toggle */}
          <NetworkSearchToggle
            disabled={isLoading}
            onNetworkSearchStateChange={setNetworkSearchEnabled}
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

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorDialogOpen}
        onClose={() => {
          logger.debug('Error dialog closed', {
            conversationId,
          }, 'ChatPanel');
          setErrorDialogOpen(false);
        }}
        error={errorDialogData}
      />
    </div>
  );
};

export default ChatPanel;

