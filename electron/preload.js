/**
 * Electron Preload Script
 * 
 * This script runs in the renderer process before web content loads.
 * It provides a secure bridge between the main process and renderer process.
 * 
 * Security:
 * - Uses contextBridge to expose limited APIs
 * - No direct Node.js access in renderer
 * - Validates all IPC communications
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Logger for preload script
 */
const logger = {
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [PRELOAD] [${level.toUpperCase()}] ${message}`;
    
    console.log(logMessage);
    
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  },

  info(message, data = null) {
    this.log('info', message, data);
  },

  error(message, data = null) {
    this.log('error', message, data);
  },

  warn(message, data = null) {
    this.log('warn', message, data);
  },

  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, data);
    }
  },
};

logger.info('Preload script initializing');

/**
 * Electron API exposed to renderer process
 */
const electronAPI = {
  /**
   * Get application version
   */
  getAppVersion: async () => {
    try {
      logger.debug('Calling getAppVersion');
      const version = await ipcRenderer.invoke('get-app-version');
      logger.debug('App version retrieved', { version });
      return version;
    } catch (error) {
      logger.error('Failed to get app version', { error: error.message });
      throw error;
    }
  },

  /**
   * Get application name
   */
  getAppName: async () => {
    try {
      logger.debug('Calling getAppName');
      const name = await ipcRenderer.invoke('get-app-name');
      logger.debug('App name retrieved', { name });
      return name;
    } catch (error) {
      logger.error('Failed to get app name', { error: error.message });
      throw error;
    }
  },

  /**
   * Get window bounds
   */
  getWindowBounds: async () => {
    try {
      logger.debug('Calling getWindowBounds');
      const bounds = await ipcRenderer.invoke('get-window-bounds');
      logger.debug('Window bounds retrieved', { bounds });
      return bounds;
    } catch (error) {
      logger.error('Failed to get window bounds', { error: error.message });
      throw error;
    }
  },

  /**
   * Check if running in Electron
   */
  isElectron: () => {
    return true;
  },

  /**
   * Get platform information
   */
  getPlatform: () => {
    const platform = process.platform;
    logger.debug('Platform retrieved', { platform });
    return platform;
  },

  /**
   * Select a directory via native dialog
   */
  selectDirectory: async () => {
    try {
      logger.debug('Calling selectDirectory');
      const result = await ipcRenderer.invoke('select-directory');
      logger.debug('Directory selection result', { result });
      return result;
    } catch (error) {
      logger.error('Failed to select directory', { error: error.message });
      return null;
    }
  },

  /**
   * Load model configurations from file system
   */
  loadModelConfigs: async () => {
    try {
      logger.info('Loading model configurations');
      const result = await ipcRenderer.invoke('load-model-configs');
      
      if (result.success) {
        logger.info('Model configurations loaded successfully', {
          count: result.data.models?.length || 0,
        });
      } else {
        logger.error('Failed to load model configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading model configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: { models: [] },
      };
    }
  },

  /**
   * Save model configurations to file system
   */
  saveModelConfigs: async (configs) => {
    try {
      logger.info('Saving model configurations', {
        count: configs.models?.length || 0,
      });
      
      const result = await ipcRenderer.invoke('save-model-configs', configs);
      
      if (result.success) {
        logger.info('Model configurations saved successfully');
      } else {
        logger.error('Failed to save model configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving model configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Get API server port (for packaged mode)
   */
  getApiServerPort: async () => {
    try {
      logger.debug('Calling getApiServerPort');
      const port = await ipcRenderer.invoke('get-api-server-port');
      logger.debug('API server port retrieved', { port });
      return port;
    } catch (error) {
      logger.error('Failed to get API server port', { error: error.message });
      return null;
    }
  },

  /**
   * Get Flask backend port
   */
  getFlaskBackendPort: async () => {
    try {
      logger.debug('Calling getFlaskBackendPort');
      const port = await ipcRenderer.invoke('get-flask-backend-port');
      logger.debug('Flask backend port retrieved', { port });
      return port;
    } catch (error) {
      logger.error('Failed to get Flask backend port', { error: error.message });
      return null;
    }
  },

  /**
   * Get Flask backend status
   */
  getFlaskBackendStatus: async () => {
    try {
      logger.debug('Calling getFlaskBackendStatus');
      const status = await ipcRenderer.invoke('get-flask-backend-status');
      logger.debug('Flask backend status retrieved', { status });
      return status;
    } catch (error) {
      logger.error('Failed to get Flask backend status', { error: error.message });
      return {
        isRunning: false,
        isStarting: false,
        port: null,
        pid: null,
      };
    }
  },

  /**
   * Get Flask backend logs
   */
  getFlaskLogs: async (lines = 100) => {
    try {
      logger.debug('Fetching Flask backend logs', { lines });
      
      const port = await ipcRenderer.invoke('get-api-server-port');
      if (!port) {
        logger.warn('API server not available for logs request');
        return {
          success: false,
          error: 'API server not available',
          logs: '',
        };
      }

      const response = await fetch(`http://localhost:${port}/api/logs?lines=${lines}`);
      const data = await response.json();
      
      if (response.ok) {
        logger.info('Flask logs retrieved successfully', {
          lines: data.returned_lines,
        });
        return {
          success: true,
          logs: data.content,
          total_lines: data.total_lines,
          returned_lines: data.returned_lines,
          log_file: data.log_file,
        };
      } else {
        logger.error('Failed to retrieve Flask logs', { error: data.error });
        return {
          success: false,
          error: data.error || 'Unknown error',
          logs: '',
        };
      }
    } catch (error) {
      logger.error('Exception while fetching Flask logs', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        logs: '',
      };
    }
  },

  /**
   * Load MCP configurations from file system
   */
  loadMCPConfigs: async () => {
    try {
      logger.info('Loading MCP configurations');
      const result = await ipcRenderer.invoke('load-mcp-configs');
      
      if (result.success) {
        logger.info('MCP configurations loaded successfully', {
          count: result.data.mcpServers?.length || 0,
        });
      } else {
        logger.error('Failed to load MCP configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading MCP configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: { mcpServers: [] },
      };
    }
  },

  /**
   * Save MCP configurations to file system
   */
  saveMCPConfigs: async (configs) => {
    try {
      logger.info('Saving MCP configurations', {
        count: configs.mcpServers?.length || 0,
      });
      
      const result = await ipcRenderer.invoke('save-mcp-configs', configs);
      
      if (result.success) {
        logger.info('MCP configurations saved successfully');
      } else {
        logger.error('Failed to save MCP configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving MCP configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Start MCP server
   */
  startMCPServer: async (id, mcpConfig) => {
    try {
      logger.info('Starting MCP server', {
        id,
        name: mcpConfig.name,
      });
      
      const result = await ipcRenderer.invoke('start-mcp-server', id, mcpConfig);
      
      if (result.success) {
        logger.info('MCP server started successfully', {
          id,
          pid: result.pid,
        });
      } else {
        logger.error('Failed to start MCP server', {
          id,
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while starting MCP server', {
        id,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Stop MCP server
   */
  stopMCPServer: async (id) => {
    try {
      logger.info('Stopping MCP server', { id });
      
      const result = await ipcRenderer.invoke('stop-mcp-server', id);
      
      if (result.success) {
        logger.info('MCP server stopped successfully', { id });
      } else {
        logger.error('Failed to stop MCP server', {
          id,
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while stopping MCP server', {
        id,
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Get MCP server status
   */
  getMCPServerStatus: async (id) => {
    try {
      logger.debug('Getting MCP server status', { id });
      const status = await ipcRenderer.invoke('get-mcp-server-status', id);
      logger.debug('MCP server status retrieved', { id, status });
      return status;
    } catch (error) {
      logger.error('Failed to get MCP server status', {
        id,
        error: error.message,
      });
      return {
        isRunning: false,
      };
    }
  },

  /**
   * Load AI Chat state from file system
   */
  loadAIChatState: async () => {
    try {
      logger.info('Loading AI Chat state via IPC');
      const result = await ipcRenderer.invoke('load-ai-chat-state');

      if (result.success) {
        logger.info('AI Chat state loaded via IPC', {
          hasState: !!result.data,
        });
      } else {
        logger.error('Failed to load AI Chat state via IPC', {
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      logger.error('Exception while loading AI Chat state via IPC', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: null,
      };
    }
  },

  /**
   * Save AI Chat state to file system
   */
  saveAIChatState: async (state) => {
    try {
      logger.info('Saving AI Chat state via IPC', {
        hasState: !!state,
      });

      const result = await ipcRenderer.invoke('save-ai-chat-state', state);

      if (result.success) {
        logger.info('AI Chat state saved via IPC');
      } else {
        logger.error('Failed to save AI Chat state via IPC', {
          error: result.error,
        });
      }

      return result;
    } catch (error) {
      logger.error('Exception while saving AI Chat state via IPC', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Load chat bot configurations from file system
   */
  loadChatBotConfigs: async () => {
    try {
      logger.info('Loading chat bot configurations');
      const result = await ipcRenderer.invoke('load-chat-bot-configs');
      
      if (result.success) {
        logger.info('Chat bot configurations loaded successfully', {
          count: result.data.bots?.length || 0,
        });
      } else {
        logger.error('Failed to load chat bot configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading chat bot configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: { bots: [] },
      };
    }
  },

  /**
   * Save chat bot configurations to file system
   */
  saveChatBotConfigs: async (configs) => {
    try {
      logger.info('Saving chat bot configurations', {
        count: configs.bots?.length || 0,
      });
      
      const result = await ipcRenderer.invoke('save-chat-bot-configs', configs);
      
      if (result.success) {
        logger.info('Chat bot configurations saved successfully');
      } else {
        logger.error('Failed to save chat bot configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving chat bot configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Load image service configurations from file system
   */
  loadImageServiceConfigs: async () => {
    try {
      logger.info('Loading image service configurations');
      const result = await ipcRenderer.invoke('load-image-service-configs');
      
      if (result.success) {
        logger.info('Image service configurations loaded successfully', {
          count: result.data.imageServices?.length || 0,
        });
      } else {
        logger.error('Failed to load image service configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading image service configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: { imageServices: [] },
      };
    }
  },

  /**
   * Save image service configurations to file system
   */
  saveImageServiceConfigs: async (configs) => {
    try {
      logger.info('Saving image service configurations', {
        count: configs.imageServices?.length || 0,
      });
      
      const result = await ipcRenderer.invoke('save-image-service-configs', configs);
      
      if (result.success) {
        logger.info('Image service configurations saved successfully');
      } else {
        logger.error('Failed to save image service configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving image service configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Load search service configurations from file system
   */
  loadSearchServiceConfigs: async () => {
    try {
      logger.info('Loading search service configurations');
      const result = await ipcRenderer.invoke('load-search-service-configs');
      
      if (result.success) {
        logger.info('Search service configurations loaded successfully', {
          count: result.data.searchServices?.length || 0,
        });
      } else {
        logger.error('Failed to load search service configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading search service configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: { searchServices: [] },
      };
    }
  },

  /**
   * Save search service configurations to file system
   */
  saveSearchServiceConfigs: async (configs) => {
    try {
      logger.info('Saving search service configurations', {
        count: configs.searchServices?.length || 0,
      });
      
      const result = await ipcRenderer.invoke('save-search-service-configs', configs);
      
      if (result.success) {
        logger.info('Search service configurations saved successfully');
      } else {
        logger.error('Failed to save search service configurations', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving search service configurations', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Load display configuration from file system
   */
  loadDisplayConfig: async () => {
    try {
      logger.info('Loading display configuration');
      const result = await ipcRenderer.invoke('load-display-config');
      
      if (result.success) {
        logger.info('Display configuration loaded successfully', {
          fontSizeLevel: result.data?.fontSize?.level || 'medium',
          fontSizeScale: result.data?.fontSize?.scale || 1.0,
        });
      } else {
        logger.error('Failed to load display configuration', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while loading display configuration', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
        data: {
          fontSize: {
            level: 'medium',
            scale: 1.0,
          },
        },
      };
    }
  },

  /**
   * Save display configuration to file system
   */
  saveDisplayConfig: async (config) => {
    try {
      logger.info('Saving display configuration', {
        fontSizeLevel: config.fontSize?.level || 'medium',
        fontSizeScale: config.fontSize?.scale || 1.0,
      });
      
      const result = await ipcRenderer.invoke('save-display-config', config);
      
      if (result.success) {
        logger.info('Display configuration saved successfully');
      } else {
        logger.error('Failed to save display configuration', {
          error: result.error,
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Exception while saving display configuration', {
        error: error.message,
      });
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

/**
 * Expose protected methods to renderer process
 */
try {
  logger.info('Exposing Electron API to renderer process');
  
  contextBridge.exposeInMainWorld('electron', electronAPI);
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  
  logger.info('Electron API exposed successfully', {
    exposedAPIs: Object.keys(electronAPI),
  });
} catch (error) {
  logger.error('Failed to expose Electron API', {
    error: error.message,
    stack: error.stack,
  });
}

/**
 * Log environment information
 */
logger.info('Preload script environment', {
  nodeVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  electronVersion: process.versions.electron,
  platform: process.platform,
  arch: process.arch,
});

logger.info('Preload script initialized successfully');

