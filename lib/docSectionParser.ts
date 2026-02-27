/**
 * Document Section Parser
 *
 * Parses HTML documents into a list of sections based on heading structure.
 * Section 0: <h1> title + intro content (everything before the first <h2>)
 * Section 1+: Each <h2> heading + its following content until the next <h2>
 */

/** A single section of the document. */
export interface Section {
  /** Zero-based index within the document. */
  index: number;
  /** Section title text (h1 for section 0, h2 for others). */
  title: string;
  /** HTML content of the section body (excluding the heading tag itself). */
  content: string;
}

// ── Heading extraction helpers ───────────────────────────────────────────────

/** Extract the text content inside the first <h1> tag, or empty string. */
export const extractH1Title = (html: string): string => {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return '';
  return stripTags(match[1]).trim();
};

/** Extract the text content inside the first <h2> tag, or empty string. */
export const extractH2Title = (html: string): string => {
  const match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (!match) return '';
  return stripTags(match[1]).trim();
};

/** Remove the first <h1>…</h1> tag from the HTML. */
export const removeH1Tag = (html: string): string => {
  return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim();
};

/** Remove the first <h2>…</h2> tag from the HTML. */
export const removeH2Tag = (html: string): string => {
  return html.replace(/<h2[^>]*>[\s\S]*?<\/h2>/i, '').trim();
};

/** Strip all HTML tags, returning plain text. */
const stripTags = (html: string): string => {
  return html.replace(/<[^>]*>/g, '');
};

// ── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse an HTML string into a list of sections.
 *
 * Splits on `<h2>` boundaries. The part before the first `<h2>` becomes
 * section 0 (with its title taken from `<h1>` if present). Each subsequent
 * `<h2>` starts a new section.
 *
 * @param html - Full HTML string from the TipTap editor
 * @returns Array of Section objects (may be empty for blank documents)
 */
export const parseHtmlToSections = (html: string): Section[] => {
  if (!html || !html.trim()) return [];

  // Split on <h2> boundaries, keeping the <h2> tag with the segment that follows it.
  // (?=<h2) is a lookahead so the <h2> tag stays at the start of each subsequent part.
  const parts = html.split(/(?=<h2[\s>])/i);

  const sections: Section[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.trim()) continue;

    if (i === 0 && !part.match(/^<h2[\s>]/i)) {
      // First part that does NOT start with <h2> → section 0 (title area)
      const title = extractH1Title(part);
      const content = removeH1Tag(part);
      sections.push({ index: 0, title, content });
    } else {
      // h2-led section
      const title = extractH2Title(part);
      const content = removeH2Tag(part);
      sections.push({ index: sections.length, title, content });
    }
  }

  return sections;
};

// ── Section manipulation helpers ─────────────────────────────────────────────

/** Rebuild full HTML from a sections array. */
export const sectionsToHtml = (sections: Section[]): string => {
  return sections
    .map((s, i) => {
      // First element is always the title area (h1), rest are h2 sections.
      // Use array position rather than s.index to stay correct even if
      // sections haven't been reindexed yet.
      if (i === 0) {
        const titleHtml = s.title ? `<h1>${s.title}</h1>` : '';
        return `${titleHtml}${s.content}`;
      }
      const titleHtml = s.title ? `<h2>${s.title}</h2>` : '';
      return `${titleHtml}${s.content}`;
    })
    .join('');
};

/** Re-index sections so their `index` field matches their array position. */
export const reindexSections = (sections: Section[]): Section[] => {
  return sections.map((s, i) => ({ ...s, index: i }));
};
