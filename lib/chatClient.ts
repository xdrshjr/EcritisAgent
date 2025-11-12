/**
 * Chat Client Utility
 * Handles communication with OpenAI-compatible LLM API
 * Supports streaming responses for real-time chat experience
 */

import { logger } from './logger';

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
 * Get LLM configuration from environment variables
 */
export const getLLMConfig = (): LLMConfig => {
  const config: LLMConfig = {
    apiKey: process.env.LLM_API_KEY || '',
    apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1',
    modelName: process.env.LLM_MODEL_NAME || 'gpt-4',
    timeout: parseInt(process.env.LLM_API_TIMEOUT || '30000', 10),
  };

  logger.debug('LLM configuration loaded', {
    apiUrl: config.apiUrl,
    modelName: config.modelName,
    timeout: config.timeout,
    hasApiKey: !!config.apiKey,
  }, 'ChatClient');

  return config;
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
 * Create chat completion with streaming support
 * This function sends messages to OpenAI-compatible API and returns a streaming response
 */
export const createStreamingChatCompletion = async (
  messages: ChatMessage[],
  config: LLMConfig,
  onChunk?: (chunk: string) => void
): Promise<ReadableStream<Uint8Array>> => {
  const startTime = Date.now();
  
  logger.info('Creating streaming chat completion', {
    messageCount: messages.length,
    model: config.modelName,
  }, 'ChatClient');

  const validation = validateLLMConfig(config);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
    
    logger.debug('Sending request to LLM API', {
      endpoint,
      model: config.modelName,
      messagesCount: messages.length,
    }, 'ChatClient');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

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
        max_tokens: 2000,
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
        duration: `${Date.now() - startTime}ms`,
      }, 'ChatClient');
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is empty');
    }

    logger.success('Streaming chat completion started', {
      duration: `${Date.now() - startTime}ms`,
    }, 'ChatClient');

    return response.body;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('LLM API request timed out', {
        timeout: config.timeout,
        duration: `${duration}ms`,
      }, 'ChatClient');
      throw new Error('Request timed out');
    }

    logger.error('Failed to create streaming chat completion', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }, 'ChatClient');
    
    throw error;
  }
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
        max_tokens: 2000,
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

