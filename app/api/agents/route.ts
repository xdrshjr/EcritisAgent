/**
 * Agents List API Proxy
 * Proxies requests to get available agents from Flask backend
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl, fetchFlask } from '@/lib/flaskConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const start = Date.now();
  logger.info('Agents List API proxy received request', undefined, 'API:Agents');

  try {
    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/agents');
    logger.debug('Agents List API: Flask URL', { flaskUrl }, 'API:Agents');

    // Forward request to Flask backend using Node.js http directly
    let flaskResponse: Awaited<ReturnType<typeof fetchFlask>>;
    try {
      flaskResponse = await fetchFlask('/api/agents', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
    } catch (fetchError) {
      logger.error('Agents List API: Failed to connect to Flask backend', {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        flaskUrl,
      }, 'API:Agents');

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
    }

    // Get response body
    const responseText = await flaskResponse.text();

    // Handle non-OK responses from Flask
    if (!flaskResponse.ok) {
      logger.error('Agents List API: Backend returned error', { 
        status: flaskResponse.status, 
        statusText: flaskResponse.statusText,
        responsePreview: responseText.substring(0, 200),
      }, 'API:Agents');
      
      return new Response(responseText, {
        status: flaskResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate response
    let agentsData;
    try {
      agentsData = JSON.parse(responseText);
      logger.info('Agents List API: Successfully retrieved agents', {
        agentCount: agentsData.agents?.length || 0,
        duration: `${Date.now() - start}ms`,
      }, 'API:Agents');
    } catch (parseError) {
      logger.error('Agents List API: Failed to parse backend response', {
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        responsePreview: responseText.substring(0, 200),
      }, 'API:Agents');
      
      return new Response(
        JSON.stringify({
          error: 'Failed to parse backend response',
          details: 'Invalid JSON response from backend',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Agents List API: Proxy completed', {
      duration: `${Date.now() - start}ms`,
    }, 'API:Agents');

    return new Response(responseText, {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
    
  } catch (error) {
    logger.error('Agents List API: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'API:Agents');
    
    return new Response(
      JSON.stringify({
        error: 'Agents list proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

