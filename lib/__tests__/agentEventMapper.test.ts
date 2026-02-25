import { describe, it, expect, vi } from 'vitest';
import {
  mapAgentEventToSSE,
  encodeSSE,
  errorToSSE,
  type SSEPayload,
} from '../agentEventMapper';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent } from '@mariozechner/pi-ai';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const makePartialAssistant = (overrides?: Partial<AssistantMessage>): AssistantMessage => ({
  role: 'assistant',
  content: [],
  api: 'openai-completions',
  provider: 'openai',
  model: 'gpt-4',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop',
  timestamp: Date.now(),
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('mapAgentEventToSSE', () => {
  // Lifecycle events
  it('maps agent_start', () => {
    const result = mapAgentEventToSSE({ type: 'agent_start' });
    expect(result).toEqual([{ type: 'agent_start' }]);
  });

  it('maps agent_end to complete', () => {
    const result = mapAgentEventToSSE({ type: 'agent_end', messages: [] });
    expect(result).toEqual([{ type: 'complete' }]);
  });

  it('maps turn_start to empty array', () => {
    const result = mapAgentEventToSSE({ type: 'turn_start' });
    expect(result).toEqual([]);
  });

  it('maps turn_end', () => {
    const result = mapAgentEventToSSE({
      type: 'turn_end',
      message: { role: 'assistant', content: [], api: 'openai-completions', provider: 'openai', model: 'gpt-4', usage: {} as any, stopReason: 'stop', timestamp: 0 },
      toolResults: [],
    });
    expect(result).toEqual([{ type: 'turn_end' }]);
  });

  // Message events
  it('maps message_start to thinking_start', () => {
    const result = mapAgentEventToSSE({
      type: 'message_start',
      message: makePartialAssistant(),
    });
    expect(result).toEqual([{ type: 'thinking_start' }]);
  });

  it('maps message_end to thinking_end', () => {
    const result = mapAgentEventToSSE({
      type: 'message_end',
      message: makePartialAssistant(),
    });
    expect(result).toEqual([{ type: 'thinking_end' }]);
  });

  // message_update — text delta
  it('maps message_update with text_delta to content', () => {
    const sub: AssistantMessageEvent = {
      type: 'text_delta',
      contentIndex: 0,
      delta: 'Hello world',
      partial: makePartialAssistant(),
    };
    const result = mapAgentEventToSSE({
      type: 'message_update',
      message: makePartialAssistant(),
      assistantMessageEvent: sub,
    });
    expect(result).toEqual([{ type: 'content', content: 'Hello world' }]);
  });

  // message_update — thinking delta
  it('maps message_update with thinking_delta to thinking', () => {
    const sub: AssistantMessageEvent = {
      type: 'thinking_delta',
      contentIndex: 0,
      delta: 'Let me think...',
      partial: makePartialAssistant(),
    };
    const result = mapAgentEventToSSE({
      type: 'message_update',
      message: makePartialAssistant(),
      assistantMessageEvent: sub,
    });
    expect(result).toEqual([{ type: 'thinking', content: 'Let me think...' }]);
  });

  // message_update — toolcall_end
  it('maps message_update with toolcall_end to tool_use', () => {
    const sub: AssistantMessageEvent = {
      type: 'toolcall_end',
      contentIndex: 0,
      toolCall: { type: 'toolCall', id: 'tc_1', name: 'read', arguments: { path: 'foo.ts' } },
      partial: makePartialAssistant(),
    };
    const result = mapAgentEventToSSE({
      type: 'message_update',
      message: makePartialAssistant(),
      assistantMessageEvent: sub,
    });
    expect(result).toEqual([{
      type: 'tool_use',
      toolName: 'read',
      toolInput: { path: 'foo.ts' },
      toolId: 'tc_1',
    }]);
  });

  // message_update — error
  it('maps message_update with error to error', () => {
    const sub: AssistantMessageEvent = {
      type: 'error',
      reason: 'error',
      error: makePartialAssistant({ errorMessage: 'rate limited', stopReason: 'error' }),
    };
    const result = mapAgentEventToSSE({
      type: 'message_update',
      message: makePartialAssistant(),
      assistantMessageEvent: sub,
    });
    expect(result).toEqual([{ type: 'error', error: 'rate limited' }]);
  });

  // message_update — irrelevant sub-events produce empty
  it('returns empty for toolcall_start sub-event', () => {
    const sub: AssistantMessageEvent = {
      type: 'toolcall_start',
      contentIndex: 0,
      partial: makePartialAssistant(),
    };
    const result = mapAgentEventToSSE({
      type: 'message_update',
      message: makePartialAssistant(),
      assistantMessageEvent: sub,
    });
    expect(result).toEqual([]);
  });

  // Tool execution events
  it('maps tool_execution_start to tool_use', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_start',
      toolCallId: 'tc_2',
      toolName: 'bash',
      args: { command: 'ls' },
    });
    expect(result).toEqual([{
      type: 'tool_use',
      toolName: 'bash',
      toolInput: { command: 'ls' },
      toolId: 'tc_2',
    }]);
  });

  it('maps tool_execution_update to tool_update (string)', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_update',
      toolCallId: 'tc_2',
      toolName: 'bash',
      args: {},
      partialResult: 'partial output',
    });
    expect(result).toEqual([{
      type: 'tool_update',
      toolId: 'tc_2',
      toolName: 'bash',
      content: 'partial output',
    }]);
  });

  it('maps tool_execution_update to tool_update (object)', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_update',
      toolCallId: 'tc_3',
      toolName: 'read',
      args: {},
      partialResult: { lines: 42 },
    });
    expect(result).toEqual([{
      type: 'tool_update',
      toolId: 'tc_3',
      toolName: 'read',
      content: '{"lines":42}',
    }]);
  });

  it('maps tool_execution_end to tool_result with text content', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_end',
      toolCallId: 'tc_2',
      toolName: 'bash',
      result: {
        content: [{ type: 'text', text: 'file1.ts\nfile2.ts' }],
        details: {},
      },
      isError: false,
    });
    expect(result).toEqual([{
      type: 'tool_result',
      toolId: 'tc_2',
      toolName: 'bash',
      content: 'file1.ts\nfile2.ts',
      isError: false,
    }]);
  });

  it('maps tool_execution_end with isError=true', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_end',
      toolCallId: 'tc_4',
      toolName: 'write',
      result: {
        content: [{ type: 'text', text: 'Permission denied' }],
        details: {},
      },
      isError: true,
    });
    expect(result[0]).toMatchObject({
      type: 'tool_result',
      isError: true,
      content: 'Permission denied',
    });
  });

  it('maps tool_execution_end with string result', () => {
    const result = mapAgentEventToSSE({
      type: 'tool_execution_end',
      toolCallId: 'tc_5',
      toolName: 'edit',
      result: 'raw string result',
      isError: false,
    });
    expect(result[0]).toMatchObject({
      type: 'tool_result',
      content: 'raw string result',
    });
  });
});

describe('encodeSSE', () => {
  it('encodes multiple payloads', () => {
    const payloads: SSEPayload[] = [
      { type: 'agent_start' },
      { type: 'content', content: 'hi' },
    ];
    const result = encodeSSE(payloads);
    expect(result).toBe(
      'data: {"type":"agent_start"}\n\n' +
      'data: {"type":"content","content":"hi"}\n\n'
    );
  });

  it('returns empty string for empty array', () => {
    expect(encodeSSE([])).toBe('');
  });
});

describe('errorToSSE', () => {
  it('encodes Error instance', () => {
    const result = errorToSSE(new Error('boom'));
    expect(result).toBe('data: {"type":"error","error":"boom"}\n\n');
  });

  it('encodes non-Error', () => {
    const result = errorToSSE('string error');
    expect(result).toBe('data: {"type":"error","error":"Unknown error"}\n\n');
  });
});
