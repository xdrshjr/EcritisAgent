/**
 * Agent Event Mapper
 *
 * Converts pi-agent-core AgentEvent objects into SSE frame payloads
 * that the frontend can parse and render in the chat message stream.
 */

import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { AssistantMessageEvent, TextContent, ToolCall } from '@mariozechner/pi-ai';

// ── SSE payload types ────────────────────────────────────────────────────────

export interface SSEAgentStart {
  type: 'agent_start';
}

export interface SSEThinkingStart {
  type: 'thinking_start';
}

export interface SSEThinkingEnd {
  type: 'thinking_end';
}

export interface SSEContent {
  type: 'content';
  content: string;
}

export interface SSEThinking {
  type: 'thinking';
  content: string;
}

export interface SSEToolUse {
  type: 'tool_use';
  toolName: string;
  toolInput: unknown;
  toolId: string;
}

export interface SSEToolUpdate {
  type: 'tool_update';
  toolId: string;
  toolName: string;
  content: string;
}

export interface SSEToolResult {
  type: 'tool_result';
  toolId: string;
  toolName: string;
  content: string;
  isError: boolean;
}

export interface SSEComplete {
  type: 'complete';
  messages?: unknown[];
}

export interface SSETurnEnd {
  type: 'turn_end';
}

export interface SSEError {
  type: 'error';
  error: string;
}

export type SSEPayload =
  | SSEAgentStart
  | SSEThinkingStart
  | SSEThinkingEnd
  | SSEContent
  | SSEThinking
  | SSEToolUse
  | SSEToolUpdate
  | SSEToolResult
  | SSEComplete
  | SSETurnEnd
  | SSEError;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract text delta from an AssistantMessageEvent, if any. */
const extractTextDelta = (event: AssistantMessageEvent): string | null => {
  if (event.type === 'text_delta') return event.delta;
  return null;
};

/** Extract thinking delta from an AssistantMessageEvent, if any. */
const extractThinkingDelta = (event: AssistantMessageEvent): string | null => {
  if (event.type === 'thinking_delta') return event.delta;
  return null;
};

/** Stringify tool result content array to a single string. */
const stringifyContent = (content: Array<{ type: string; text?: string }>): string => {
  return content
    .filter((c): c is TextContent => c.type === 'text' && typeof c.text === 'string')
    .map(c => c.text)
    .join('');
};

// ── Main mapper ──────────────────────────────────────────────────────────────

/**
 * Map a pi-agent-core `AgentEvent` to zero or more SSE payloads.
 *
 * Returns an array because some events (like `message_update`) may produce
 * nothing (e.g. a toolcall_delta that we don't surface individually).
 */
export const mapAgentEventToSSE = (event: AgentEvent): SSEPayload[] => {
  switch (event.type) {
    // ── Lifecycle ─────────────────────────────────────────────────────────
    case 'agent_start':
      return [{ type: 'agent_start' }];

    case 'agent_end':
      return [{ type: 'complete', messages: event.messages }];

    case 'turn_start':
      return []; // no SSE needed — the first message_start will signal the UI

    case 'turn_end':
      return [{ type: 'turn_end' }];

    // ── LLM streaming ─────────────────────────────────────────────────────
    case 'message_start':
      return [{ type: 'thinking_start' }];

    case 'message_end':
      return [{ type: 'thinking_end' }];

    case 'message_update': {
      const sub = event.assistantMessageEvent;
      const payloads: SSEPayload[] = [];

      // Text content delta
      const text = extractTextDelta(sub);
      if (text !== null) {
        payloads.push({ type: 'content', content: text });
      }

      // Thinking / reasoning delta
      const thinking = extractThinkingDelta(sub);
      if (thinking !== null) {
        payloads.push({ type: 'thinking', content: thinking });
      }

      // Tool call completed — emit tool_use so the UI can show it
      if (sub.type === 'toolcall_end') {
        const tc: ToolCall = sub.toolCall;
        payloads.push({
          type: 'tool_use',
          toolName: tc.name,
          toolInput: tc.arguments,
          toolId: tc.id,
        });
      }

      // We intentionally skip toolcall_start and toolcall_delta — the
      // tool_use frame at toolcall_end already carries the full info, and
      // intermediate deltas are JSON fragments that aren't useful to the UI.

      // Error event from the LLM
      if (sub.type === 'error') {
        payloads.push({
          type: 'error',
          error: sub.error.errorMessage ?? 'Unknown LLM error',
        });
      }

      return payloads;
    }

    // ── Tool execution ────────────────────────────────────────────────────
    case 'tool_execution_start':
      // Already covered by the toolcall_end → tool_use mapping above,
      // but we emit this as well so the UI can show "executing…" state.
      return [{
        type: 'tool_use',
        toolName: event.toolName,
        toolInput: event.args,
        toolId: event.toolCallId,
      }];

    case 'tool_execution_update':
      return [{
        type: 'tool_update',
        toolId: event.toolCallId,
        toolName: event.toolName,
        content: typeof event.partialResult === 'string'
          ? event.partialResult
          : JSON.stringify(event.partialResult),
      }];

    case 'tool_execution_end':
      return [{
        type: 'tool_result',
        toolId: event.toolCallId,
        toolName: event.toolName,
        content: event.result?.content
          ? stringifyContent(event.result.content)
          : typeof event.result === 'string'
            ? event.result
            : JSON.stringify(event.result),
        isError: event.isError,
      }];

    default:
      return [];
  }
};

/**
 * Encode SSE payloads into the `data: ...\n\n` wire format.
 */
export const encodeSSE = (payloads: SSEPayload[]): string => {
  return payloads
    .map(p => `data: ${JSON.stringify(p)}\n\n`)
    .join('');
};

/**
 * Create an SSE error frame from an arbitrary Error.
 */
export const errorToSSE = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return `data: ${JSON.stringify({ type: 'error', error: message })}\n\n`;
};
