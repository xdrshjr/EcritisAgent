import { describe, it, expect } from 'vitest';
import {
  parseHtmlToSections,
  extractH1Title,
  extractH2Title,
  removeH1Tag,
  removeH2Tag,
  sectionsToHtml,
  reindexSections,
  type Section,
} from '../docSectionParser';

// ── Helper extraction tests ──────────────────────────────────────────────────

describe('extractH1Title', () => {
  it('extracts plain text from h1', () => {
    expect(extractH1Title('<h1>My Title</h1>')).toBe('My Title');
  });

  it('strips nested tags inside h1', () => {
    expect(extractH1Title('<h1><strong>Bold</strong> Title</h1>')).toBe('Bold Title');
  });

  it('returns empty string when no h1', () => {
    expect(extractH1Title('<p>No heading here</p>')).toBe('');
  });

  it('handles h1 with attributes', () => {
    expect(extractH1Title('<h1 class="title" id="main">Styled Title</h1>')).toBe('Styled Title');
  });
});

describe('extractH2Title', () => {
  it('extracts plain text from h2', () => {
    expect(extractH2Title('<h2>Chapter One</h2>')).toBe('Chapter One');
  });

  it('returns empty string when no h2', () => {
    expect(extractH2Title('<h1>Only h1</h1>')).toBe('');
  });
});

describe('removeH1Tag', () => {
  it('removes the first h1 tag', () => {
    expect(removeH1Tag('<h1>Title</h1><p>Content</p>')).toBe('<p>Content</p>');
  });

  it('returns original string when no h1', () => {
    expect(removeH1Tag('<p>Content</p>')).toBe('<p>Content</p>');
  });
});

describe('removeH2Tag', () => {
  it('removes the first h2 tag', () => {
    expect(removeH2Tag('<h2>Chapter</h2><p>Text</p>')).toBe('<p>Text</p>');
  });

  it('only removes the first h2', () => {
    const result = removeH2Tag('<h2>First</h2><p>A</p><h2>Second</h2><p>B</p>');
    expect(result).toContain('<h2>Second</h2>');
    expect(result).not.toContain('<h2>First</h2>');
  });
});

// ── parseHtmlToSections ──────────────────────────────────────────────────────

describe('parseHtmlToSections', () => {
  it('returns empty array for empty string', () => {
    expect(parseHtmlToSections('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseHtmlToSections('   \n  ')).toEqual([]);
  });

  it('parses document with only h1 (no h2)', () => {
    const html = '<h1>My Document</h1><p>Introduction paragraph.</p>';
    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(1);
    expect(sections[0].index).toBe(0);
    expect(sections[0].title).toBe('My Document');
    expect(sections[0].content).toBe('<p>Introduction paragraph.</p>');
  });

  it('parses standard document with h1 + multiple h2', () => {
    const html =
      '<h1>Title</h1><p>Intro</p>' +
      '<h2>Chapter 1</h2><p>Content 1</p>' +
      '<h2>Chapter 2</h2><p>Content 2</p><p>More content 2</p>';

    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(3);

    // Section 0: h1 title area
    expect(sections[0].index).toBe(0);
    expect(sections[0].title).toBe('Title');
    expect(sections[0].content).toBe('<p>Intro</p>');

    // Section 1
    expect(sections[1].index).toBe(1);
    expect(sections[1].title).toBe('Chapter 1');
    expect(sections[1].content).toBe('<p>Content 1</p>');

    // Section 2
    expect(sections[2].index).toBe(2);
    expect(sections[2].title).toBe('Chapter 2');
    expect(sections[2].content).toBe('<p>Content 2</p><p>More content 2</p>');
  });

  it('parses document without h1 but with h2', () => {
    const html =
      '<h2>Section A</h2><p>Alpha</p>' +
      '<h2>Section B</h2><p>Beta</p>';

    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(2);
    expect(sections[0].index).toBe(0);
    expect(sections[0].title).toBe('Section A');
    expect(sections[1].index).toBe(1);
    expect(sections[1].title).toBe('Section B');
  });

  it('parses document with only paragraphs (no headings)', () => {
    const html = '<p>Just a paragraph.</p><p>Another one.</p>';
    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(1);
    expect(sections[0].index).toBe(0);
    expect(sections[0].title).toBe('');
    expect(sections[0].content).toBe('<p>Just a paragraph.</p><p>Another one.</p>');
  });

  it('handles complex document with images and lists', () => {
    const html =
      '<h1>Report</h1><p>Summary</p>' +
      '<h2>Findings</h2><ul><li>Item 1</li><li>Item 2</li></ul>' +
      '<h2>Images</h2><p>See below:</p><img src="test.png" alt="test"/>';

    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(3);
    expect(sections[0].title).toBe('Report');
    expect(sections[1].title).toBe('Findings');
    expect(sections[1].content).toContain('<ul>');
    expect(sections[2].title).toBe('Images');
    expect(sections[2].content).toContain('<img');
  });

  it('handles h2 with attributes', () => {
    const html = '<h1>Doc</h1><h2 class="chapter" id="ch1">Styled H2</h2><p>Body</p>';
    const sections = parseHtmlToSections(html);

    expect(sections).toHaveLength(2);
    expect(sections[1].title).toBe('Styled H2');
  });
});

// ── sectionsToHtml ───────────────────────────────────────────────────────────

describe('sectionsToHtml', () => {
  it('rebuilds HTML from sections', () => {
    const sections: Section[] = [
      { index: 0, title: 'Title', content: '<p>Intro</p>' },
      { index: 1, title: 'Ch 1', content: '<p>Body</p>' },
    ];

    const html = sectionsToHtml(sections);
    expect(html).toBe('<h1>Title</h1><p>Intro</p><h2>Ch 1</h2><p>Body</p>');
  });

  it('omits heading tag when title is empty', () => {
    const sections: Section[] = [
      { index: 0, title: '', content: '<p>Just text</p>' },
    ];
    expect(sectionsToHtml(sections)).toBe('<p>Just text</p>');
  });

  it('returns empty string for empty array', () => {
    expect(sectionsToHtml([])).toBe('');
  });
});

// ── reindexSections ──────────────────────────────────────────────────────────

describe('reindexSections', () => {
  it('fixes indices after splice', () => {
    const sections: Section[] = [
      { index: 0, title: 'A', content: '' },
      { index: 5, title: 'B', content: '' },
      { index: 10, title: 'C', content: '' },
    ];

    const result = reindexSections(sections);
    expect(result.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('preserves title and content', () => {
    const sections: Section[] = [
      { index: 99, title: 'Keep', content: '<p>Me</p>' },
    ];

    const result = reindexSections(sections);
    expect(result[0].title).toBe('Keep');
    expect(result[0].content).toBe('<p>Me</p>');
  });
});
