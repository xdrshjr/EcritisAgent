/**
 * ChatMessage Component
 * Displays individual chat messages with role-based styling
 * Supports user and assistant messages with proper formatting
 * Renders Markdown content for AI responses
 */

'use client';

import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

const ChatMessage = ({ role, content, timestamp }: ChatMessageProps) => {
  const isUser = role === 'user';

  const handleFormatTimestamp = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
      return 'Just now';
    }
    if (minutes < 60) {
      return `${minutes}m ago`;
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      className={`flex gap-3 mb-4 animate-fadeIn ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent text-accent-foreground'
        }`}
        aria-label={isUser ? 'User' : 'AI Assistant'}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex-1 max-w-[75%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`rounded-lg px-4 py-2 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          {isUser ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
          ) : (
            <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[#0d1117] prose-pre:text-gray-100 prose-code:text-pink-500 prose-code:before:content-[''] prose-code:after:content-['']">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Custom rendering for code blocks
                  code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Custom rendering for links
                  a: ({ node, children, ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 underline"
                    >
                      {children}
                    </a>
                  ),
                  // Custom rendering for paragraphs
                  p: ({ node, children, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props}>
                      {children}
                    </p>
                  ),
                  // Custom rendering for lists
                  ul: ({ node, children, ...props }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ node, children, ...props }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1" {...props}>
                      {children}
                    </ol>
                  ),
                  // Custom rendering for headings
                  h1: ({ node, children, ...props }) => (
                    <h1 className="text-lg font-bold mb-2 mt-2" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ node, children, ...props }) => (
                    <h2 className="text-base font-bold mb-2 mt-2" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ node, children, ...props }) => (
                    <h3 className="text-sm font-bold mb-1 mt-1" {...props}>
                      {children}
                    </h3>
                  ),
                  // Custom rendering for blockquotes
                  blockquote: ({ node, children, ...props }) => (
                    <blockquote className="border-l-4 border-gray-400 pl-3 italic my-2" {...props}>
                      {children}
                    </blockquote>
                  ),
                  // Custom rendering for tables
                  table: ({ node, children, ...props }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-collapse border border-gray-300" {...props}>
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ node, children, ...props }) => (
                    <th className="border border-gray-300 px-2 py-1 bg-gray-100 dark:bg-gray-800 font-semibold" {...props}>
                      {children}
                    </th>
                  ),
                  td: ({ node, children, ...props }) => (
                    <td className="border border-gray-300 px-2 py-1" {...props}>
                      {children}
                    </td>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <div
            className={`text-xs text-muted-foreground mt-1 px-1 ${
              isUser ? 'text-right' : 'text-left'
            }`}
          >
            {handleFormatTimestamp(timestamp)}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;

