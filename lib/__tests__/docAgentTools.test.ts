import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SSEController } from '../docAgentTools';

// Mock logger before importing the module under test
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock flaskConfig
vi.mock('@/lib/flaskConfig', () => ({
  buildFlaskApiUrl: vi.fn((endpoint: string) => `http://127.0.0.1:5000${endpoint}`),
}));

import { createDocAgentTools } from '../docAgentTools';

// ── Test helpers ─────────────────────────────────────────────────────────────

const SAMPLE_HTML =
  '<h1>My Document</h1><p>Introduction</p>' +
  '<h2>Chapter 1</h2><p>Content of chapter 1</p>' +
  '<h2>Chapter 2</h2><p>Content of chapter 2</p>';

const createMockSSEController = (): SSEController & { chunks: string[] } => {
  const chunks: string[] = [];
  return {
    chunks,
    enqueue: (chunk: Uint8Array | string) => {
      if (typeof chunk === 'string') {
        chunks.push(chunk);
      } else {
        // Uint8Array or any ArrayBufferView — decode to string
        chunks.push(new TextDecoder().decode(chunk));
      }
    },
  };
};

/** Extract the parsed SSE event data from controller chunks. */
const parseSSEChunks = (chunks: string[]): Record<string, unknown>[] => {
  return chunks
    .join('')
    .split('\n\n')
    .filter((frame) => frame.startsWith('data: '))
    .map((frame) => JSON.parse(frame.slice(6)));
};

// Dummy toolCallId for execute calls
const CALL_ID = 'test-call-1';

// ── get_document ─────────────────────────────────────────────────────────────

describe('get_document', () => {
  it('returns structured sections from HTML', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const getTool = tools.find((t) => t.name === 'get_document')!;

    const result = await getTool.execute(CALL_ID, {});
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    const data = JSON.parse(text);

    expect(data.totalSections).toBe(3);
    expect(data.sections[0].title).toBe('My Document');
    expect(data.sections[1].title).toBe('Chapter 1');
    expect(data.sections[2].title).toBe('Chapter 2');
  });

  it('returns empty sections for blank document', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools('', controller);
    const getTool = tools.find((t) => t.name === 'get_document')!;

    const result = await getTool.execute(CALL_ID, {});
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    const data = JSON.parse(text);

    expect(data.totalSections).toBe(0);
    expect(data.sections).toEqual([]);
    expect(data.rawHtml).toBe('');
  });

  it('does not emit SSE events', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const getTool = tools.find((t) => t.name === 'get_document')!;

    await getTool.execute(CALL_ID, {});
    expect(controller.chunks).toHaveLength(0);
  });
});

// ── update_section: replace ──────────────────────────────────────────────────

describe('update_section — replace', () => {
  it('replaces content of an existing section', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'replace',
      sectionIndex: 1,
      content: '<p>New chapter 1 content</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('updated');

    // Verify SSE event was sent
    const events = parseSSEChunks(controller.chunks);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('doc_update');
    expect(events[0].operation).toBe('replace');
    expect(events[0].sectionIndex).toBe(1);
    expect(events[0].content).toBe('<p>New chapter 1 content</p>');
  });

  it('replaces title when provided', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    await updateTool.execute(CALL_ID, {
      operation: 'replace',
      sectionIndex: 1,
      title: 'New Title',
      content: '<p>New content</p>',
    });

    // Verify the internal state updated — read document again
    const getTool = tools.find((t) => t.name === 'get_document')!;
    const getResult = await getTool.execute(CALL_ID, {});
    const data = JSON.parse(
      getResult.content[0].type === 'text' ? getResult.content[0].text : '{}',
    );
    expect(data.sections[1].title).toBe('New Title');
    expect(data.sections[1].content).toBe('<p>New content</p>');
  });

  it('returns error for out-of-range index', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'replace',
      sectionIndex: 99,
      content: '<p>Bad</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('out of range');
    expect(controller.chunks).toHaveLength(0);
  });

  it('returns error when sectionIndex is missing', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'replace',
      content: '<p>No index</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('returns error when content is missing', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'replace',
      sectionIndex: 1,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });
});

// ── update_section: append ───────────────────────────────────────────────────

describe('update_section — append', () => {
  it('appends a new section at the end', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'append',
      title: 'Chapter 3',
      content: '<p>New chapter content</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Chapter 3');
    expect(text).toContain('Section 3');

    // Verify via get_document
    const getTool = tools.find((t) => t.name === 'get_document')!;
    const getResult = await getTool.execute(CALL_ID, {});
    const data = JSON.parse(
      getResult.content[0].type === 'text' ? getResult.content[0].text : '{}',
    );
    expect(data.totalSections).toBe(4);
    expect(data.sections[3].title).toBe('Chapter 3');

    // SSE event
    const events = parseSSEChunks(controller.chunks);
    expect(events[0].operation).toBe('append');
    expect(events[0].sectionIndex).toBe(3);
  });

  it('returns error when title is missing', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'append',
      content: '<p>No title</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('returns error when content is missing', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'append',
      title: 'New Section',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });
});

// ── update_section: insert ───────────────────────────────────────────────────

describe('update_section — insert', () => {
  it('inserts a section at the specified position', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    await updateTool.execute(CALL_ID, {
      operation: 'insert',
      sectionIndex: 1,
      title: 'Inserted Chapter',
      content: '<p>Inserted content</p>',
    });

    const getTool = tools.find((t) => t.name === 'get_document')!;
    const getResult = await getTool.execute(CALL_ID, {});
    const data = JSON.parse(
      getResult.content[0].type === 'text' ? getResult.content[0].text : '{}',
    );

    expect(data.totalSections).toBe(4);
    expect(data.sections[1].title).toBe('Inserted Chapter');
    expect(data.sections[2].title).toBe('Chapter 1'); // pushed back
    expect(data.sections[3].title).toBe('Chapter 2');
  });

  it('returns error for out-of-range index', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'insert',
      sectionIndex: 100,
      title: 'Bad',
      content: '<p>Bad</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('allows inserting at position equal to length (same as append)', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'insert',
      sectionIndex: 3, // sections.length === 3
      title: 'At End',
      content: '<p>End</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('Error');
  });
});

// ── update_section: delete ───────────────────────────────────────────────────

describe('update_section — delete', () => {
  it('deletes the specified section', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'delete',
      sectionIndex: 1,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('deleted');

    const getTool = tools.find((t) => t.name === 'get_document')!;
    const getResult = await getTool.execute(CALL_ID, {});
    const data = JSON.parse(
      getResult.content[0].type === 'text' ? getResult.content[0].text : '{}',
    );

    expect(data.totalSections).toBe(2);
    expect(data.sections[1].title).toBe('Chapter 2'); // was section 2, now section 1
  });

  it('cannot delete Section 0', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'delete',
      sectionIndex: 0,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('Cannot delete Section 0');
  });

  it('returns error for out-of-range index', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const updateTool = tools.find((t) => t.name === 'update_section')!;

    const result = await updateTool.execute(CALL_ID, {
      operation: 'delete',
      sectionIndex: 50,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('out of range');
  });
});

// ── insert_image ─────────────────────────────────────────────────────────────

describe('insert_image', () => {
  it('sends doc_update SSE event with insert_image operation', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'insert_image')!;

    const result = await imgTool.execute(CALL_ID, {
      sectionIndex: 1,
      imageUrl: 'https://example.com/photo.jpg',
      imageDescription: 'A test photo',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Image inserted');
    expect(text).toContain('after');

    const events = parseSSEChunks(controller.chunks);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'doc_update',
      operation: 'insert_image',
      sectionIndex: 1,
      imageUrl: 'https://example.com/photo.jpg',
      imageDescription: 'A test photo',
      position: 'after_section',
    });
  });

  it('supports before_section position', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'insert_image')!;

    await imgTool.execute(CALL_ID, {
      sectionIndex: 1,
      imageUrl: 'https://example.com/photo.jpg',
      imageDescription: 'Before photo',
      position: 'before_section',
    });

    const events = parseSSEChunks(controller.chunks);
    expect(events[0].position).toBe('before_section');
  });

  it('returns error for out-of-range section', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'insert_image')!;

    const result = await imgTool.execute(CALL_ID, {
      sectionIndex: 99,
      imageUrl: 'https://example.com/photo.jpg',
      imageDescription: 'Bad index',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(controller.chunks).toHaveLength(0);
  });
});

// ── search_web ───────────────────────────────────────────────────────────────

describe('search_web', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns search results on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'Summary 1', score: 0.9 },
        ],
      }),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    const result = await searchTool.execute(CALL_ID, { query: 'test query' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    const data = JSON.parse(text);

    expect(data.totalResults).toBe(1);
    expect(data.results[0].title).toBe('Result 1');
    expect(data.query).toBe('test query');
  });

  it('returns error when Flask returns non-OK status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    const result = await searchTool.execute(CALL_ID, { query: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('500');
  });

  it('returns error when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new Error('Network failure'),
    ) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    const result = await searchTool.execute(CALL_ID, { query: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('Network failure');
  });

  it('clamps maxResults to valid range', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [] }),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    await searchTool.execute(CALL_ID, { query: 'test', maxResults: 100 });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.maxResults).toBe(10);
  });

  it('does not emit SSE events', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [] }),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    await searchTool.execute(CALL_ID, { query: 'test' });
    expect(controller.chunks).toHaveLength(0);
  });
});

// ── search_image ─────────────────────────────────────────────────────────────

describe('search_image', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns image results on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        images: [
          {
            url: 'https://unsplash.com/photo1',
            description: 'A sunset',
            author: 'Photographer',
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'search_image')!;

    const result = await imgTool.execute(CALL_ID, { keywords: 'sunset' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    const data = JSON.parse(text);

    expect(data.totalImages).toBe(1);
    expect(data.images[0].url).toBe('https://unsplash.com/photo1');
    expect(data.keywords).toBe('sunset');
  });

  it('returns error when Flask returns non-OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'search_image')!;

    const result = await imgTool.execute(CALL_ID, { keywords: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('clamps count to valid range', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, images: [] }),
    }) as unknown as typeof fetch;

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'search_image')!;

    await imgTool.execute(CALL_ID, { keywords: 'test', count: 50 });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.perPage).toBe(5);
  });
});

// ── Tool creation ────────────────────────────────────────────────────────────

describe('createDocAgentTools', () => {
  it('returns 5 tools with correct names', () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);

    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_document');
    expect(names).toContain('update_section');
    expect(names).toContain('insert_image');
    expect(names).toContain('search_web');
    expect(names).toContain('search_image');
  });

  it('all tools have label and description', () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);

    for (const tool of tools) {
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('all tools have parameters schema', () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);

    for (const tool of tools) {
      expect(tool.parameters).toBeDefined();
    }
  });
});
