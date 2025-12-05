/**
 * Text Processing API Proxy
 * Proxies text processing requests (polish, rewrite, check) to Flask backend
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Text processing API proxy received request', undefined, 'API:TextProcessing');

  try {
    const body = await request.json();
    const { text, type, modelId } = body as {
      text: string;
      type: 'polish' | 'rewrite' | 'check';
      modelId?: string;
    };

    if (!text || typeof text !== 'string') {
      logger.warn('Text processing API: Invalid text parameter', {
        hasText: !!text,
        textType: typeof text,
      }, 'API:TextProcessing');
      
      return new Response(
        JSON.stringify({ error: 'text is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!type || !['polish', 'rewrite', 'check'].includes(type)) {
      logger.warn('Text processing API: Invalid type parameter', {
        type,
      }, 'API:TextProcessing');
      
      return new Response(
        JSON.stringify({ error: 'type must be one of: polish, rewrite, check' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.debug('Text processing API: Forwarding to Flask backend', {
      textLength: text.length,
      textPreview: text.substring(0, 100),
      type,
      modelId: modelId || 'default',
    }, 'API:TextProcessing');

    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/text-processing');
    logger.debug('Text processing API: Flask URL', { flaskUrl }, 'API:TextProcessing');

    // Set timeout for text processing (2 minutes)
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      logger.warn('Text processing API: Request timeout (2min)', undefined, 'API:TextProcessing');
      controller.abort();
    }, 120000);

    let flaskResponse: Response;
    try {
      flaskResponse = await fetch(flaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          type,
          modelId,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      logger.error('Text processing API: Failed to connect to Flask backend', {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        flaskUrl,
      }, 'API:TextProcessing');
      
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to backend',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    // Handle non-OK responses from Flask
    if (!flaskResponse.ok) {
      const text = await flaskResponse.text();
      logger.error('Text processing API: Backend returned error', {
        status: flaskResponse.status,
        statusText: flaskResponse.statusText,
        responsePreview: text.substring(0, 200),
      }, 'API:TextProcessing');
      
      return new Response(text, {
        status: flaskResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await flaskResponse.json();
    
    logger.success('Text processing API: Request completed', {
      type,
      duration: `${Date.now() - startTime}ms`,
    }, 'API:TextProcessing');

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    logger.error('Text processing API: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'API:TextProcessing');
    
    return new Response(
      JSON.stringify({
        error: 'Text processing proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

