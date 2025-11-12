/**
 * WordEditorPanel Component
 * Handles Word document upload and editing with rich text editor
 */

'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
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
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
// @ts-expect-error - mammoth types may not be fully available
import mammoth from 'mammoth/mammoth.browser';

interface WordEditorPanelProps {
  onContentChange?: (content: string) => void;
  onExportReady?: (ready: boolean) => void;
}

export interface WordEditorPanelRef {
  getContent: () => string;
}

const WordEditorPanel = forwardRef<WordEditorPanelRef, WordEditorPanelProps>(
  ({ onContentChange, onExportReady }, ref) => {
  const dict = getDictionary('en');
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

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
    ],
    content: getDefaultEditorContent(),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none p-6 min-h-full',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      logger.debug('Editor content updated', { contentLength: html.length }, 'WordEditorPanel');
      onContentChange?.(html);
    },
  });

  // Expose getContent method to parent via ref
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
  }), [editor]);

  useEffect(() => {
    logger.component('WordEditorPanel', 'mounted');
    return () => {
      editor?.destroy();
    };
  }, [editor]);

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
        className={`flex-1 overflow-auto relative ${dragActive ? 'ring-4 ring-primary' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </div>
  );
});

WordEditorPanel.displayName = 'WordEditorPanel';

export default WordEditorPanel;
