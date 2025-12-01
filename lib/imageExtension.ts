/**
 * TipTap Custom Image Extension
 * Enhanced image extension with resize, alignment, and delete functionality
 */

import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { logger } from './logger';

export interface ImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /**
       * Set an image with optional attributes
       */
      setImage: (options: { 
        src: string; 
        alt?: string; 
        title?: string;
        width?: number | string;
        height?: number | string;
        align?: 'left' | 'center' | 'right';
      }) => ReturnType;
      /**
       * Update image attributes
       */
      updateImage: (options: {
        width?: number | string;
        height?: number | string;
        align?: 'left' | 'center' | 'right';
      }) => ReturnType;
      /**
       * Delete current image
       */
      deleteImage: () => ReturnType;
    };
  }
}

/**
 * Enhanced Image Extension
 * Supports width, height, and alignment attributes
 */
export const EnhancedImage = Image.extend<ImageOptions>({
  name: 'image',

  addOptions() {
    return {
      ...this.parent?.(),
      inline: true,
      allowBase64: true,
      HTMLAttributes: {
        class: 'editor-image',
      },
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: element => element.getAttribute('src'),
        renderHTML: attributes => {
          if (!attributes.src) {
            return {};
          }
          return {
            src: attributes.src,
          };
        },
      },
      alt: {
        default: null,
        parseHTML: element => element.getAttribute('alt'),
        renderHTML: attributes => {
          if (!attributes.alt) {
            return {};
          }
          return {
            alt: attributes.alt,
          };
        },
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('title'),
        renderHTML: attributes => {
          if (!attributes.title) {
            return {};
          }
          return {
            title: attributes.title,
          };
        },
      },
      width: {
        default: null,
        parseHTML: element => {
          const width = element.getAttribute('width');
          if (width) {
            // Try to parse as number, otherwise return as string (e.g., "100%")
            const numWidth = parseInt(width, 10);
            return isNaN(numWidth) ? width : numWidth;
          }
          return null;
        },
        renderHTML: attributes => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: String(attributes.width),
          };
        },
      },
      height: {
        default: null,
        parseHTML: element => {
          const height = element.getAttribute('height');
          if (height) {
            const numHeight = parseInt(height, 10);
            return isNaN(numHeight) ? height : numHeight;
          }
          return null;
        },
        renderHTML: attributes => {
          if (!attributes.height) {
            return {};
          }
          return {
            height: String(attributes.height),
          };
        },
      },
      align: {
        default: 'center',
        parseHTML: element => {
          const align = element.getAttribute('data-align') || 
                       element.getAttribute('align') ||
                       element.style.textAlign ||
                       'center';
          return align === 'left' || align === 'center' || align === 'right' ? align : 'center';
        },
        renderHTML: attributes => {
          const align = attributes.align || 'center';
          return {
            'data-align': align,
            style: `text-align: ${align};`,
          };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImage:
        options =>
        ({ commands }) => {
          logger.debug('Setting image', { 
            src: options.src?.substring(0, 50),
            width: options.width,
            height: options.height,
            align: options.align,
          }, 'ImageExtension');
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: options.src,
              alt: options.alt || '',
              title: options.title || '',
              width: options.width || null,
              height: options.height || null,
              align: options.align || 'center',
            },
          });
        },
      updateImage:
        options =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { $from } = selection;
          
          // Find the image node at the current position
          let imageNode = null;
          let imagePos = -1;
          
          // Check if current node is an image
          const nodeAtPos = state.doc.nodeAt($from.pos);
          if (nodeAtPos && nodeAtPos.type.name === this.name) {
            imageNode = nodeAtPos;
            imagePos = $from.pos;
          } else {
            // Search around the current position
            state.doc.nodesBetween(Math.max(0, $from.pos - 1), Math.min(state.doc.content.size, $from.pos + 1), (node, pos) => {
              if (node.type.name === this.name) {
                imageNode = node;
                imagePos = pos;
                return false;
              }
            });
          }
          
          if (!imageNode || imagePos === -1) {
            logger.warn('No image found at current position', { pos: $from.pos }, 'ImageExtension');
            return false;
          }
          
          logger.debug('Updating image attributes', { 
            pos: imagePos,
            options,
          }, 'ImageExtension');
          
          const newAttrs = {
            ...imageNode.attrs,
            ...(options.width !== undefined && { width: options.width }),
            ...(options.height !== undefined && { height: options.height }),
            ...(options.align !== undefined && { align: options.align }),
          };
          
          if (dispatch) {
            tr.setNodeMarkup(imagePos, undefined, newAttrs);
            dispatch(tr);
          }
          
          logger.success('Image attributes updated', { 
            width: newAttrs.width,
            height: newAttrs.height,
            align: newAttrs.align,
          }, 'ImageExtension');
          
          return true;
        },
      deleteImage:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { $from } = selection;
          
          // Find the image node at the current position
          let imageNode = null;
          let imagePos = -1;
          
          // Check if current node is an image
          const nodeAtPos = state.doc.nodeAt($from.pos);
          if (nodeAtPos && nodeAtPos.type.name === this.name) {
            imageNode = nodeAtPos;
            imagePos = $from.pos;
          } else {
            // Search around the current position
            state.doc.nodesBetween(Math.max(0, $from.pos - 1), Math.min(state.doc.content.size, $from.pos + 1), (node, pos) => {
              if (node.type.name === this.name) {
                imageNode = node;
                imagePos = pos;
                return false;
              }
            });
          }
          
          if (!imageNode || imagePos === -1) {
            logger.warn('No image found at current position to delete', { pos: $from.pos }, 'ImageExtension');
            return false;
          }
          
          logger.info('Deleting image', { 
            pos: imagePos,
            src: imageNode.attrs.src?.substring(0, 50),
          }, 'ImageExtension');
          
          if (dispatch) {
            tr.delete(imagePos, imagePos + imageNode.nodeSize);
            dispatch(tr);
          }
          
          logger.success('Image deleted successfully', undefined, 'ImageExtension');
          return true;
        },
    };
  },
});

