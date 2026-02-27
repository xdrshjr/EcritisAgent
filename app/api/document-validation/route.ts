/**
 * AI Document Validation API - Flask Backend Proxy
 * Proxies document validation requests to Flask backend which handles LLM API calls
 * This ensures all LLM communication goes through Python backend with comprehensive logging
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl, fetchFlask } from '@/lib/flaskConfig';

// Use Node.js runtime for proper HTTP streaming support
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/document-validation
 * Proxy document validation requests to Flask backend
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Document validation API proxy: Request received', undefined, 'API:DocumentValidation');

  try {
    // Parse request body
    const body = await request.json();
    const { content, chunkIndex, totalChunks, language, modelId } = body as { 
      content: string; 
      chunkIndex: number; 
      totalChunks: number;
      language?: string;
      modelId?: string;
    };

    // Validate input
    if (!content || typeof content !== 'string') {
      logger.warn('Invalid content in validation request', { 
        hasContent: !!content, 
        contentType: typeof content,
        chunkIndex,
      }, 'API:DocumentValidation');
      
      return new Response(
        JSON.stringify({ error: 'Content is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Normalize language parameter (default to 'en' if not provided)
    const normalizedLanguage = language || 'en';

    logger.debug('Proxying validation request to Flask backend', {
      contentLength: content.length,
      chunkIndex,
      totalChunks,
      language: normalizedLanguage,
      modelId: modelId || 'default',
    }, 'API:DocumentValidation');

    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/document-validation');
    
    logger.info('Forwarding validation to Flask backend', {
      url: flaskUrl,
      chunkIndex,
      totalChunks,
      contentLength: content.length,
      language: normalizedLanguage,
      modelId: modelId || 'default',
    }, 'API:DocumentValidation');

    // Forward request to Flask backend using Node.js http directly
    // (bypasses Next.js patched fetch which can break local connections)
    const controller = new AbortController();

    let flaskResponse: Awaited<ReturnType<typeof fetchFlask>>;

    try {
      flaskResponse = await fetchFlask('/api/document-validation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          chunkIndex,
          totalChunks,
          language: normalizedLanguage,
          modelId: modelId,
        }),
        timeout: 120000,
        signal: controller.signal,
      });
      
      logger.debug('Flask backend validation response received', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        ok: flaskResponse.ok,
        chunkIndex,
        contentType: flaskResponse.headers['content-type'],
      }, 'API:DocumentValidation');

    } catch (fetchError) {
      
      const errorDetails = {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        errorName: fetchError instanceof Error ? fetchError.name : 'Unknown',
        errorType: fetchError instanceof Error ? fetchError.constructor.name : typeof fetchError,
        flaskUrl,
        chunkIndex,
        isAbortError: fetchError instanceof Error && fetchError.name === 'AbortError',
        duration: `${Date.now() - startTime}ms`,
      };
      
      logger.error('Failed to connect to Flask backend for validation', errorDetails, 'API:DocumentValidation');
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: 'Validation request timed out',
            details: 'The validation request to Flask backend timed out. Please try again.',
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
        logger.warn('Failed to parse Flask validation error response', {
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          chunkIndex,
        }, 'API:DocumentValidation');
      }
      
      logger.error('Flask backend validation returned error', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        error: errorData.error,
        details: errorData.details,
        chunkIndex,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:DocumentValidation');
      
      return new Response(
        JSON.stringify({ 
          error: errorData.error || `Flask backend validation error: ${flaskResponse.status} ${flaskResponse.statusText}`,
          details: errorData.details || 'The Python backend returned a validation error. Please check backend logs.',
        }),
        {
          status: flaskResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if response has body
    if (!flaskResponse.body) {
      logger.error('Flask validation response body is empty', { chunkIndex }, 'API:DocumentValidation');
      return new Response(
        JSON.stringify({ error: 'Empty response from Flask backend' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming Flask validation response to client', {
      duration: `${Date.now() - startTime}ms`,
      chunkIndex,
    }, 'API:DocumentValidation');

    // Stream Flask response to client with enhanced logging
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        let totalChunks = 0;
        let totalBytes = 0;
        let lastProgressLog = Date.now();
        const progressLogInterval = 3000; // Log every 3 seconds

        logger.info('Starting Flask validation response stream proxy', {
          flaskUrl,
          chunkIndex,
          totalChunks: body.totalChunks,
        }, 'API:DocumentValidation');

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Flask validation stream proxy completed', {
                totalChunks,
                totalBytes,
                averageChunkSize: totalChunks > 0 ? Math.round(totalBytes / totalChunks) : 0,
                chunkIndex,
                duration: `${Date.now() - startTime}ms`,
              }, 'API:DocumentValidation');
              controller.close();
              break;
            }

            if (!value || value.length === 0) {
              logger.warn('Received empty chunk from Flask validation stream', {
                streamChunkIndex: totalChunks,
                documentChunkIndex: chunkIndex,
              }, 'API:DocumentValidation');
              continue;
            }

            totalChunks++;
            totalBytes += value.length;
            
            try {
              controller.enqueue(value);
              
              // Periodic progress logging
              const now = Date.now();
              if (now - lastProgressLog >= progressLogInterval) {
                logger.debug('Flask validation stream proxy progress', {
                  chunks: totalChunks,
                  bytes: totalBytes,
                  chunkIndex,
                  elapsed: `${now - startTime}ms`,
                }, 'API:DocumentValidation');
                lastProgressLog = now;
              }
            } catch (enqueueError) {
              logger.error('Failed to enqueue chunk to client validation stream', {
                error: enqueueError instanceof Error ? enqueueError.message : 'Unknown error',
                streamChunkIndex: totalChunks,
                documentChunkIndex: chunkIndex,
              }, 'API:DocumentValidation');
              throw enqueueError;
            }
          }
        } catch (error) {
          logger.error('Error in Flask validation stream proxy', {
            error: error instanceof Error ? error.message : 'Unknown error',
            errorStack: error instanceof Error ? error.stack : undefined,
            totalChunks,
            totalBytes,
            chunkIndex,
            duration: `${Date.now() - startTime}ms`,
          }, 'API:DocumentValidation');
          
          try {
            controller.error(new Error(
              error instanceof Error ? error.message : 'Validation stream proxy failed'
            ));
          } catch (controllerError) {
            logger.error('Failed to send validation error to client', {
              error: controllerError instanceof Error ? controllerError.message : 'Unknown error',
              chunkIndex,
            }, 'API:DocumentValidation');
          }
        } finally {
          try {
            reader.releaseLock();
            logger.debug('Flask validation stream reader released', {
              totalChunks,
              totalBytes,
              chunkIndex,
            }, 'API:DocumentValidation');
          } catch (releaseError) {
            logger.warn('Failed to release Flask validation stream reader', {
              error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
              chunkIndex,
            }, 'API:DocumentValidation');
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
    
    logger.error('Document validation API proxy failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:DocumentValidation');

    return new Response(
      JSON.stringify({ 
        error: 'Validation proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred in validation proxy',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/document-validation
 * Health check endpoint - checks Flask backend availability
 */
export async function GET() {
  logger.info('Document validation API health check', undefined, 'API:DocumentValidation');

  try {
    const flaskUrl = buildFlaskApiUrl('/api/document-validation');
    
    logger.debug('Checking Flask backend validation endpoint', { url: flaskUrl }, 'API:DocumentValidation');

    // Forward health check to Flask using Node.js http directly
    const response = await fetchFlask('/api/document-validation', {
      method: 'GET',
    });

    if (response.ok) {
      const data = await response.json() as { configured?: boolean; model?: string };
      logger.success('Flask validation endpoint is healthy', { data }, 'API:DocumentValidation');

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
      logger.warn('Flask validation endpoint returned non-OK status', {
        status: response.status,
      }, 'API:DocumentValidation');
      
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
    logger.error('Document validation API health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:DocumentValidation');

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

