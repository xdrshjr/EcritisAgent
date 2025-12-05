'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { type DocumentParagraph } from '@/lib/documentUtils';
import WordEditorPanel, { type WordEditorPanelRef } from './WordEditorPanel';
import ChatDialog from './ChatDialog';

interface AIAutoWriterContainerProps {
  leftPanelWidth: number;
  onLeftPanelWidthChange: (width: number) => void;
  onDocumentFunctionsReady?: (
    getContent: () => string,
    updateContent: (content: string | DocumentParagraph[]) => void
  ) => void;
  onContentChange?: (content: string) => void;
}

const MIN_LEFT_WIDTH = 35;
const MAX_LEFT_WIDTH = 70;

const AIAutoWriterContainer = ({
  leftPanelWidth,
  onLeftPanelWidthChange,
  onDocumentFunctionsReady,
  onContentChange,
}: AIAutoWriterContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wordEditorRef = useRef<WordEditorPanelRef>(null);
  const [isResizing, setIsResizing] = useState(false);

  const getEditorContent = useCallback(() => {
    if (!wordEditorRef.current) {
      logger.warn('Word editor ref unavailable while getting content', undefined, 'AIAutoWriterContainer');
      return '';
    }

    const editor = wordEditorRef.current.getEditor();
    if (!editor) {
      logger.warn('Word editor instance missing while getting content', undefined, 'AIAutoWriterContainer');
      return '';
    }

    const html = editor.getHTML();
    logger.debug('Auto-writer editor content fetched', { length: html.length }, 'AIAutoWriterContainer');
    return html;
  }, []);

  const updateEditorContent = useCallback((content: string | DocumentParagraph[]) => {
    if (!wordEditorRef.current) {
      logger.error('Word editor ref unavailable while updating content', undefined, 'AIAutoWriterContainer');
      return;
    }

    const editor = wordEditorRef.current.getEditor();
    if (!editor) {
      logger.error('Word editor instance missing while updating content', undefined, 'AIAutoWriterContainer');
      return;
    }

    if (Array.isArray(content)) {
      // Update paragraphs individually
      logger.info('Auto-writer updating document paragraphs', { paragraphCount: content.length }, 'AIAutoWriterContainer');
      content.forEach(para => {
        wordEditorRef.current?.updateParagraph(para.id, para.content);
      });
      logger.success('Auto-writer editor paragraphs updated from AI chat', { paragraphCount: content.length }, 'AIAutoWriterContainer');
    } else {
      // Legacy: Set HTML content directly
      editor.commands.setContent(content);
      logger.info('Auto-writer editor content updated from AI chat', { length: content.length }, 'AIAutoWriterContainer');
    }
  }, []);

  const exposeDocumentFunctions = useCallback(() => {
    if (!wordEditorRef.current || !onDocumentFunctionsReady) {
      return;
    }

    onDocumentFunctionsReady(getEditorContent, updateEditorContent);
    logger.debug('Auto-writer document functions exposed to parent', undefined, 'AIAutoWriterContainer');
  }, [getEditorContent, updateEditorContent, onDocumentFunctionsReady]);

  useEffect(() => {
    exposeDocumentFunctions();
  }, [exposeDocumentFunctions]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
    logger.info('Auto-writer panels resizing started', { leftPanelWidth }, 'AIAutoWriterContainer');
  };

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing || !containerRef.current) {
      return;
    }

    const bounds = containerRef.current.getBoundingClientRect();
    const newWidth = ((event.clientX - bounds.left) / bounds.width) * 100;

    if (newWidth >= MIN_LEFT_WIDTH && newWidth <= MAX_LEFT_WIDTH) {
      onLeftPanelWidthChange(Number(newWidth.toFixed(2)));
    }
  }, [isResizing, onLeftPanelWidthChange]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      logger.info('Auto-writer panels resizing stopped', { leftPanelWidth }, 'AIAutoWriterContainer');
    }
  }, [isResizing, leftPanelWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, isResizing]);

  const handleContentChangeInternal = (content: string) => {
    logger.debug('Auto-writer editor content changed', { length: content.length }, 'AIAutoWriterContainer');
    onContentChange?.(content);
  };

  return (
    <div
      ref={containerRef}
      className="h-full flex relative bg-background"
      data-testid="auto-writer-container"
    >
      <section
        className="h-full overflow-hidden transition-[width]"
        style={{ width: `${leftPanelWidth}%` }}
        aria-label="Document editor"
      >
        <WordEditorPanel
          ref={wordEditorRef}
          onContentChange={handleContentChangeInternal}
        />
      </section>

      <div
        className={`w-1 bg-border cursor-col-resize hover:bg-primary transition-colors relative group ${isResizing ? 'bg-primary' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        data-testid="auto-writer-resizer"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <div className="w-1 h-12 bg-border group-hover:bg-primary rounded-full transition-colors" />
        </div>
      </div>

      <section
        className="h-full overflow-hidden border-l border-border bg-background"
        style={{ width: `${100 - leftPanelWidth}%` }}
        aria-label="AI assistant"
      >
        <ChatDialog
          isOpen
          onClose={() => logger.debug('Embedded chat close invoked', undefined, 'AIAutoWriterContainer')}
          variant="embedded"
          title="AI Document Auto-Writer"
          getDocumentContent={getEditorContent}
          updateDocumentContent={updateEditorContent}
          className="bg-background"
          agentVariant="auto-writer"
        />
      </section>
    </div>
  );
};

export default AIAutoWriterContainer;

