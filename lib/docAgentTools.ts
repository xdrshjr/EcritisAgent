/**
 * Document Agent Tools
 *
 * Creates pi-agent-compatible tools for the document agent. These are
 * "virtual tools" — they operate on the TipTap editor's in-memory content
 * (delivered via the request body) rather than the file system.
 *
 * Tools:
 *   get_document      — read current editor content as structured sections
 *   clear_document    — clear all sections from the document
 *   append_section    — append a new section at the end
 *   replace_section   — replace an existing section's title and content
 *   delete_section    — delete a section by index
 *   insert_section    — insert a new section at a given position
 *   insert_image      — insert an image after/before a section
 *   search_web        — search the web via Tavily
 *   search_image      — search images via Unsplash
 */

import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import {
  parseHtmlToSections,
  sectionsToHtml,
  reindexSections,
} from './docSectionParser';
import { fetchFlask } from './flaskConfig';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────────

/** Configuration for external services (search, image). */
export interface DocToolServiceConfig {
  /** Flask backend is available for proxying search/image requests. */
  flaskAvailable?: boolean;
}

/** A controller that can enqueue SSE frames to the response stream. */
export interface SSEController {
  enqueue: (chunk: Uint8Array | string) => void;
}

/** Payload shape for doc_update SSE events sent to the frontend. */
export interface DocUpdateEvent {
  type: 'doc_update';
  operation: 'replace' | 'append' | 'insert' | 'delete' | 'insert_image' | 'clear_all';
  sectionIndex?: number;
  title?: string;
  content?: string;
  imageUrl?: string;
  imageDescription?: string;
  position?: string;
}

// ── SSE helper ───────────────────────────────────────────────────────────────

/** Encode a doc_update event as an SSE frame string. */
const encodeDocUpdateSSE = (event: DocUpdateEvent): string => {
  return `data: ${JSON.stringify(event)}\n\n`;
};

/** Send a doc_update event through the SSE controller. */
const sendDocUpdate = (controller: SSEController, event: DocUpdateEvent): void => {
  controller.enqueue(new TextEncoder().encode(encodeDocUpdateSSE(event)));
};

// ── Tool result helpers ──────────────────────────────────────────────────────

const textResult = <T>(text: string, details: T): AgentToolResult<T> => ({
  content: [{ type: 'text', text }],
  details,
});

const errorResult = <T>(message: string, details: T): AgentToolResult<T> => ({
  content: [{ type: 'text', text: `Error: ${message}` }],
  details,
});

// ── Parameter Schemas (TypeBox) ──────────────────────────────────────────────

const GetDocumentParams = Type.Object({});

const ClearDocumentParams = Type.Object({});

const AppendSectionParams = Type.Object({
  title: Type.String({
    description: 'Section title (plain text, will be wrapped in h1/h2)',
  }),
  content: Type.String({
    description: 'Section HTML content (paragraphs, lists, etc. wrapped in <p> tags)',
  }),
});

const ReplaceSectionParams = Type.Object({
  sectionIndex: Type.Number({
    description: 'Target section index (0-based)',
  }),
  title: Type.String({
    description: 'Section title (pass the original title to keep it unchanged)',
  }),
  content: Type.String({
    description: 'New section HTML content (paragraphs, lists, etc. wrapped in <p> tags)',
  }),
});

const DeleteSectionParams = Type.Object({
  sectionIndex: Type.Number({
    description: 'Target section index (0-based). Cannot delete Section 0.',
  }),
});

const InsertSectionParams = Type.Object({
  sectionIndex: Type.Number({
    description: 'Insert new section before this index (0-based)',
  }),
  title: Type.String({
    description: 'Section title (plain text, will be wrapped in h1/h2)',
  }),
  content: Type.String({
    description: 'Section HTML content (paragraphs, lists, etc. wrapped in <p> tags)',
  }),
});

const InsertImageParams = Type.Object({
  sectionIndex: Type.Number({
    description: 'Insert image relative to this section index',
  }),
  imageUrl: Type.String({
    description: 'Full URL of the image to insert',
  }),
  imageDescription: Type.String({
    description: 'Image description / alt text',
  }),
  position: Type.Optional(Type.Union([
    Type.Literal('after_section'),
    Type.Literal('before_section'),
  ], { description: 'Insert position relative to the section (default: after_section)' })),
});

const SearchWebParams = Type.Object({
  query: Type.String({ description: 'Search query string' }),
  maxResults: Type.Optional(Type.Number({
    description: 'Maximum number of results to return (1-10, default 5)',
  })),
});

const SearchImageParams = Type.Object({
  keywords: Type.String({
    description: 'Search keywords (space-separated)',
  }),
  count: Type.Optional(Type.Number({
    description: 'Number of images to return (1-5, default 3)',
  })),
});

// ── Main factory ─────────────────────────────────────────────────────────────

/**
 * Create the full set of document agent tools.
 *
 * @param documentContent  HTML string from the frontend editor (snapshot at request time)
 * @param sseController    SSE stream controller for sending doc_update events to the frontend
 * @param serviceConfig    Optional external service configuration
 * @returns Array of AgentTool instances ready for pi-agent
 */
export const createDocAgentTools = (
  documentContent: string,
  sseController: SSEController,
  _serviceConfig?: DocToolServiceConfig,
): AgentTool<any>[] => { // eslint-disable-line @typescript-eslint/no-explicit-any
  logger.info('Creating document agent tools', {
    contentLength: documentContent.length,
    hasSSEController: !!sseController,
  }, 'DocAgentTools');

  // Mutable state: the parsed sections (updated as the agent modifies the document)
  let sections = parseHtmlToSections(documentContent);
  let currentHtml = documentContent;

  /** Rebuild html from current sections and update state. */
  const rebuildHtml = (): void => {
    sections = reindexSections(sections);
    currentHtml = sectionsToHtml(sections);
  };

  // ── get_document ─────────────────────────────────────────────────────────

  const getDocument: AgentTool<typeof GetDocumentParams> = {
    name: 'get_document',
    label: 'Get Document',
    description:
      '读取当前文档的完整内容，返回按章节(section)分组的结构化数据。' +
      '每个section包含index(序号)、title(标题)和content(HTML内容)。' +
      '用于了解文档当前状态，在修改文档之前应先调用此工具。',
    parameters: GetDocumentParams,
    execute: async () => {
      const result = {
        sections: sections.map((s) => ({
          index: s.index,
          title: s.title,
          content: s.content,
        })),
        totalSections: sections.length,
        rawHtml: currentHtml,
      };

      logger.info('get_document executed', {
        totalSections: sections.length,
      }, 'DocAgentTools');

      return textResult(JSON.stringify(result, null, 2), { sections: sections.length });
    },
  };

  // ── clear_document ──────────────────────────────────────────────────────

  const clearDocument: AgentTool<typeof ClearDocumentParams> = {
    name: 'clear_document',
    label: 'Clear Document',
    description:
      '清空整个文档的所有章节。通常在创建新文档之前调用，以清除编辑器中的旧内容。',
    parameters: ClearDocumentParams,
    execute: async () => {
      logger.info('clear_document called', {}, 'DocAgentTools');

      sections = [];
      rebuildHtml();

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'clear_all',
      });

      return textResult(
        'Document has been cleared. You can now build the document from scratch using append_section.',
        { operation: 'clear_all' },
      );
    },
  };

  // ── append_section ─────────────────────────────────────────────────────

  const appendSection: AgentTool<typeof AppendSectionParams> = {
    name: 'append_section',
    label: 'Append Section',
    description:
      '在文档末尾追加一个新章节。需要提供章节标题(title)和HTML内容(content)。' +
      '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
    parameters: AppendSectionParams,
    execute: async (_toolCallId, params) => {
      const { title, content } = params as Static<typeof AppendSectionParams>;

      logger.info('append_section called', { title: title.substring(0, 50) }, 'DocAgentTools');

      if (!title) {
        return errorResult('append_section requires title', {});
      }
      if (!content) {
        return errorResult('append_section requires content', {});
      }

      const newIndex = sections.length;
      sections.push({ index: newIndex, title, content });
      rebuildHtml();

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'append',
        sectionIndex: newIndex,
        title,
        content,
      });

      return textResult(
        `New section '${title}' appended as Section ${newIndex}.`,
        { operation: 'append', sectionIndex: newIndex },
      );
    },
  };

  // ── replace_section ────────────────────────────────────────────────────

  const replaceSection: AgentTool<typeof ReplaceSectionParams> = {
    name: 'replace_section',
    label: 'Replace Section',
    description:
      '替换指定章节的标题和内容。需要提供sectionIndex(章节索引)、title(标题)和content(新内容)。' +
      '如果不需要修改标题，请传入原标题。' +
      '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
    parameters: ReplaceSectionParams,
    execute: async (_toolCallId, params) => {
      const { sectionIndex, title, content } = params as Static<typeof ReplaceSectionParams>;

      logger.info('replace_section called', { sectionIndex, title: title.substring(0, 50) }, 'DocAgentTools');

      if (sectionIndex < 0 || sectionIndex >= sections.length) {
        return errorResult(
          `sectionIndex ${sectionIndex} out of range. Valid range: 0-${sections.length - 1}`,
          {},
        );
      }
      if (!content) {
        return errorResult('replace_section requires content', {});
      }

      sections[sectionIndex] = {
        ...sections[sectionIndex],
        title,
        content,
      };
      rebuildHtml();

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'replace',
        sectionIndex,
        title: sections[sectionIndex].title,
        content,
      });

      return textResult(
        `Section ${sectionIndex} '${sections[sectionIndex].title}' has been updated.`,
        { operation: 'replace', sectionIndex },
      );
    },
  };

  // ── delete_section ─────────────────────────────────────────────────────

  const deleteSection: AgentTool<typeof DeleteSectionParams> = {
    name: 'delete_section',
    label: 'Delete Section',
    description:
      '删除指定索引的章节。不能删除 Section 0（文档标题区域）。',
    parameters: DeleteSectionParams,
    execute: async (_toolCallId, params) => {
      const { sectionIndex } = params as Static<typeof DeleteSectionParams>;

      logger.info('delete_section called', { sectionIndex }, 'DocAgentTools');

      if (sectionIndex === 0) {
        return errorResult('Cannot delete Section 0 (document title area)', {});
      }
      if (sectionIndex < 0 || sectionIndex >= sections.length) {
        return errorResult(
          `sectionIndex ${sectionIndex} out of range. Valid range: 1-${sections.length - 1}`,
          {},
        );
      }

      const deletedTitle = sections[sectionIndex].title;
      sections.splice(sectionIndex, 1);
      rebuildHtml();

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'delete',
        sectionIndex,
      });

      return textResult(
        `Section ${sectionIndex} '${deletedTitle}' has been deleted.`,
        { operation: 'delete', sectionIndex },
      );
    },
  };

  // ── insert_section ─────────────────────────────────────────────────────

  const insertSection: AgentTool<typeof InsertSectionParams> = {
    name: 'insert_section',
    label: 'Insert Section',
    description:
      '在指定位置之前插入一个新章节。需要提供sectionIndex(插入位置)、title(标题)和content(内容)。' +
      '内容使用HTML格式(p, ul, ol, li, strong, em等标签)。',
    parameters: InsertSectionParams,
    execute: async (_toolCallId, params) => {
      const { sectionIndex, title, content } = params as Static<typeof InsertSectionParams>;

      logger.info('insert_section called', { sectionIndex, title: title.substring(0, 50) }, 'DocAgentTools');

      if (sectionIndex < 0 || sectionIndex > sections.length) {
        return errorResult(
          `sectionIndex ${sectionIndex} out of range for insert. Valid range: 0-${sections.length}`,
          {},
        );
      }
      if (!title) {
        return errorResult('insert_section requires title', {});
      }
      if (!content) {
        return errorResult('insert_section requires content', {});
      }

      sections.splice(sectionIndex, 0, { index: sectionIndex, title, content });
      rebuildHtml();

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'insert',
        sectionIndex,
        title,
        content,
      });

      return textResult(
        `New section '${title}' inserted at position ${sectionIndex}.`,
        { operation: 'insert', sectionIndex },
      );
    },
  };

  // ── insert_image ─────────────────────────────────────────────────────────

  const insertImage: AgentTool<typeof InsertImageParams> = {
    name: 'insert_image',
    label: 'Insert Image',
    description:
      '在指定章节之后（或之前）插入一张图片。需要提供图片URL和描述文字(alt text)。' +
      '通常在调用search_image获取图片后使用。',
    parameters: InsertImageParams,
    execute: async (_toolCallId, params) => {
      const { sectionIndex, imageUrl, imageDescription, position } =
        params as Static<typeof InsertImageParams>;

      logger.info('insert_image called', { sectionIndex, imageUrl: imageUrl.substring(0, 80) }, 'DocAgentTools');

      if (sectionIndex < 0 || sectionIndex >= sections.length) {
        return errorResult(
          `sectionIndex ${sectionIndex} out of range. Valid range: 0-${sections.length - 1}`,
          {},
        );
      }

      const pos = position ?? 'after_section';

      sendDocUpdate(sseController, {
        type: 'doc_update',
        operation: 'insert_image',
        sectionIndex,
        imageUrl,
        imageDescription,
        position: pos,
      });

      return textResult(
        `Image inserted ${pos === 'before_section' ? 'before' : 'after'} Section ${sectionIndex}.`,
        { sectionIndex, imageUrl, position: pos },
      );
    },
  };

  // ── search_web ───────────────────────────────────────────────────────────

  const searchWeb: AgentTool<typeof SearchWebParams> = {
    name: 'search_web',
    label: 'Search Web',
    description:
      '搜索网络获取参考资料和相关信息。返回搜索结果列表，包含标题、URL和内容摘要。' +
      '用于丰富文档内容、添加引用依据。',
    parameters: SearchWebParams,
    execute: async (_toolCallId, params, signal) => {
      const { query, maxResults } = params as Static<typeof SearchWebParams>;
      const limit = Math.max(1, Math.min(maxResults ?? 5, 10));

      logger.info('search_web called', { query, maxResults: limit }, 'DocAgentTools');

      try {
        const response = await fetchFlask('/api/search-services/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, maxResults: limit }),
          timeout: 15000,
          signal: signal ?? undefined,
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.error('search_web Flask request failed', {
            status: response.status,
            body: errBody.substring(0, 200),
          }, 'DocAgentTools');
          return errorResult(
            `Search service returned status ${response.status}. Ensure search service is configured in settings.`,
            {},
          );
        }

        const data = await response.json() as { success?: boolean; error?: string; results?: unknown[] };

        if (!data.success) {
          return errorResult(data.error || 'Search service returned an error', {});
        }

        const results = data.results || [];
        const result = {
          results,
          totalResults: results.length,
          query,
        };

        logger.info('search_web completed', {
          query,
          resultCount: result.totalResults,
        }, 'DocAgentTools');

        return textResult(JSON.stringify(result, null, 2), { resultCount: result.totalResults });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return errorResult('Search request was cancelled or timed out', {});
        }
        logger.error('search_web error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'DocAgentTools');
        return errorResult(
          `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}. ` +
          'Ensure the Flask backend is running and search service is configured.',
          {},
        );
      }
    },
  };

  // ── search_image ─────────────────────────────────────────────────────────

  const searchImage: AgentTool<typeof SearchImageParams> = {
    name: 'search_image',
    label: 'Search Image',
    description:
      '根据关键词搜索图片素材。返回图片URL、描述和作者信息。' +
      '搜索到合适的图片后，可使用insert_image工具将其插入文档。',
    parameters: SearchImageParams,
    execute: async (_toolCallId, params, signal) => {
      const { keywords, count } = params as Static<typeof SearchImageParams>;
      const perPage = Math.max(1, Math.min(count ?? 3, 5));

      logger.info('search_image called', { keywords, count: perPage }, 'DocAgentTools');

      try {
        const response = await fetchFlask('/api/image-services/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: keywords, perPage }),
          timeout: 10000,
          signal: signal ?? undefined,
        });

        if (!response.ok) {
          const errBody = await response.text();
          logger.error('search_image Flask request failed', {
            status: response.status,
            body: errBody.substring(0, 200),
          }, 'DocAgentTools');
          return errorResult(
            `Image service returned status ${response.status}. Ensure image service is configured in settings.`,
            {},
          );
        }

        const data = await response.json() as { success?: boolean; error?: string; images?: Record<string, unknown>[] };

        if (!data.success) {
          return errorResult(data.error || 'Image service returned an error', {});
        }

        const images = (data.images || []).map((img: Record<string, unknown>) => ({
          url: img.url,
          description: img.description || '',
          author: img.author || '',
        }));

        const result = {
          images,
          totalImages: images.length,
          keywords,
        };

        logger.info('search_image completed', {
          keywords,
          imageCount: images.length,
        }, 'DocAgentTools');

        return textResult(JSON.stringify(result, null, 2), { imageCount: images.length });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return errorResult('Image search request was cancelled or timed out', {});
        }
        logger.error('search_image error', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }, 'DocAgentTools');
        return errorResult(
          `Image search failed: ${err instanceof Error ? err.message : 'Unknown error'}. ` +
          'Ensure the Flask backend is running and image service is configured.',
          {},
        );
      }
    },
  };

  // ── Assemble & return ────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTools: AgentTool<any>[] = [
    getDocument,
    clearDocument,
    appendSection,
    replaceSection,
    deleteSection,
    insertSection,
    insertImage,
    searchWeb,
    searchImage,
  ];

  logger.info('Document agent tools created', {
    toolNames: allTools.map((t) => t.name),
    count: allTools.length,
    initialSections: sections.length,
  }, 'DocAgentTools');

  return allTools;
};
