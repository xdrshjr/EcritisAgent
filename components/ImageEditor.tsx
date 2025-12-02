/**
 * ImageEditor Component
 * Provides UI for editing images in the editor (resize, align, delete)
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  Edit2, 
  X, 
  ZoomIn, 
  ZoomOut, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Trash2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import type { Editor } from '@tiptap/react';

interface ImageEditorProps {
  editor: Editor;
  src: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  align?: 'left' | 'center' | 'right';
  nodePos: number;
}

const ImageEditor = ({ editor, src, alt, width, height, align = 'center', nodePos }: ImageEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState<number | string>(width || 'auto');
  const [currentHeight, setCurrentHeight] = useState<number | string>(height || 'auto');
  const [currentAlign, setCurrentAlign] = useState<'left' | 'center' | 'right'>(align);
  const [scale, setScale] = useState(100);
  const editorRef = useRef<HTMLDivElement>(null);

  // Parse width/height to number for calculations
  const getNumericWidth = (): number => {
    if (typeof currentWidth === 'number') {
      return currentWidth;
    }
    if (typeof currentWidth === 'string' && currentWidth.endsWith('%')) {
      return parseFloat(currentWidth);
    }
    if (typeof currentWidth === 'string') {
      const num = parseInt(currentWidth, 10);
      return isNaN(num) ? 300 : num;
    }
    return 300;
  };

  const getNumericHeight = (): number => {
    if (typeof currentHeight === 'number') {
      return currentHeight;
    }
    if (typeof currentHeight === 'string' && currentHeight.endsWith('%')) {
      return parseFloat(currentHeight);
    }
    if (typeof currentHeight === 'string') {
      const num = parseInt(currentHeight, 10);
      return isNaN(num) ? 200 : num;
    }
    return 200;
  };

  // Initialize scale based on current width
  useEffect(() => {
    const numWidth = getNumericWidth();
    if (typeof numWidth === 'number' && numWidth > 0) {
      setScale(Math.round((numWidth / 300) * 100));
    }
  }, []);

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    logger.info('Image edit mode toggled', { nodePos, isEditing: !isEditing }, 'ImageEditor');
    setIsEditing(!isEditing);
  };

  const handleZoomIn = () => {
    const newScale = Math.min(scale + 10, 200);
    setScale(newScale);
    updateImageSize(newScale);
    logger.debug('Image zoomed in', { scale: newScale, nodePos }, 'ImageEditor');
  };

  const handleZoomOut = () => {
    const newScale = Math.max(scale - 10, 10);
    setScale(newScale);
    updateImageSize(newScale);
    logger.debug('Image zoomed out', { scale: newScale, nodePos }, 'ImageEditor');
  };

  const updateImageSize = (newScale: number) => {
    const baseWidth = 300;
    const newWidth = Math.round((baseWidth * newScale) / 100);
    setCurrentWidth(newWidth);
    
    // Update in editor using transaction API
    const { state, dispatch } = editor.view;
    const { tr } = state;
    const node = state.doc.nodeAt(nodePos);
    
    if (node && node.type.name === 'image') {
      const newAttrs = {
        ...node.attrs,
        width: newWidth,
      };
      tr.setNodeMarkup(nodePos, undefined, newAttrs);
      dispatch(tr);
      logger.debug('Image size updated', { width: newWidth, scale: newScale, nodePos }, 'ImageEditor');
    }
  };

  const handleAlignChange = (newAlign: 'left' | 'center' | 'right') => {
    setCurrentAlign(newAlign);
    
    // Update in editor using transaction API
    const { state, dispatch } = editor.view;
    const { tr } = state;
    const node = state.doc.nodeAt(nodePos);
    
    if (node && node.type.name === 'image') {
      const newAttrs = {
        ...node.attrs,
        align: newAlign,
      };
      tr.setNodeMarkup(nodePos, undefined, newAttrs);
      dispatch(tr);
      logger.info('Image alignment changed', { align: newAlign, nodePos }, 'ImageEditor');
    }
  };

  const handleDelete = () => {
    logger.info('Deleting image', { nodePos, src: src.substring(0, 50) }, 'ImageEditor');
    
    // Delete image using transaction API
    const { state, dispatch } = editor.view;
    const { tr } = state;
    const node = state.doc.nodeAt(nodePos);
    
    if (node && node.type.name === 'image') {
      tr.delete(nodePos, nodePos + node.nodeSize);
      dispatch(tr);
      setIsEditing(false);
    }
  };

  const handleMaximize = () => {
    setScale(200);
    updateImageSize(200);
    logger.debug('Image maximized', { nodePos }, 'ImageEditor');
  };

  const handleMinimize = () => {
    setScale(50);
    updateImageSize(50);
    logger.debug('Image minimized', { nodePos }, 'ImageEditor');
  };

  // Close editor when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(event.target as Node)) {
        if (isEditing) {
          setIsEditing(false);
          logger.debug('Image editor closed (clicked outside)', { nodePos }, 'ImageEditor');
        }
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isEditing, nodePos]);

  const imageStyle: React.CSSProperties = {
    width: typeof currentWidth === 'number' ? `${currentWidth}px` : currentWidth,
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    margin: currentAlign === 'center' ? '1em auto' : currentAlign === 'left' ? '1em 0' : '1em auto 1em auto',
    marginLeft: currentAlign === 'left' ? '0' : currentAlign === 'right' ? 'auto' : 'auto',
    marginRight: currentAlign === 'right' ? '0' : currentAlign === 'left' ? 'auto' : 'auto',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  };

  return (
    <div 
      ref={editorRef}
      className="relative inline-block group"
      style={{ 
        textAlign: currentAlign,
        width: '100%',
        display: 'block',
      }}
      data-image-editor
    >
      <img
        src={src}
        alt={alt || ''}
        style={imageStyle}
        draggable={false}
        onError={(e) => {
          logger.error('Image failed to load', { src: src.substring(0, 50) }, 'ImageEditor');
        }}
      />
      
      {/* Edit Button - Always visible on hover */}
      <button
        onClick={handleEditClick}
        className="absolute top-2 right-2 p-1.5 bg-card border-2 border-border rounded shadow-sm hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100 z-10"
        aria-label="Edit image"
        title="Edit image"
      >
        <Edit2 className="w-4 h-4" />
      </button>

      {/* Edit Panel - Shows when editing */}
      {isEditing && (
        <div className="absolute top-2 right-2 bg-card border-2 border-border rounded shadow-lg p-3 z-20 min-w-[200px]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-foreground">Edit Image</h4>
            <button
              onClick={() => {
                setIsEditing(false);
                logger.debug('Image editor closed', { nodePos }, 'ImageEditor');
              }}
              className="p-1 hover:bg-muted rounded"
              aria-label="Close editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="mb-3">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Size</label>
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all"
                aria-label="Zoom out"
                disabled={scale <= 10}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-foreground min-w-[50px] text-center">
                {scale}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all"
                aria-label="Zoom in"
                disabled={scale >= 200}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleMinimize}
                className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all ml-1"
                aria-label="Minimize"
                title="Minimize to 50%"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleMaximize}
                className="p-1.5 border-2 border-border hover:bg-primary hover:text-primary-foreground transition-all"
                aria-label="Maximize"
                title="Maximize to 200%"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Alignment Controls */}
          <div className="mb-3">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Alignment</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAlignChange('left')}
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
                onClick={() => handleAlignChange('center')}
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
                onClick={() => handleAlignChange('right')}
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
          </div>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="w-full p-2 bg-destructive text-destructive-foreground border-2 border-border hover:opacity-90 transition-all flex items-center justify-center gap-2"
            aria-label="Delete image"
          >
            <Trash2 className="w-4 h-4" />
            <span className="text-sm font-medium">Delete</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageEditor;

