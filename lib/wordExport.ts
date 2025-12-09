/**
 * Word Export Utilities
 * Converts HTML content from the editor to Word document format
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, ExternalHyperlink, InternalHyperlink, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { logger } from './logger';

export interface ExportOptions {
  fileName?: string;
}

/**
 * Convert image source (base64 or URL) to Uint8Array
 */
const imageToUint8Array = async (src: string): Promise<Uint8Array | null> => {
  try {
    logger.debug('Converting image to Uint8Array', { srcPreview: src.substring(0, 50) }, 'WordExport');

    // Handle base64 images
    if (src.startsWith('data:image')) {
      const base64Data = src.split(',')[1];
      if (base64Data) {
        // Convert base64 to binary string, then to Uint8Array
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        logger.debug('Base64 image converted to Uint8Array', { bufferSize: bytes.length }, 'WordExport');
        return bytes;
      }
    }

    // Handle blob URLs
    if (src.startsWith('blob:')) {
      logger.debug('Fetching blob URL image', undefined, 'WordExport');
      const response = await fetch(src);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      logger.debug('Blob image converted to Uint8Array', { bufferSize: bytes.length }, 'WordExport');
      return bytes;
    }

    // Handle HTTP/HTTPS URLs
    if (src.startsWith('http://') || src.startsWith('https://')) {
      logger.debug('Fetching HTTP URL image', undefined, 'WordExport');
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      logger.debug('HTTP image converted to Uint8Array', { bufferSize: bytes.length }, 'WordExport');
      return bytes;
    }

    logger.warn('Unsupported image source format', { srcPreview: src.substring(0, 50) }, 'WordExport');
    return null;
  } catch (error) {
    logger.error('Failed to convert image to Uint8Array', {
      error: error instanceof Error ? error.message : 'Unknown error',
      srcPreview: src.substring(0, 50),
    }, 'WordExport');
    return null;
  }
};

/**
 * Parse HTML and convert to docx elements
 */
const parseHTMLToDocxElements = async (html: string): Promise<(Paragraph | Table)[]> => {
  logger.info('Parsing HTML to docx elements', { htmlLength: html.length }, 'WordExport');

  try {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const elements: (Paragraph | Table)[] = [];

    // Process all child nodes
    for (const child of Array.from(tempDiv.childNodes)) {
      const parsed = await processNode(child);
      if (parsed) {
        if (Array.isArray(parsed)) {
          elements.push(...parsed);
        } else {
          elements.push(parsed);
        }
      }
    }

    logger.success('HTML parsed to docx elements', {
      elementCount: elements.length,
      htmlLength: html.length,
    }, 'WordExport');

    return elements;
  } catch (error) {
    logger.error('Failed to parse HTML to docx elements', {
      error: error instanceof Error ? error.message : 'Unknown error',
      htmlLength: html.length,
    }, 'WordExport');
    return [];
  }
};

/**
 * Process a DOM node and convert to docx elements
 */
const processNode = async (node: Node): Promise<(Paragraph | Table)[] | Paragraph | null> => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() || '';
    if (text.length === 0) {
      return null;
    }
    return new Paragraph({
      children: [new TextRun(text)],
    });
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();

  logger.debug('Processing HTML element', { tagName, textPreview: element.textContent?.substring(0, 50) }, 'WordExport');

  switch (tagName) {
    case 'h1':
      return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: await processInlineContent(element),
      });

    case 'h2':
      return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: await processInlineContent(element),
      });

    case 'h3':
      return new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: await processInlineContent(element),
      });

    case 'h4':
      return new Paragraph({
        heading: HeadingLevel.HEADING_4,
        children: await processInlineContent(element),
      });

    case 'h5':
      return new Paragraph({
        heading: HeadingLevel.HEADING_5,
        children: await processInlineContent(element),
      });

    case 'h6':
      return new Paragraph({
        heading: HeadingLevel.HEADING_6,
        children: await processInlineContent(element),
      });

    case 'p':
      return new Paragraph({
        alignment: getAlignment(element),
        children: await processInlineContent(element),
      });

    case 'ul':
    case 'ol': {
      const listItems: Paragraph[] = [];
      const listElements = element.querySelectorAll('li');
      for (const li of Array.from(listElements)) {
        const children = await processInlineContent(li);
        listItems.push(new Paragraph({
          children: [
            new TextRun({
              text: tagName === 'ol' ? '• ' : '• ',
              bold: true,
            }),
            ...children,
          ],
        }));
      }
      return listItems;
    }

    case 'li': {
      const children = await processInlineContent(element);
      return new Paragraph({
        children: [
          new TextRun({
            text: '• ',
            bold: true,
          }),
          ...children,
        ],
      });
    }

    case 'br':
      return new Paragraph({
        children: [new TextRun('')],
      });

    case 'div':
      // Process div as paragraph if it has content
      const children = await processInlineContent(element);
      if (children.length > 0) {
        return new Paragraph({
          alignment: getAlignment(element),
          children,
        });
      }
      return null;

    case 'img': {
      const img = element as HTMLImageElement;
      const src = img.src || img.getAttribute('src') || '';
      const alt = img.alt || img.getAttribute('alt') || '';
      const width = img.width || img.getAttribute('width') || 300;
      const height = img.height || img.getAttribute('height') || 200;
      const align = img.getAttribute('data-align') || img.getAttribute('align') || 'center';

      logger.debug('Processing image element', {
        srcPreview: src.substring(0, 50),
        alt,
        width,
        height,
        align,
      }, 'WordExport');

      const imageData = await imageToUint8Array(src);
      if (!imageData) {
        logger.warn('Failed to load image, creating placeholder text', { alt }, 'WordExport');
        return new Paragraph({
          alignment: getAlignmentFromString(align),
          children: [
            new TextRun({
              text: alt || '[Image]',
              italics: true,
            }),
          ],
        });
      }

      // Determine image dimensions
      const numericWidth = typeof width === 'number' ? width : parseInt(String(width), 10) || 300;
      const numericHeight = typeof height === 'number' ? height : parseInt(String(height), 10) || 200;

      // Calculate aspect ratio to maintain
      const aspectRatio = numericHeight / numericWidth;
      const maxWidth = 500; // Maximum width in points (1 point = 1/72 inch)
      const maxHeight = 400; // Maximum height in points
      
      let finalWidth = Math.min(numericWidth, maxWidth);
      let finalHeight = finalWidth * aspectRatio;
      
      if (finalHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = finalHeight / aspectRatio;
      }

      return new Paragraph({
        alignment: getAlignmentFromString(align),
        children: [
          new ImageRun({
            data: imageData,
            transformation: {
              width: finalWidth,
              height: finalHeight,
            },
          } as any),
        ],
      });
    }

    default:
      // For other elements, process their children
      const defaultChildren = await processInlineContent(element);
      if (defaultChildren.length > 0) {
        return new Paragraph({
          children: defaultChildren,
        });
      }
      return null;
  }
};

/**
 * Process inline content (text, formatting, images)
 */
const processInlineContent = async (element: HTMLElement): Promise<(TextRun | ImageRun)[]> => {
  const children: (TextRun | ImageRun)[] = [];

  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim().length > 0) {
        children.push(new TextRun(text));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childElement = node as HTMLElement;
      const tagName = childElement.tagName.toLowerCase();

      if (tagName === 'img') {
        const img = childElement as HTMLImageElement;
        const src = img.src || img.getAttribute('src') || '';
        const alt = img.alt || img.getAttribute('alt') || '';
        const width = img.width || img.getAttribute('width') || 300;
        const height = img.height || img.getAttribute('height') || 200;

        logger.debug('Processing inline image', {
          srcPreview: src.substring(0, 50),
          alt,
        }, 'WordExport');

        const imageData = await imageToUint8Array(src);
        if (imageData) {
          const numericWidth = typeof width === 'number' ? width : parseInt(String(width), 10) || 300;
          const numericHeight = typeof height === 'number' ? height : parseInt(String(height), 10) || 200;
          const aspectRatio = numericHeight / numericWidth;
          const maxWidth = 200;
          const maxHeight = 150;
          
          let finalWidth = Math.min(numericWidth, maxWidth);
          let finalHeight = finalWidth * aspectRatio;
          
          if (finalHeight > maxHeight) {
            finalHeight = maxHeight;
            finalWidth = finalHeight / aspectRatio;
          }

          children.push(
            new ImageRun({
              data: imageData,
              transformation: {
                width: finalWidth,
                height: finalHeight,
              },
            } as any)
          );
        } else {
          children.push(
            new TextRun({
              text: alt || '[Image]',
              italics: true,
            })
          );
        }
      } else {
        // Process formatting tags
        const text = childElement.textContent || '';
        if (text.trim().length > 0) {
          const isUnderline = childElement.tagName === 'U';
          const textRun = new TextRun({
            text,
            bold: childElement.tagName === 'STRONG' || childElement.tagName === 'B',
            italics: childElement.tagName === 'EM' || childElement.tagName === 'I',
            ...(isUnderline && { underline: { type: 'single' } }),
            strike: childElement.tagName === 'S' || childElement.tagName === 'STRIKE',
          });
          children.push(textRun);
        }

        // Recursively process nested elements
        const nested = await processInlineContent(childElement);
        children.push(...nested);
      }
    }
  }

  return children;
};

/**
 * Get alignment from element style or class
 */
const getAlignment = (element: HTMLElement): typeof AlignmentType[keyof typeof AlignmentType] => {
  const style = element.getAttribute('style') || '';
  const align = element.getAttribute('align') || element.getAttribute('data-align') || '';
  const classList = element.classList;

  if (align === 'left' || style.includes('text-align:left') || classList.contains('text-left')) {
    return AlignmentType.LEFT;
  }
  if (align === 'right' || style.includes('text-align:right') || classList.contains('text-right')) {
    return AlignmentType.RIGHT;
  }
  if (align === 'center' || style.includes('text-align:center') || classList.contains('text-center')) {
    return AlignmentType.CENTER;
  }
  if (style.includes('text-align:justify') || classList.contains('text-justify')) {
    return AlignmentType.JUSTIFIED;
  }

  return AlignmentType.LEFT;
};

/**
 * Get alignment from string
 */
const getAlignmentFromString = (align: string): typeof AlignmentType[keyof typeof AlignmentType] => {
  switch (align.toLowerCase()) {
    case 'left':
      return AlignmentType.LEFT;
    case 'right':
      return AlignmentType.RIGHT;
    case 'center':
      return AlignmentType.CENTER;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
};

/**
 * Export HTML content to Word document
 */
export const exportToWord = async (html: string, options: ExportOptions = {}): Promise<void> => {
  logger.info('Starting Word export', {
    htmlLength: html.length,
    fileName: options.fileName,
  }, 'WordExport');

  try {
    // Parse HTML to docx elements
    const elements = await parseHTMLToDocxElements(html);

    if (elements.length === 0) {
      logger.warn('No content to export', undefined, 'WordExport');
      throw new Error('No content to export');
    }

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: elements,
        },
      ],
    });

    logger.debug('Document created, generating blob', {
      elementCount: elements.length,
    }, 'WordExport');

    // Generate document blob
    const blob = await Packer.toBlob(doc);

    logger.debug('Blob generated, creating download', {
      blobSize: blob.size,
    }, 'WordExport');

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = options.fileName || `document-${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logger.success('Word document exported successfully', {
      fileName: a.download,
      blobSize: blob.size,
    }, 'WordExport');
  } catch (error) {
    logger.error('Failed to export Word document', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      htmlLength: html.length,
    }, 'WordExport');
    throw error;
  }
};

