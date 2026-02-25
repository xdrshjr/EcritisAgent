/**
 * Agent Chat API Route
 *
 * Runs a pi-agent Agent loop on the server, streaming AgentEvents
 * back to the client as SSE frames.
 *
 * POST /api/agent-chat
 * Body: { message, workDir, history?, llmConfig }
 * Response: text/event-stream
 */

import { NextRequest } from 'next/server';
import { Agent } from '@mariozechner/pi-agent-core';
import { convertToLlm } from '@mariozechner/pi-coding-agent';
import { logger } from '@/lib/logger';
import { createAgentTools } from '@/lib/agentTools';
import { mapAgentEventToSSE, encodeSSE, errorToSSE } from '@/lib/agentEventMapper';
import type { Api, Model, StreamOptions, Message } from '@mariozechner/pi-ai';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import fs from 'node:fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Request body types ───────────────────────────────────────────────────────

interface AgentChatRequestBody {
  /** User message text */
  message: string;
  /** Absolute path to the working directory */
  workDir: string;
  /** Conversation history for context continuation */
  history?: AgentMessage[];
  /** Pre-resolved LLM configuration (model + stream options) */
  llmConfig: {
    model: Model<Api>;
    streamOptions: Omit<StreamOptions, 'signal'>;
  };
}

// ── System prompt ────────────────────────────────────────────────────────────

const buildAgentSystemPrompt = (workDir: string): string =>
  `You are an AI coding assistant working in the directory: ${workDir}

You have access to tools for reading/writing files, executing shell commands,
searching code, and more. Use these tools to help the user with their
coding tasks.

Guidelines:
- Always read files before modifying them
- Explain what you're doing before taking actions
- Show file changes clearly
- Report errors clearly if they occur

Current working directory: ${workDir}
Operating system: ${process.platform}
`;

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Agent chat request received', undefined, 'API:AgentChat');

  // ── Parse & validate ───────────────────────────────────────────────────
  let body: AgentChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { message, workDir, history, llmConfig } = body;

  if (!message || typeof message !== 'string') {
    return jsonError('message is required', 400);
  }

  if (!workDir || typeof workDir !== 'string') {
    return jsonError('workDir is required', 400);
  }

  if (!llmConfig?.model || !llmConfig?.streamOptions?.apiKey) {
    return jsonError('llmConfig with model and apiKey is required', 401);
  }

  // Validate working directory
  try {
    const stat = await fs.stat(workDir);
    if (!stat.isDirectory()) {
      return jsonError(`workDir is not a directory: ${workDir}`, 400);
    }
  } catch {
    return jsonError(`workDir does not exist or is not accessible: ${workDir}`, 400);
  }

  logger.info('Agent chat request validated', {
    workDir,
    modelId: llmConfig.model.id,
    provider: llmConfig.model.provider,
    hasHistory: !!history?.length,
    historyLength: history?.length ?? 0,
  }, 'API:AgentChat');

  // ── Build Agent ────────────────────────────────────────────────────────
  const tools = createAgentTools(workDir);
  const systemPrompt = buildAgentSystemPrompt(workDir);
  const { model, streamOptions } = llmConfig;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: 'off',
    },
    convertToLlm: (messages: AgentMessage[]): Message[] => convertToLlm(messages),
    getApiKey: () => streamOptions.apiKey,
  });

  // Restore history if provided
  if (history && history.length > 0) {
    agent.replaceMessages(history);
  }

  // ── SSE stream ─────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (data: string) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          streamClosed = true;
        }
      };

      // Subscribe to agent events
      const unsubscribe = agent.subscribe((event) => {
        const payloads = mapAgentEventToSSE(event);
        const encoded = encodeSSE(payloads);
        if (encoded) enqueue(encoded);

        // Close stream when agent finishes
        if (event.type === 'agent_end') {
          logger.success('Agent loop completed', {
            duration: `${Date.now() - startTime}ms`,
            messageCount: event.messages.length,
          }, 'API:AgentChat');

          streamClosed = true;
          try { controller.close(); } catch { /* already closed */ }
          unsubscribe();
        }
      });

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        logger.info('Client disconnected, aborting agent', undefined, 'API:AgentChat');
        agent.abort();
        streamClosed = true;
        try { controller.close(); } catch { /* already closed */ }
        unsubscribe();
      });

      // Start agent loop
      agent.prompt(message).catch((err) => {
        logger.error('Agent prompt failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'API:AgentChat');
        enqueue(errorToSSE(err));
        streamClosed = true;
        try { controller.close(); } catch { /* already closed */ }
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
