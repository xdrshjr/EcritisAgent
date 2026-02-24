/**
 * ChatInput Component
 * Input field with send button and file upload for chat messages
 * Supports document file upload (PDF, Word) for context-aware conversations
 * Handles keyboard shortcuts and submission
 */

'use client';

import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { logger } from '@/lib/logger';
import FileAttachment from './FileAttachment';

export interface UploadedFile {
  filename: string;
  content: string;
  size: number;
}

interface HistoryEntry {
  instruction: string;
  context: string;
}

export interface ChatInputProps {
  onSend: (message: string, fileContext?: UploadedFile, context?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isAdvancedMode?: boolean;
  onAdvancedModeChange?: (isAdvanced: boolean) => void;
  hideInternalToggle?: boolean;
}

const ChatInput = ({ 
  onSend, 
  disabled = false, 
  placeholder = 'Type your message...',
  isAdvancedMode: controlledIsAdvancedMode,
  onAdvancedModeChange,
  hideInternalToggle = false
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [contextInput, setContextInput] = useState('');
  const [internalIsAdvancedMode, setInternalIsAdvancedMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputHistory, setInputHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState<{ instruction: string; context: string }>({ instruction: '', context: '' });
  
  const isAdvancedMode = controlledIsAdvancedMode !== undefined ? controlledIsAdvancedMode : internalIsAdvancedMode;

  const toggleAdvancedMode = () => {
    const newValue = !isAdvancedMode;
    if (onAdvancedModeChange) {
      onAdvancedModeChange(newValue);
    }
    if (controlledIsAdvancedMode === undefined) {
      setInternalIsAdvancedMode(newValue);
    }
  };
  
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load input history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('aidocmaster.chatInputHistory');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === 'string') {
            const converted: HistoryEntry[] = parsed.map((item: string) => ({
              instruction: item,
              context: ''
            }));
            setInputHistory(converted);
          } else {
            setInputHistory(parsed);
          }
        }
      } catch (error) {
        logger.warn('Failed to parse input history from localStorage', { error }, 'ChatInput');
      }
    }
  }, []);

  // Save input history to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('aidocmaster.chatInputHistory', JSON.stringify(inputHistory));
  }, [inputHistory]);

  // Click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage || disabled) {
      return;
    }

    logger.debug('Sending chat message', { 
      messageLength: trimmedMessage.length,
      hasFileContext: !!uploadedFile,
      isAdvancedMode,
      hasContext: !!contextInput
    }, 'ChatInput');
    
    onSend(trimmedMessage, uploadedFile || undefined, isAdvancedMode ? contextInput : undefined);
    
    const newHistory = [...inputHistory];
    const lastEntry = newHistory[newHistory.length - 1];
    const trimmedContext = contextInput.trim();
    
    if (newHistory.length === 0 || 
        lastEntry?.instruction !== trimmedMessage || 
        lastEntry?.context !== trimmedContext) {
      newHistory.push({
        instruction: trimmedMessage,
        context: trimmedContext
      });
      if (newHistory.length > 10) {
        newHistory.shift();
      }
      setInputHistory(newHistory);
    }
    
    setMessage('');
    setContextInput('');
    setUploadedFile(null);
    setIsExpanded(false);
    setHistoryIndex(-1);
    setTempInput({ instruction: '', context: '' });

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    const allowedExtensions = ['.pdf', '.docx', '.doc'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      logger.warn('Invalid file type selected', { 
        filename: file.name,
        type: file.type 
      }, 'ChatInput');
      
      alert('Please select a PDF or Word document file.');
      event.target.value = '';
      return;
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      logger.warn('File size exceeds limit', { 
        filename: file.name,
        size: file.size,
        maxSize 
      }, 'ChatInput');
      
      alert('File size must be less than 10MB.');
      event.target.value = '';
      return;
    }

    logger.info('Uploading file', { 
      filename: file.name,
      size: file.size,
      type: file.type 
    }, 'ChatInput');

    setIsUploading(true);

    try {
      // Create FormData to upload file
      const formData = new FormData();
      formData.append('file', file);

      // Upload file to backend
      const apiUrl = typeof window !== 'undefined' && (window as any).electron?.apiUrl 
        ? `${(window as any).electron.apiUrl}/api/chat/upload-file`
        : 'http://localhost:5000/api/chat/upload-file';

      logger.debug('Uploading file to API', { apiUrl, filename: file.name }, 'ChatInput');

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.text) {
        logger.success('File uploaded and parsed successfully', { 
          filename: file.name,
          textLength: result.text.length,
          metadata: result.metadata
        }, 'ChatInput');

        setUploadedFile({
          filename: file.name,
          content: result.text,
          size: file.size,
        });
      } else {
        logger.error('File upload failed', { 
          filename: file.name,
          error: result.error 
        }, 'ChatInput');
        
        alert(`Failed to parse file: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('File upload error', { 
        filename: file.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'ChatInput');
      
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handleFileButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveFile = () => {
    logger.debug('Removing uploaded file', { 
      filename: uploadedFile?.filename 
    }, 'ChatInput');
    
    setUploadedFile(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory(1);
    }
  };

  const navigateHistory = (direction: number) => {
    if (inputHistory.length === 0) {
      return;
    }

    if (historyIndex === -1 && direction === -1) {
      setTempInput({ instruction: message, context: contextInput });
      setHistoryIndex(inputHistory.length - 1);
      const entry = inputHistory[inputHistory.length - 1];
      setMessage(entry.instruction);
      setContextInput(entry.context);
    } else {
      const newIndex = historyIndex + direction;
      if (newIndex >= 0 && newIndex < inputHistory.length) {
        setHistoryIndex(newIndex);
        const entry = inputHistory[newIndex];
        setMessage(entry.instruction);
        setContextInput(entry.context);
      } else if (newIndex >= inputHistory.length) {
        setMessage(tempInput.instruction);
        setContextInput(tempInput.context);
        setHistoryIndex(-1);
      }
    }
  };

  const handleInstructionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setTempInput({ instruction: '', context: '' });
    }

    if (!isExpanded || !isAdvancedMode) {
      const textarea = e.target;
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 120);
      textarea.style.height = `${newHeight}px`;
    }
  };

  const handleContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContextInput(e.target.value);
    
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setTempInput({ instruction: '', context: '' });
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`flex flex-col border-t border-border bg-background transition-all duration-300 ease-in-out ${
        isExpanded && isAdvancedMode ? 'h-[30vh]' : 'h-auto'
      }`}
    >
      {/* Advanced Mode Toggle - Only show if not hidden */}
      {!hideInternalToggle && (
        <div className="flex items-center justify-end px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground font-medium cursor-pointer select-none" onClick={toggleAdvancedMode}>
              Advanced Mode
            </label>
            <button
              onClick={toggleAdvancedMode}
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                isAdvancedMode ? 'bg-primary' : 'bg-input'
              }`}
              role="switch"
              aria-checked={isAdvancedMode}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                  isAdvancedMode ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* File Attachment Display */}
      {uploadedFile && (
        <div className="px-3 pt-1.5 pb-1 border-b border-border/50">
          <FileAttachment
            filename={uploadedFile.filename}
            fileSize={uploadedFile.size}
            onRemove={handleRemoveFile}
          />
        </div>
      )}

      {/* Input Area */}
      <div className={`flex gap-2 px-3 py-2 ${isExpanded && isAdvancedMode ? 'flex-1 items-stretch' : 'items-end'}`}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileUpload}
          className="hidden"
          aria-label="Upload document file"
        />

        {/* File upload button */}
        <button
          onClick={handleFileButtonClick}
          disabled={disabled || isUploading}
          className={`flex-shrink-0 w-10 h-10 rounded-lg border border-input bg-background flex items-center justify-center hover:bg-muted hover:border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isExpanded && isAdvancedMode ? 'self-end' : ''}`}
          aria-label="Upload document file"
          title="Upload PDF or Word document"
          tabIndex={0}
        >
          <Paperclip className={`w-4 h-4 ${isUploading ? 'animate-spin' : ''}`} />
        </button>

        {isExpanded && isAdvancedMode ? (
          <div className="flex-1 flex gap-4 h-full">
            <div className="flex-1 flex flex-col gap-2">
               <label className="text-xs text-muted-foreground font-medium">Instruction</label>
               <textarea
                   ref={inputRef}
                   value={message}
                   onChange={handleInstructionChange}
                   onKeyDown={handleKeyDown}
                   placeholder="Enter your instruction..."
                   className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                   disabled={disabled}
               />
            </div>
            <div className="flex-1 flex flex-col gap-2">
               <label className="text-xs text-muted-foreground font-medium">Context</label>
               <textarea
                   ref={contextInputRef}
                   value={contextInput}
                   onChange={handleContextChange}
                   onKeyDown={handleKeyDown}
                   placeholder="Enter context..."
                   className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                   disabled={disabled}
               />
            </div>
          </div>
        ) : (
          /* Text input */
          <textarea
            ref={inputRef}
            value={message}
            onChange={handleInstructionChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (isAdvancedMode) setIsExpanded(true);
            }}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ maxHeight: '120px' }}
            aria-label="Chat message input"
          />
        )}
        
        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          className={`flex-shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isExpanded && isAdvancedMode ? 'self-end' : ''}`}
          aria-label="Send message"
          tabIndex={0}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;