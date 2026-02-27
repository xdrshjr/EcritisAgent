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

// Mock flaskConfig — provide fetchFlask as a vi.fn() so tests can override it
const mockFetchFlask = vi.fn();
vi.mock('@/lib/flaskConfig', () => ({
  buildFlaskApiUrl: vi.fn((endpoint: string) => `http://127.0.0.1:5000${endpoint}`),
  fetchFlask: (...args: unknown[]) => mockFetchFlask(...args),
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

// ── replace_section ──────────────────────────────────────────────────────────

describe('replace_section', () => {
  it('replaces content of an existing section', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const replaceTool = tools.find((t) => t.name === 'replace_section')!;

    const result = await replaceTool.execute(CALL_ID, {
      sectionIndex: 1,
      title: 'Chapter 1',
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
    const replaceTool = tools.find((t) => t.name === 'replace_section')!;

    await replaceTool.execute(CALL_ID, {
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
    const replaceTool = tools.find((t) => t.name === 'replace_section')!;

    const result = await replaceTool.execute(CALL_ID, {
      sectionIndex: 99,
      title: 'Chapter 1',
      content: '<p>Bad</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('out of range');
    expect(controller.chunks).toHaveLength(0);
  });

  it('returns error when content is empty', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const replaceTool = tools.find((t) => t.name === 'replace_section')!;

    const result = await replaceTool.execute(CALL_ID, {
      sectionIndex: 1,
      title: 'Chapter 1',
      content: '',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });
});

// ── append_section ───────────────────────────────────────────────────────────

describe('append_section', () => {
  it('appends a new section at the end', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const appendTool = tools.find((t) => t.name === 'append_section')!;

    const result = await appendTool.execute(CALL_ID, {
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

  it('returns error when title is empty', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const appendTool = tools.find((t) => t.name === 'append_section')!;

    const result = await appendTool.execute(CALL_ID, {
      title: '',
      content: '<p>No title</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('returns error when content is empty', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const appendTool = tools.find((t) => t.name === 'append_section')!;

    const result = await appendTool.execute(CALL_ID, {
      title: 'New Section',
      content: '',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });
});

// ── insert_section ───────────────────────────────────────────────────────────

describe('insert_section', () => {
  it('inserts a section at the specified position', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const insertTool = tools.find((t) => t.name === 'insert_section')!;

    await insertTool.execute(CALL_ID, {
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
    const insertTool = tools.find((t) => t.name === 'insert_section')!;

    const result = await insertTool.execute(CALL_ID, {
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
    const insertTool = tools.find((t) => t.name === 'insert_section')!;

    const result = await insertTool.execute(CALL_ID, {
      sectionIndex: 3, // sections.length === 3
      title: 'At End',
      content: '<p>End</p>',
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).not.toContain('Error');
  });
});

// ── delete_section ───────────────────────────────────────────────────────────

describe('delete_section', () => {
  it('deletes the specified section', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const deleteTool = tools.find((t) => t.name === 'delete_section')!;

    const result = await deleteTool.execute(CALL_ID, {
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
    const deleteTool = tools.find((t) => t.name === 'delete_section')!;

    const result = await deleteTool.execute(CALL_ID, {
      sectionIndex: 0,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('Cannot delete Section 0');
  });

  it('returns error for out-of-range index', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const deleteTool = tools.find((t) => t.name === 'delete_section')!;

    const result = await deleteTool.execute(CALL_ID, {
      sectionIndex: 50,
    });

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('out of range');
  });
});

// ── clear_document ───────────────────────────────────────────────────────────

describe('clear_document', () => {
  it('clears all sections', async () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const clearTool = tools.find((t) => t.name === 'clear_document')!;

    const result = await clearTool.execute(CALL_ID, {});

    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('cleared');

    // Verify document is empty
    const getTool = tools.find((t) => t.name === 'get_document')!;
    const getResult = await getTool.execute(CALL_ID, {});
    const data = JSON.parse(
      getResult.content[0].type === 'text' ? getResult.content[0].text : '{}',
    );
    expect(data.totalSections).toBe(0);

    // SSE event
    const events = parseSSEChunks(controller.chunks);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'doc_update',
      operation: 'clear_all',
    });
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
  afterEach(() => {
    mockFetchFlask.mockReset();
  });

  it('returns search results on success', async () => {
    mockFetchFlask.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'Summary 1', score: 0.9 },
        ],
      }),
      text: () => Promise.resolve(''),
    });

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
    mockFetchFlask.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    const result = await searchTool.execute(CALL_ID, { query: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('500');
  });

  it('returns error when fetchFlask throws', async () => {
    mockFetchFlask.mockRejectedValue(new Error('Network failure'));

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    const result = await searchTool.execute(CALL_ID, { query: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
    expect(text).toContain('Network failure');
  });

  it('clamps maxResults to valid range', async () => {
    mockFetchFlask.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, results: [] }),
      text: () => Promise.resolve(''),
    });

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    await searchTool.execute(CALL_ID, { query: 'test', maxResults: 100 });

    const fetchCall = mockFetchFlask.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.maxResults).toBe(10);
  });

  it('does not emit SSE events', async () => {
    mockFetchFlask.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, results: [] }),
      text: () => Promise.resolve(''),
    });

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const searchTool = tools.find((t) => t.name === 'search_web')!;

    await searchTool.execute(CALL_ID, { query: 'test' });
    expect(controller.chunks).toHaveLength(0);
  });
});

// ── search_image ─────────────────────────────────────────────────────────────

describe('search_image', () => {
  afterEach(() => {
    mockFetchFlask.mockReset();
  });

  it('returns image results on success', async () => {
    mockFetchFlask.mockResolvedValue({
      ok: true,
      status: 200,
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
      text: () => Promise.resolve(''),
    });

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
    mockFetchFlask.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'search_image')!;

    const result = await imgTool.execute(CALL_ID, { keywords: 'test' });
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toContain('Error');
  });

  it('clamps count to valid range', async () => {
    mockFetchFlask.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, images: [] }),
      text: () => Promise.resolve(''),
    });

    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);
    const imgTool = tools.find((t) => t.name === 'search_image')!;

    await imgTool.execute(CALL_ID, { keywords: 'test', count: 50 });

    const fetchCall = mockFetchFlask.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    expect(body.perPage).toBe(5);
  });
});

// ── Tool creation ────────────────────────────────────────────────────────────

describe('createDocAgentTools', () => {
  it('returns 9 tools with correct names', () => {
    const controller = createMockSSEController();
    const tools = createDocAgentTools(SAMPLE_HTML, controller);

    expect(tools).toHaveLength(9);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_document');
    expect(names).toContain('clear_document');
    expect(names).toContain('append_section');
    expect(names).toContain('replace_section');
    expect(names).toContain('delete_section');
    expect(names).toContain('insert_section');
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
