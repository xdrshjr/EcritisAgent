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

