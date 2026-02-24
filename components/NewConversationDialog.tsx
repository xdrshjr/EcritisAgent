/**
 * NewConversationDialog Component
 * Dialog for selecting conversation type: Basic, ChatBot, or AI Agent
 */

'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Bot, Sparkles, Loader2, ChevronRight } from 'lucide-react';
import { logger } from '@/lib/logger';
import { loadChatBotConfigs, type ChatBotConfig } from '@/lib/chatBotConfig';
import { buildApiUrl } from '@/lib/apiConfig';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { type ConversationType } from './ConversationList';

interface AgentCapability {
  type: string;
  name: string;
  description: string;
  capabilities: string[];
  typical_requests: string[];
  requires_document: boolean;
}

interface NewConversationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (type: ConversationType, metadata?: { chatbotId?: string; agentType?: string }) => void;
}

const NewConversationDialog = ({ isOpen, onClose, onConfirm }: NewConversationDialogProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [selectedType, setSelectedType] = useState<ConversationType | null>(null);
  const [chatBots, setChatBots] = useState<ChatBotConfig[]>([]);
  const [agents, setAgents] = useState<AgentCapability[]>([]);
  const [selectedChatBotId, setSelectedChatBotId] = useState<string | null>(null);
  const [selectedAgentType, setSelectedAgentType] = useState<string | null>(null);
  const [isLoadingChatBots, setIsLoadingChatBots] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [chatBotError, setChatBotError] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setSelectedType(null);
      setSelectedChatBotId(null);
      setSelectedAgentType(null);
      setChatBots([]);
      setAgents([]);
      setChatBotError(null);
      setAgentError(null);
      logger.info('NewConversationDialog opened', undefined, 'NewConversationDialog');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && selectedType === 'chatbot' && chatBots.length === 0 && !isLoadingChatBots) {
      loadChatBots();
    }
  }, [isOpen, selectedType, chatBots.length, isLoadingChatBots]);

  useEffect(() => {
    if (isOpen && selectedType === 'agent' && agents.length === 0 && !isLoadingAgents) {
      loadAgents();
    }
  }, [isOpen, selectedType, agents.length, isLoadingAgents]);

  const loadChatBots = async () => {
    logger.info('Loading chat bots for conversation selection', undefined, 'NewConversationDialog');
    setIsLoadingChatBots(true);
    setChatBotError(null);

    try {
      const configList = await loadChatBotConfigs();
      const enabledBots = configList.bots.filter(bot => bot.isEnabled !== false);
      
      logger.info('Chat bots loaded successfully', {
        total: configList.bots.length,
        enabled: enabledBots.length,
      }, 'NewConversationDialog');
      
      setChatBots(enabledBots);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load chat bots', {
        error: errorMessage,
      }, 'NewConversationDialog');
      setChatBotError(errorMessage);
    } finally {
      setIsLoadingChatBots(false);
    }
  };

  const loadAgents = async () => {
    logger.info('Loading agents for conversation selection', undefined, 'NewConversationDialog');
    setIsLoadingAgents(true);
    setAgentError(null);

    try {
      const apiUrl = await buildApiUrl('/api/agents');
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`Failed to load agents: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const agentList = data.agents || [];

      logger.info('Agents loaded successfully', {
        count: agentList.length,
      }, 'NewConversationDialog');

      setAgents(agentList);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to load agents', {
        error: errorMessage,
      }, 'NewConversationDialog');
      setAgentError(errorMessage);
    } finally {
      setIsLoadingAgents(false);
    }
  };

  const handleTypeSelect = (type: ConversationType) => {
    logger.info('Conversation type selected', { type }, 'NewConversationDialog');
    
    // If basic conversation, create immediately without showing selection
    if (type === 'basic') {
      logger.info('Basic conversation selected, creating immediately', undefined, 'NewConversationDialog');
      onConfirm('basic');
      return;
    }
    
    setSelectedType(type);
    setSelectedChatBotId(null);
    setSelectedAgentType(null);
  };

  const handleChatBotSelect = (chatBotId: string) => {
    logger.info('Chat bot selected', { chatBotId }, 'NewConversationDialog');
    setSelectedChatBotId(chatBotId);
  };

  const handleAgentSelect = (agentType: string) => {
    logger.info('Agent selected', { agentType }, 'NewConversationDialog');
    setSelectedAgentType(agentType);
  };

  const handleConfirm = () => {
    if (!selectedType) {
      logger.warn('Cannot confirm: no type selected', undefined, 'NewConversationDialog');
      return;
    }

    if (selectedType === 'chatbot' && !selectedChatBotId) {
      logger.warn('Cannot confirm: no chat bot selected', undefined, 'NewConversationDialog');
      return;
    }

    if (selectedType === 'agent' && !selectedAgentType) {
      logger.warn('Cannot confirm: no agent selected', undefined, 'NewConversationDialog');
      return;
    }

    logger.info('Confirming new conversation creation', {
      type: selectedType,
      chatbotId: selectedChatBotId,
      agentType: selectedAgentType,
    }, 'NewConversationDialog');

    onConfirm(selectedType, {
      chatbotId: selectedChatBotId || undefined,
      agentType: selectedAgentType || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-background border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <h2 className="text-xl font-semibold text-foreground">
            {dict.chat.newConversationDialogTitle || 'Create New Conversation'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close dialog"
            tabIndex={0}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Type Selection */}
          {!selectedType && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                {dict.chat.newConversationDialogDescription || 'Select the type of conversation you want to create:'}
              </p>
              
              <button
                onClick={() => handleTypeSelect('basic')}
                className="w-full p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all text-left flex items-center gap-4 group"
                tabIndex={0}
              >
                <div className="p-3 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <MessageSquare className="w-6 h-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    {dict.chat.basicConversation || 'Basic Conversation'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.basicConversationDescription || 'Standard AI chat conversation'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                onClick={() => handleTypeSelect('chatbot')}
                className="w-full p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all text-left flex items-center gap-4 group"
                tabIndex={0}
              >
                <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                  <Bot className="w-6 h-6 text-purple-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    {dict.chat.chatbotConversation || 'Chat Bot'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.chatbotConversationDescription || 'Conversation with a configured chat bot'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>

              <button
                onClick={() => handleTypeSelect('agent')}
                className="w-full p-4 border border-border rounded-lg hover:border-primary/50 hover:bg-muted/50 transition-all text-left flex items-center gap-4 group"
                tabIndex={0}
              >
                <div className="p-3 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                  <Sparkles className="w-6 h-6 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">
                    {dict.chat.agentConversation || 'AI Agent'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.agentConversationDescription || 'Conversation with an AI agent'}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </div>
          )}

          {/* Chat Bot Selection */}
          {selectedType === 'chatbot' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setSelectedType(null)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Back"
                  tabIndex={0}
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground rotate-180" />
                </button>
                <h3 className="text-lg font-semibold text-foreground">
                  {dict.chat.selectChatBot || 'Select Chat Bot'}
                </h3>
              </div>

              {isLoadingChatBots && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.loadingChatBots || 'Loading chat bots...'}
                  </p>
                </div>
              )}

              {chatBotError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-destructive font-medium">
                    {dict.chat.failedToLoadChatBots || 'Failed to load chat bots'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{chatBotError}</p>
                  <button
                    onClick={loadChatBots}
                    className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                  >
                    {dict.chat.retry || 'Retry'}
                  </button>
                </div>
              )}

              {!isLoadingChatBots && !chatBotError && chatBots.length === 0 && (
                <div className="text-center py-12">
                  <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.noChatBotsAvailable || 'No chat bots available'}
                  </p>
                </div>
              )}

              {!isLoadingChatBots && !chatBotError && chatBots.length > 0 && (
                <div className="space-y-2">
                  {chatBots.map((bot) => (
                    <button
                      key={bot.id}
                      onClick={() => handleChatBotSelect(bot.id)}
                      className={`w-full p-4 border rounded-lg transition-all text-left ${
                        selectedChatBotId === bot.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                      tabIndex={0}
                    >
                      <div className="flex items-start gap-3">
                        <Bot className={`w-5 h-5 mt-0.5 ${selectedChatBotId === bot.id ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">{bot.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {bot.systemPrompt}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent Selection */}
          {selectedType === 'agent' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setSelectedType(null)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Back"
                  tabIndex={0}
                >
                  <ChevronRight className="w-4 h-4 text-muted-foreground rotate-180" />
                </button>
                <h3 className="text-lg font-semibold text-foreground">
                  {dict.chat.selectAgent || 'Select AI Agent'}
                </h3>
              </div>

              {isLoadingAgents && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.loadingAgents || 'Loading agents...'}
                  </p>
                </div>
              )}

              {agentError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <p className="text-sm text-destructive font-medium">
                    {dict.chat.failedToLoadAgents || 'Failed to load agents'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{agentError}</p>
                  <button
                    onClick={loadAgents}
                    className="mt-3 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 transition-colors"
                  >
                    {dict.chat.retry || 'Retry'}
                  </button>
                </div>
              )}

              {!isLoadingAgents && !agentError && agents.length === 0 && (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    {dict.chat.noAgentsAvailable || 'No agents available'}
                  </p>
                </div>
              )}

              {!isLoadingAgents && !agentError && agents.length > 0 && (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.type}
                      onClick={() => handleAgentSelect(agent.type)}
                      className={`w-full p-4 border rounded-lg transition-all text-left ${
                        selectedAgentType === agent.type
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                      tabIndex={0}
                    >
                      <div className="flex items-start gap-3">
                        <Sparkles className={`w-5 h-5 mt-0.5 ${selectedAgentType === agent.type ? 'text-primary' : 'text-muted-foreground'}`} />
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">{agent.name}</h4>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {agent.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors text-sm font-medium"
            tabIndex={0}
          >
            {dict.settings.cancel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              !selectedType ||
              (selectedType === 'chatbot' && !selectedChatBotId) ||
              (selectedType === 'agent' && !selectedAgentType)
            }
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            tabIndex={0}
          >
            {dict.chat.createConversation || 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewConversationDialog;

