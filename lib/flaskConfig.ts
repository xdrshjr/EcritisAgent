/**
 * Flask Backend Configuration Utility
 * 
 * Provides Flask backend URL for API route proxying.
 * The Flask backend handles all LLM API calls with comprehensive logging and error handling.
 */

import http from 'node:http';
import { logger } from './logger';

/**
 * Get Flask backend base URL
 * The Flask backend runs on localhost:5000 by default
 */
export const getFlaskBackendUrl = (): string => {
  // Check for custom Flask port from environment
  const flaskPort = process.env.FLASK_PORT || process.env.FLASK_BACKEND_PORT || '5000';
  const flaskHost = process.env.FLASK_HOST || '127.0.0.1';
  
  const baseUrl = `http://${flaskHost}:${flaskPort}`;
  
  logger.debug('Flask backend URL configuration', {
    baseUrl,
    host: flaskHost,
    port: flaskPort,
    source: process.env.FLASK_PORT ? 'FLASK_PORT env var' : 'default',
  }, 'FlaskConfig');
  
  return baseUrl;
};

/**
 * Build Flask API endpoint URL
 */
export const buildFlaskApiUrl = (endpoint: string): string => {
  const baseUrl = getFlaskBackendUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${normalizedEndpoint}`;
  
  logger.debug('Built Flask API URL', {
    endpoint,
    fullUrl: url,
  }, 'FlaskConfig');
  
  return url;
};

/**
 * Check if Flask backend is available
 */
export const checkFlaskBackendHealth = async (): Promise<boolean> => {
  try {
    logger.info('Checking Flask backend health', undefined, 'FlaskConfig');

    const response = await fetchFlask('/health', { method: 'GET', timeout: 5000 });
    const isHealthy = response.ok;

    if (isHealthy) {
      logger.success('Flask backend is healthy', { status: response.status }, 'FlaskConfig');
    } else {
      logger.warn('Flask backend health check returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
      }, 'FlaskConfig');
    }

    return isHealthy;
  } catch (error) {
    logger.error('Flask backend health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : typeof error,
    }, 'FlaskConfig');

    return false;
  }
};

/**
 * Fetch Flask backend using Node.js http.request directly.
 *
 * Next.js 16 patches global `fetch` with caching/instrumentation that can break
 * connections to local werkzeug dev server (keep-alive reuse causes "other side closed").
 * This function bypasses the patched fetch by using Node.js http module directly,
 * creating a fresh TCP connection per call.
 *
 * Works correctly in both dev (Next.js) and production (Electron) environments.
 */
export interface FetchFlaskInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface FetchFlaskResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  body: ReadableStream<Uint8Array> | null;
}

export const fetchFlask = (endpoint: string, init?: FetchFlaskInit): Promise<FetchFlaskResponse> => {
  const flaskPort = process.env.FLASK_PORT || process.env.FLASK_BACKEND_PORT || '5000';
  const flaskHost = process.env.FLASK_HOST || '127.0.0.1';
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const timeout = init?.timeout ?? 120000;

  logger.debug('fetchFlask request', {
    host: flaskHost,
    port: flaskPort,
    path: normalizedEndpoint,
    method: init?.method || 'GET',
  }, 'FlaskConfig');

  return new Promise((resolve, reject) => {
    // Handle external abort signal
    if (init?.signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    // Declare abort handler before http.request so it can be cleaned up in the response callback
    let onAbort: (() => void) | undefined;

    const req = http.request(
      {
        hostname: flaskHost,
        port: Number(flaskPort),
        path: normalizedEndpoint,
        method: init?.method || 'GET',
        headers: {
          ...(init?.headers || {}),
          Connection: 'close',
        },
      },
      (res) => {
        // Clean up external abort listener on successful connection
        if (onAbort && init?.signal) {
          init.signal.removeEventListener('abort', onAbort);
        }

        const status = res.statusCode ?? 500;
        const statusText = res.statusMessage ?? '';
        const ok = status >= 200 && status < 300;

        // Collect response headers
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) {
            headers[key] = Array.isArray(val) ? val.join(', ') : val;
          }
        }

        // Create a ReadableStream from the Node.js response
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on('data', (chunk: Buffer) => {
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on('end', () => {
              controller.close();
            });
            res.on('error', (err) => {
              controller.error(err);
            });
          },
          cancel() {
            res.destroy();
          },
        });

        const response: FetchFlaskResponse = {
          ok,
          status,
          statusText,
          headers,
          body,
          text: async () => {
            const reader = body.getReader();
            const chunks: Uint8Array[] = [];
            let done = false;
            while (!done) {
              const result = await reader.read();
              done = result.done;
              if (result.value) chunks.push(result.value);
            }
            const decoder = new TextDecoder();
            return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
          },
          json: async () => {
            const reader = body.getReader();
            const chunks: Uint8Array[] = [];
            let readDone = false;
            while (!readDone) {
              const result = await reader.read();
              readDone = result.done;
              if (result.value) chunks.push(result.value);
            }
            const decoder = new TextDecoder();
            const text = chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
            return JSON.parse(text);
          },
        };

        resolve(response);
      }
    );

    // Timeout
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });

    // External abort signal
    onAbort = () => {
      req.destroy();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    init?.signal?.addEventListener('abort', onAbort, { once: true });

    req.on('error', (err) => {
      if (onAbort && init?.signal) {
        init.signal.removeEventListener('abort', onAbort);
      }
      reject(new TypeError(`fetch failed: ${err.message}`));
    });

    // Write body
    if (init?.body) {
      req.write(init.body);
    }
    req.end();
  });
};

