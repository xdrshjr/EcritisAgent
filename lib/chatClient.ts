/**
 * Chat Client Utility
 * Handles communication with OpenAI-compatible LLM API
 * Supports streaming responses for real-time chat experience
 * Now supports custom model configurations from user settings
 */

import { logger } from './logger';
import { getDefaultModel, getLLMConfigFromModel, getModelApiUrl, getModelName } from './modelConfig';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMConfig {
  apiKey: string;
  apiUrl: string;
  modelName: string;
  timeout: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * Error information from backend streaming API
 */
export interface StreamErrorEvent {
  type: 'error';
  error_code: string;
  status_code?: number;
  message: string;
  details?: string;
  user_message: string;
  error_data?: any;
}

/**
 * Check if a parsed SSE event is an error event
 */
export const isStreamErrorEvent = (data: any): data is StreamErrorEvent => {
  return data && data.type === 'error' && typeof data.error_code === 'string';
};

/**
 * Get LLM configuration - uses user-configured default model
 * No longer depends on environment variables
 */
export const getLLMConfig = async (): Promise<LLMConfig> => {
  logger.info('Fetching LLM configuration for API call', undefined, 'ChatClient');

  try {
    // Get default model from user configuration or persistent storage
    const defaultModel = await getDefaultModel();
    
    if (defaultModel) {
      logger.success('Using user-configured default model', {
        source: 'User Settings',
        modelId: defaultModel.id,
        displayName: defaultModel.name,
        modelName: getModelName(defaultModel) || 'resolved-at-call-time',
        apiUrl: getModelApiUrl(defaultModel) || 'resolved-at-call-time',
        isEnabled: defaultModel.isEnabled !== false,
      }, 'ChatClient');
      
      return getLLMConfigFromModel(defaultModel);
    }

    // No model configured - throw error with helpful message
    const errorMessage = 'No LLM model configured. Please configure a model in Settings.';
    logger.error(errorMessage, {
      source: 'User Settings',
      suggestion: 'Open Settings dialog and add a model configuration',
    }, 'ChatClient');
    
    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message.includes('No LLM model configured')) {
      // Re-throw configuration errors as-is
      throw error;
    }
    
    logger.error('Error loading user model configuration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ChatClient');
    
    throw new Error('Failed to load LLM configuration. Please check your model settings.');
  }
};

/**
 * Validate LLM configuration
 */
export const validateLLMConfig = (config: LLMConfig): { valid: boolean; error?: string } => {
  if (!config.apiKey) {
    logger.error('LLM API key is missing', undefined, 'ChatClient');
    return { valid: false, error: 'LLM API key is not configured' };
  }

  if (!config.apiUrl) {
    logger.error('LLM API URL is missing', undefined, 'ChatClient');
    return { valid: false, error: 'LLM API URL is not configured' };
  }

  if (!config.modelName) {
    logger.error('LLM model name is missing', undefined, 'ChatClient');
    return { valid: false, error: 'LLM model name is not configured' };
  }

  return { valid: true };
};

/**
 * Check connection health by making a simple request
 */
export const checkConnectionHealth = async (config: LLMConfig): Promise<{ healthy: boolean; latency?: number; error?: string }> => {
  const startTime = Date.now();
  
  logger.debug('Checking LLM API connection health', {
    endpoint: config.apiUrl,
  }, 'ChatClient');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health check

    const response = await fetch(config.apiUrl, {
      method: 'HEAD',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (response.ok || response.status === 404) { // 404 is acceptable for base URL
      logger.success('LLM API connection healthy', {
        latency: `${latency}ms`,
      }, 'ChatClient');
      return { healthy: true, latency };
    }

    logger.warn('LLM API connection unhealthy', {
      status: response.status,
      latency: `${latency}ms`,
    }, 'ChatClient');
    
    return { 
      healthy: false, 
      latency,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    logger.warn('LLM API connection check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: `${latency}ms`,
    }, 'ChatClient');
    
    return { 
      healthy: false, 
      latency,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
};

/**
 * Create chat completion with streaming support and retry mechanism
 * This function sends messages to OpenAI-compatible API and returns a streaming response
 */
export const createStreamingChatCompletion = async (
  messages: ChatMessage[],
  config: LLMConfig,
  onChunk?: (chunk: string) => void,
  maxRetries: number = 2
): Promise<ReadableStream<Uint8Array>> => {
  const startTime = Date.now();
  
  logger.info('Creating streaming chat completion', {
    messageCount: messages.length,
    model: config.modelName,
    maxRetries,
  }, 'ChatClient');

  const validation = validateLLMConfig(config);
  if (!validation.valid) {
    logger.error('LLM config validation failed', { error: validation.error }, 'ChatClient');
    throw new Error(validation.error);
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
      logger.info('Retrying streaming request', {
        attempt,
        maxRetries,
        backoffDelay: `${backoffDelay}ms`,
      }, 'ChatClient');
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }

    try {
      const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
      
      logger.debug('Sending request to LLM API', {
        endpoint,
        model: config.modelName,
        messagesCount: messages.length,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
      }, 'ChatClient');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      logger.debug('Removed max_tokens limit to allow unlimited response length', {
        model: config.modelName,
        note: 'AI responses will not be truncated by token limits',
      }, 'ChatClient');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelName,
          messages,
          stream: true,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('LLM API request failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          attempt: attempt + 1,
          duration: `${Date.now() - startTime}ms`,
        }, 'ChatClient');
        
        // Don't retry on 4xx errors (client errors) except 429 (rate limit)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
        }
        
        lastError = new Error(`LLM API error: ${response.status} ${response.statusText}`);
        continue; // Retry on 5xx or 429
      }

      if (!response.body) {
        lastError = new Error('Response body is empty');
        logger.error('Response body is empty', {
          attempt: attempt + 1,
        }, 'ChatClient');
        continue; // Retry
      }

      logger.success('Streaming chat completion started', {
        duration: `${Date.now() - startTime}ms`,
        attempt: attempt + 1,
      }, 'ChatClient');

      return response.body;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('LLM API request timed out', {
          timeout: config.timeout,
          duration: `${duration}ms`,
          attempt: attempt + 1,
        }, 'ChatClient');
        lastError = new Error('Request timed out');
        continue; // Retry on timeout
      }

      logger.error('Failed to create streaming chat completion', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        attempt: attempt + 1,
      }, 'ChatClient');
      
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      // Don't retry on network errors if this was the last attempt
      if (attempt >= maxRetries) {
        break;
      }
    }
  }

  // All retries exhausted
  logger.error('All retry attempts exhausted', {
    maxRetries,
    totalDuration: `${Date.now() - startTime}ms`,
    finalError: lastError?.message,
  }, 'ChatClient');
  
  throw lastError || new Error('Failed to create streaming chat completion after retries');
};

/**
 * Parse SSE (Server-Sent Events) stream from OpenAI
 */
export const parseSSEStream = async (
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error) => void
): Promise<void> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  logger.debug('Starting SSE stream parsing', undefined, 'ChatClient');

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        logger.debug('SSE stream completed', undefined, 'ChatClient');
        onComplete();
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
            
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (parseError) {
            logger.warn('Failed to parse SSE chunk', {
              line: trimmedLine,
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            }, 'ChatClient');
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error parsing SSE stream', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ChatClient');
    onError(error instanceof Error ? error : new Error('Stream parsing error'));
  } finally {
    reader.releaseLock();
  }
};

/**
 * Create a non-streaming chat completion (fallback)
 */
export const createChatCompletion = async (
  messages: ChatMessage[],
  config: LLMConfig
): Promise<string> => {
  const startTime = Date.now();
  
  logger.info('Creating chat completion', {
    messageCount: messages.length,
    model: config.modelName,
  }, 'ChatClient');

  const validation = validateLLMConfig(config);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    logger.debug('Removed max_tokens limit to allow unlimited response length', {
      model: config.modelName,
      note: 'AI responses will not be truncated by token limits',
    }, 'ChatClient');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('LLM API request failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      }, 'ChatClient');
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    logger.success('Chat completion received', {
      contentLength: content.length,
      duration: `${Date.now() - startTime}ms`,
    }, 'ChatClient');

    return content;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('LLM API request timed out', {
        timeout: config.timeout,
        duration: `${duration}ms`,
      }, 'ChatClient');
      throw new Error('Request timed out');
    }

    logger.error('Failed to create chat completion', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }, 'ChatClient');
    
    throw error;
  }
};

