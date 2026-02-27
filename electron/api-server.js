/**
 * Electron API Server
 * 
 * This module provides a local API proxy server within Electron that forwards
 * requests to the Flask backend for LLM processing.
 * 
 * Handles:
 * - /api/chat - Proxies to Flask backend for AI chat completions
 * - /api/document-validation - Proxies to Flask backend for document validation
 * - /api/logs - Proxies to Flask backend for log file access
 * - /api/agents - Proxies to Flask backend for agent list
 * - /api/agent-chat - Pi-agent coding agent loop (SSE)
 * - /api/agent-chat/home-dir - Returns user home directory
 * - /api/agent-chat/validate-dir - Validates directory paths
 * - /api/agent-file - File download with path traversal protection
 * - /api/doc-agent-chat - Pi-agent document agent loop (SSE)
 * - /api/text-processing - Proxies to Flask backend for text polish/rewrite/check
 * 
 * This server only runs in packaged mode. In development mode, the Next.js
 * dev server handles these routes natively.
 */

const http = require('http');
const { URL } = require('url');
const nodePath = require('path');
const nodeOs = require('os');
const nodeFs = require('fs');

// ── Shell detection (Windows only) ──────────────────────────────────────────
// Mirrors lib/agentShellConfig.ts in plain CommonJS for the Electron build.

function ensureShellConfiguredJs(log) {
  if (process.platform !== 'win32') return;

  const { execSync } = require('child_process');
  const piSettingsDir = nodePath.join(nodeOs.homedir(), '.pi', 'agent');
  const piSettingsFile = nodePath.join(piSettingsDir, 'settings.json');

  // 1. Check cached settings
  let settings = {};
  try {
    settings = JSON.parse(nodeFs.readFileSync(piSettingsFile, 'utf-8'));
  } catch { /* no file yet */ }

  if (settings.shellPath && typeof settings.shellPath === 'string' && nodeFs.existsSync(settings.shellPath)) {
    return;
  }

  const persist = (shellPath) => {
    if (log) log.info('Bash found, persisting to settings', { path: shellPath });
    nodeFs.mkdirSync(piSettingsDir, { recursive: true });
    nodeFs.writeFileSync(piSettingsFile, JSON.stringify({ ...settings, shellPath }, null, 2), 'utf-8');
  };

  const whereFirst = (exe) => {
    try {
      const line = execSync(`where ${exe}`, { encoding: 'utf-8', timeout: 5000 })
        .trim().split('\n')[0].trim();
      return (line && nodeFs.existsSync(line)) ? line : null;
    } catch { return null; }
  };

  // 2. Derive bash from git.exe location (most reliable)
  const gitPath = whereFirst('git.exe');
  if (gitPath) {
    const gitRoot = nodePath.dirname(nodePath.dirname(gitPath));
    for (const rel of ['usr\\bin\\bash.exe', 'bin\\bash.exe']) {
      const bp = nodePath.join(gitRoot, rel);
      if (nodeFs.existsSync(bp)) { persist(bp); return; }
    }
  }

  // 3. Direct bash lookup on PATH
  const bashPath = whereFirst('bash.exe');
  if (bashPath) { persist(bashPath); return; }

  // 4. Fallback: standard install location (Git not added to PATH)
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  for (const rel of ['usr\\bin\\bash.exe', 'bin\\bash.exe']) {
    const bp = nodePath.join(programFiles, 'Git', rel);
    if (nodeFs.existsSync(bp)) { persist(bp); return; }
  }

  // Nothing found — let pi-coding-agent try its own detection
  if (log) log.warn('Could not locate bash');
}

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

  /**
   * Handle POST /api/agent-chat
   *
   * Runs a pi-agent coding agent loop and streams AgentEvents back as SSE.
   * This is a port of app/api/agent-chat/route.ts for packaged Electron mode
   * where the Next.js API server is not available.
   */
  async handleAgentChatRequest(reqBody, res) {
    const { message, workDir, history, llmConfig } = reqBody;

    // Basic validation
    if (!message || !workDir || !llmConfig?.model || !llmConfig?.streamOptions?.apiKey) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'message, workDir, and llmConfig are required' }));
      return;
    }

    // Validate workDir
    const fs = require('fs');
    try {
      const stat = fs.statSync(workDir);
      if (!stat.isDirectory()) throw new Error('Not a directory');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `workDir is not accessible: ${workDir}` }));
      return;
    }

    // Dynamic import (packages may be ESM) — must happen BEFORE committing SSE headers
    // so we can still send a proper JSON error response if the import fails.
    let Agent, convertToLlm, createCodingTools, createGrepTool, createFindTool, createLsTool;
    try {
      ({ Agent } = await import('@mariozechner/pi-agent-core'));
      ({ convertToLlm, createCodingTools, createGrepTool, createFindTool, createLsTool } =
        await import('@mariozechner/pi-coding-agent'));
    } catch (importErr) {
      this.logger.error('Failed to load pi-agent packages', { error: importErr.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load agent modules', details: importErr.message }));
      return;
    }

    // Best-effort: expand bash detection for non-standard install locations
    ensureShellConfiguredJs(this.logger);

    // All validation passed — now commit SSE headers (cannot send JSON errors after this point)
    // Disable buffering for real-time streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Disable Nagle's algorithm so small SSE frames are sent immediately
    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    const tools = [
      ...createCodingTools(workDir),
      createGrepTool(workDir),
      createFindTool(workDir),
      createLsTool(workDir),
    ];

    const systemPrompt =
      `You are an AI coding assistant working in the directory: ${workDir}\n\n` +
      `You have access to tools for reading/writing files, executing shell commands,\n` +
      `searching code, and more. Use these tools to help the user with their\ncoding tasks.\n\n` +
      `Guidelines:\n` +
      `- Always read files before modifying them\n` +
      `- Explain what you're doing before taking actions\n` +
      `- Show file changes clearly\n` +
      `- Report errors clearly if they occur\n\n` +
      `Current working directory: ${workDir}\n` +
      `Operating system: ${process.platform}`;

    const { model, streamOptions } = llmConfig;

    const agent = new Agent({
      initialState: { systemPrompt, model, tools, thinkingLevel: 'off' },
      convertToLlm: (messages) => convertToLlm(messages),
      getApiKey: () => streamOptions.apiKey,
    });

    if (history && history.length > 0) {
      agent.replaceMessages(history);
    }

    // SSE helpers — inline port of lib/agentEventMapper.ts
    const mapEvent = (event) => {
      switch (event.type) {
        case 'agent_start':   return [{ type: 'agent_start' }];
        case 'agent_end':     return [{ type: 'complete', messages: event.messages }];
        case 'turn_start':    return [];
        case 'turn_end':      return [{ type: 'turn_end' }];
        case 'message_start': return [{ type: 'thinking_start' }];
        case 'message_end':   return [{ type: 'thinking_end' }];
        case 'message_update': {
          const sub = event.assistantMessageEvent;
          const out = [];
          if (sub.type === 'text_delta')     out.push({ type: 'content', content: sub.delta });
          if (sub.type === 'thinking_delta') out.push({ type: 'thinking', content: sub.delta });
          if (sub.type === 'toolcall_end')   out.push({ type: 'tool_use', toolName: sub.toolCall.name, toolInput: sub.toolCall.arguments, toolId: sub.toolCall.id });
          if (sub.type === 'error')          out.push({ type: 'error', error: sub.error.errorMessage ?? 'Unknown LLM error' });
          return out;
        }
        case 'tool_execution_start':
          return [{ type: 'tool_use', toolName: event.toolName, toolInput: event.args, toolId: event.toolCallId }];
        case 'tool_execution_update':
          return [{ type: 'tool_update', toolId: event.toolCallId, toolName: event.toolName, content: typeof event.partialResult === 'string' ? event.partialResult : JSON.stringify(event.partialResult) }];
        case 'tool_execution_end': {
          const content = event.result?.content
            ? event.result.content.filter(c => c.type === 'text').map(c => c.text).join('')
            : typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
          return [{ type: 'tool_result', toolId: event.toolCallId, toolName: event.toolName, content, isError: event.isError }];
        }
        default: return [];
      }
    };

    const writeSse = (payloads) => {
      if (!res.writableEnded) {
        payloads.forEach(p => res.write(`data: ${JSON.stringify(p)}\n\n`));
      }
    };

    // Handle client disconnect → abort agent
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      agent.abort();
    });

    const unsubscribe = agent.subscribe((event) => {
      if (aborted) return;
      writeSse(mapEvent(event));
      if (event.type === 'agent_end') {
        unsubscribe();
        if (!res.writableEnded) res.end();
      }
    });

    agent.prompt(message).catch((err) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message ?? 'Agent error' })}\n\n`);
        res.end();
      }
      unsubscribe();
    });
  }

  // ── Document Section Parser (inline port of lib/docSectionParser.ts) ──────

  _stripTags(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  _extractH1Title(html) {
    const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return match ? this._stripTags(match[1]).trim() : '';
  }

  _extractH2Title(html) {
    const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    return match ? this._stripTags(match[1]).trim() : '';
  }

  _removeH1Tag(html) {
    return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim();
  }

  _removeH2Tag(html) {
    return html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '').trim();
  }

  _parseHtmlToSections(html) {
    if (!html || !html.trim()) return [];
    const parts = html.split(/(?=<h2[\s>])/i);
    const sections = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.trim()) continue;
      if (i === 0 && !part.match(/^<h2[\s>]/i)) {
        sections.push({ index: 0, title: this._extractH1Title(part), content: this._removeH1Tag(part) });
      } else {
        sections.push({ index: sections.length, title: this._extractH2Title(part), content: this._removeH2Tag(part) });
      }
    }
    return sections;
  }

  _sectionsToHtml(sections) {
    return sections.map((s, i) => {
      if (i === 0) {
        const t = s.title ? `<h1>${s.title}</h1>` : '';
        return `${t}${s.content}`;
      }
      const t = s.title ? `<h2>${s.title}</h2>` : '';
      return `${t}${s.content}`;
    }).join('');
  }

  _reindexSections(sections) {
    return sections.map((s, i) => ({ ...s, index: i }));
  }

  // ── Doc Agent Tools factory (inline port of lib/docAgentTools.ts) ─────────

  _createDocAgentTools(documentContent, writeSse, writeSseAndFlush, Type) {
    let sections = this._parseHtmlToSections(documentContent);
    let currentHtml = documentContent;
    const self = this;

    const rebuildHtml = () => {
      sections = self._reindexSections(sections);
      currentHtml = self._sectionsToHtml(sections);
    };

    const textResult = (text, details) => ({
      content: [{ type: 'text', text }],
      details,
    });
    const errorResult = (message, details) => ({
      content: [{ type: 'text', text: `Error: ${message}` }],
      details,
    });

    const sendDocUpdate = (event) => {
      return writeSseAndFlush(event);
    };

    const getDocument = {
      name: 'get_document',
      label: 'Get Document',
      description:
        '读取当前文档的完整内容，返回按章节(section)分组的结构化数据。' +
        '每个section包含index(序号)、title(标题)和content(HTML内容)。' +
        '用于了解文档当前状态，在修改文档之前应先调用此工具。',
      parameters: Type.Object({}),
      execute: async () => {
        const result = {
          sections: sections.map(s => ({ index: s.index, title: s.title, content: s.content })),
          totalSections: sections.length,
          rawHtml: currentHtml,
        };
        return textResult(JSON.stringify(result, null, 2), { sections: sections.length });
      },
    };

    const clearDocument = {
      name: 'clear_document',
      label: 'Clear Document',
      description:
        '清空整个文档的所有章节。通常在创建新文档之前调用，以清除编辑器中的旧内容。',
      parameters: Type.Object({}),
      execute: async () => {
        sections = [];
        rebuildHtml();
        await sendDocUpdate({ type: 'doc_update', operation: 'clear_all' });
        return textResult('Document has been cleared. You can now build the document from scratch using append_section.', { operation: 'clear_all' });
      },
    };

    const appendSection = {
      name: 'append_section',
      label: 'Append Section',
      description:
        '在文档末尾追加一个新章节。需要提供章节标题(title)和HTML内容(content)。' +
        '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
      parameters: Type.Object({
        title: Type.String({ description: 'Section title (plain text, will be wrapped in h1/h2)' }),
        content: Type.String({ description: 'Section HTML content (paragraphs, lists, etc. wrapped in <p> tags)' }),
      }),
      execute: async (_toolCallId, params) => {
        const { title, content } = params;
        if (!title) return errorResult('append_section requires title', {});
        if (!content) return errorResult('append_section requires content', {});
        const newIndex = sections.length;
        sections.push({ index: newIndex, title, content });
        rebuildHtml();
        await sendDocUpdate({ type: 'doc_update', operation: 'append', sectionIndex: newIndex, title, content });
        return textResult(`New section '${title}' appended as Section ${newIndex}.`, { operation: 'append', sectionIndex: newIndex });
      },
    };

    const replaceSection = {
      name: 'replace_section',
      label: 'Replace Section',
      description:
        '替换指定章节的标题和内容。需要提供sectionIndex(章节索引)、title(标题)和content(新内容)。' +
        '如果不需要修改标题，请传入原标题。' +
        '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
      parameters: Type.Object({
        sectionIndex: Type.Number({ description: 'Target section index (0-based)' }),
        title: Type.String({ description: 'Section title (pass the original title to keep it unchanged)' }),
        content: Type.String({ description: 'New section HTML content (paragraphs, lists, etc. wrapped in <p> tags)' }),
      }),
      execute: async (_toolCallId, params) => {
        const { sectionIndex, title, content } = params;
        if (sectionIndex < 0 || sectionIndex >= sections.length) return errorResult(`sectionIndex ${sectionIndex} out of range. Valid range: 0-${sections.length - 1}`, {});
        if (!content) return errorResult('replace_section requires content', {});
        sections[sectionIndex] = { ...sections[sectionIndex], title, content };
        rebuildHtml();
        await sendDocUpdate({ type: 'doc_update', operation: 'replace', sectionIndex, title: sections[sectionIndex].title, content });
        return textResult(`Section ${sectionIndex} '${sections[sectionIndex].title}' has been updated.`, { operation: 'replace', sectionIndex });
      },
    };

    const deleteSection = {
      name: 'delete_section',
      label: 'Delete Section',
      description:
        '删除指定索引的章节。不能删除 Section 0（文档标题区域）。',
      parameters: Type.Object({
        sectionIndex: Type.Number({ description: 'Target section index (0-based). Cannot delete Section 0.' }),
      }),
      execute: async (_toolCallId, params) => {
        const { sectionIndex } = params;
        if (sectionIndex === 0) return errorResult('Cannot delete Section 0 (document title area)', {});
        if (sectionIndex < 0 || sectionIndex >= sections.length) return errorResult(`sectionIndex ${sectionIndex} out of range. Valid range: 1-${sections.length - 1}`, {});
        const deletedTitle = sections[sectionIndex].title;
        sections.splice(sectionIndex, 1);
        rebuildHtml();
        await sendDocUpdate({ type: 'doc_update', operation: 'delete', sectionIndex });
        return textResult(`Section ${sectionIndex} '${deletedTitle}' has been deleted.`, { operation: 'delete', sectionIndex });
      },
    };

    const insertSection = {
      name: 'insert_section',
      label: 'Insert Section',
      description:
        '在指定位置之前插入一个新章节。需要提供sectionIndex(插入位置)、title(标题)和content(内容)。' +
        '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
      parameters: Type.Object({
        sectionIndex: Type.Number({ description: 'Insert new section before this index (0-based)' }),
        title: Type.String({ description: 'Section title (plain text, will be wrapped in h1/h2)' }),
        content: Type.String({ description: 'Section HTML content (paragraphs, lists, etc. wrapped in <p> tags)' }),
      }),
      execute: async (_toolCallId, params) => {
        const { sectionIndex, title, content } = params;
        if (sectionIndex < 0 || sectionIndex > sections.length) return errorResult(`sectionIndex ${sectionIndex} out of range for insert. Valid range: 0-${sections.length}`, {});
        if (!title) return errorResult('insert_section requires title', {});
        if (!content) return errorResult('insert_section requires content', {});
        sections.splice(sectionIndex, 0, { index: sectionIndex, title, content });
        rebuildHtml();
        await sendDocUpdate({ type: 'doc_update', operation: 'insert', sectionIndex, title, content });
        return textResult(`New section '${title}' inserted at position ${sectionIndex}.`, { operation: 'insert', sectionIndex });
      },
    };

    const insertImage = {
      name: 'insert_image',
      label: 'Insert Image',
      description:
        '在指定章节之后（或之前）插入一张图片。需要提供图片URL和描述文字(alt text)。',
      parameters: Type.Object({
        sectionIndex: Type.Number({ description: 'Insert image relative to this section index' }),
        imageUrl: Type.String({ description: 'Full URL of the image to insert' }),
        imageDescription: Type.String({ description: 'Image description / alt text' }),
        position: Type.Optional(Type.Union([
          Type.Literal('after_section'),
          Type.Literal('before_section'),
        ], { description: 'Insert position (default: after_section)' })),
      }),
      execute: async (_toolCallId, params) => {
        const { sectionIndex, imageUrl, imageDescription, position } = params;
        if (sectionIndex < 0 || sectionIndex >= sections.length) {
          return errorResult(`sectionIndex ${sectionIndex} out of range (0-${sections.length - 1})`, {});
        }
        const pos = position || 'after_section';
        await sendDocUpdate({ type: 'doc_update', operation: 'insert_image', sectionIndex, imageUrl, imageDescription, position: pos });
        return textResult(`Image inserted ${pos === 'before_section' ? 'before' : 'after'} Section ${sectionIndex}.`, { sectionIndex, imageUrl, position: pos });
      },
    };

    // search_web and search_image proxy to Flask backend
    const flaskPort = getFlaskBackendPort();
    const flaskBase = flaskPort ? `http://127.0.0.1:${flaskPort}` : null;

    const searchWeb = {
      name: 'search_web',
      label: 'Search Web',
      description:
        '搜索网络获取参考资料和相关信息。返回搜索结果列表，包含标题、URL和内容摘要。',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query string' }),
        maxResults: Type.Optional(Type.Number({ description: 'Max results (1-10, default 5)' })),
      }),
      execute: async (_toolCallId, params) => {
        const { query, maxResults } = params;
        const limit = Math.max(1, Math.min(maxResults || 5, 10));
        if (!flaskBase) return errorResult('Flask backend not available for search', {});
        try {
          const resp = await fetch(`${flaskBase}/api/search-services/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, maxResults: limit }),
            signal: AbortSignal.timeout(15000),
          });
          if (!resp.ok) return errorResult(`Search service returned status ${resp.status}`, {});
          const data = await resp.json();
          if (!data.success) return errorResult(data.error || 'Search service error', {});
          const results = data.results || [];
          return textResult(JSON.stringify({ results, totalResults: results.length, query }, null, 2), { resultCount: results.length });
        } catch (err) {
          return errorResult(`Search failed: ${err.message || 'Unknown error'}`, {});
        }
      },
    };

    const searchImage = {
      name: 'search_image',
      label: 'Search Image',
      description:
        '根据关键词搜索图片素材。返回图片URL、描述和作者信息。',
      parameters: Type.Object({
        keywords: Type.String({ description: 'Search keywords' }),
        count: Type.Optional(Type.Number({ description: 'Number of images (1-5, default 3)' })),
      }),
      execute: async (_toolCallId, params) => {
        const { keywords, count } = params;
        const perPage = Math.max(1, Math.min(count || 3, 5));
        if (!flaskBase) return errorResult('Flask backend not available for image search', {});
        try {
          const resp = await fetch(`${flaskBase}/api/image-services/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: keywords, perPage }),
            signal: AbortSignal.timeout(10000),
          });
          if (!resp.ok) return errorResult(`Image service returned status ${resp.status}`, {});
          const data = await resp.json();
          if (!data.success) return errorResult(data.error || 'Image service error', {});
          const images = (data.images || []).map(img => ({ url: img.url, description: img.description || '', author: img.author || '' }));
          return textResult(JSON.stringify({ images, totalImages: images.length, keywords }, null, 2), { imageCount: images.length });
        } catch (err) {
          return errorResult(`Image search failed: ${err.message || 'Unknown error'}`, {});
        }
      },
    };

    return [getDocument, clearDocument, appendSection, replaceSection, deleteSection, insertSection, insertImage, searchWeb, searchImage];
  }

  /**
   * Handle GET /api/agents
   * Proxies to Flask backend to get list of available agents.
   */
  async handleAgentsListRequest(res) {
    this.logger.info('Agents list request received');
    this.proxyToFlask('/api/agents', 'GET', null, res);
  }

  /**
   * Handle GET /api/agent-chat/home-dir
   * Returns the user's home directory path.
   */
  async handleHomeDirRequest(res) {
    const os = require('os');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ homeDir: os.homedir() }));
  }

  /**
   * Handle GET /api/agent-chat/validate-dir?path=...
   * Validates that the given path is an accessible directory.
   */
  async handleValidateDirRequest(queryString, res) {
    const { URL } = require('url');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    const params = new URL(`http://localhost${queryString || ''}`).searchParams;
    const dirPath = params.get('path');

    if (!dirPath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'path parameter is required' }));
      return;
    }

    const resolvedPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.resolve(os.homedir(), dirPath);

    try {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ valid: false, error: 'Path is not a directory' }));
        return;
      }
      fs.readdirSync(resolvedPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: true, resolvedPath }));
    } catch (error) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: `Path is not accessible: ${error.message}` }));
    }
  }

  /**
   * Handle GET /api/agent-file?path=...&workDir=...
   * Downloads a file with path traversal protection.
   */
  async handleAgentFileRequest(queryString, res) {
    const fs = require('fs');
    const path = require('path');

    const params = new URL(`http://localhost${queryString || ''}`).searchParams;
    const filePath = params.get('path');
    const workDir = params.get('workDir');

    if (!filePath || !workDir) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required parameters: path and workDir' }));
      return;
    }

    const resolvedWorkDir = path.resolve(workDir);
    const resolvedPath = path.resolve(filePath);

    // Path traversal protection
    const isInside =
      resolvedPath === resolvedWorkDir ||
      resolvedPath.startsWith(resolvedWorkDir + path.sep);
    if (!isInside) {
      this.logger.warn('Agent file download blocked: path traversal attempt', { filePath, workDir });
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied: file is outside the working directory' }));
      return;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Path is not a file' }));
        return;
      }

      const MIME_TYPES = {
        '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
        '.js': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript',
        '.jsx': 'text/javascript', '.html': 'text/html', '.css': 'text/css',
        '.py': 'text/x-python', '.xml': 'application/xml', '.yaml': 'text/yaml',
        '.yml': 'text/yaml', '.csv': 'text/csv', '.svg': 'image/svg+xml',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.zip': 'application/zip',
      };

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileName = path.basename(resolvedPath);
      const fileBuffer = fs.readFileSync(resolvedPath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': String(stat.size),
      });
      res.end(fileBuffer);
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
      }
      this.logger.error('Agent file download failed', { error: error.message, filePath: resolvedPath });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read file' }));
    }
  }

  /**
   * Handle POST /api/text-processing
   * Proxies to Flask backend for text polish/rewrite/check operations.
   */
  async handleTextProcessingRequest(reqBody, res) {
    this.logger.info('Text processing request received', { type: reqBody?.type });
    this.proxyToFlask('/api/text-processing', 'POST', reqBody, res);
  }

  /**
   * Handle POST /api/doc-agent-chat
   *
   * Runs a pi-agent document agent loop and streams AgentEvents back as SSE.
   * Port of app/api/doc-agent-chat/route.ts for packaged Electron mode.
   */
  async handleDocAgentChatRequest(reqBody, res) {
    const { message, documentContent = '', history, llmConfig } = reqBody;

    if (!message || typeof message !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'message is required' }));
      return;
    }

    if (!llmConfig?.model || !llmConfig?.streamOptions?.apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'llmConfig with model and apiKey is required' }));
      return;
    }

    // Dynamic import ESM packages
    let Agent, convertToLlm, Type;
    try {
      ({ Agent } = await import('@mariozechner/pi-agent-core'));
      ({ convertToLlm } = await import('@mariozechner/pi-coding-agent'));
      ({ Type } = await import('@sinclair/typebox'));
    } catch (importErr) {
      this.logger.error('Failed to load pi-agent packages for doc agent', { error: importErr.message });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load agent modules', details: importErr.message }));
      return;
    }

    // Commit SSE headers — disable buffering for real-time streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Disable Nagle's algorithm so small SSE frames are sent immediately
    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    // SSE helpers
    const writeSse = (payloads) => {
      if (!res.writableEnded) {
        payloads.forEach(p => res.write(`data: ${JSON.stringify(p)}\n\n`));
      }
    };

    // Flush-aware SSE writer for doc_update events — ensures each event is
    // flushed to the TCP socket as a separate segment before the tool returns.
    const writeSseAndFlush = (payload) => {
      return new Promise(resolve => {
        if (res.writableEnded) { resolve(); return; }
        res.write(`data: ${JSON.stringify(payload)}\n\n`, () => {
          // Yield to event loop after write callback to ensure TCP flush
          setImmediate(resolve);
        });
      });
    };

    // Create doc agent tools with SSE writer
    const tools = this._createDocAgentTools(documentContent, writeSse, writeSseAndFlush, Type);

    // System prompt (inline port of lib/docAgentPrompt.ts)
    const systemPrompt = `你是一个专业的文档写作助手，擅长创建和修改结构化文档。

## 角色定位
你是一个高水准的文档写作专家，能够：
- 根据用户需求从零创建完整的结构化文档
- 对已有文档进行修改、扩展、精简、重写等操作
- 撰写多种类型的内容：技术文档、博客文章、学术报告、营销文案、商业计划等
- 使用网络搜索丰富内容的参考依据
- 为文档配图以增强可读性

## 工作方式

### 文档操作
你通过工具与文档编辑器交互。文档按章节(Section)组织：
- Section 0: 文档标题(h1)和引言段落
- Section 1+: 各个章节，每个章节包含标题(h2)和内容段落

你可以使用的工具：
- \`get_document\`: 读取当前文档内容，了解文档现有结构和内容
- \`clear_document\`: 清空整个文档（无参数）
- \`append_section\`: 在文档末尾追加新章节（需要 title 和 content）
- \`replace_section\`: 替换指定章节（需要 sectionIndex、title 和 content）
- \`delete_section\`: 删除指定章节（需要 sectionIndex）
- \`insert_section\`: 在指定位置之前插入新章节（需要 sectionIndex、title 和 content）
- \`insert_image\`: 在指定章节后插入图片
- \`search_web\`: 搜索网络获取参考资料
- \`search_image\`: 搜索适合的图片素材

### 创建文档流程
当用户要求创建新文档时，你应该：
1. 理解用户需求（主题、风格、长度、受众等）
2. **首先调用 clear_document 清空编辑器中的旧内容**
3. 规划文档结构（标题和各章节标题）
4. 逐章节编写内容，使用 append_section 逐步构建
5. 如有需要，使用 search_web 获取参考资料
6. 如有需要，使用 search_image + insert_image 为文档配图
7. 完成后给出总结

### 修改文档流程
当用户要求修改现有文档时：
1. 先调用 get_document 了解当前文档内容
2. 理解用户的修改需求
3. 使用 replace_section 修改需要改动的章节
4. 如需新增章节，使用 append_section 或 insert_section
5. 如需删除章节，使用 delete_section
6. 完成后说明修改了哪些内容

## 写作规范

### 内容质量
- 内容充实、有深度，避免空洞的套话
- 段落之间逻辑连贯，过渡自然
- 使用具体的数据、案例和引用来支撑观点
- 根据受众调整专业术语的使用程度

### 格式规范
- 每个章节(Section)的内容使用 HTML 格式
- 使用 <p> 标签包裹段落
- 可以使用 <ul>/<ol>/<li> 创建列表
- 可以使用 <strong>/<em> 进行强调
- 不要在 content 中包含 <h1> 或 <h2> 标签（标题通过 title 参数传递）
- 每个章节建议 2-5 个段落，内容适中

### 引用规范
- 如果使用了 search_web 获取的参考资料，在内容中适当引用
- 引用格式：在段落末尾用 [来源标题](URL) 标注

## 重要注意事项
- 每次只修改需要修改的部分，不要替换整个文档
- **创建新文档时，必须先调用 clear_document 清空旧内容，再用 append_section 逐章节构建**
- content 参数不要包含标题标签（h1/h2），标题通过 title 参数传递
- 使用 replace_section 时，必须传入 title 参数——如果不需要修改标题，传入原标题即可
- 在创建文档时，先追加 Section 0（标题和引言），再逐个追加后续章节
- 如果用户没有明确指定语言，默认使用与用户消息相同的语言
- 回复用户时，简洁说明你做了什么或计划做什么，不要过度解释`;

    const { model, streamOptions } = llmConfig;

    const agent = new Agent({
      initialState: { systemPrompt, model, tools, thinkingLevel: 'off' },
      convertToLlm: (messages) => convertToLlm(messages),
      getApiKey: () => streamOptions.apiKey,
    });

    // Restore conversation history
    if (history && history.length > 0) {
      const STUB_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      const agentHistory = history
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => {
          if (m.role === 'user') {
            return { role: 'user', content: m.content, timestamp: m.timestamp };
          }
          return {
            role: 'assistant',
            content: [{ type: 'text', text: m.content }],
            api: 'openai-completions',
            provider: 'openai',
            model: 'history',
            usage: STUB_USAGE,
            stopReason: 'stop',
            timestamp: m.timestamp,
          };
        });
      agent.replaceMessages(agentHistory);
    }

    // SSE event mapper (same as handleAgentChatRequest)
    const mapEvent = (event) => {
      switch (event.type) {
        case 'agent_start':   return [{ type: 'agent_start' }];
        case 'agent_end':     return [{ type: 'complete', messages: event.messages }];
        case 'turn_start':    return [];
        case 'turn_end':      return [{ type: 'turn_end' }];
        case 'message_start': return [{ type: 'thinking_start' }];
        case 'message_end':   return [{ type: 'thinking_end' }];
        case 'message_update': {
          const sub = event.assistantMessageEvent;
          const out = [];
          if (sub.type === 'text_delta')     out.push({ type: 'content', content: sub.delta });
          if (sub.type === 'thinking_delta') out.push({ type: 'thinking', content: sub.delta });
          if (sub.type === 'toolcall_end')   out.push({ type: 'tool_use', toolName: sub.toolCall.name, toolInput: sub.toolCall.arguments, toolId: sub.toolCall.id });
          if (sub.type === 'error')          out.push({ type: 'error', error: sub.error.errorMessage ?? 'Unknown LLM error' });
          return out;
        }
        case 'tool_execution_start':
          return [{ type: 'tool_use', toolName: event.toolName, toolInput: event.args, toolId: event.toolCallId }];
        case 'tool_execution_update':
          return [{ type: 'tool_update', toolId: event.toolCallId, toolName: event.toolName, content: typeof event.partialResult === 'string' ? event.partialResult : JSON.stringify(event.partialResult) }];
        case 'tool_execution_end': {
          const content = event.result?.content
            ? event.result.content.filter(c => c.type === 'text').map(c => c.text).join('')
            : typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
          return [{ type: 'tool_result', toolId: event.toolCallId, toolName: event.toolName, content, isError: event.isError }];
        }
        default: return [];
      }
    };

    // Handle client disconnect
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      agent.abort();
    });

    // Timeout guard (5 minutes)
    const startTime = Date.now();
    const timeoutId = setTimeout(() => {
      if (!aborted && !res.writableEnded) {
        this.logger.warn('Doc agent loop timed out', { duration: `${Date.now() - startTime}ms` });
        agent.abort();
        writeSse([{ type: 'error', error: 'Agent loop timed out after 5 minutes' }]);
        res.end();
      }
    }, 5 * 60 * 1000);

    const unsubscribe = agent.subscribe((event) => {
      if (aborted) return;
      writeSse(mapEvent(event));
      if (event.type === 'agent_end') {
        unsubscribe();
        clearTimeout(timeoutId);
        if (!res.writableEnded) res.end();
      }
    });

    agent.prompt(message).catch((err) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message ?? 'Agent error' })}\n\n`);
        res.end();
      }
      unsubscribe();
      clearTimeout(timeoutId);
    });
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
      } else if (normalizedPath === '/api/logs') {
        if (method === 'GET') {
          await this.routeHandlers.handleLogsRequest(queryString, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agents') {
        if (method === 'GET') {
          await this.routeHandlers.handleAgentsListRequest(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agent-chat/home-dir') {
        if (method === 'GET') {
          await this.routeHandlers.handleHomeDirRequest(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agent-chat/validate-dir') {
        if (method === 'GET') {
          await this.routeHandlers.handleValidateDirRequest(queryString, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agent-chat') {
        if (method === 'POST') {
          this.logger.info('Handling POST /api/agent-chat request');
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleAgentChatRequest(body, res);
        } else {
          this.logger.warn('Method not allowed for /api/agent-chat', { method });
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/agent-file') {
        if (method === 'GET') {
          await this.routeHandlers.handleAgentFileRequest(queryString, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/doc-agent-chat') {
        if (method === 'POST') {
          this.logger.info('Handling POST /api/doc-agent-chat request');
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleDocAgentChatRequest(body, res);
        } else {
          this.logger.warn('Method not allowed for /api/doc-agent-chat', { method });
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (normalizedPath === '/api/text-processing') {
        if (method === 'POST') {
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleTextProcessingRequest(body, res);
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

