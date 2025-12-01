/**
 * ImageEditorPanel Component
 * Floating panel for editing images in the editor
 */

'use client';

import { 
  ZoomIn, 
  ZoomOut, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Trash2,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface ImageEditorPanelProps {
  imageNode: {
    pos: number;
    attrs: {
      src: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
      align?: 'left' | 'center' | 'right';
    };
  };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAlignChange: (align: 'left' | 'center' | 'right') => void;
  onDelete: () => void;
  onClose: () => void;
  position?: {
    top: number;
    left: number;
    width: number;
  };
}

const ImageEditorPanel = ({
  imageNode,
  onZoomIn,
  onZoomOut,
  onAlignChange,
  onDelete,
  onClose,
  position,
}: ImageEditorPanelProps) => {
  const currentAlign = imageNode.attrs.align || 'center';
  const currentWidth = imageNode.attrs.width;
  const numericWidth = typeof currentWidth === 'number' 
    ? currentWidth 
    : typeof currentWidth === 'string' && !currentWidth.endsWith('%')
      ? parseInt(currentWidth, 10) || 300
      : 300;

  const handleMaximize = () => {
    logger.debug('Maximizing image', { pos: imageNode.pos }, 'ImageEditorPanel');
    // Set to maximum reasonable size
    for (let i = 0; i < 20; i++) {
      onZoomIn();
    }
  };

  const handleMinimize = () => {
    logger.debug('Minimizing image', { pos: imageNode.pos }, 'ImageEditorPanel');
    // Set to minimum reasonable size
    for (let i = 0; i < 10; i++) {
      onZoomOut();
    }
  };

  const panelStyle: React.CSSProperties = position
    ? {
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
      }
    : {
        position: 'absolute',
        top: '-64px',
        left: '50%',
        transform: 'translateX(-50%)',
      };

  return (
    <div 
      className="bg-card border-2 border-border rounded shadow-lg px-4 py-2 z-50 image-editor-panel whitespace-nowrap"
      style={panelStyle}
    >
      <div className="flex items-center gap-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-muted rounded transition-colors flex-shrink-0"
          aria-label="Close editor"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-border" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Size:</span>
          <button
            onClick={onZoomOut}
            className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Zoom out"
            disabled={numericWidth <= 50}
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground min-w-[50px] text-center">
            {numericWidth}px
          </span>
          <button
            onClick={onZoomIn}
            className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Zoom in"
            disabled={numericWidth >= 2000}
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleMinimize}
            className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all"
            aria-label="Minimize"
            title="Minimize"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleMaximize}
            className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all"
            aria-label="Maximize"
            title="Maximize"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Alignment Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Align:</span>
          <button
            onClick={() => onAlignChange('left')}
            className={`p-2 border-2 border-border transition-all ${
              currentAlign === 'left' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-card hover:bg-muted'
            }`}
            aria-label="Align left"
            title="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAlignChange('center')}
            className={`p-2 border-2 border-border transition-all ${
              currentAlign === 'center' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-card hover:bg-muted'
            }`}
            aria-label="Align center"
            title="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => onAlignChange('right')}
            className={`p-2 border-2 border-border transition-all ${
              currentAlign === 'right' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-card hover:bg-muted'
            }`}
            aria-label="Align right"
            title="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="p-2 bg-destructive text-destructive-foreground border-2 border-border hover:opacity-90 transition-all flex items-center gap-2 flex-shrink-0"
          aria-label="Delete image"
          title="Delete image"
        >
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-medium">Delete</span>
        </button>
      </div>
    </div>
  );
};

export default ImageEditorPanel;

