import { describe, it, expect, vi } from 'vitest';
import { processAgentSSEStream, type AgentStreamCallbacks } from '../agentStreamParser';

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a ReadableStream from SSE frame strings */
const makeStream = (frames: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  const data = frames.join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });
};

/** Create a ReadableStream that delivers chunks one at a time */
const makeChunkedStream = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
};

const frame = (data: Record<string, unknown>) => `data: ${JSON.stringify(data)}\n\n`;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processAgentSSEStream', () => {
  it('dispatches agent_start', async () => {
    const onAgentStart = vi.fn();
    await processAgentSSEStream(makeStream([frame({ type: 'agent_start' })]), { onAgentStart });
    expect(onAgentStart).toHaveBeenCalledOnce();
  });

  it('dispatches content events', async () => {
    const chunks: string[] = [];
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'content', content: 'Hello' }),
        frame({ type: 'content', content: ' world' }),
      ]),
      { onContent: (c) => chunks.push(c) },
    );
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('dispatches thinking events', async () => {
    const chunks: string[] = [];
    await processAgentSSEStream(
      makeStream([frame({ type: 'thinking', content: 'Let me think...' })]),
      { onThinking: (c) => chunks.push(c) },
    );
    expect(chunks).toEqual(['Let me think...']);
  });

  it('dispatches tool_use events', async () => {
    const tools: unknown[] = [];
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'tool_use', toolName: 'read', toolInput: { path: 'foo.ts' }, toolId: 'tc_1' }),
      ]),
      { onToolUse: (t) => tools.push(t) },
    );
    expect(tools).toEqual([{ toolName: 'read', toolInput: { path: 'foo.ts' }, toolId: 'tc_1' }]);
  });

  it('dispatches tool_update events', async () => {
    const updates: unknown[] = [];
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'tool_update', toolId: 'tc_2', toolName: 'bash', content: 'partial' }),
      ]),
      { onToolUpdate: (u) => updates.push(u) },
    );
    expect(updates).toEqual([{ toolId: 'tc_2', toolName: 'bash', content: 'partial' }]);
  });

  it('dispatches tool_result events', async () => {
    const results: unknown[] = [];
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'tool_result', toolId: 'tc_2', toolName: 'bash', content: 'done', isError: false }),
      ]),
      { onToolResult: (r) => results.push(r) },
    );
    expect(results).toEqual([{ toolId: 'tc_2', toolName: 'bash', content: 'done', isError: false }]);
  });

  it('dispatches complete event', async () => {
    const onComplete = vi.fn();
    await processAgentSSEStream(
      makeStream([frame({ type: 'complete' })]),
      { onComplete },
    );
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('dispatches error event', async () => {
    const onError = vi.fn();
    await processAgentSSEStream(
      makeStream([frame({ type: 'error', error: 'boom' })]),
      { onError },
    );
    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('dispatches turn_end event', async () => {
    const onTurnEnd = vi.fn();
    await processAgentSSEStream(
      makeStream([frame({ type: 'turn_end' })]),
      { onTurnEnd },
    );
    expect(onTurnEnd).toHaveBeenCalledOnce();
  });

  it('dispatches thinking_start and thinking_end', async () => {
    const onThinkingStart = vi.fn();
    const onThinkingEnd = vi.fn();
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'thinking_start' }),
        frame({ type: 'thinking_end' }),
      ]),
      { onThinkingStart, onThinkingEnd },
    );
    expect(onThinkingStart).toHaveBeenCalledOnce();
    expect(onThinkingEnd).toHaveBeenCalledOnce();
  });

  it('handles multiple events in sequence', async () => {
    const log: string[] = [];
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'agent_start' }),
        frame({ type: 'content', content: 'hi' }),
        frame({ type: 'tool_use', toolName: 'read', toolInput: {}, toolId: 't1' }),
        frame({ type: 'tool_result', toolId: 't1', toolName: 'read', content: 'ok', isError: false }),
        frame({ type: 'complete' }),
      ]),
      {
        onAgentStart: () => log.push('start'),
        onContent: () => log.push('content'),
        onToolUse: () => log.push('tool_use'),
        onToolResult: () => log.push('tool_result'),
        onComplete: () => log.push('complete'),
      },
    );
    expect(log).toEqual(['start', 'content', 'tool_use', 'tool_result', 'complete']);
  });

  it('handles chunked delivery (split across reads)', async () => {
    // Split a frame across two chunks
    const fullFrame = frame({ type: 'content', content: 'hello' });
    const mid = Math.floor(fullFrame.length / 2);

    const chunks: string[] = [];
    await processAgentSSEStream(
      makeChunkedStream([fullFrame.slice(0, mid), fullFrame.slice(mid)]),
      { onContent: (c) => chunks.push(c) },
    );
    expect(chunks).toEqual(['hello']);
  });

  it('ignores malformed JSON gracefully', async () => {
    const onContent = vi.fn();
    await processAgentSSEStream(
      makeStream([
        'data: {bad json}\n\n',
        frame({ type: 'content', content: 'ok' }),
      ]),
      { onContent },
    );
    expect(onContent).toHaveBeenCalledWith('ok');
  });

  it('handles empty stream', async () => {
    const onComplete = vi.fn();
    const stream = new ReadableStream({
      start(controller) { controller.close(); },
    });
    await processAgentSSEStream(stream, { onComplete });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores unknown event types', async () => {
    const onContent = vi.fn();
    await processAgentSSEStream(
      makeStream([
        frame({ type: 'unknown_event', foo: 'bar' }),
        frame({ type: 'content', content: 'ok' }),
      ]),
      { onContent },
    );
    expect(onContent).toHaveBeenCalledOnce();
  });
});
