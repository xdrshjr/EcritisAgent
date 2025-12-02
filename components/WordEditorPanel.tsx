/**
 * WordEditorPanel Component
 * Handles Word document upload and editing with rich text editor
 */

'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { EnhancedImage } from '@/lib/imageExtension';
import { Highlight } from '@/lib/highlightExtension';
import { highlightTextInEditor, clearAllHighlights, getSeverityColor, scrollToHighlightByIssueId } from '@/lib/highlightUtils';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import ImageInsertDialog from './ImageInsertDialog';
import ImageEditorPanel from './ImageEditorPanel';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
// @ts-expect-error - mammoth types may not be fully available
import mammoth from 'mammoth/mammoth.browser';

interface WordEditorPanelProps {
  onContentChange?: (content: string) => void;
  onExportReady?: (ready: boolean) => void;
  onHighlightClick?: (issueId: string, chunkIndex: number) => void;
  onDocumentUpload?: () => void;
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
}

export interface WordEditorPanelRef {
  getContent: () => string;
  highlightIssue: (originalText: string, issueId: string, chunkIndex: number, severity: 'high' | 'medium' | 'low') => void;
  highlightAllIssues: (issues: Array<{ originalText: string; id: string; chunkIndex: number; severity: 'high' | 'medium' | 'low' }>) => void;
  clearHighlights: () => void;
  scrollToIssue: (issueId: string) => boolean;
  getEditor: () => Editor | null;
}

const WordEditorPanel = forwardRef<WordEditorPanelRef, WordEditorPanelProps>(
  ({ onContentChange, onExportReady, onHighlightClick, onDocumentUpload, selectedModelId, onModelChange }, ref) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [selectedImageNode, setSelectedImageNode] = useState<{ pos: number; attrs: { src: string; alt?: string; width?: number | string; height?: number | string; align?: 'left' | 'center' | 'right' } } | null>(null);
  const [imageElementPosition, setImageElementPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);

  // Generate default placeholder content
  const getDefaultEditorContent = () => {
    const placeholder = dict.docValidation.editorPlaceholder;
    return `
      <h1 style="text-align: center; color: #f97316;">${placeholder.title}</h1>
      <p style="text-align: center; color: #94a3b8; font-size: 1.1em;"><em>${placeholder.subtitle}</em></p>
      
      <p><br></p>
      
      <h2 style="color: #f97316;">📚 ${placeholder.section1Title}</h2>
      <p style="line-height: 1.8;">${placeholder.section1Content}</p>
      
      <p><br></p>
      
      <h2 style="color: #f97316;">🚀 ${placeholder.section2Title}</h2>
      <ul>
        <li><strong>Option 1 - ${placeholder.section2Item1}</strong></li>
        <li><strong>Option 2 - ${placeholder.section2Item2}</strong></li>
      </ul>
      
      <p><br></p>
      
      <h2 style="color: #f97316;">✨ ${placeholder.section3Title}</h2>
      <p style="line-height: 1.8;">${placeholder.section3Content}</p>
      
      <p><br></p>
      
      <h2 style="color: #f97316;">💾 ${placeholder.section4Title}</h2>
      <p style="line-height: 1.8;">${placeholder.section4Content}</p>
      
      <p><br></p>
      
      <h2 style="color: #f97316;">💡 ${placeholder.section5Title}</h2>
      <ol>
        <li style="margin-bottom: 0.5em;">${placeholder.section5Tip1}</li>
        <li style="margin-bottom: 0.5em;">${placeholder.section5Tip2}</li>
        <li style="margin-bottom: 0.5em;">${placeholder.section5Tip3}</li>
      </ol>
      
      <p><br></p>
      <p><br></p>
      
      <p style="text-align: center; padding: 1em; background-color: #fef3c7; border-left: 4px solid #f59e0b;">
        <strong style="color: #92400e;">🎉 ${placeholder.footer}</strong>
      </p>
      
      <p><br></p>
      <p><br></p>
      
      <hr style="border: 2px solid #e5e7eb; margin: 2em 0;">
      
      <p><br></p>
      <p style="color: #6b7280; font-size: 1.1em;">👇 <strong>Start typing below this line...</strong></p>
      <p><br></p>
    `;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure paragraph to preserve attributes
        paragraph: {
          HTMLAttributes: {
            class: 'editor-paragraph',
          },
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TextStyle,
      Color,
      EnhancedImage.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {},
        onHighlightClick: (issueId: string, chunkIndex: number) => {
          logger.info('Highlight clicked in editor', { issueId, chunkIndex }, 'WordEditorPanel');
          onHighlightClick?.(issueId, chunkIndex);
        },
      }),
    ],
    content: getDefaultEditorContent(),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none p-6 min-h-full',
      },
      handleClick: (view, pos, event) => {
        const { state } = view;
        const { doc } = state;
        
        // Check if clicking directly on an image node
        const clickedNode = doc.nodeAt(pos);
        if (clickedNode && clickedNode.type.name === 'image') {
          logger.info('Image clicked', { pos, src: clickedNode.attrs.src?.substring(0, 50) }, 'WordEditorPanel');
          const imageData = {
            pos,
            attrs: {
              src: clickedNode.attrs.src,
              alt: clickedNode.attrs.alt,
              width: clickedNode.attrs.width,
              height: clickedNode.attrs.height,
              align: clickedNode.attrs.align || 'center',
            },
          };
          setSelectedImageNode(imageData);
          // Find the image element in DOM and get its position
          setTimeout(() => {
            updateImageElementPosition(clickedNode.attrs.src);
          }, 0);
          // Set selection to the image node
          const tr = state.tr;
          tr.setSelection(TextSelection.near(doc.resolve(pos)));
          view.dispatch(tr);
          return true;
        }
        
        // Also check if clicking on an image element in the DOM
        const target = event.target as HTMLElement;
        if (target && (target.tagName === 'IMG' || target.closest('img'))) {
          const imgElement = target.tagName === 'IMG' ? (target as HTMLImageElement) : (target.closest('img') as HTMLImageElement);
          if (imgElement && imgElement.classList.contains('editor-image')) {
            // Find the image node in the document
            const result: { node: Node; pos: number } | null = (() => {
              let foundPos = -1;
              let foundNode: Node | null = null;
              
              doc.descendants((node, nodePos) => {
                if (node.type.name === 'image' && node.attrs.src === imgElement.src) {
                  foundNode = node;
                  foundPos = nodePos;
                  return false;
                }
              });
              
              if (foundNode && foundPos !== -1) {
                return { node: foundNode, pos: foundPos };
              }
              return null;
            })();
            
            if (result) {
              logger.info('Image clicked (via DOM)', { pos: result.pos, src: result.node.attrs.src?.substring(0, 50) }, 'WordEditorPanel');
              const imageData = {
                pos: result.pos,
                attrs: {
                  src: result.node.attrs.src,
                  alt: result.node.attrs.alt,
                  width: result.node.attrs.width,
                  height: result.node.attrs.height,
                  align: result.node.attrs.align || 'center',
                },
              };
              setSelectedImageNode(imageData);
              // Get image element position
              updateImageElementPosition(imgElement);
              // Set selection to the image node
              const tr = state.tr;
              tr.setSelection(TextSelection.near(doc.resolve(result.pos)));
              view.dispatch(tr);
              return true;
            }
          }
        }
        
        // Check if clicking on a highlight mark
        if (clickedNode && clickedNode.marks) {
          const highlightMark = clickedNode.marks.find(mark => mark.type.name === 'highlight');
          
          if (highlightMark) {
            const { issueId, chunkIndex } = highlightMark.attrs;
            logger.info('Highlight mark clicked', { issueId, chunkIndex }, 'WordEditorPanel');
            onHighlightClick?.(issueId, chunkIndex);
            return true;
          }
        }
        
        // Clear image selection if clicking elsewhere
        if (selectedImageNode) {
          setSelectedImageNode(null);
          setImageElementPosition(null);
        }
        
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      logger.debug('Editor content updated', { contentLength: html.length }, 'WordEditorPanel');
      onContentChange?.(html);
    },
  });

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getContent: () => {
      if (!editor) {
        logger.warn('Editor not initialized, cannot get content', undefined, 'WordEditorPanel');
        return '';
      }
      const html = editor.getHTML();
      logger.debug('Getting editor content', { contentLength: html.length }, 'WordEditorPanel');
      return html;
    },
    highlightIssue: (originalText: string, issueId: string, chunkIndex: number, severity: 'high' | 'medium' | 'low') => {
      if (!editor) {
        logger.warn('Editor not initialized, cannot highlight', undefined, 'WordEditorPanel');
        return;
      }
      
      logger.info('Highlighting issue in editor', { issueId, chunkIndex, severity }, 'WordEditorPanel');
      
      const color = getSeverityColor(severity);
      const success = highlightTextInEditor(editor, originalText, issueId, chunkIndex, color);
      
      if (!success) {
        logger.warn('Failed to highlight text in editor', { issueId, originalText: originalText.substring(0, 50) }, 'WordEditorPanel');
      }
    },
    highlightAllIssues: (issues: Array<{ originalText: string; id: string; chunkIndex: number; severity: 'high' | 'medium' | 'low' }>) => {
      if (!editor) {
        logger.warn('Editor not initialized, cannot highlight all issues', undefined, 'WordEditorPanel');
        return;
      }
      
      logger.info('Auto-highlighting all validation issues in editor', {
        totalIssues: issues.length,
        highCount: issues.filter(i => i.severity === 'high').length,
        mediumCount: issues.filter(i => i.severity === 'medium').length,
        lowCount: issues.filter(i => i.severity === 'low').length,
      }, 'WordEditorPanel');

      let successCount = 0;
      let failCount = 0;

      // Highlight all issues in batch
      issues.forEach((issue, index) => {
        if (!issue.originalText) {
          logger.warn('Issue missing originalText, skipping highlight', {
            issueId: issue.id,
            issueIndex: index,
          }, 'WordEditorPanel');
          failCount++;
          return;
        }

        const color = getSeverityColor(issue.severity);
        const success = highlightTextInEditor(editor, issue.originalText, issue.id, issue.chunkIndex, color);
        
        if (success) {
          successCount++;
          logger.debug('Issue highlighted successfully', {
            issueId: issue.id,
            severity: issue.severity,
            chunkIndex: issue.chunkIndex,
          }, 'WordEditorPanel');
        } else {
          failCount++;
          logger.warn('Failed to highlight issue text', {
            issueId: issue.id,
            originalTextPreview: issue.originalText.substring(0, 50),
            severity: issue.severity,
          }, 'WordEditorPanel');
        }
      });

      logger.success('Batch highlighting completed', {
        totalIssues: issues.length,
        successCount,
        failCount,
        successRate: `${((successCount / issues.length) * 100).toFixed(1)}%`,
      }, 'WordEditorPanel');
    },
    clearHighlights: () => {
      if (!editor) {
        logger.warn('Editor not initialized, cannot clear highlights', undefined, 'WordEditorPanel');
        return;
      }
      
      logger.info('Clearing all highlights from editor', undefined, 'WordEditorPanel');
      clearAllHighlights(editor);
    },
    scrollToIssue: (issueId: string) => {
      if (!editor) {
        logger.warn('Editor not initialized, cannot scroll to issue', undefined, 'WordEditorPanel');
        return false;
      }
      
      logger.info('Scrolling to issue in editor', { issueId }, 'WordEditorPanel');
      const success = scrollToHighlightByIssueId(editor, issueId);
      
      if (!success) {
        logger.warn('Failed to scroll to issue', { issueId }, 'WordEditorPanel');
      }
      
      return success;
    },
    getEditor: () => {
      return editor;
    },
  }), [editor]);

  useEffect(() => {
    logger.component('WordEditorPanel', 'mounted');
    
    // Load available models
    const loadModels = async () => {
      try {
        logger.info('Loading available models for selector', undefined, 'WordEditorPanel');
        const { loadModelConfigs } = await import('@/lib/modelConfig');
        const configs = await loadModelConfigs();
        
        // Filter enabled models
        const enabledModels = configs.models.filter(m => m.isEnabled !== false);
        const modelList = enabledModels.map(m => ({ id: m.id, name: m.name }));
        
        setAvailableModels(modelList);
        logger.success('Loaded available models', { count: modelList.length }, 'WordEditorPanel');
      } catch (error) {
        logger.error('Failed to load available models', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'WordEditorPanel');
      }
    };
    
    loadModels();
    
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  // Update image element position for positioning the editor panel
  const updateImageElementPosition = useCallback((srcOrElement: string | HTMLImageElement) => {
    if (!editorContentRef.current) {
      return;
    }

    let imgElement: HTMLImageElement | null = null;

    if (typeof srcOrElement === 'string') {
      // Find by src
      const images = editorContentRef.current.querySelectorAll('.editor-image, img');
      images.forEach((img) => {
        if (img instanceof HTMLImageElement && img.src === srcOrElement) {
          imgElement = img;
        }
      });
    } else {
      imgElement = srcOrElement;
    }

    if (imgElement && editorContentRef.current) {
      const editorRect = editorContentRef.current.getBoundingClientRect();
      const imgRect = imgElement.getBoundingClientRect();
      
      setImageElementPosition({
        top: imgRect.top - editorRect.top + editorContentRef.current.scrollTop - 64, // 64px for panel height + margin
        left: imgRect.left - editorRect.left + (imgRect.width / 2),
        width: imgRect.width,
      });
      
      logger.debug('Image element position updated', {
        top: imgRect.top - editorRect.top,
        left: imgRect.left - editorRect.left,
        width: imgRect.width,
      }, 'WordEditorPanel');
    }
  }, []);

  // Add edit icon to images on mount and update
  useEffect(() => {
    if (!editor || !editorContentRef.current) {
      return;
    }

    const addEditIconsToImages = () => {
      const images = editorContentRef.current?.querySelectorAll('.editor-image, img');
      images?.forEach((img) => {
        if (!img.hasAttribute('data-edit-icon-added')) {
          img.setAttribute('data-edit-icon-added', 'true');
          img.setAttribute('title', 'Click to edit image');
          logger.debug('Edit icon indicator added to image', undefined, 'WordEditorPanel');
        }
      });
    };

    // Add icons initially
    addEditIconsToImages();

    // Handler for editor update events
    const handleUpdate = () => {
      setTimeout(addEditIconsToImages, 100);
      // Update image position if an image is selected
      if (selectedImageNode) {
        setTimeout(() => {
          updateImageElementPosition(selectedImageNode.attrs.src);
        }, 100);
      }
    };

    // Add icons when editor updates
    editor.on('update', handleUpdate);

    return () => {
      // Remove event listener
      if (editor && typeof editor.off === 'function') {
        editor.off('update', handleUpdate);
      }
    };
  }, [editor, selectedImageNode, updateImageElementPosition]);

  useEffect(() => {
    // Notify parent when editor is ready and has content
    // Export is enabled when editor is ready (regardless of whether a file was uploaded)
    if (editor) {
      onExportReady?.(true);
    } else {
      onExportReady?.(false);
    }
  }, [editor, fileName, onExportReady]);

  const handleFileUpload = async (file: File) => {
    if (!editor) {
      logger.warn('Editor not initialized', undefined, 'WordEditorPanel');
      return;
    }

    logger.info('Starting file upload', { fileName: file.name, fileSize: file.size }, 'WordEditorPanel');
    
    // Clear validation results before loading new document
    if (onDocumentUpload) {
      logger.debug('Calling onDocumentUpload callback to clear validation results', undefined, 'WordEditorPanel');
      onDocumentUpload();
    }
    
    setIsUploading(true);
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Convert Word document to HTML using mammoth with enhanced style preservation
      logger.debug('Converting Word document to HTML with style preservation', undefined, 'WordEditorPanel');
      
      // Configure mammoth to preserve more formatting
      const options = {
        arrayBuffer,
        styleMap: [
          // Preserve paragraph alignment
          "p[style-name='Center'] => p.text-center:fresh",
          "p[style-name='Right'] => p.text-right:fresh",
          "p[style-name='Justify'] => p.text-justify:fresh",
          // Preserve headings with alignment
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
        ].join('\n'),
        convertImage: mammoth.images.imgElement((image: unknown) => {
          return image;
        }),
        includeDefaultStyleMap: true,
        preserveEmptyParagraphs: true,
      };
      
      const result = await mammoth.convertToHtml(options);
      let html = result.value;

      logger.info('Document converted successfully', { 
        htmlLength: html.length,
        messagesCount: result.messages?.length || 0,
      }, 'WordEditorPanel');

      // Log any conversion messages/warnings
      if (result.messages && result.messages.length > 0) {
        logger.debug('Conversion messages', { messages: result.messages }, 'WordEditorPanel');
        
        // Log style-related warnings separately for debugging
        const styleWarnings = result.messages.filter((msg: { type: string; message: string }) => 
          msg.type === 'warning' && 
          (msg.message.includes('style') || msg.message.includes('format'))
        );
        if (styleWarnings.length > 0) {
          logger.warn('Style conversion warnings detected', { 
            count: styleWarnings.length,
            warnings: styleWarnings,
          }, 'WordEditorPanel');
        }
      }

      // Post-process HTML to preserve inline styles that mammoth might have captured
      html = enhanceFormattingInHTML(html);
      
      logger.debug('HTML post-processing completed', { 
        enhancedHtmlLength: html.length,
      }, 'WordEditorPanel');

      // Set the HTML content in the editor
      editor.commands.setContent(html);
      
      logger.success('Document loaded into editor with formatting preserved', { 
        fileName: file.name,
      }, 'WordEditorPanel');

    } catch (error) {
      logger.error('Failed to load document', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fileName: file.name,
        stack: error instanceof Error ? error.stack : undefined,
      }, 'WordEditorPanel');
      
      editor.commands.setContent(`
        <p style="color: red;">
          <strong>Error loading document:</strong> 
          ${error instanceof Error ? error.message : 'Unknown error occurred'}
        </p>
      `);
      setFileName(null);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Enhance HTML formatting by preserving inline styles
   * This function processes the converted HTML to ensure formatting attributes are retained
   */
  const enhanceFormattingInHTML = (html: string): string => {
    logger.debug('Starting HTML formatting enhancement', undefined, 'WordEditorPanel');
    
    try {
      // Create a temporary DOM element to parse and manipulate HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;

      // Process all paragraphs to preserve indentation
      const paragraphs = tempDiv.querySelectorAll('p');
      paragraphs.forEach((p) => {
        // Check for margin-left which indicates indentation
        const computedStyle = p.getAttribute('style') || '';
        
        // Preserve existing styles
        if (computedStyle) {
          logger.debug('Found paragraph with styles', { style: computedStyle }, 'WordEditorPanel');
        }
        
        // Add data attributes for indentation if present in style
        if (computedStyle.includes('margin-left') || computedStyle.includes('text-indent')) {
          p.setAttribute('data-indent', 'true');
        }
      });

      // Process all elements to preserve text alignment in style attribute
      const allElements = tempDiv.querySelectorAll('[style]');
      allElements.forEach((element) => {
        const style = element.getAttribute('style') || '';
        
        // Preserve text-align
        if (style.includes('text-align:center') || style.includes('text-align: center')) {
          element.setAttribute('style', style);
          if (element.tagName === 'P') {
            element.classList.add('text-center');
          }
        } else if (style.includes('text-align:right') || style.includes('text-align: right')) {
          element.setAttribute('style', style);
          if (element.tagName === 'P') {
            element.classList.add('text-right');
          }
        } else if (style.includes('text-align:justify') || style.includes('text-align: justify')) {
          element.setAttribute('style', style);
          if (element.tagName === 'P') {
            element.classList.add('text-justify');
          }
        }
      });

      const enhancedHtml = tempDiv.innerHTML;
      
      logger.debug('HTML formatting enhancement completed', {
        originalLength: html.length,
        enhancedLength: enhancedHtml.length,
        paragraphsProcessed: paragraphs.length,
        styledElementsFound: allElements.length,
      }, 'WordEditorPanel');
      
      return enhancedHtml;
    } catch (error) {
      logger.error('Error enhancing HTML formatting', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'WordEditorPanel');
      // Return original HTML if enhancement fails
      return html;
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      logger.info('File dropped', { fileName: file.name }, 'WordEditorPanel');
      handleFileUpload(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    logger.info('Model selection changed', { modelId }, 'WordEditorPanel');
    onModelChange?.(modelId);
  };

  const handleInsertImage = useCallback((imageUrl: string) => {
    if (!editor) {
      logger.warn('Editor not initialized, cannot insert image', undefined, 'WordEditorPanel');
      return;
    }

    logger.info('Inserting image into editor', { imageUrl: imageUrl.substring(0, 100) }, 'WordEditorPanel');
    
    // Insert image at current cursor position with default alignment
    // Type assertion needed because TypeScript doesn't recognize custom align property from EnhancedImage
    editor.chain().focus().setImage({ src: imageUrl, align: 'center' } as any).run();
    
    logger.success('Image inserted successfully', undefined, 'WordEditorPanel');
  }, [editor]);

  // Handle image editing functions
  const handleImageZoomIn = useCallback(() => {
    if (!editor || !selectedImageNode) {
      return;
    }

    const currentWidth = selectedImageNode.attrs.width;
    const numericWidth = typeof currentWidth === 'number' 
      ? currentWidth 
      : typeof currentWidth === 'string' && !currentWidth.endsWith('%')
        ? parseInt(currentWidth, 10) || 300
        : 300;
    
    const newWidth = Math.min(numericWidth + 50, 2000);
    // Type assertion needed because TypeScript doesn't recognize custom updateImage command from EnhancedImage
    (editor.chain().focus() as any).updateImage({ width: newWidth }).run();
    
    // Update selected image node
    const updatedNode = {
      ...selectedImageNode,
      attrs: {
        ...selectedImageNode.attrs,
        width: newWidth,
      },
    };
    setSelectedImageNode(updatedNode);
    
    // Update position after image size changes
    setTimeout(() => {
      updateImageElementPosition(selectedImageNode.attrs.src);
    }, 50);
    
    logger.debug('Image zoomed in', { width: newWidth, pos: selectedImageNode.pos }, 'WordEditorPanel');
  }, [editor, selectedImageNode, updateImageElementPosition]);

  const handleImageZoomOut = useCallback(() => {
    if (!editor || !selectedImageNode) {
      return;
    }

    const currentWidth = selectedImageNode.attrs.width;
    const numericWidth = typeof currentWidth === 'number' 
      ? currentWidth 
      : typeof currentWidth === 'string' && !currentWidth.endsWith('%')
        ? parseInt(currentWidth, 10) || 300
        : 300;
    
    const newWidth = Math.max(numericWidth - 50, 50);
    // Type assertion needed because TypeScript doesn't recognize custom updateImage command from EnhancedImage
    (editor.chain().focus() as any).updateImage({ width: newWidth }).run();
    
    // Update selected image node
    const updatedNode = {
      ...selectedImageNode,
      attrs: {
        ...selectedImageNode.attrs,
        width: newWidth,
      },
    };
    setSelectedImageNode(updatedNode);
    
    // Update position after image size changes
    setTimeout(() => {
      updateImageElementPosition(selectedImageNode.attrs.src);
    }, 50);
    
    logger.debug('Image zoomed out', { width: newWidth, pos: selectedImageNode.pos }, 'WordEditorPanel');
  }, [editor, selectedImageNode, updateImageElementPosition]);

  const handleImageAlignChange = useCallback((align: 'left' | 'center' | 'right') => {
    if (!editor || !selectedImageNode) {
      return;
    }

    // Type assertion needed because TypeScript doesn't recognize custom updateImage command from EnhancedImage
    (editor.chain().focus() as any).updateImage({ align }).run();
    
    // Update selected image node
    const updatedNode = {
      ...selectedImageNode,
      attrs: {
        ...selectedImageNode.attrs,
        align,
      },
    };
    setSelectedImageNode(updatedNode);
    
    // Update position after alignment changes
    setTimeout(() => {
      updateImageElementPosition(selectedImageNode.attrs.src);
    }, 50);
    
    logger.info('Image alignment changed', { align, pos: selectedImageNode.pos }, 'WordEditorPanel');
  }, [editor, selectedImageNode, updateImageElementPosition]);

  const handleImageDelete = useCallback(() => {
    if (!editor || !selectedImageNode) {
      return;
    }

    logger.info('Deleting image', { pos: selectedImageNode.pos, src: selectedImageNode.attrs.src?.substring(0, 50) }, 'WordEditorPanel');
    // Type assertion needed because TypeScript doesn't recognize custom deleteImage command from EnhancedImage
    (editor.chain().focus() as any).deleteImage().run();
    setSelectedImageNode(null);
    logger.success('Image deleted successfully', undefined, 'WordEditorPanel');
  }, [editor, selectedImageNode]);

  const handleOpenImageDialog = useCallback(() => {
    logger.info('Opening image insert dialog', undefined, 'WordEditorPanel');
    setIsImageDialogOpen(true);
  }, []);

  const handleCloseImageDialog = useCallback(() => {
    logger.info('Closing image insert dialog', undefined, 'WordEditorPanel');
    setIsImageDialogOpen(false);
  }, []);

  if (!editor) {
    return <div className="flex items-center justify-center h-full">Loading editor...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="border-b-4 border-border bg-card shadow-sm">
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          {/* Upload Button */}
          <button
            onClick={handleUploadClick}
            disabled={isUploading}
            className="px-3 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            aria-label={dict.docValidation.uploadDocument}
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">
              {isUploading ? dict.docValidation.uploading : dict.docValidation.uploadDocument}
            </span>
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          {/* Format Buttons */}
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.bold}
          >
            <Bold className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.italic}
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('underline') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.underline}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('strike') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.strike}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('heading', { level: 1 }) ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.heading1}
          >
            <Heading1 className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('heading', { level: 2 }) ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.heading2}
          >
            <Heading2 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.bulletList}
          >
            <List className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive('orderedList') ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.orderedList}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive({ textAlign: 'left' }) ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.alignLeft}
          >
            <AlignLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive({ textAlign: 'center' }) ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.alignCenter}
          >
            <AlignCenter className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-2 border-2 border-border transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm ${
              editor.isActive({ textAlign: 'right' }) ? 'bg-primary text-primary-foreground' : 'bg-card'
            }`}
            aria-label={dict.docValidation.editorToolbar.alignRight}
          >
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <button
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-2 border-2 border-border bg-card transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={dict.docValidation.editorToolbar.undo}
          >
            <Undo className="w-4 h-4" />
          </button>

          <button
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-2 border-2 border-border bg-card transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={dict.docValidation.editorToolbar.redo}
          >
            <Redo className="w-4 h-4" />
          </button>

          {/* Insert Image Button */}
          <div className="w-px h-6 bg-border mx-2" />
          <button
            onClick={handleOpenImageDialog}
            className="px-3 py-2 border-2 border-border bg-card transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm flex items-center gap-2"
            aria-label={dict.docValidation.editorToolbar.insertImage}
            title={dict.docValidation.editorToolbar.insertImage}
          >
            <ImageIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{dict.docValidation.editorToolbar.insertImage}</span>
          </button>

          {/* Model Selector */}
          {availableModels.length > 0 && (
            <>
              <div className="w-px h-6 bg-border mx-2" />
              <select
                value={selectedModelId || ''}
                onChange={handleModelChange}
                className="px-3 py-2 border-2 border-border bg-card text-foreground transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm focus:outline-none focus:ring-2 focus:ring-primary text-sm font-medium"
                aria-label="Select AI Model"
              >
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* File Name Display */}
        {fileName && (
          <div className="px-4 py-2 bg-background border-t-2 border-border">
            <p className="text-sm text-muted-foreground">
              Editing: <span className="font-medium text-foreground">{fileName}</span>
            </p>
          </div>
        )}
      </div>

      {/* Editor Content */}
      <div 
        ref={editorContentRef}
        className={`flex-1 overflow-auto relative ${dragActive ? 'ring-4 ring-primary' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={(e) => {
          // Clear image selection if clicking on editor content (not on image)
          if (e.target instanceof HTMLElement && !e.target.closest('.editor-image') && !e.target.closest('.image-editor-panel')) {
            setSelectedImageNode(null);
          }
        }}
      >
        {/* Drag and Drop Hint Overlay - Only shows when dragging */}
        {dragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm z-10 pointer-events-none">
            <div className="text-center p-8 bg-card border-4 border-dashed border-primary">
              <Upload className="w-16 h-16 mx-auto mb-4 text-primary" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {dict.docValidation.uploadHint}
              </h3>
              <p className="text-sm text-muted-foreground">
                {dict.docValidation.uploadHintDetail}
              </p>
            </div>
          </div>
        )}

        <EditorContent editor={editor} className="h-full" />

        {/* Image Editor Panel - Shows when image is selected */}
        {selectedImageNode && imageElementPosition && (
          <ImageEditorPanel
            imageNode={selectedImageNode}
            onZoomIn={handleImageZoomIn}
            onZoomOut={handleImageZoomOut}
            onAlignChange={handleImageAlignChange}
            onDelete={handleImageDelete}
            onClose={() => {
              setSelectedImageNode(null);
              setImageElementPosition(null);
            }}
            position={imageElementPosition}
          />
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Image Insert Dialog */}
      <ImageInsertDialog
        isOpen={isImageDialogOpen}
        onClose={handleCloseImageDialog}
        onInsertImage={handleInsertImage}
      />
    </div>
  );
});

WordEditorPanel.displayName = 'WordEditorPanel';

export default WordEditorPanel;
