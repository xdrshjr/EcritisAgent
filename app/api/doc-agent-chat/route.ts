/**
 * Document Agent Chat API Route
 *
 * Runs a pi-agent Agent loop for document writing/editing, streaming
 * AgentEvents back to the client as SSE frames. The document agent
 * operates on in-memory editor content (not the file system) and uses
 * virtual tools (get_document, update_section, insert_image, search_web,
 * search_image) to interact with the TipTap editor.
 *
 * POST /api/doc-agent-chat
 * Body: { message, documentContent, history?, llmConfig }
 * Response: text/event-stream
 */

import { NextRequest } from 'next/server';
import { Agent } from '@mariozechner/pi-agent-core';
import { convertToLlm } from '@mariozechner/pi-coding-agent';
import { logger } from '@/lib/logger';
import { createDocAgentTools } from '@/lib/docAgentTools';
import { buildDocAgentSystemPrompt } from '@/lib/docAgentPrompt';
import { mapAgentEventToSSE, encodeSSE, errorToSSE } from '@/lib/agentEventMapper';
import type { Api, Model, Provider, StreamOptions, Message, Usage } from '@mariozechner/pi-ai';
import type { AgentMessage } from '@mariozechner/pi-agent-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Request body types ───────────────────────────────────────────────────────

/** Simplified message format for conversation history (role + content only). */
interface SimplifiedHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface DocAgentChatRequestBody {
  /** User message text */
  message: string;
  /** Current editor HTML content (snapshot at request time) */
  documentContent?: string;
  /** Simplified conversation history (role + content, no tool call details) */
  history?: SimplifiedHistoryMessage[];
  /** Pre-resolved LLM configuration (model + stream options) */
  llmConfig: {
    model: Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    streamOptions: Omit<StreamOptions, 'signal'>;
  };
}

// ── History conversion ──────────────────────────────────────────────────────

/** Stub Usage object for reconstructed assistant messages. */
const STUB_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Convert simplified history messages to proper pi-ai AgentMessage objects
 * that can be fed to `agent.replaceMessages()`.
 */
const convertSimplifiedHistory = (history: SimplifiedHistoryMessage[]): AgentMessage[] => {
  return history
    .filter(m => m.content.trim().length > 0)
    .map((m): AgentMessage => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content, timestamp: m.timestamp };
      }
      // Reconstruct a minimal AssistantMessage with stub metadata.
      // convertToLlm passes assistant messages through as-is, and the LLM
      // API only uses role + content — the other fields are response metadata.
      return {
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'openai-completions' as Api,
        provider: 'openai' as Provider,
        model: 'history',
        usage: STUB_USAGE,
        stopReason: 'stop',
        timestamp: m.timestamp,
      };
    });
};

// ── Timeout ──────────────────────────────────────────────────────────────────

/** Maximum time the agent loop can run (5 minutes). */
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Doc agent chat request received', undefined, 'API:DocAgentChat');

  // ── Parse & validate ───────────────────────────────────────────────────
  let body: DocAgentChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const { message, documentContent = '', history, llmConfig } = body;

  if (!message || typeof message !== 'string') {
    return jsonError('message is required', 400);
  }

  if (!llmConfig?.model || !llmConfig?.streamOptions?.apiKey) {
    return jsonError('llmConfig with model and apiKey is required', 401);
  }

  logger.info('Doc agent chat request validated', {
    messageLength: message.length,
    documentContentLength: documentContent.length,
    modelId: llmConfig.model.id,
    hasHistory: !!history?.length,
    historyLength: history?.length ?? 0,
  }, 'API:DocAgentChat');

  // ── Build Agent ────────────────────────────────────────────────────────
  const systemPrompt = buildDocAgentSystemPrompt();
  const { model, streamOptions } = llmConfig;

  // SSE stream setup — the controller is captured inside start() so
  // document tools can enqueue doc_update events directly.
  const encoder = new TextEncoder();
  let streamClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Declared early because subscribe, abort, and catch handlers all
      // reference it, but it can only be assigned after subscribe (circular).
      let timeoutId: ReturnType<typeof setTimeout>; // eslint-disable-line prefer-const

      const enqueue = (data: string) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          streamClosed = true;
        }
      };

      // Create document tools with the SSE controller
      const tools = createDocAgentTools(
        documentContent,
        { enqueue: (chunk: Uint8Array | string) => {
          if (streamClosed) return;
          try {
            if (typeof chunk === 'string') {
              controller.enqueue(encoder.encode(chunk));
            } else {
              controller.enqueue(chunk);
            }
          } catch {
            streamClosed = true;
          }
        }},
      );

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

      // Restore conversation history if provided
      if (history && history.length > 0) {
        agent.replaceMessages(convertSimplifiedHistory(history));
      }

      // Subscribe to agent events → SSE
      const unsubscribe = agent.subscribe((event) => {
        const payloads = mapAgentEventToSSE(event);
        const encoded = encodeSSE(payloads);
        if (encoded) enqueue(encoded);

        // Close stream when agent finishes
        if (event.type === 'agent_end') {
          logger.success('Doc agent loop completed', {
            duration: `${Date.now() - startTime}ms`,
            messageCount: event.messages.length,
          }, 'API:DocAgentChat');

          streamClosed = true;
          try { controller.close(); } catch { /* already closed */ }
          unsubscribe();
          clearTimeout(timeoutId);
        }
      });

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        logger.info('Client disconnected, aborting doc agent', undefined, 'API:DocAgentChat');
        agent.abort();
        streamClosed = true;
        try { controller.close(); } catch { /* already closed */ }
        unsubscribe();
        clearTimeout(timeoutId);
      });

      // Timeout guard — abort the agent loop after AGENT_TIMEOUT_MS
      timeoutId = setTimeout(() => {
        if (!streamClosed) {
          logger.warn('Doc agent loop timed out', {
            duration: `${Date.now() - startTime}ms`,
          }, 'API:DocAgentChat');
          agent.abort();
          enqueue(errorToSSE(new Error('Agent loop timed out after 5 minutes')));
          streamClosed = true;
          try { controller.close(); } catch { /* already closed */ }
          unsubscribe();
        }
      }, AGENT_TIMEOUT_MS);

      // Start agent loop
      agent.prompt(message).catch((err) => {
        logger.error('Doc agent prompt failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'API:DocAgentChat');
        enqueue(errorToSSE(err));
        streamClosed = true;
        try { controller.close(); } catch { /* already closed */ }
        unsubscribe();
        clearTimeout(timeoutId);
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
