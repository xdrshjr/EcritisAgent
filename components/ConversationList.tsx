/**
 * ConversationList Component
 * Left sidebar showing conversation history
 * Allows users to browse and select previous conversations
 */

'use client';

import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Bot, Sparkles } from 'lucide-react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import NewConversationDialog from './NewConversationDialog';

export type ConversationType = 'basic' | 'chatbot' | 'agent';

export interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messageCount: number;
  type?: ConversationType;
  metadata?: {
    chatbotId?: string;
    chatbotName?: string;
    agentType?: string;
    agentName?: string;
  };
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: (type?: ConversationType, metadata?: { chatbotId?: string; agentType?: string }) => void;
  onDeleteConversation: (conversationId: string) => void;
}

const ConversationList = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ConversationListProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleConversationClick = (conversationId: string) => {
    logger.info('Conversation selected', { conversationId }, 'ConversationList');
    onSelectConversation(conversationId);
  };

  const handleNewConversationClick = () => {
    logger.info('New conversation button clicked, opening dialog', undefined, 'ConversationList');
    setIsDialogOpen(true);
  };

  const handleDialogConfirm = (type: ConversationType, metadata?: { chatbotId?: string; agentType?: string }) => {
    logger.info('New conversation confirmed from dialog', { type, metadata }, 'ConversationList');
    setIsDialogOpen(false);
    onNewConversation(type, metadata);
  };

  const handleDialogClose = () => {
    logger.debug('New conversation dialog closed', undefined, 'ConversationList');
    setIsDialogOpen(false);
  };

  const getConversationIcon = (conversation: Conversation) => {
    const type = conversation.type || 'basic';
    switch (type) {
      case 'chatbot':
        return <Bot className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-500" />;
      case 'agent':
        return <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500" />;
      default:
        return <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />;
    }
  };

  const getConversationTypeLabel = (conversation: Conversation) => {
    const type = conversation.type || 'basic';
    if (type === 'chatbot' && conversation.metadata?.chatbotName) {
      return conversation.metadata.chatbotName;
    }
    if (type === 'agent' && conversation.metadata?.agentName) {
      return conversation.metadata.agentName;
    }
    return null;
  };

  const handleDeleteConversationClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    conversationId: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    logger.info(
      'Delete conversation button clicked',
      { conversationId },
      'ConversationList'
    );

    onDeleteConversation(conversationId);
  };

  const handleDeleteConversationKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    conversationId: string
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      logger.debug(
        'Delete conversation triggered from keyboard',
        { conversationId, key: event.key },
        'ConversationList'
      );
      onDeleteConversation(conversationId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleConversationClick(conversationId);
    }
  };

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNewConversationClick();
    }
  };

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) {
      return 'Just now';
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    if (days === 1) {
      return 'Yesterday';
    }
    if (days < 7) {
      return `${days}d ago`;
    }
    return date.toLocaleDateString();
  };

  return (
    <aside className="h-full bg-sidebar border-r-4 border-sidebar-border flex flex-col">
      {/* Header with New Conversation button */}
      <div className="p-3 border-b-2 border-sidebar-border">
        <button
          onClick={handleNewConversationClick}
          onKeyDown={handleNewKeyDown}
          tabIndex={0}
          aria-label={dict.chat.newConversation}
          className="w-full px-3 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>{dict.chat.newConversation}</span>
        </button>
      </div>

      {/* Conversations Title */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {dict.chat.conversations}
        </h3>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;

              return (
                <div
                  key={conversation.id}
                  className="flex items-stretch gap-1"
                >
                  <button
                    onClick={() => handleConversationClick(conversation.id)}
                    onKeyDown={(event) => handleKeyDown(event, conversation.id)}
                    tabIndex={0}
                    aria-label={`Conversation: ${conversation.title}`}
                    className={`flex-1 min-w-0 px-3 py-2 text-left border-2 transition-all ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-border shadow-md'
                        : 'bg-card text-card-foreground border-border hover:bg-accent hover:text-accent-foreground shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {getConversationIcon(conversation)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conversation.title}
                        </p>
                        <div className="mt-1 overflow-hidden">
                          <p className="text-xs opacity-70 truncate">
                            {[
                              getConversationTypeLabel(conversation),
                              formatTimestamp(conversation.timestamp),
                              `${conversation.messageCount} msg`
                            ]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={(event) =>
                      handleDeleteConversationClick(event, conversation.id)
                    }
                    onKeyDown={(event) =>
                      handleDeleteConversationKeyDown(event, conversation.id)
                    }
                    tabIndex={0}
                    aria-label={`${dict.chat.deleteConversationAriaLabel}: ${conversation.title}`}
                    className={`flex-shrink-0 px-2 py-2 border-2 transition-all flex items-center justify-center ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-border shadow-md hover:bg-primary/90'
                        : 'bg-card text-muted-foreground border-border shadow-sm hover:bg-destructive/10 hover:text-destructive hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        onConfirm={handleDialogConfirm}
      />
    </aside>
  );
};

export default ConversationList;

