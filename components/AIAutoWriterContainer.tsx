'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import WordEditorPanel, { type WordEditorPanelRef } from './WordEditorPanel';
import DocAgentPanel from './DocAgentPanel';
import {
  replaceSectionInEditor,
  appendSectionToEditor,
  insertSectionInEditor,
  deleteSectionFromEditor,
} from '@/lib/docEditorOperations';

interface AIAutoWriterContainerProps {
  leftPanelWidth: number;
  onLeftPanelWidthChange: (width: number) => void;
  onContentChange?: (content: string) => void;
  selectedModelId?: string | null;
}

const MIN_LEFT_WIDTH = 35;
const MAX_LEFT_WIDTH = 70;

const AIAutoWriterContainer = ({
  leftPanelWidth,
  onLeftPanelWidthChange,
  onContentChange,
  selectedModelId,
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

  const handleSectionUpdate = useCallback((
    operation: string,
    sectionIndex: number,
    title?: string,
    content?: string,
  ) => {
    const editor = wordEditorRef.current?.getEditor();
    if (!editor) {
      logger.error('Editor not available for section update', { operation, sectionIndex }, 'AIAutoWriterContainer');
      return;
    }

    switch (operation) {
      case 'replace':
        replaceSectionInEditor(editor, sectionIndex, title, content);
        break;
      case 'append':
        appendSectionToEditor(editor, title, content);
        break;
      case 'insert':
        insertSectionInEditor(editor, sectionIndex, title, content);
        break;
      case 'delete':
        deleteSectionFromEditor(editor, sectionIndex);
        break;
      default:
        logger.warn('Unknown section operation', { operation }, 'AIAutoWriterContainer');
    }
  }, []);

  const handleImageInsert = useCallback((
    sectionIndex: number,
    imageUrl: string,
    imageDescription: string,
  ) => {
    if (!wordEditorRef.current) {
      logger.warn('Word editor ref not available for image insert', { sectionIndex }, 'AIAutoWriterContainer');
      return false;
    }

    const success = wordEditorRef.current.insertImageAfterSection(sectionIndex, imageUrl, imageDescription);

    if (success) {
      logger.info('Image inserted via ProseMirror API', {
        sectionIndex,
        imageUrl: imageUrl.substring(0, 50),
      }, 'AIAutoWriterContainer');
    } else {
      logger.warn('Failed to insert image', { sectionIndex }, 'AIAutoWriterContainer');
    }

    return success;
  }, []);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
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
    }
  }, [isResizing]);

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
        <DocAgentPanel
          getDocumentContent={getEditorContent}
          updateSectionContent={handleSectionUpdate}
          insertImageAfterSection={handleImageInsert}
          selectedModelId={selectedModelId ?? null}
        />
      </section>
    </div>
  );
};

export default AIAutoWriterContainer;
