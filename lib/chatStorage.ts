/**
 * AI Chat Storage Utility
 * Handles persistence of conversations and messages across Electron and browser environments.
 */

import { logger } from './logger';
import type { Conversation } from '@/components/ConversationList';
import type { Message } from '@/components/ChatPanel';

export interface AIChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messagesMap: Map<string, Message[]>;
}

interface SerializedConversation {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
}

interface SerializedMessage {
  id: string;
  role: Message['role'];
  content: string;
  timestamp: string;
  isCleared?: boolean;
  mcpExecutionSteps?: unknown[];
}

interface SerializedAIChatState {
  version: number;
  conversations: SerializedConversation[];
  activeConversationId: string | null;
  messagesByConversationId: Record<string, SerializedMessage[]>;
}

const STORAGE_KEY = 'aidocmaster.aiChatState.v1';

const isBrowser = typeof window !== 'undefined';

const getElectronAPI = () => {
  if (!isBrowser) {
    return undefined;
  }

  const anyWindow = window as unknown as {
    electron?: ElectronAPI;
    electronAPI?: ElectronAPI;
  };

  return anyWindow.electron || anyWindow.electronAPI;
};

const serializeAIChatState = (state: AIChatState): SerializedAIChatState => {
  const { conversations, activeConversationId, messagesMap } = state;

  const serializedConversations: SerializedConversation[] = conversations.map((conv) => ({
    id: conv.id,
    title: conv.title,
    timestamp: conv.timestamp.toISOString(),
    messageCount: conv.messageCount,
  }));

  const messagesByConversationId: Record<string, SerializedMessage[]> = {};

  messagesMap.forEach((messages, conversationId) => {
    messagesByConversationId[conversationId] = messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp.toISOString(),
      isCleared: msg.isCleared,
      mcpExecutionSteps: msg.mcpExecutionSteps,
    }));
  });

  return {
    version: 1,
    conversations: serializedConversations,
    activeConversationId,
    messagesByConversationId,
  };
};

const deserializeAIChatState = (serialized: SerializedAIChatState): AIChatState => {
  const conversations: Conversation[] = serialized.conversations.map((conv) => ({
    id: conv.id,
    title: conv.title,
    timestamp: new Date(conv.timestamp),
    messageCount: conv.messageCount,
  }));

  const messagesMap = new Map<string, Message[]>();

  Object.entries(serialized.messagesByConversationId).forEach(([conversationId, serializedMessages]) => {
    const messages: Message[] = serializedMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
      isCleared: msg.isCleared,
      mcpExecutionSteps: msg.mcpExecutionSteps,
    }));
    messagesMap.set(conversationId, messages);
  });

  return {
    conversations,
    activeConversationId: serialized.activeConversationId,
    messagesMap,
  };
};

export const loadAIChatState = async (): Promise<AIChatState | null> => {
  try {
    const electronAPI = getElectronAPI();

    if (electronAPI && typeof electronAPI.loadAIChatState === 'function') {
      logger.info('Loading AI Chat state via Electron API', undefined, 'AIChatStorage');
      const result = await electronAPI.loadAIChatState();

      if (!result || !result.success || !result.data) {
        logger.info(
          'No persisted AI Chat state found via Electron API',
          { success: result?.success ?? false, hasData: !!result?.data },
          'AIChatStorage'
        );
        return null;
      }

      logger.success(
        'AI Chat state loaded from Electron storage',
        {
          conversations: result.data.conversations?.length ?? 0,
          hasActiveConversation: !!result.data.activeConversationId,
        },
        'AIChatStorage'
      );

      return deserializeAIChatState(result.data);
    }

    if (!isBrowser || typeof localStorage === 'undefined') {
      logger.debug('Not in browser environment, skipping AI Chat state load', undefined, 'AIChatStorage');
      return null;
    }

    logger.info('Loading AI Chat state from localStorage', { key: STORAGE_KEY }, 'AIChatStorage');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      logger.info('No AI Chat state in localStorage', undefined, 'AIChatStorage');
      return null;
    }

    const parsed = JSON.parse(raw) as SerializedAIChatState;

    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      logger.warn(
        'AI Chat state in localStorage has unexpected format or version',
        { version: (parsed as SerializedAIChatState | undefined)?.version },
        'AIChatStorage'
      );
      return null;
    }

    const restored = deserializeAIChatState(parsed);

    logger.success(
      'AI Chat state loaded from localStorage',
      {
        conversations: restored.conversations.length,
        hasActiveConversation: !!restored.activeConversationId,
      },
      'AIChatStorage'
    );

    return restored;
  } catch (error) {
    logger.error(
      'Failed to load AI Chat state',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'AIChatStorage'
    );
    return null;
  }
};

export const saveAIChatState = async (state: AIChatState): Promise<void> => {
  try {
    const serialized = serializeAIChatState(state);
    const electronAPI = getElectronAPI();

    if (electronAPI && typeof electronAPI.saveAIChatState === 'function') {
      logger.info(
        'Saving AI Chat state via Electron API',
        {
          conversations: serialized.conversations.length,
          hasActiveConversation: !!serialized.activeConversationId,
        },
        'AIChatStorage'
      );

      const result = await electronAPI.saveAIChatState(serialized);

      if (!result || !result.success) {
        logger.error(
          'Electron API reported failure when saving AI Chat state',
          { error: result?.error },
          'AIChatStorage'
        );
        return;
      }

      logger.success(
        'AI Chat state saved via Electron API',
        {
          conversations: serialized.conversations.length,
        },
        'AIChatStorage'
      );

      return;
    }

    if (!isBrowser || typeof localStorage === 'undefined') {
      logger.debug('Not in browser environment, skipping AI Chat state save', undefined, 'AIChatStorage');
      return;
    }

    logger.info(
      'Saving AI Chat state to localStorage',
      {
        key: STORAGE_KEY,
        conversations: serialized.conversations.length,
      },
      'AIChatStorage'
    );

    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));

    logger.success(
      'AI Chat state saved to localStorage',
      { conversations: serialized.conversations.length },
      'AIChatStorage'
    );
  } catch (error) {
    logger.error(
      'Failed to save AI Chat state',
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'AIChatStorage'
    );
  }
};


