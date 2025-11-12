/**
 * AI Chat API
 * Handles streaming chat completions using OpenAI-compatible LLM API
 * Provides real-time responses for the chat interface
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getLLMConfig, validateLLMConfig, type ChatMessage } from '@/lib/chatClient';

export const runtime = 'edge';

/**
 * POST /api/chat
 * Stream chat completions from LLM
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Chat request received', undefined, 'API:Chat');

  try {
    // Parse request body
    const body = await request.json();
    const { messages } = body as { messages: ChatMessage[] };

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.warn('Invalid messages in chat request', { messages }, 'API:Chat');
      return new Response(
        JSON.stringify({ error: 'Messages array is required and must not be empty' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.debug('Processing chat request', {
      messageCount: messages.length,
      lastMessageRole: messages[messages.length - 1]?.role,
    }, 'API:Chat');

    // Get and validate LLM configuration
    const config = getLLMConfig();
    const validation = validateLLMConfig(config);

    if (!validation.valid) {
      logger.error('LLM configuration validation failed', { error: validation.error }, 'API:Chat');
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid LLM configuration' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Prepare system message
    const systemMessage: ChatMessage = {
      role: 'system',
      content: 'You are a helpful AI assistant for DocAIMaster, an AI-powered document editing and validation tool. You help users with document-related questions, provide guidance on using the tool, and assist with document editing tasks. Be concise, friendly, and professional.',
    };

    const fullMessages = [systemMessage, ...messages];

    logger.debug('Sending request to LLM API', {
      endpoint: config.apiUrl,
      model: config.modelName,
      messageCount: fullMessages.length,
    }, 'API:Chat');

    // Create streaming response
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const llmResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error('LLM API request failed', {
        status: llmResponse.status,
        statusText: llmResponse.statusText,
        error: errorText,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify({ 
          error: `LLM API error: ${llmResponse.status} ${llmResponse.statusText}`,
          details: errorText,
        }),
        {
          status: llmResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!llmResponse.body) {
      logger.error('LLM response body is empty', undefined, 'API:Chat');
      return new Response(
        JSON.stringify({ error: 'Empty response from LLM API' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming chat response started', {
      duration: `${Date.now() - startTime}ms`,
    }, 'API:Chat');

    // Create a transformed stream that logs completion
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = llmResponse.body!.getReader();
        const decoder = new TextDecoder();
        let totalChunks = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Chat stream completed', {
                totalChunks,
                duration: `${Date.now() - startTime}ms`,
              }, 'API:Chat');
              controller.close();
              break;
            }

            totalChunks++;
            controller.enqueue(value);

            // Log progress periodically
            if (totalChunks % 10 === 0) {
              logger.debug('Chat stream progress', {
                chunks: totalChunks,
                chunkSize: value.length,
              }, 'API:Chat');
            }
          }
        } catch (error) {
          logger.error('Error in chat stream', {
            error: error instanceof Error ? error.message : 'Unknown error',
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
          }, 'API:Chat');
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    // Return streaming response
    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Chat request timed out', { duration: `${duration}ms` }, 'API:Chat');
      return new Response(
        JSON.stringify({ error: 'Request timed out' }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.error('Chat request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:Chat');

    return new Response(
      JSON.stringify({ 
        error: 'Failed to process chat request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/chat
 * Health check endpoint
 */
export async function GET() {
  logger.info('Chat API health check', undefined, 'API:Chat');

  try {
    const config = getLLMConfig();
    const validation = validateLLMConfig(config);

    return new Response(
      JSON.stringify({
        status: 'ok',
        configured: validation.valid,
        model: config.modelName,
        endpoint: config.apiUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Chat API health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:Chat');

    return new Response(
      JSON.stringify({ status: 'error', configured: false }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

