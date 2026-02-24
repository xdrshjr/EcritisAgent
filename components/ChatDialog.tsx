/**
 * ChatDialog Component
 * Main chat interface with message history and streaming support
 * Displays above the floating chat button
 */

'use client';

import { useState, useEffect, useRef, useCallback, forwardRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Loader2, Trash2, Trash, Bot, List } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import ErrorDialog, { type ErrorDialogData } from './ErrorDialog';
import AgentStatusPanel, { type AgentStatus, type TodoItem } from './AgentStatusPanel';
import AgentListDialog from './AgentListDialog';
import NetworkSearchToggle from './NetworkSearchToggle';
import { logger } from '@/lib/logger';
import { type DocumentParagraph } from '@/lib/documentUtils';
import type { ChatMessage as ChatMessageType, StreamErrorEvent, isStreamErrorEvent } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, type ModelConfig } from '@/lib/modelConfig';
import { cn } from '@/lib/utils';

export type AgentVariant = 'document' | 'auto-writer';

export interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  welcomeMessage?: string;
  getDocumentContent?: () => string | DocumentParagraph[];
  updateDocumentContent?: (content: string | DocumentParagraph[]) => void;
  insertImageAfterSection?: (sectionIndex: number, imageUrl: string, imageDescription?: string) => boolean;
  variant?: 'modal' | 'embedded';
  className?: string;
  agentVariant?: AgentVariant;
}

interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
  context?: string; // Advanced mode context
  references?: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
  }>;
}

const ChatDialog = forwardRef<HTMLDivElement, ChatDialogProps>(({ 
  isOpen, 
  onClose, 
  title = 'AI Assistant',
  welcomeMessage = 'Hello! I\'m your AI assistant. How can I help you today?',
  getDocumentContent,
  updateDocumentContent,
  insertImageAfterSection,
  variant = 'modal',
  className,
  agentVariant = 'document',
}, ref) => {
  const isEmbedded = variant === 'embedded';
  const isAutoWriterAgent = agentVariant === 'auto-writer';
  const shouldRender = isEmbedded || isOpen;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [viewportHeight, setViewportHeight] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogData, setErrorDialogData] = useState<ErrorDialogData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Agent mode state
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [isAgentListOpen, setIsAgentListOpen] = useState(false);
  
  // Network search state (for auto-writer agent)
  const [networkSearchEnabled, setNetworkSearchEnabled] = useState(true); // Default to enabled

  // Track viewport height for responsive dialog sizing (modal only)
  useEffect(() => {
    if (isEmbedded) {
      logger.debug('Embedded chat dialog skips viewport tracking', undefined, 'ChatDialog');
      return;
    }
    
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
  }, [isEmbedded]);

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
    if (shouldRender && messages.length === 0) {
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
      };
      setMessages([welcomeMsg]);
      logger.component('ChatDialog', 'initialized with welcome message');
    }
  }, [shouldRender, messages.length, welcomeMessage]);

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
      }, 'ChatDialog');

      // Check if user scrolled away from bottom
      const nearBottom = isNearBottom(container);
      if (!nearBottom) {
        setShouldAutoScroll(false);
        logger.debug('Auto-scroll disabled - user scrolled away from bottom', {
          distanceFromBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        }, 'ChatDialog');
      } else {
        // User scrolled back to bottom, re-enable auto-scroll
        setShouldAutoScroll(true);
        logger.debug('Auto-scroll re-enabled - user scrolled to bottom', undefined, 'ChatDialog');
      }

      // Reset user scrolling flag after a delay
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    logger.debug('Scroll event listener attached to messages container', undefined, 'ChatDialog');

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      logger.debug('Scroll event listener removed from messages container', undefined, 'ChatDialog');
    };
  }, [isNearBottom]);

  // Auto-scroll to bottom on new messages (only if shouldAutoScroll is true)
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current && !isUserScrollingRef.current) {
      logger.debug('Auto-scrolling to bottom', {
        messageCount: messages.length,
        hasStreamingContent: !!streamingContent,
      }, 'ChatDialog');
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    } else if (!shouldAutoScroll) {
      logger.debug('Auto-scroll skipped - user has scrolled away', {
        messageCount: messages.length,
        hasStreamingContent: !!streamingContent,
      }, 'ChatDialog');
    }
  }, [messages, streamingContent, shouldAutoScroll]);

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
      phase: isAutoWriterAgent ? 'intent' : 'planning',
      message: 'Initializing agent...',
    });
    
    logger.debug('Agent status reset for new execution', {
      previousPhase: agentStatus?.phase,
      note: 'Previous execution record will be replaced',
    }, 'ChatDialog');

    try {
      // Get document content if available (for potential document modifier agent)
      const documentContent = getDocumentContent ? getDocumentContent() : null;
      const isParagraphsArray = Array.isArray(documentContent);
      const hasDocument = isParagraphsArray 
        ? documentContent.length > 0
        : Boolean(documentContent && typeof documentContent === 'string' && documentContent.trim().length > 0);
      
      if (hasDocument) {
        logger.debug('Document content available for agent routing', { 
          contentType: isParagraphsArray ? 'paragraphs' : 'html',
          contentLength: isParagraphsArray ? documentContent.length : (documentContent as string).length,
        }, 'ChatDialog');
      } else {
        logger.debug('No document content available - routing may select auto-writer agent', 
          undefined, 'ChatDialog');
      }

      // For auto-writer agent, use dedicated endpoint
      // For other agents, use unified routing endpoint
      let apiUrl: string;
      let requestBody: any;
      
      if (isAutoWriterAgent) {
        // Use auto-writer dedicated endpoint
        apiUrl = await buildApiUrl('/api/auto-writer');
        requestBody = {
          prompt: command,
          language: 'zh',
          modelId: selectedModel?.id,
          enableImageGeneration: true,
          enableNetworkSearch: networkSearchEnabled,
        };
        
        logger.info('Sending auto-writer request', {
          promptPreview: command.substring(0, 100),
          enableNetworkSearch: networkSearchEnabled,
          modelId: selectedModel?.id || 'default',
        }, 'ChatDialog');
      } else {
        // Use unified agent routing endpoint
        apiUrl = await buildApiUrl('/api/agent-route');
        requestBody = {
          request: command,
          content: documentContent,
          content_type: isParagraphsArray ? 'paragraphs' : 'html',
          language: 'zh',
          modelId: selectedModel?.id,
        };
        
        logger.info('Sending agent routing request', {
          commandPreview: command.substring(0, 100),
          hasDocument,
          modelId: selectedModel?.id || 'default',
        }, 'ChatDialog');
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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

              // Handle routing event (new unified routing endpoint)
              if (data.type === 'routing') {
                logger.info('[Agent Event] Routing decision received', {
                  agent_type: data.agent_type,
                  agent_name: data.agent_name,
                  confidence: data.confidence,
                  reasoning: data.reasoning?.substring(0, 100),
                }, 'ChatDialog');
                
                // Display routing information to user
                const routingMessage: Message = {
                  id: `agent-routing-${Date.now()}`,
                  role: 'assistant',
                  content: `🤖 **Agent Selected**: ${data.agent_name}\n\n**Confidence**: ${data.confidence}\n\n**Reasoning**: ${data.reasoning}`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, routingMessage]);
                
                // Update agent status with routing info
                setAgentStatus(prev => ({
                  ...(prev || {}),
                  phase: 'routing',
                  message: `Routing to ${data.agent_name}...`,
                  selectedAgent: data.agent_type,
                  routingConfidence: data.confidence,
                }));
              }
              // Update agent status based on event type
              else if (data.type === 'status') {
                if (isAutoWriterAgent) {
                  setAgentStatus(prev => ({
                    ...(prev || { phase: 'intent', message: '' }),
                    phase: data.phase || prev?.phase || 'status',
                    message: data.message,
                    timeline: data.timeline,
                  }));
                  continue;
                }
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
              } else if (isAutoWriterAgent && data.type === 'parameters') {
                const parameterMessage: Message = {
                  id: `agent-parameters-${Date.now()}`,
                  role: 'assistant',
                  content: `🎯 参数已就绪：\n- 标题：${data.parameters?.title}\n- 段落数：${data.parameters?.paragraph_count}\n- 语调：${data.parameters?.tone}`,
                  timestamp: new Date(),
                };
                setMessages(prev => [...prev, parameterMessage]);
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
                  contentType: data.content_type || 'html',
                  contentLength: Array.isArray(data.updated_content) 
                    ? data.updated_content.length 
                    : (data.updated_content?.length || 0),
                  message: data.message,
                  hasUpdateHandler: !!updateDocumentContent,
                  hasContent: !!data.updated_content,
                }, 'ChatDialog');
                
                // Update document in editor
                if (updateDocumentContent && data.updated_content) {
                  try {
                    const content = data.updated_content;
                    const isParagraphs = Array.isArray(content);
                    
                    logger.debug('[Agent Event] Calling updateDocumentContent', {
                      contentType: isParagraphs ? 'paragraphs' : 'html',
                      contentLength: isParagraphs ? content.length : content.length,
                      contentPreview: isParagraphs 
                        ? `[${content.length} paragraphs]` 
                        : content.substring(0, 100),
                    }, 'ChatDialog');
                    
                    updateDocumentContent(content);
                    
                    logger.success('[Agent Event] Document updated successfully in editor', { 
                      step: data.step,
                      contentType: isParagraphs ? 'paragraphs' : 'html',
                      contentLength: isParagraphs ? content.length : content.length,
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
                    contentLength: Array.isArray(data.updated_content)
                      ? data.updated_content.length
                      : (data.updated_content?.length || 0),
                  }, 'ChatDialog');
                }
              } else if (data.type === 'section_progress' && isAutoWriterAgent) {
                setAgentStatus(prev => {
                  const total = data.total || prev?.totalSteps || 0;
                  const resolvedTotal = total || data.current || 0;
                  const todoList =
                    prev?.todoList && prev.todoList.length === resolvedTotal
                      ? [...prev.todoList]
                      : Array.from({ length: resolvedTotal }, (_, index) => ({
                          id: `section-${index + 1}`,
                          description: `段落 ${index + 1}`,
                          status: 'pending' as const,
                        }));
                  const currentIndex = Math.max(0, (data.current || 1) - 1);
                  if (todoList[currentIndex]) {
                    todoList[currentIndex] = {
                      ...todoList[currentIndex],
                      status: 'completed',
                      result: data.title,
                    };
                  }
                  return {
                    phase: 'writing',
                    message: `正在完成段落 ${data.current}/${data.total}`,
                    currentStep: data.current,
                    totalSteps: data.total,
                    todoList,
                    timeline: prev?.timeline,
                  };
                });
              } else if (data.type === 'network_search_status' && isAutoWriterAgent) {
                // Network search status update
                logger.info('[Agent Event] Network search status received', {
                  section_index: data.section_index,
                  section_title: data.section_title,
                  status: data.status,
                  message: data.message,
                  reference_count: data.reference_count,
                  has_references: !!data.references && data.references.length > 0,
                }, 'ChatDialog');
                
                // Update agent status to show network search progress
                setAgentStatus(prev => ({
                  ...(prev || { phase: 'writing', message: '' }),
                  phase: 'writing',
                  message: data.message || '正在检索参考文献...',
                  currentStep: data.section_index + 1,
                  totalSteps: prev?.totalSteps || 0,
                  todoList: prev?.todoList,
                  timeline: prev?.timeline,
                }));
                
                // Add a chat message about network search with references
                if (data.status === 'completed') {
                  const references = data.references || [];
                  logger.debug('[Agent Event] Creating network search message', {
                    section_title: data.section_title,
                    reference_count: data.reference_count,
                    references_count: references.length,
                  }, 'ChatDialog');
                  
                  const searchMessage: Message = {
                    id: `network-search-${data.section_index}-${Date.now()}`,
                    role: 'assistant',
                    content: `🔍 **已为段落《${data.section_title}》检索到 ${data.reference_count} 篇参考文献**`,
                    timestamp: new Date(),
                    references: references.length > 0 ? references : undefined,
                  };
                  setMessages(prev => [...prev, searchMessage]);
                }
              } else if (data.type === 'content_chunk' && isAutoWriterAgent) {
                // Real-time streaming chunk from section generation
                logger.debug('[Agent Event] Content chunk received', {
                  section_index: data.section_index,
                  section_title: data.section_title,
                  chunk_length: data.chunk?.length || 0,
                  accumulated_length: data.accumulated_length,
                  current_section: data.current_section,
                  total_sections: data.total_sections,
                }, 'ChatDialog');
                
                // Note: article_draft events will provide the full HTML with chunks included
                // We rely on article_draft for actual document updates
              } else if (data.type === 'article_draft' && isAutoWriterAgent) {
                if (updateDocumentContent && data.html) {
                  const startTime = Date.now();
                  updateDocumentContent(data.html);
                  const duration = Date.now() - startTime;
                  
                  logger.info('[Agent Event] Document updated with streaming content', {
                    html_length: data.html.length,
                    update_duration_ms: duration,
                  }, 'ChatDialog');
                } else {
                  logger.warn('[Agent Event] Cannot update document - missing handler or HTML', {
                    hasHandler: !!updateDocumentContent,
                    hasHtml: !!data.html,
                  }, 'ChatDialog');
                }
              } else if (data.type === 'paragraph_summary' && isAutoWriterAgent) {
                // Display paragraph summary in chat bubble
                logger.info('[Agent Event] Paragraph summary received', {
                  section_index: data.section_index,
                  section_title: data.section_title,
                  summary_length: data.summary?.length || 0,
                  current: data.current,
                  total: data.total,
                }, 'ChatDialog');
                
                // Create a chat message bubble showing the summary
                const summaryMessage: Message = {
                  id: `paragraph-summary-${data.section_index}-${Date.now()}`,
                  role: 'assistant',
                  content: `📝 **段落 ${data.current}/${data.total} 完成：《${data.section_title}》**\n\n💡 总结：${data.summary}`,
                  timestamp: new Date(),
                };
                
                setMessages(prev => [...prev, summaryMessage]);
                
                logger.debug('[Agent Event] Paragraph summary added to chat', {
                  message_id: summaryMessage.id,
                  section_title: data.section_title,
                }, 'ChatDialog');
              } else if (data.type === 'paragraph_image' && isAutoWriterAgent) {
                // Handle image insertion after paragraph
                logger.info('[Agent Event] Paragraph image received', {
                  section_index: data.section_index,
                  section_title: data.section_title,
                  image_url_preview: data.image_url?.substring(0, 100),
                  keywords: data.keywords,
                  current: data.current,
                  total: data.total,
                }, 'ChatDialog');
                
                if (insertImageAfterSection && data.image_url) {
                  // Use a longer delay and retry mechanism to ensure editor content is updated
                  // The delay increases for later sections to account for streaming content updates
                  const baseDelay = 300;
                  const sectionDelay = data.section_index * 100; // Additional delay for later sections
                  const totalDelay = baseDelay + sectionDelay;
                  
                  logger.debug('[Agent Event] Scheduling image insertion with delay', {
                    section_index: data.section_index,
                    section_title: data.section_title,
                    baseDelay,
                    sectionDelay,
                    totalDelay,
                  }, 'ChatDialog');
                  
                  setTimeout(() => {
                    logger.debug('[Agent Event] Attempting to insert image after section', {
                      section_index: data.section_index,
                      section_title: data.section_title,
                      delay_used: totalDelay,
                    }, 'ChatDialog');
                    
                    // Try to insert the image
                    let success = false;
                    let retryCount = 0;
                    const maxRetries = 3;
                    const retryDelay = 200;
                    
                    const attemptInsert = () => {
                      success = insertImageAfterSection(
                        data.section_index,
                        data.image_url,
                        data.image_description || ''
                      );
                      
                      if (!success && retryCount < maxRetries) {
                        retryCount++;
                        logger.debug('[Agent Event] Image insertion failed, retrying', {
                          section_index: data.section_index,
                          retry_count: retryCount,
                          max_retries: maxRetries,
                        }, 'ChatDialog');
                        setTimeout(attemptInsert, retryDelay);
                      } else if (success) {
                        logger.success('[Agent Event] Image inserted after section successfully', {
                          section_index: data.section_index,
                          section_title: data.section_title,
                          retry_count: retryCount,
                        }, 'ChatDialog');
                        
                        // Add a chat message about the image insertion
                        const imageMessage: Message = {
                          id: `paragraph-image-${data.section_index}-${Date.now()}`,
                          role: 'assistant',
                          content: `🖼️ **已为段落 ${data.current}/${data.total}《${data.section_title}》插入相关图片**\n\n🔑 关键词：${data.keywords?.join('、') || '无'}`,
                          timestamp: new Date(),
                        };
                        
                        setMessages(prev => [...prev, imageMessage]);
                      } else {
                        logger.warn('[Agent Event] Failed to insert image after section after retries', {
                          section_index: data.section_index,
                          section_title: data.section_title,
                          retry_count: retryCount,
                        }, 'ChatDialog');
                      }
                    };
                    
                    attemptInsert();
                  }, totalDelay);
                } else {
                  logger.warn('[Agent Event] Cannot insert image - missing handler or URL', {
                    hasHandler: !!insertImageAfterSection,
                    hasImageUrl: !!data.image_url,
                  }, 'ChatDialog');
                }
              } else if (data.type === 'complete') {
                logger.success('[Agent Event] Agent workflow completed', {
                  message: data.message,
                  hasSummary: !!data.summary,
                  summaryLength: data.summary?.length || 0,
                  hasTimeline: !!data.timeline,
                }, 'ChatDialog');
                
                setAgentStatus(prev => ({
                  ...(prev || { phase: 'complete', message: '' }),
                  phase: 'complete',
                  message: data.message || '任务完成',
                  summary: data.summary,
                  todoList: prev?.todoList,
                  timeline: data.timeline || prev?.timeline,
                }));
                
                logger.info('Agent execution completed, status will be collapsed', {
                  hasTodoList: !!agentStatus?.todoList,
                  todoCount: agentStatus?.todoList?.length || 0,
                  hasSummary: !!data.summary,
                }, 'ChatDialog');
                
                // Add completion message & update document for auto writer
                if (isAutoWriterAgent) {
                  if (updateDocumentContent && data.final_html) {
                    updateDocumentContent(data.final_html);
                  }
                  const completionMsg: Message = {
                    id: `agent-complete-${Date.now()}`,
                    role: 'assistant',
                    content: `✓ 文章已完成：《${data.title || 'AI文章'}》`,
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, completionMsg]);
                } else {
                  const completionMsg: Message = {
                    id: `agent-complete-${Date.now()}`,
                    role: 'assistant',
                    content: `✓ Task completed!\n\n${data.summary}`,
                    timestamp: new Date(),
                  };
                  setMessages(prev => [...prev, completionMsg]);
                }
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

  const handleSendMessage = async (content: string, fileContext?: any, context?: string) => {
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
        context, // Store context in message
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
      context, // Store context in message
    };

    // Add user message immediately so it's visible
    setMessages((prev) => [...prev, userMessage]);
    
    logger.info('User message added to chat', {
      messageId: userMessage.id,
      messageCount: messages.length + 1,
      content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      hasContext: !!context,
      contextLength: context?.length,
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
      
      // If advanced mode context exists, add it as a system message
      if (context) {
        apiMessages.push({
          role: 'system',
          content: `[Additional Context]\n\n${context}\n\n---\n\nPlease answer the following question based on the additional context above.`
        });
        logger.debug('Added advanced mode context as system message to API request', {
          contextLength: context.length,
          apiMessagesCount: apiMessages.length + 1
        }, 'ChatDialog');
      }

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
          }, 'ChatDialog');
        }
        
        logger.error('API request failed with error response', { 
          status: response.status,
          statusText: response.statusText,
          hasBackendError: !!backendError,
          backendErrorKeys: Object.keys(backendError),
          errorCode: backendError.error,
          hasUserMessage: !!backendError.user_message,
          hasStatusCode: !!backendError.status_code,
          hasDetails: !!backendError.details,
          hasErrorData: !!backendError.error_data,
        }, 'ChatDialog');
        
        logger.debug('Full backend error object', {
          backendError,
        }, 'ChatDialog');
        
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
            errorCode: structuredErrorData.errorCode,
            statusCode: structuredErrorData.statusCode,
            userMessage: structuredErrorData.userMessage,
            hasDetails: !!structuredErrorData.details,
            hasErrorData: !!structuredErrorData.errorData,
          }, 'ChatDialog');
          
          // Throw error with structured data attached
          const error = new Error(backendError.user_message);
          (error as any).errorData = structuredErrorData;
          throw error;
        } else {
          // Fallback to generic error message
          logger.warn('Backend error missing structured data, using fallback', {
            hasError: !!backendError.error,
            hasUserMessage: !!backendError.user_message,
            hasDetails: !!backendError.details,
          }, 'ChatDialog');
          
          const errorMessage = backendError.details || backendError.error || backendError.user_message || `Failed to get response (${response.status} ${response.statusText})`;
          throw new Error(errorMessage);
        }
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
                
                // Check if this is an error event from backend
                if (data.type === 'error' && data.error_code) {
                  logger.error('Received error event from backend', {
                    errorCode: data.error_code,
                    statusCode: data.status_code,
                    message: data.message,
                    userMessage: data.user_message,
                    fullData: data,
                  }, 'ChatDialog');
                  
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
                  }, 'ChatDialog');
                  
                  // Stop streaming and throw error with error data
                  const error = new Error(data.user_message);
                  (error as any).errorData = errorData;
                  
                  logger.info('About to throw error to stop streaming', {
                    errorMessage: error.message,
                    hasErrorData: !!(error as any).errorData,
                  }, 'ChatDialog');
                  
                  throw error;
                }
                
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
                // Check if this is an error with errorData (from backend error event)
                if (parseError instanceof Error && (parseError as any).errorData) {
                  // Re-throw to be caught by outer catch block
                  throw parseError;
                }
                
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
      logger.error('Failed to send chat message - CATCH BLOCK ENTERED', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        hasErrorData: !!(error instanceof Error && (error as any).errorData),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      }, 'ChatDialog');

      // Check if error has structured error data from backend
      const errorData = (error instanceof Error && (error as any).errorData) as ErrorDialogData | undefined;
      
      logger.info('Checking for structured error data', {
        hasErrorData: !!errorData,
        errorDataContent: errorData,
      }, 'ChatDialog');
      
      if (errorData) {
        // Use structured error data from backend
        logger.info('Displaying structured error from backend in dialog', {
          errorCode: errorData.errorCode,
          statusCode: errorData.statusCode,
          userMessage: errorData.userMessage,
        }, 'ChatDialog');
        
        setErrorDialogData(errorData);
        setErrorDialogOpen(true);
      } else {
        // Fallback to generic error handling
        let userFriendlyError = 'Sorry, I encountered an error. Please try again.';
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
        }, 'ChatDialog');

        setErrorDialogData({
          errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
          userMessage: userFriendlyError,
          details: error instanceof Error ? error.stack : undefined,
        });
        setErrorDialogOpen(true);
      }
      
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isEmbedded) {
      logger.debug('Embedded chat dialog close ignored', undefined, 'ChatDialog');
      return;
    }
    
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
    if (isEmbedded) {
      return;
    }
    
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!shouldRender) {
    return null;
  }

  // Calculate chat dialog height for modal presentation
  const calculatedHeight = isEmbedded
    ? undefined
    : (viewportHeight > 0 ? Math.max(Math.floor(viewportHeight * 0.8), 300) : 720);

  if (!isEmbedded) {
    logger.debug('Chat dialog height calculated', {
      viewportHeight,
      calculatedHeight,
      percentage: '80%'
    }, 'ChatDialog');
  }

  const containerClassName = isEmbedded
    ? cn(
        'h-full w-full bg-background border-l border-border flex flex-col',
        'rounded-none shadow-none',
        className
      )
    : 'fixed bottom-24 right-6 w-[576px] bg-background border border-border rounded-xl shadow-xl flex flex-col z-50 animate-slideUp';

  return (
    <div
      ref={ref}
      className={containerClassName}
      style={!isEmbedded ? { height: `${calculatedHeight}px` } : undefined}
      onKeyDown={isEmbedded ? undefined : handleKeyDown}
      role={isEmbedded ? 'region' : 'dialog'}
      aria-label={title}
      aria-modal={isEmbedded ? undefined : 'true'}
      data-testid={isEmbedded ? 'chat-dialog-embedded' : 'chat-dialog-modal'}
    >
      {/* Header - only shown in modal mode */}
      {!isEmbedded && (
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
      )}

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
            context={message.context}
            references={message.references}
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
          
          {/* Agent List Button */}
          <button
            onClick={() => {
              setIsAgentListOpen(true);
              logger.info('Agent list dialog opened', undefined, 'ChatDialog');
            }}
            disabled={isLoading || isAgentRunning}
            className="ml-2 p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed group"
            aria-label="View available agents"
            title="View available agents"
          >
            <List className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
          
          {/* Network Search Toggle (for auto-writer agent only, next to agent list button) */}
          {isAutoWriterAgent && (
            <div className="ml-2">
              <NetworkSearchToggle
                disabled={isLoading || isAgentRunning}
                enabled={networkSearchEnabled}
                onNetworkSearchStateChange={setNetworkSearchEnabled}
              />
            </div>
          )}
        </div>
        {/* Advanced Mode Toggle - right side of Agent Mode row */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium cursor-pointer select-none" onClick={() => setIsAdvancedMode(!isAdvancedMode)}>
            Advanced Mode
          </label>
          <button
            onClick={() => setIsAdvancedMode(!isAdvancedMode)}
            className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
              isAdvancedMode ? 'bg-primary' : 'bg-input'
            }`}
            role="switch"
            aria-checked={isAdvancedMode}
            aria-label="Toggle Advanced Mode"
            disabled={isLoading || isAgentRunning}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                isAdvancedMode ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
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
        isAdvancedMode={isAdvancedMode}
        onAdvancedModeChange={setIsAdvancedMode}
        hideInternalToggle={true}
      />

      {/* Agent List Dialog */}
      <AgentListDialog 
        isOpen={isAgentListOpen}
        onClose={() => {
          setIsAgentListOpen(false);
          logger.info('Agent list dialog closed', undefined, 'ChatDialog');
        }}
      />

      {/* Error Dialog */}
      <ErrorDialog
        isOpen={errorDialogOpen}
        onClose={() => {
          logger.debug('Error dialog closed', undefined, 'ChatDialog');
          setErrorDialogOpen(false);
        }}
        error={errorDialogData}
      />
    </div>
  );
});

ChatDialog.displayName = 'ChatDialog';

export default ChatDialog;

