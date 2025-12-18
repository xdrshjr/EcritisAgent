/**
 * FileAttachment Component
 * Displays uploaded file information in chat input area
 * Shows truncated filename with remove button
 * Elegant and compact design
 */

'use client';

import { X, FileText, File } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface FileAttachmentProps {
  filename: string;
  fileSize?: number;
  onRemove: () => void;
}

const FileAttachment = ({ filename, fileSize, onRemove }: FileAttachmentProps) => {
  // Truncate filename if too long (max 30 characters)
  const truncateFilename = (name: string, maxLength: number = 30): string => {
    if (name.length <= maxLength) {
      return name;
    }
    
    const extension = name.split('.').pop() || '';
    const nameWithoutExt = name.substring(0, name.length - extension.length - 1);
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 4) + '...';
    
    return `${truncatedName}.${extension}`;
  };

  // Format file size
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    
    if (bytes < 1024) {
      return `${bytes}B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
  };

  // Get file icon based on extension
  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      return <FileText className="w-3.5 h-3.5 text-red-500" />;
    } else if (ext === 'docx' || ext === 'doc') {
      return <FileText className="w-3.5 h-3.5 text-blue-500" />;
    }
    return <File className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  const truncatedName = truncateFilename(filename);
  const sizeText = formatFileSize(fileSize);

  const handleRemove = () => {
    logger.debug('File attachment removed', { filename }, 'FileAttachment');
    onRemove();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRemove();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors animate-fadeIn">
      {/* File Icon */}
      <div className="flex-shrink-0">
        {getFileIcon(filename)}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span 
            className="text-xs font-medium text-foreground truncate" 
            title={filename}
          >
            {truncatedName}
          </span>
          {sizeText && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              ({sizeText})
            </span>
          )}
        </div>
      </div>

      {/* Remove Button */}
      <button
        onClick={handleRemove}
        onKeyDown={handleKeyDown}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Remove file"
        tabIndex={0}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default FileAttachment;

