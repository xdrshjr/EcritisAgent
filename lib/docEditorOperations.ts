/**
 * Document Editor Section Operations
 *
 * ProseMirror-level operations for manipulating sections in the TipTap editor.
 * A "section" is defined as an h2 heading and all content until the next h2.
 * Section 0 is the h1 title area (everything before the first h2).
 */

import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { logger } from './logger';

// ── Position helpers ────────────────────────────────────────────────────────

interface SectionRange {
  /** Position of the first node in this section (the heading or doc start). */
  from: number;
  /** Position just after the last node in this section. */
  to: number;
}

/**
 * Find the document position ranges for all sections.
 *
 * Section 0: from doc start to the first h2 (or doc end if no h2)
 * Section N: from the Nth h2 to the next h2 (or doc end)
 *
 * Returns an array of { from, to } for each section.
 */
export const findSectionRanges = (doc: ProseMirrorNode): SectionRange[] => {
  const ranges: SectionRange[] = [];
  const h2Positions: number[] = [];

  // Collect all h2 positions (absolute positions in the doc)
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level === 2) {
      h2Positions.push(pos);
    }
    return true; // continue traversing
  });

  const docEnd = doc.content.size;

  if (h2Positions.length === 0) {
    // No h2: the entire document is section 0
    ranges.push({ from: 0, to: docEnd });
  } else {
    // Section 0: from start to first h2
    ranges.push({ from: 0, to: h2Positions[0] });

    // Section 1..N: each h2 to the next h2 (or doc end)
    for (let i = 0; i < h2Positions.length; i++) {
      const from = h2Positions[i];
      const to = i + 1 < h2Positions.length ? h2Positions[i + 1] : docEnd;
      ranges.push({ from, to });
    }
  }

  return ranges;
};

// ── Section operations ────────────────────────────────────────────────────

/**
 * Replace the content of a specific section in the editor.
 *
 * @param editor TipTap editor instance
 * @param sectionIndex 0-based section index
 * @param title New section title (optional — if omitted, keeps existing title)
 * @param content HTML content (paragraphs, lists, etc. — no heading tags)
 */
export const replaceSectionInEditor = (
  editor: Editor,
  sectionIndex: number,
  title?: string,
  content?: string,
): boolean => {
  const doc = editor.state.doc;
  const ranges = findSectionRanges(doc);

  if (!Number.isFinite(sectionIndex) || sectionIndex < 0 || sectionIndex >= ranges.length) {
    logger.warn('replaceSectionInEditor: sectionIndex out of range', {
      sectionIndex,
      totalSections: ranges.length,
    }, 'DocEditorOps');
    return false;
  }

  const range = ranges[sectionIndex];
  const headingTag = sectionIndex === 0 ? 'h1' : 'h2';

  // Build replacement HTML
  let html = '';
  if (title !== undefined) {
    html += `<${headingTag}>${title}</${headingTag}>`;
  } else {
    // Preserve existing heading
    const existingHeading = extractHeadingHtml(doc, range.from, sectionIndex === 0 ? 1 : 2);
    html += existingHeading;
  }
  html += content || '';

  try {
    editor.chain()
      .focus()
      .deleteRange({ from: range.from, to: range.to })
      .insertContentAt(range.from, html)
      .run();

    logger.info('Section replaced', { sectionIndex, titleProvided: title !== undefined }, 'DocEditorOps');
    return true;
  } catch (err) {
    logger.error('Failed to replace section', {
      sectionIndex,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'DocEditorOps');
    return false;
  }
};

/**
 * Append a new section at the end of the document.
 *
 * @param editor TipTap editor instance
 * @param title Section title text
 * @param content HTML content body
 * @param sectionIndex The index this section will occupy. When 0, the title
 *                     is wrapped in h1 (document title); otherwise h2.
 */
export const appendSectionToEditor = (
  editor: Editor,
  title?: string,
  content?: string,
  sectionIndex?: number,
): boolean => {
  const doc = editor.state.doc;
  const insertPos = doc.content.size;

  const headingTag = sectionIndex === 0 ? 'h1' : 'h2';
  let html = '';
  if (title) {
    html += `<${headingTag}>${title}</${headingTag}>`;
  }
  html += content || '';

  if (!html) {
    logger.warn('appendSectionToEditor: nothing to append', undefined, 'DocEditorOps');
    return false;
  }

  try {
    editor.commands.insertContentAt(insertPos, html);
    logger.info('Section appended', { title: title?.substring(0, 50) }, 'DocEditorOps');
    return true;
  } catch (err) {
    logger.error('Failed to append section', {
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'DocEditorOps');
    return false;
  }
};

/**
 * Insert a new section before the specified section index.
 */
export const insertSectionInEditor = (
  editor: Editor,
  sectionIndex: number,
  title?: string,
  content?: string,
): boolean => {
  const doc = editor.state.doc;
  const ranges = findSectionRanges(doc);

  if (!Number.isFinite(sectionIndex) || sectionIndex < 0 || sectionIndex > ranges.length) {
    logger.warn('insertSectionInEditor: sectionIndex out of range', {
      sectionIndex,
      totalSections: ranges.length,
    }, 'DocEditorOps');
    return false;
  }

  // Insert position: if sectionIndex is within range, insert before that section.
  // If sectionIndex === ranges.length, append at the end.
  const insertPos = sectionIndex < ranges.length
    ? ranges[sectionIndex].from
    : doc.content.size;

  let html = '';
  if (title) {
    html += `<h2>${title}</h2>`;
  }
  html += content || '';

  if (!html) {
    logger.warn('insertSectionInEditor: nothing to insert', undefined, 'DocEditorOps');
    return false;
  }

  try {
    editor.commands.insertContentAt(insertPos, html);
    logger.info('Section inserted', { sectionIndex, title: title?.substring(0, 50) }, 'DocEditorOps');
    return true;
  } catch (err) {
    logger.error('Failed to insert section', {
      sectionIndex,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'DocEditorOps');
    return false;
  }
};

/**
 * Delete a section from the editor. Cannot delete section 0.
 */
export const deleteSectionFromEditor = (
  editor: Editor,
  sectionIndex: number,
): boolean => {
  if (sectionIndex === 0) {
    logger.warn('deleteSectionFromEditor: cannot delete section 0', undefined, 'DocEditorOps');
    return false;
  }

  const doc = editor.state.doc;
  const ranges = findSectionRanges(doc);

  if (!Number.isFinite(sectionIndex) || sectionIndex < 0 || sectionIndex >= ranges.length) {
    logger.warn('deleteSectionFromEditor: sectionIndex out of range', {
      sectionIndex,
      totalSections: ranges.length,
    }, 'DocEditorOps');
    return false;
  }

  const range = ranges[sectionIndex];

  try {
    editor.chain()
      .focus()
      .deleteRange({ from: range.from, to: range.to })
      .run();

    logger.info('Section deleted', { sectionIndex }, 'DocEditorOps');
    return true;
  } catch (err) {
    logger.error('Failed to delete section', {
      sectionIndex,
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'DocEditorOps');
    return false;
  }
};

/**
 * Clear all content from the editor, leaving it empty for a fresh document.
 */
export const clearAllSectionsInEditor = (editor: Editor): boolean => {
  try {
    editor.commands.clearContent();
    logger.info('All sections cleared', undefined, 'DocEditorOps');
    return true;
  } catch (err) {
    logger.error('Failed to clear all sections', {
      error: err instanceof Error ? err.message : 'Unknown error',
    }, 'DocEditorOps');
    return false;
  }
};

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Extract the heading HTML from a specific position in the document.
 * Returns the heading element as an HTML string, or empty string if not found.
 */
const extractHeadingHtml = (doc: ProseMirrorNode, from: number, level: number): string => {
  let result = '';
  const searchEnd = Math.min(from + 200, doc.content.size);
  if (from >= searchEnd) return result;

  doc.nodesBetween(from, searchEnd, (node) => {
    if (node.type.name === 'heading' && node.attrs.level === level && !result) {
      const tag = `h${level}`;
      result = `<${tag}>${node.textContent}</${tag}>`;
      return false;
    }
    return true;
  });
  return result;
};
