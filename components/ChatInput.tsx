/**
 * ChatInput Component
 * Input field with send button for chat messages
 * Handles keyboard shortcuts and submission
 */

'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput = ({ onSend, disabled = false, placeholder = 'Type your message...' }: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage || disabled) {
      return;
    }

    logger.debug('Sending chat message', { messageLength: trimmedMessage.length }, 'ChatInput');
    onSend(trimmedMessage);
    setMessage('');

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120); // Max 120px
    textarea.style.height = `${newHeight}px`;
  };

  return (
    <div className="flex items-end gap-2 px-3 py-4 border-t border-border bg-background">
      <textarea
        ref={inputRef}
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ maxHeight: '120px' }}
        aria-label="Chat message input"
      />
      
      <button
        onClick={handleSend}
        disabled={disabled || !message.trim()}
        className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Send message"
        tabIndex={0}
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ChatInput;

