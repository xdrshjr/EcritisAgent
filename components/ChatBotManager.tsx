/**
 * Chat Bot Manager Component
 * Manages chat bot configurations with CRUD operations
 */

'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Bot } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadChatBotConfigs,
  saveChatBotConfigs,
  addChatBotConfig,
  updateChatBotConfig,
  deleteChatBotConfig,
  getAvailableModels,
  type ChatBotConfig,
} from '@/lib/chatBotConfig';
import { cn } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface ChatBotManagerProps {
  className?: string;
}

const ChatBotManager = ({ className }: ChatBotManagerProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [bots, setBots] = useState<ChatBotConfig[]>([]);
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [botToDelete, setBotToDelete] = useState<ChatBotConfig | null>(null);
  const [formData, setFormData] = useState<Partial<ChatBotConfig>>({
    name: '',
    systemPrompt: '',
    modelId: '',
    temperature: 0.7,
    maxTokens: undefined,
    topP: undefined,
    frequencyPenalty: undefined,
    presencePenalty: undefined,
  });

  useEffect(() => {
    const initialize = async () => {
      logger.info('Initializing ChatBotManager', undefined, 'ChatBotManager');
      setLoading(true);
      
      try {
        const [botsData, modelsData] = await Promise.all([
          loadChatBotConfigs(),
          getAvailableModels(),
        ]);
        
        setBots(botsData.bots);
        setModels(modelsData);
        
        logger.success('ChatBotManager initialized', {
          botsCount: botsData.bots.length,
          modelsCount: modelsData.length,
        }, 'ChatBotManager');
      } catch (error) {
        logger.error('Failed to initialize ChatBotManager', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'ChatBotManager');
      } finally {
        setLoading(false);
      }
    };

    void initialize();
  }, []);

  const handleAdd = () => {
    logger.info('Starting to add new chat bot', undefined, 'ChatBotManager');
    setIsAdding(true);
    setEditingId(null);
    setFormData({
      name: '',
      systemPrompt: '',
      modelId: models[0]?.id || '',
      temperature: 0.7,
      maxTokens: undefined,
      topP: undefined,
      frequencyPenalty: undefined,
      presencePenalty: undefined,
    });
  };

  const handleEdit = (bot: ChatBotConfig) => {
    logger.info('Starting to edit chat bot', { id: bot.id, name: bot.name }, 'ChatBotManager');
    setEditingId(bot.id);
    setIsAdding(false);
    setFormData({
      name: bot.name,
      systemPrompt: bot.systemPrompt,
      modelId: bot.modelId,
      temperature: bot.temperature,
      maxTokens: bot.maxTokens,
      topP: bot.topP,
      frequencyPenalty: bot.frequencyPenalty,
      presencePenalty: bot.presencePenalty,
    });
  };

  const handleCancel = () => {
    logger.debug('Canceling chat bot edit/add', undefined, 'ChatBotManager');
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      name: '',
      systemPrompt: '',
      modelId: '',
      temperature: 0.7,
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.systemPrompt || !formData.modelId) {
      logger.warn('Cannot save chat bot: missing required fields', undefined, 'ChatBotManager');
      return;
    }

    try {
      if (isAdding) {
        logger.info('Adding new chat bot', { name: formData.name }, 'ChatBotManager');
        const result = await addChatBotConfig({
          name: formData.name,
          systemPrompt: formData.systemPrompt,
          modelId: formData.modelId,
          temperature: formData.temperature ?? 0.7,
          maxTokens: formData.maxTokens,
          topP: formData.topP,
          frequencyPenalty: formData.frequencyPenalty,
          presencePenalty: formData.presencePenalty,
        });

        if (result.success && result.bot) {
          setBots([...bots, result.bot]);
          setIsAdding(false);
          setFormData({
            name: '',
            systemPrompt: '',
            modelId: '',
            temperature: 0.7,
          });
          logger.success('Chat bot added successfully', { id: result.bot.id }, 'ChatBotManager');
        } else {
          logger.error('Failed to add chat bot', { error: result.error }, 'ChatBotManager');
          alert(result.error || 'Failed to add chat bot');
        }
      } else if (editingId) {
        logger.info('Updating chat bot', { id: editingId }, 'ChatBotManager');
        const result = await updateChatBotConfig(editingId, formData);

        if (result.success) {
          const updatedBots = bots.map(bot =>
            bot.id === editingId
              ? { ...bot, ...formData, updatedAt: new Date().toISOString() }
              : bot
          );
          setBots(updatedBots);
          setEditingId(null);
          logger.success('Chat bot updated successfully', { id: editingId }, 'ChatBotManager');
        } else {
          logger.error('Failed to update chat bot', { error: result.error }, 'ChatBotManager');
          alert(result.error || 'Failed to update chat bot');
        }
      }
    } catch (error) {
      logger.error('Exception while saving chat bot', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'ChatBotManager');
      alert('An error occurred while saving the chat bot');
    }
  };

  const handleDelete = (bot: ChatBotConfig) => {
    logger.info('Requesting to delete chat bot', { id: bot.id, name: bot.name }, 'ChatBotManager');
    setBotToDelete(bot);
  };

  const handleConfirmDelete = async () => {
    if (!botToDelete) return;

    try {
      logger.info('Deleting chat bot', { id: botToDelete.id }, 'ChatBotManager');
      const result = await deleteChatBotConfig(botToDelete.id);

      if (result.success) {
        setBots(bots.filter(bot => bot.id !== botToDelete.id));
        setBotToDelete(null);
        logger.success('Chat bot deleted successfully', { id: botToDelete.id }, 'ChatBotManager');
      } else {
        logger.error('Failed to delete chat bot', { error: result.error }, 'ChatBotManager');
        alert(result.error || 'Failed to delete chat bot');
      }
    } catch (error) {
      logger.error('Exception while deleting chat bot', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'ChatBotManager');
      alert('An error occurred while deleting the chat bot');
    }
  };

  if (loading) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <p className="text-muted-foreground text-sm">{dict.settings.loading}</p>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col overflow-hidden p-2 chat-bot-manager-container', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold">{dict.settings.chatBots}</h2>
        {!isAdding && !editingId && (
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded border-2 border-border hover:bg-primary/90 transition-colors"
            tabIndex={0}
            aria-label={dict.settings.addChatBot}
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">{dict.settings.addChatBot}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Add/Edit Form */}
        {(isAdding || editingId) && (
          <div className="mb-4 p-4 border-2 border-border bg-card rounded-lg">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{dict.settings.chatBotName}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={dict.settings.chatBotName}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{dict.settings.systemPrompt}</label>
                <textarea
                  value={formData.systemPrompt || ''}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring min-h-[120px] resize-y"
                  placeholder={dict.settings.systemPrompt}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{dict.settings.model}</label>
                <select
                  value={formData.modelId || ''}
                  onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {models.length === 0 ? (
                    <option value="">{dict.chat.noModelsConfigured}</option>
                  ) : (
                    models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{dict.settings.temperature} (0-2)</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature ?? 0.7}
                    onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) || 0.7 })}
                    className="w-full px-3 py-2 border-2 border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{dict.settings.maxTokens} ({dict.settings.optional})</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.maxTokens || ''}
                    onChange={(e) => setFormData({ ...formData, maxTokens: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border-2 border-border bg-background rounded focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder={dict.settings.optional}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-3 py-1.5 border-2 border-border bg-card hover:bg-accent transition-colors rounded"
                  tabIndex={0}
                >
                  <X className="w-4 h-4" />
                  <span className="text-sm">{dict.settings.cancel}</span>
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded border-2 border-border hover:bg-primary/90 transition-colors"
                  tabIndex={0}
                >
                  <Save className="w-4 h-4" />
                  <span className="text-sm">{dict.settings.save}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bot List */}
        {bots.length === 0 && !isAdding && !editingId ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-sm mb-2">{dict.settings.noChatBots}</p>
            <p className="text-muted-foreground text-xs">{dict.settings.noChatBotsHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map((bot) => {
              const isEditing = editingId === bot.id;
              const model = models.find(m => m.id === bot.modelId);

              if (isEditing) {
                return null; // Form is shown above
              }

              return (
                <div
                  key={bot.id}
                  className="p-4 border-2 border-border bg-card rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold">{bot.name}</h3>
                        {bot.isEnabled === false && (
                          <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded">{dict.settings.disabled}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {bot.systemPrompt}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>{dict.settings.model}: {model?.name || bot.modelId}</span>
                        <span>•</span>
                        <span>{dict.settings.temperature}: {bot.temperature}</span>
                        {bot.maxTokens && (
                          <>
                            <span>•</span>
                            <span>{dict.settings.maxTokens}: {bot.maxTokens}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEdit(bot)}
                        className="p-2 border-2 border-border bg-card hover:bg-accent transition-colors rounded"
                        tabIndex={0}
                        aria-label={`Edit ${bot.name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(bot)}
                        className="p-2 border-2 border-border bg-card hover:bg-destructive/10 hover:border-destructive/50 transition-colors rounded"
                        tabIndex={0}
                        aria-label={`Delete ${bot.name}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {botToDelete && (
        <ConfirmDialog
          isOpen={!!botToDelete}
          title={dict.settings.deleteConfirmTitle}
          description={dict.settings.deleteConfirmDescription.replace('this chat bot', `"${botToDelete.name}"`)}
          confirmLabel={dict.settings.delete}
          cancelLabel={dict.settings.cancel}
          isDestructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setBotToDelete(null)}
        />
      )}
    </div>
  );
};

export default ChatBotManager;

