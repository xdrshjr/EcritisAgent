/**
 * Electron API Server
 * 
 * This module provides a local API proxy server within Electron that forwards
 * requests to the Flask backend for LLM processing.
 * 
 * Handles:
 * - /api/chat - Proxies to Flask backend for AI chat completions
 * - /api/document-validation - Proxies to Flask backend for document validation
 * - /api/agent-validation - Proxies to Flask backend for agent-based document validation
 * - /api/logs - Proxies to Flask backend for log file access
 * 
 * This server only runs in packaged mode. In development mode, the Next.js
 * dev server handles these routes natively.
 */

const http = require('http');
const { URL } = require('url');

/**
 * API Server Logger
 */
class APILogger {
  constructor(mainLogger) {
    this.mainLogger = mainLogger;
  }

  info(message, data = null) {
    this.mainLogger.info(`[API Server] ${message}`, data);
  }

  debug(message, data = null) {
    this.mainLogger.debug(`[API Server] ${message}`, data);
  }

  error(message, data = null) {
    this.mainLogger.error(`[API Server] ${message}`, data);
  }

  warn(message, data = null) {
    this.mainLogger.warn(`[API Server] ${message}`, data);
  }

  success(message, data = null) {
    this.mainLogger.success(`[API Server] ${message}`, data);
  }
}

/**
 * Get Flask backend port from global
 */
function getFlaskBackendPort() {
  return global.flaskBackendPort || null;
}

/**
 * API Route Handlers - Proxy to Flask Backend
 */
class APIRouteHandlers {
  constructor(app, logger) {
    this.app = app;
    this.logger = logger;
  }

  /**
   * Proxy request to Flask backend
   */
  proxyToFlask(path, method, reqBody, res, queryParams = '') {
    const startTime = Date.now();
    const flaskPort = getFlaskBackendPort();

    this.logger.info(`Proxying ${method} request to Flask backend`, {
      path,
      hasBody: !!reqBody,
      queryParams,
    });

    if (!flaskPort) {
      this.logger.error('Flask backend port not available');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Flask backend not available',
        details: 'The Python backend service is not running. Please check the logs.',
      }));
      return;
    }

    try {
      const flaskUrl = `http://127.0.0.1:${flaskPort}${path}${queryParams}`;
      
      this.logger.debug('Forwarding to Flask backend', {
        url: flaskUrl,
        method,
      });

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const flaskReq = http.request(flaskUrl, options, (flaskRes) => {
        this.logger.debug('Flask backend response received', {
          statusCode: flaskRes.statusCode,
          headers: flaskRes.headers,
        });

        // Forward status code and headers
        res.writeHead(flaskRes.statusCode, flaskRes.headers);

        // Stream the response
        let totalBytes = 0;
        let chunkCount = 0;

        flaskRes.on('data', (chunk) => {
          chunkCount++;
          totalBytes += chunk.length;
          res.write(chunk);
          
          // Log progress periodically
          if (chunkCount % 10 === 0) {
            this.logger.debug('Proxy stream progress', {
              chunks: chunkCount,
              bytes: totalBytes,
              path,
            });
          }
        });

        flaskRes.on('end', () => {
          const duration = Date.now() - startTime;
          this.logger.success('Proxy request completed', {
            path,
            duration: `${duration}ms`,
            chunks: chunkCount,
            bytes: totalBytes,
          });
          res.end();
        });

        flaskRes.on('error', (error) => {
          this.logger.error('Error in Flask response stream', {
            error: error.message,
            path,
          });
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Flask backend stream error',
              details: error.message,
            }));
          }
        });
      });

      flaskReq.on('error', (error) => {
        const duration = Date.now() - startTime;
        this.logger.error('Flask proxy request failed', {
          error: error.message,
          path,
          duration: `${duration}ms`,
        });

        if (!res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Failed to connect to Flask backend',
            details: error.message,
          }));
        }
      });

      flaskReq.on('timeout', () => {
        this.logger.error('Flask proxy request timed out', { path });
        flaskReq.destroy();
        
        if (!res.headersSent) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Flask backend request timed out',
          }));
        }
      });

      // Send request body if present
      if (reqBody) {
        const bodyString = JSON.stringify(reqBody);
        flaskReq.write(bodyString);
      }

      flaskReq.end();

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Proxy request failed', {
        error: error.message,
        stack: error.stack,
        path,
        duration: `${duration}ms`,
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Internal proxy error',
          details: error.message,
        }));
      }
    }
  }

  /**
   * Handle POST /api/chat
   */
  async handleChatRequest(reqBody, res) {
    this.logger.info('Chat request received');
    this.proxyToFlask('/api/chat', 'POST', reqBody, res);
  }

  /**
   * Handle POST /api/document-validation
   */
  async handleDocumentValidationRequest(reqBody, res) {
    this.logger.info('Document validation request received');
    this.proxyToFlask('/api/document-validation', 'POST', reqBody, res);
  }

  /**
   * Handle POST /api/agent-validation
   */
  async handleAgentValidationRequest(reqBody, res) {
    this.logger.info('Agent validation request received', {
      hasCommand: !!reqBody?.command,
      hasContent: !!reqBody?.content,
      commandLength: reqBody?.command?.length || 0,
      contentLength: reqBody?.content?.length || 0,
    });
    this.proxyToFlask('/api/agent-validation', 'POST', reqBody, res);
  }

  /**
   * Handle GET /api/chat (health check)
   */
  async handleChatHealthCheck(res) {
    this.logger.info('Chat API health check');
    this.proxyToFlask('/api/chat', 'GET', null, res);
  }

  /**
   * Handle GET /api/document-validation (health check)
   */
  async handleDocumentValidationHealthCheck(res) {
    this.logger.info('Document validation API health check');
    this.proxyToFlask('/api/document-validation', 'GET', null, res);
  }

  /**
   * Handle GET /api/logs
   */
  async handleLogsRequest(queryParams, res) {
    this.logger.info('Logs request received', { queryParams });
    this.proxyToFlask('/api/logs', 'GET', null, res, queryParams);
  }
}

/**
 * Electron API Server
 */
class ElectronAPIServer {
  constructor(app, mainLogger, port = 3001) {
    this.app = app;
    this.port = port;
    this.server = null;
    this.logger = new APILogger(mainLogger);
    this.routeHandlers = new APIRouteHandlers(app, this.logger);
  }

  /**
   * Parse request body
   */
  parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (body) {
            resolve(JSON.parse(body));
          } else {
            resolve({});
          }
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Handle incoming requests
   */
  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;
    const queryString = parsedUrl.search;

    this.logger.debug('Incoming request', {
      method,
      pathname,
      query: queryString,
    });

    // Enable CORS for Electron renderer process
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Normalize pathname to handle trailing slashes consistently
      const normalizedPath = pathname.endsWith('/') && pathname !== '/' 
        ? pathname.slice(0, -1) 
        : pathname;

      // Route handling
      if (normalizedPath === '/api/chat') {
        if (method === 'POST') {
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleChatRequest(body, res);
        } else if (method === 'GET') {
          await this.routeHandlers.handleChatHealthCheck(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/document-validation') {
        if (method === 'POST') {
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleDocumentValidationRequest(body, res);
        } else if (method === 'GET') {
          await this.routeHandlers.handleDocumentValidationHealthCheck(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agent-validation') {
        if (method === 'POST') {
          this.logger.info('Received agent validation request', {
            method,
            path: normalizedPath,
          });
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleAgentValidationRequest(body, res);
        } else {
          this.logger.warn('Method not allowed for agent-validation endpoint', { method });
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/logs') {
        if (method === 'GET') {
          await this.routeHandlers.handleLogsRequest(queryString, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else {
        this.logger.warn('Route not found', { pathname, normalizedPath, method });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (error) {
      this.logger.error('Request handling failed', {
        error: error.message,
        stack: error.stack,
        pathname,
        method,
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error',
          details: error.message,
        }));
      }
    }
  }

  /**
   * Start the API server
   */
  start() {
    return new Promise((resolve, reject) => {
      this.logger.info('Starting API proxy server', { port: this.port });

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.warn('Port already in use, trying next port', {
            currentPort: this.port,
            nextPort: this.port + 1,
          });
          this.port += 1;
          
          // Retry with next port
          setTimeout(() => {
            this.server.close();
            this.start().then(resolve).catch(reject);
          }, 100);
        } else {
          this.logger.error('Server error', {
            error: error.message,
            stack: error.stack,
          });
          reject(error);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        this.logger.success('API proxy server started successfully', {
          port: this.port,
          address: `http://localhost:${this.port}`,
        });
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the API server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.logger.info('Stopping API proxy server');
        
        this.server.close(() => {
          this.logger.success('API proxy server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the current server port
   */
  getPort() {
    return this.port;
  }
}

module.exports = ElectronAPIServer;

