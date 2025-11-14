/**
 * AI Agent Validation API - Flask Backend Proxy
 * Proxies agent-based validation requests to Flask backend
 * Streams agent thinking, planning, and execution results
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';

// Use Node.js runtime for proper HTTP streaming support
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/agent-validation
 * Proxy agent validation requests to Flask backend
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Agent validation API proxy: Request received', undefined, 'API:AgentValidation');

  try {
    // Parse request body
    const body = await request.json();
    const { command, content, language, modelId } = body as { 
      command: string; 
      content: string;
      language?: string;
      modelId?: string;
    };

    // Validate input
    if (!command || typeof command !== 'string') {
      logger.warn('Invalid command in agent validation request', { 
        hasCommand: !!command, 
        commandType: typeof command,
      }, 'API:AgentValidation');
      
      return new Response(
        JSON.stringify({ error: 'Command is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!content || typeof content !== 'string') {
      logger.warn('Invalid content in agent validation request', { 
        hasContent: !!content, 
        contentType: typeof content,
      }, 'API:AgentValidation');
      
      return new Response(
        JSON.stringify({ error: 'Document content is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Normalize language parameter (default to 'en' if not provided)
    const normalizedLanguage = language || 'en';

    logger.debug('Proxying agent validation request to Flask backend', {
      commandLength: command.length,
      contentLength: content.length,
      language: normalizedLanguage,
      modelId: modelId || 'default',
    }, 'API:AgentValidation');

    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/agent-validation');
    
    logger.info('Forwarding agent validation to Flask backend', {
      url: flaskUrl,
      commandLength: command.length,
      contentLength: content.length,
      language: normalizedLanguage,
      modelId: modelId || 'default',
    }, 'API:AgentValidation');

    // Forward request to Flask backend
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for agent

    let flaskResponse: Response;
    
    try {
      flaskResponse = await fetch(flaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          content,
          language: normalizedLanguage,
          modelId: modelId,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      logger.debug('Flask backend agent validation response received', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        ok: flaskResponse.ok,
        contentType: flaskResponse.headers.get('content-type'),
      }, 'API:AgentValidation');
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      const errorDetails = {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        errorName: fetchError instanceof Error ? fetchError.name : 'Unknown',
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        flaskUrl,
        isAbortError: fetchError instanceof Error && fetchError.name === 'AbortError',
        duration: `${Date.now() - startTime}ms`,
      };
      
      logger.error('Failed to connect to Flask backend for agent validation', errorDetails, 'API:AgentValidation');
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: 'Agent validation request timed out',
            details: 'The agent validation request to Flask backend timed out. Please try again.',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'Flask backend unavailable',
          details: `Could not connect to Flask backend at ${flaskUrl}. Please ensure the Python backend is running. Error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle non-OK responses from Flask
    if (!flaskResponse.ok) {
      let errorData: { error?: string; details?: string } = {};
      
      try {
        const errorText = await flaskResponse.text();
        errorData = JSON.parse(errorText);
      } catch (parseError) {
        logger.warn('Failed to parse Flask agent validation error response', {
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
        }, 'API:AgentValidation');
      }
      
      logger.error('Flask backend agent validation returned error', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        error: errorData.error,
        details: errorData.details,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:AgentValidation');
      
      return new Response(
        JSON.stringify({ 
          error: errorData.error || `Flask backend agent validation error: ${flaskResponse.status} ${flaskResponse.statusText}`,
          details: errorData.details || 'The Python backend returned an agent validation error. Please check backend logs.',
        }),
        {
          status: flaskResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if response has body
    if (!flaskResponse.body) {
      logger.error('Flask agent validation response body is empty', undefined, 'API:AgentValidation');
      return new Response(
        JSON.stringify({ error: 'Empty response from Flask backend' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming Flask agent validation response to client', {
      duration: `${Date.now() - startTime}ms`,
    }, 'API:AgentValidation');

    // Stream Flask response to client with enhanced logging
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        let totalChunks = 0;
        let totalBytes = 0;
        let lastProgressLog = Date.now();
        const progressLogInterval = 5000; // Log every 5 seconds

        logger.info('Starting Flask agent validation response stream proxy', {
          flaskUrl,
        }, 'API:AgentValidation');

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Flask agent validation stream proxy completed', {
                totalChunks,
                totalBytes,
                averageChunkSize: totalChunks > 0 ? Math.round(totalBytes / totalChunks) : 0,
                duration: `${Date.now() - startTime}ms`,
              }, 'API:AgentValidation');
              controller.close();
              break;
            }

            if (!value || value.length === 0) {
              logger.warn('Received empty chunk from Flask agent validation stream', {
                streamChunkIndex: totalChunks,
              }, 'API:AgentValidation');
              continue;
            }

            totalChunks++;
            totalBytes += value.length;
            
            try {
              controller.enqueue(value);
              
              // Periodic progress logging
              const now = Date.now();
              if (now - lastProgressLog >= progressLogInterval) {
                logger.debug('Flask agent validation stream proxy progress', {
                  chunks: totalChunks,
                  bytes: totalBytes,
                  elapsed: `${now - startTime}ms`,
                }, 'API:AgentValidation');
                lastProgressLog = now;
              }
            } catch (enqueueError) {
              logger.error('Failed to enqueue chunk to client agent validation stream', {
                error: enqueueError instanceof Error ? enqueueError.message : 'Unknown error',
                streamChunkIndex: totalChunks,
              }, 'API:AgentValidation');
              throw enqueueError;
            }
          }
        } catch (error) {
          logger.error('Error in Flask agent validation stream proxy', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            totalChunks,
            totalBytes,
            duration: `${Date.now() - startTime}ms`,
          }, 'API:AgentValidation');
          
          try {
            controller.error(new Error(
              error instanceof Error ? error.message : 'Agent validation stream proxy failed'
            ));
          } catch (controllerError) {
            logger.error('Failed to send agent validation error to client', {
              error: controllerError instanceof Error ? controllerError.message : 'Unknown error',
            }, 'API:AgentValidation');
          }
        } finally {
          try {
            reader.releaseLock();
            logger.debug('Flask agent validation stream reader released', {
              totalChunks,
              totalBytes,
            }, 'API:AgentValidation');
          } catch (releaseError) {
            logger.warn('Failed to release Flask agent validation stream reader', {
              error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
            }, 'API:AgentValidation');
          }
        }
      },
    });

    // Return streaming response with proper headers
    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Proxy-Source': 'Flask-Backend-Agent',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Agent validation API proxy failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:AgentValidation');

    return new Response(
      JSON.stringify({ 
        error: 'Agent validation proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred in agent validation proxy',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

