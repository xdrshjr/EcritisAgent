/**
 * AI Chat API - Flask Backend Proxy
 * Proxies chat requests to Flask backend which handles LLM API calls
 * This ensures all LLM communication goes through Python backend with comprehensive logging
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl, fetchFlask } from '@/lib/flaskConfig';
import type { ChatMessage } from '@/lib/chatClient';

// Use Node.js runtime for proper HTTP streaming support
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/chat
 * Stop an active chat streaming session
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Chat API stop request received', undefined, 'API:Chat');

  try {
    // Parse request body to get session ID
    const body = await request.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      logger.warn('Stop request missing sessionId', undefined, 'API:Chat');
      return new Response(
        JSON.stringify({ 
          error: 'sessionId is required',
          success: false 
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Stopping chat session', { sessionId }, 'API:Chat');

    // Build Flask backend stop URL
    const flaskUrl = buildFlaskApiUrl('/api/chat/stop');
    
    logger.debug('Forwarding stop request to Flask backend', { 
      url: flaskUrl,
      sessionId 
    }, 'API:Chat');

    // Forward stop request to Flask backend using Node.js http directly
    let flaskResponse: Awaited<ReturnType<typeof fetchFlask>>;

    try {
      flaskResponse = await fetchFlask('/api/chat/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
        timeout: 5000,
      });

      logger.debug('Flask backend stop response received', {
        status: flaskResponse.status,
        ok: flaskResponse.ok,
      }, 'API:Chat');

    } catch (fetchError) {
      logger.error('Failed to connect to Flask backend for stop', {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        sessionId,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify({ 
          error: 'Flask backend unavailable',
          details: `Could not connect to Flask backend to stop session`,
          success: false
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse Flask response
    const responseData = await flaskResponse.json();
    
    if (!flaskResponse.ok) {
      logger.error('Flask backend returned error for stop request', {
        status: flaskResponse.status,
        data: responseData,
        sessionId,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify(responseData),
        {
          status: flaskResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Chat session stopped successfully', {
      sessionId,
      duration: `${Date.now() - startTime}ms`,
    }, 'API:Chat');

    return new Response(
      JSON.stringify(responseData),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Chat API stop request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }, 'API:Chat');

    return new Response(
      JSON.stringify({ 
        error: 'Stop request failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * POST /api/chat
 * Proxy chat requests to Flask backend
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Chat API proxy: Request received', undefined, 'API:Chat');

  try {
    // Parse request body
    const body = await request.json();
    const { messages, modelId, mcpEnabled, mcpTools, networkSearchEnabled } = body as { 
      messages: ChatMessage[]; 
      modelId?: string | null;
      mcpEnabled?: boolean;
      mcpTools?: any[];
      networkSearchEnabled?: boolean;
    };

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      logger.warn('Invalid messages in chat request', { 
        hasMessages: !!messages,
        isArray: Array.isArray(messages),
        length: messages?.length,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify({ error: 'Messages array is required and must not be empty' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.debug('Proxying chat request to Flask backend', {
      messageCount: messages.length,
      lastMessageRole: messages[messages.length - 1]?.role,
      modelId: modelId || 'default',
      mcpEnabled: mcpEnabled || false,
      mcpToolCount: mcpTools?.length || 0,
      networkSearchEnabled: networkSearchEnabled || false,
    }, 'API:Chat');

    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/chat');
    
    logger.info('Forwarding to Flask backend', {
      url: flaskUrl,
      messageCount: messages.length,
      modelId: modelId || 'default',
      mcpEnabled: mcpEnabled || false,
      mcpToolCount: mcpTools?.length || 0,
      networkSearchEnabled: networkSearchEnabled || false,
    }, 'API:Chat');

    // Prepare request body for Flask backend
    const flaskRequestBody = {
      messages,
      ...(modelId && { modelId }), // Only include modelId if it's provided
      ...(mcpEnabled !== undefined && { mcpEnabled }), // Include MCP enabled flag
      ...(mcpTools && { mcpTools }), // Include MCP tools array
      ...(networkSearchEnabled !== undefined && { networkSearchEnabled }), // Include network search enabled flag
    };

    // Forward request to Flask backend using Node.js http directly
    let flaskResponse: Awaited<ReturnType<typeof fetchFlask>>;

    try {
      flaskResponse = await fetchFlask('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flaskRequestBody),
        timeout: 120000,
      });

      logger.debug('Flask backend response received', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        ok: flaskResponse.ok,
        contentType: flaskResponse.headers['content-type'],
      }, 'API:Chat');

    } catch (fetchError) {
      
      const errorDetails = {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        errorName: fetchError instanceof Error ? fetchError.name : 'Unknown',
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        flaskUrl,
        isAbortError: fetchError instanceof Error && fetchError.name === 'AbortError',
        duration: `${Date.now() - startTime}ms`,
      };
      
      logger.error('Failed to connect to Flask backend', errorDetails, 'API:Chat');
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: 'Request timed out',
            details: 'The request to Flask backend timed out. Please try again.',
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
      let errorData: { 
        error?: string; 
        details?: string;
        status_code?: number;
        message?: string;
        user_message?: string;
        error_data?: any;
      } = {};
      
      try {
        const errorText = await flaskResponse.text();
        logger.debug('Received error response from Flask', {
          status: flaskResponse.status,
          responseText: errorText.substring(0, 500), // Log first 500 chars
        }, 'API:Chat');
        
        errorData = JSON.parse(errorText);
        
        logger.debug('Parsed Flask error response', {
          hasError: !!errorData.error,
          hasDetails: !!errorData.details,
          hasStatusCode: !!errorData.status_code,
          hasUserMessage: !!errorData.user_message,
          hasErrorData: !!errorData.error_data,
          errorCode: errorData.error,
          statusCode: errorData.status_code,
        }, 'API:Chat');
      } catch (parseError) {
        logger.warn('Failed to parse Flask error response', {
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          status: flaskResponse.status,
        }, 'API:Chat');
      }
      
      logger.error('Flask backend returned error', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        errorCode: errorData.error,
        statusCode: errorData.status_code,
        userMessage: errorData.user_message,
        hasDetails: !!errorData.details,
        hasErrorData: !!errorData.error_data,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:Chat');
      
      // Forward all error fields from Flask to frontend
      const errorResponse: any = {
        error: errorData.error || `Flask backend error: ${flaskResponse.status} ${flaskResponse.statusText}`,
        details: errorData.details || 'The Python backend returned an error. Please check backend logs.',
      };
      
      // Include optional fields if they exist
      if (errorData.status_code !== undefined) {
        errorResponse.status_code = errorData.status_code;
      }
      if (errorData.message) {
        errorResponse.message = errorData.message;
      }
      if (errorData.user_message) {
        errorResponse.user_message = errorData.user_message;
      }
      if (errorData.error_data) {
        errorResponse.error_data = errorData.error_data;
      }
      
      logger.info('Forwarding structured error to frontend', {
        errorCode: errorResponse.error,
        hasUserMessage: !!errorResponse.user_message,
        hasStatusCode: !!errorResponse.status_code,
        hasErrorData: !!errorResponse.error_data,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify(errorResponse),
        {
          status: flaskResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if response has body
    if (!flaskResponse.body) {
      logger.error('Flask response body is empty', undefined, 'API:Chat');
      return new Response(
        JSON.stringify({ error: 'Empty response from Flask backend' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming Flask response to client', {
      duration: `${Date.now() - startTime}ms`,
    }, 'API:Chat');

    // Stream Flask response to client with enhanced logging
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        let totalChunks = 0;
        let totalBytes = 0;
        let lastProgressLog = Date.now();
        const progressLogInterval = 3000; // Log every 3 seconds

        logger.info('Starting Flask response stream proxy', {
          flaskUrl,
        }, 'API:Chat');

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Flask stream proxy completed', {
                totalChunks,
                totalBytes,
                averageChunkSize: totalChunks > 0 ? Math.round(totalBytes / totalChunks) : 0,
                duration: `${Date.now() - startTime}ms`,
              }, 'API:Chat');
              controller.close();
              break;
            }

            if (!value || value.length === 0) {
              logger.warn('Received empty chunk from Flask stream', {
                chunkIndex: totalChunks,
              }, 'API:Chat');
              continue;
            }

            totalChunks++;
            totalBytes += value.length;
            
            try {
              controller.enqueue(value);
              
              // Periodic progress logging
              const now = Date.now();
              if (now - lastProgressLog >= progressLogInterval) {
                logger.debug('Flask stream proxy progress', {
                  chunks: totalChunks,
                  bytes: totalBytes,
                  elapsed: `${now - startTime}ms`,
                }, 'API:Chat');
                lastProgressLog = now;
              }
            } catch (enqueueError) {
              logger.error('Failed to enqueue chunk to client stream', {
                error: enqueueError instanceof Error ? enqueueError.message : 'Unknown error',
                chunkIndex: totalChunks,
              }, 'API:Chat');
              throw enqueueError;
            }
          }
        } catch (error) {
          logger.error('Error in Flask stream proxy', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            totalChunks,
            totalBytes,
            duration: `${Date.now() - startTime}ms`,
          }, 'API:Chat');
          
          try {
            controller.error(new Error(
              error instanceof Error ? error.message : 'Stream proxy failed'
            ));
          } catch (controllerError) {
            logger.error('Failed to send error to client', {
              error: controllerError instanceof Error ? controllerError.message : 'Unknown error',
            }, 'API:Chat');
          }
        } finally {
          try {
            reader.releaseLock();
            logger.debug('Flask stream reader released', {
              totalChunks,
              totalBytes,
            }, 'API:Chat');
          } catch (releaseError) {
            logger.warn('Failed to release Flask stream reader', {
              error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
            }, 'API:Chat');
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
        'X-Proxy-Source': 'Flask-Backend',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Chat API proxy failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:Chat');

    return new Response(
      JSON.stringify({ 
        error: 'Chat proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred in chat proxy',
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
 * Health check endpoint - checks Flask backend availability
 */
export async function GET() {
  logger.info('Chat API health check', undefined, 'API:Chat');

  try {
    const flaskUrl = buildFlaskApiUrl('/api/chat');
    
    logger.debug('Checking Flask backend chat endpoint', { url: flaskUrl }, 'API:Chat');
    
    // Forward health check to Flask using Node.js http directly
    const response = await fetchFlask('/api/chat', {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json() as { configured?: boolean; model?: string };
      logger.success('Flask chat endpoint is healthy', { data }, 'API:Chat');

      return new Response(
        JSON.stringify({
          status: 'ok',
          backend: 'flask',
          flaskEndpoint: flaskUrl,
          configured: data.configured,
          model: data.model,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      logger.warn('Flask chat endpoint returned non-OK status', {
        status: response.status,
      }, 'API:Chat');
      
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          backend: 'flask',
          flaskEndpoint: flaskUrl,
          configured: false,
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    logger.error('Chat API health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:Chat');

    return new Response(
      JSON.stringify({ 
        status: 'error', 
        backend: 'flask',
        configured: false,
        error: 'Flask backend unavailable',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

