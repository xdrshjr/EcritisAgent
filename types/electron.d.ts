/**
 * Type definitions for Electron API exposed via preload script
 */

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getAppName: () => Promise<string>;
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  isElectron: () => boolean;
  getPlatform: () => string;
  loadModelConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      models: Array<{
        id: string;
        name: string;
        apiUrl: string;
        apiKey: string;
        modelName: string;
        isDefault?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
      defaultModelId?: string;
    };
  }>;
  saveModelConfigs: (configs: {
    models: Array<{
      id: string;
      name: string;
      apiUrl: string;
      apiKey: string;
      modelName: string;
      isDefault?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
    defaultModelId?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getApiServerPort: () => Promise<number | null>;
  getFlaskBackendPort: () => Promise<number | null>;
  getFlaskBackendStatus: () => Promise<{
    isRunning: boolean;
    isStarting: boolean;
    port: number | null;
    pid: number | null;
  }>;
  getFlaskLogs: (lines?: number) => Promise<{
    success: boolean;
    error?: string;
    logs: string;
    total_lines?: number;
    returned_lines?: number;
    log_file?: string;
  }>;
  loadMCPConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      mcpServers: Array<{
        id: string;
        name: string;
        command: string;
        args: string[];
        env?: Record<string, string>;
        isEnabled?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
    };
  }>;
  saveMCPConfigs: (configs: {
    mcpServers: Array<{
      id: string;
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
      isEnabled?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  startMCPServer: (id: string, config: {
    id: string;
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    isEnabled?: boolean;
  }) => Promise<{
    success: boolean;
    error?: string;
    pid?: number;
  }>;
  stopMCPServer: (id: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getMCPServerStatus: (id: string) => Promise<{
    isRunning: boolean;
    pid?: number;
    startedAt?: string;
    name?: string;
  }>;
  loadAIChatState: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      version: number;
      conversations: Array<{
        id: string;
        title: string;
        timestamp: string;
        messageCount: number;
      }>;
      activeConversationId: string | null;
      messagesByConversationId: Record<
        string,
        Array<{
          id: string;
          role: 'system' | 'user' | 'assistant';
          content: string;
          timestamp: string;
          isCleared?: boolean;
          mcpExecutionSteps?: unknown[];
        }>
      >;
    } | null;
  }>;
  saveAIChatState: (state: {
    version: number;
    conversations: Array<{
      id: string;
      title: string;
      timestamp: string;
      messageCount: number;
    }>;
    activeConversationId: string | null;
    messagesByConversationId: Record<
      string,
      Array<{
        id: string;
        role: 'system' | 'user' | 'assistant';
        content: string;
        timestamp: string;
        isCleared?: boolean;
        mcpExecutionSteps?: unknown[];
      }>
    >;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loadChatBotConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      bots: Array<{
        id: string;
        name: string;
        systemPrompt: string;
        modelId: string;
        temperature: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        isEnabled?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
    };
  }>;
  saveChatBotConfigs: (configs: {
    bots: Array<{
      id: string;
      name: string;
      systemPrompt: string;
      modelId: string;
      temperature: number;
      maxTokens?: number;
      topP?: number;
      frequencyPenalty?: number;
      presencePenalty?: number;
      isEnabled?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loadImageServiceConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      imageServices: Array<{
        id: string;
        name: string;
        type: 'unsplash' | 'custom';
        apiKeys: string[];
        isDefault?: boolean;
        isDeletable?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
      defaultServiceId?: string;
    };
  }>;
  saveImageServiceConfigs: (configs: {
    imageServices: Array<{
      id: string;
      name: string;
      type: 'unsplash' | 'custom';
      apiKeys: string[];
      isDefault?: boolean;
      isDeletable?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
    defaultServiceId?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loadSearchServiceConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      searchServices: Array<{
        id: string;
        name: string;
        type: 'tavily' | 'custom';
        apiKeys: string[];
        isDefault?: boolean;
        isDeletable?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
      defaultServiceId?: string;
    };
  }>;
  saveSearchServiceConfigs: (configs: {
    searchServices: Array<{
      id: string;
      name: string;
      type: 'tavily' | 'custom';
      apiKeys: string[];
      isDefault?: boolean;
      isDeletable?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
    defaultServiceId?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  loadDisplayConfig: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      fontSize: {
        level: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
        scale: number;
      };
    };
  }>;
  selectDirectory: () => Promise<string | null>;
  saveDisplayConfig: (config: {
    fontSize: {
      level: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
      scale: number;
    };
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

interface Window {
  electron?: ElectronAPI;
  electronAPI?: ElectronAPI;
}

