/**
 * Document Agent SSE Stream Parser
 *
 * Extends the standard agent stream parser with support for `doc_update`
 * events that are emitted by document tools (update_section, insert_image).
 * These events drive real-time editor synchronisation.
 */

import { logger } from './logger';
import type { AgentStreamCallbacks } from './agentStreamParser';

// ── Doc Update payload ────────────────────────────────────────────────────────

export interface DocUpdatePayload {
  operation: 'replace' | 'append' | 'insert' | 'delete' | 'insert_image' | 'clear_all';
  sectionIndex?: number;
  title?: string;
  content?: string;
  imageUrl?: string;
  imageDescription?: string;
  position?: string;
}

// ── Extended callbacks ────────────────────────────────────────────────────────

export interface DocAgentStreamCallbacks extends AgentStreamCallbacks {
  onDocUpdate?: (update: DocUpdatePayload) => void;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Process an SSE stream from the doc-agent-chat API.
 *
 * Identical to `processAgentSSEStream` except it additionally dispatches
 * `doc_update` events to the `onDocUpdate` callback.
 */
export const processDocAgentSSEStream = async (
  body: ReadableStream<Uint8Array>,
  callbacks: DocAgentStreamCallbacks,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  logger.debug('Doc agent SSE stream parser started', undefined, 'DocAgentStreamParser');

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        logger.debug('Doc agent SSE stream ended (reader done)', undefined, 'DocAgentStreamParser');
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex: number;
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = frame.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);

          try {
            const data = JSON.parse(jsonStr);
            dispatchDocEvent(data, callbacks);
          } catch (parseError) {
            logger.warn('Failed to parse doc agent SSE data', {
              raw: jsonStr.substring(0, 200),
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            }, 'DocAgentStreamParser');
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.info('Doc agent SSE stream aborted by user', undefined, 'DocAgentStreamParser');
      return;
    }

    logger.error('Doc agent SSE stream read error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'DocAgentStreamParser');

    callbacks.onError?.(error instanceof Error ? error.message : 'Stream read error');
  }
};

// ── Event dispatcher ────────────────────────────────────────────────────────

const dispatchDocEvent = (
  data: Record<string, unknown>,
  callbacks: DocAgentStreamCallbacks,
): void => {
  switch (data.type) {
    case 'agent_start':
      callbacks.onAgentStart?.();
      break;

    case 'thinking_start':
      callbacks.onThinkingStart?.();
      break;

    case 'thinking_end':
      callbacks.onThinkingEnd?.();
      break;

    case 'thinking':
      callbacks.onThinking?.(data.content as string);
      break;

    case 'content':
      callbacks.onContent?.(data.content as string);
      break;

    case 'tool_use':
      callbacks.onToolUse?.({
        toolName: data.toolName as string,
        toolInput: data.toolInput,
        toolId: data.toolId as string,
      });
      break;

    case 'tool_update':
      callbacks.onToolUpdate?.({
        toolId: data.toolId as string,
        toolName: data.toolName as string,
        content: data.content as string,
      });
      break;

    case 'tool_result':
      callbacks.onToolResult?.({
        toolId: data.toolId as string,
        toolName: data.toolName as string,
        content: data.content as string,
        isError: data.isError as boolean,
      });
      break;

    case 'turn_end':
      callbacks.onTurnEnd?.();
      break;

    case 'complete':
      callbacks.onComplete?.();
      break;

    case 'error':
      callbacks.onError?.(data.error as string);
      break;

    // ── Document-specific event ─────────────────────────────────────────
    case 'doc_update':
      callbacks.onDocUpdate?.({
        operation: data.operation as DocUpdatePayload['operation'],
        sectionIndex: data.sectionIndex as number,
        title: data.title as string | undefined,
        content: data.content as string | undefined,
        imageUrl: data.imageUrl as string | undefined,
        imageDescription: data.imageDescription as string | undefined,
        position: data.position as string | undefined,
      });
      break;

    default:
      logger.debug('Unknown doc agent SSE event type', { type: data.type }, 'DocAgentStreamParser');
  }
};
