/**
 * Agent SSE Stream Parser
 *
 * Parses the SSE stream from the /api/agent-chat endpoint and invokes
 * typed callbacks for each event type. Handles buffer splitting for
 * chunked transfer encoding.
 */

import { logger } from './logger';

// ── Agent Tool Call type (shared with ChatPanel) ─────────────────────────────

export interface AgentToolCall {
  id: string;
  toolName: string;
  toolInput: unknown;
  status: 'running' | 'complete' | 'error';
  result?: string;
  isError?: boolean;
  startTime?: number;
  endTime?: number;
}

// ── Callback interface ───────────────────────────────────────────────────────

export interface AgentStreamCallbacks {
  onAgentStart?: () => void;
  onThinkingStart?: () => void;
  onThinkingEnd?: () => void;
  onThinking?: (content: string) => void;
  onContent?: (content: string) => void;
  onToolUse?: (tool: { toolName: string; toolInput: unknown; toolId: string }) => void;
  onToolUpdate?: (update: { toolId: string; toolName: string; content: string }) => void;
  onToolResult?: (result: { toolId: string; toolName: string; content: string; isError: boolean }) => void;
  onTurnEnd?: () => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Process an SSE stream from the agent-chat API.
 *
 * Reads the ReadableStream<Uint8Array>, splits on `\n\n` boundaries,
 * parses `data: {...}` lines, and dispatches to callbacks.
 */
export const processAgentSSEStream = async (
  body: ReadableStream<Uint8Array>,
  callbacks: AgentStreamCallbacks,
): Promise<void> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  logger.debug('Agent SSE stream parser started', undefined, 'AgentStreamParser');

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        logger.debug('Agent SSE stream ended (reader done)', undefined, 'AgentStreamParser');
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process all complete SSE frames in the buffer
      let boundaryIndex: number;
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        // Each frame can have multiple lines; we only care about `data:` lines
        const lines = frame.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);

          try {
            const data = JSON.parse(jsonStr);
            dispatchEvent(data, callbacks);
          } catch (parseError) {
            logger.warn('Failed to parse agent SSE data', {
              raw: jsonStr.substring(0, 200),
              error: parseError instanceof Error ? parseError.message : 'Unknown error',
            }, 'AgentStreamParser');
          }
        }
      }
    }
  } catch (error) {
    // AbortError is expected when user stops the stream
    if (error instanceof Error && error.name === 'AbortError') {
      logger.info('Agent SSE stream aborted by user', undefined, 'AgentStreamParser');
      return;
    }

    logger.error('Agent SSE stream read error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'AgentStreamParser');

    callbacks.onError?.(error instanceof Error ? error.message : 'Stream read error');
  }
};

// ── Event dispatcher ─────────────────────────────────────────────────────────

const dispatchEvent = (
  data: Record<string, unknown>,
  callbacks: AgentStreamCallbacks,
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

    default:
      logger.debug('Unknown agent SSE event type', { type: data.type }, 'AgentStreamParser');
  }
};
