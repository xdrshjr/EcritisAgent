/**
 * Server-Side Model Configuration Service
 * Handles model configuration loading in Next.js API routes (Node.js runtime)
 * Supports both Electron file system and browser cookie-based storage
 */

import { logger } from './logger';
import { ModelConfig, ModelConfigList } from './modelConfig';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const MODEL_CONFIG_FILENAME = 'model-configs.json';

/**
 * Check if running in Electron environment (server-side check)
 */
const isElectronEnvironment = (): boolean => {
  // In server-side, check for Electron-specific environment variables
  return process.env.ELECTRON_RUN_AS_NODE !== undefined || 
         process.env.ELECTRON_APP === 'true';
};

/**
 * Get model config file path for Electron
 */
const getElectronConfigPath = (): string => {
  // Use user data directory
  const userDataPath = process.env.ELECTRON_USER_DATA || 
                       path.join(os.homedir(), '.docaimaster');
  return path.join(userDataPath, MODEL_CONFIG_FILENAME);
};

/**
 * Load model configurations from file system (Electron mode)
 */
const loadModelConfigsFromFile = async (): Promise<ModelConfigList> => {
  try {
    const configPath = getElectronConfigPath();
    logger.debug('Loading model configs from file', { path: configPath }, 'ModelConfigServer');
    
    const fileContent = await fs.readFile(configPath, 'utf-8');
    const configs = JSON.parse(fileContent) as ModelConfigList;
    
    logger.success('Model configurations loaded from file', {
      count: configs.models.length,
      path: configPath,
    }, 'ModelConfigServer');
    
    return configs;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      logger.info('Model config file not found, returning empty list', undefined, 'ModelConfigServer');
      return { models: [] };
    }
    
    logger.error('Failed to load model configs from file', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigServer');
    
    return { models: [] };
  }
};

/**
 * Load model configurations from request cookies (browser mode)
 */
const loadModelConfigsFromCookies = (request: Request): ModelConfigList => {
  try {
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) {
      logger.debug('No cookies found in request', undefined, 'ModelConfigServer');
      return { models: [] };
    }

    // Parse cookies
    const cookies = Object.fromEntries(
      cookieHeader.split('; ').map(c => {
        const [key, ...v] = c.split('=');
        return [key, v.join('=')];
      })
    );

    const modelConfigsCookie = cookies['docaimaster_model_configs'];
    if (!modelConfigsCookie) {
      logger.debug('Model configs cookie not found', undefined, 'ModelConfigServer');
      return { models: [] };
    }

    // Decode and parse
    const decoded = decodeURIComponent(modelConfigsCookie);
    const configs = JSON.parse(decoded) as ModelConfigList;
    
    logger.success('Model configurations loaded from cookies', {
      count: configs.models.length,
    }, 'ModelConfigServer');
    
    return configs;
  } catch (error) {
    logger.error('Failed to load model configs from cookies', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigServer');
    
    return { models: [] };
  }
};

/**
 * Get default model configuration (server-side)
 * Returns null if no default model is configured
 */
export const getDefaultModelServer = async (request?: Request): Promise<ModelConfig | null> => {
  logger.debug('Getting default model (server-side)', undefined, 'ModelConfigServer');

  try {
    let configList: ModelConfigList;

    // Try Electron file system first
    if (isElectronEnvironment()) {
      logger.debug('Using Electron file system mode', undefined, 'ModelConfigServer');
      configList = await loadModelConfigsFromFile();
    } else if (request) {
      // Fall back to cookies for browser mode
      logger.debug('Using browser cookie mode', undefined, 'ModelConfigServer');
      configList = loadModelConfigsFromCookies(request);
    } else {
      logger.warn('No request provided and not in Electron mode', undefined, 'ModelConfigServer');
      return null;
    }

    if (configList.models.length === 0) {
      logger.info('No models configured', undefined, 'ModelConfigServer');
      return null;
    }

    // Filter enabled models
    const enabledModels = configList.models.filter(m => m.isEnabled !== false);
    
    if (enabledModels.length === 0) {
      logger.warn('No enabled models available', undefined, 'ModelConfigServer');
      return null;
    }

    // Find default model among enabled models
    const defaultModel = enabledModels.find(m => m.isDefault);
    
    if (defaultModel) {
      logger.info('Default model found and enabled', {
        id: defaultModel.id,
        name: defaultModel.name,
        modelName: defaultModel.modelName,
      }, 'ModelConfigServer');
      return defaultModel;
    }

    // If no default set among enabled models, return first enabled model
    logger.info('No default model set, using first enabled model', {
      id: enabledModels[0].id,
      name: enabledModels[0].name,
      modelName: enabledModels[0].modelName,
    }, 'ModelConfigServer');
    
    return enabledModels[0];
  } catch (error) {
    logger.error('Failed to get default model', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigServer');
    return null;
  }
};

/**
 * Get LLM configuration for API calls (server-side)
 * Uses user-configured models from persistent storage
 * No longer depends on environment variables
 */
export const getLLMConfigServer = async (request?: Request): Promise<{
  apiKey: string;
  apiUrl: string;
  modelName: string;
  timeout: number;
}> => {
  logger.info('Fetching LLM configuration (server-side)', undefined, 'ModelConfigServer');

  try {
    // Get default model from user configuration or persistent storage
    const defaultModel = await getDefaultModelServer(request);
    
    if (defaultModel) {
      logger.success('Using user-configured default model', {
        source: 'User Settings',
        modelId: defaultModel.id,
        displayName: defaultModel.name,
        modelName: defaultModel.modelName,
        apiUrl: defaultModel.apiUrl,
        isEnabled: defaultModel.isEnabled !== false,
      }, 'ModelConfigServer');
      
      return {
        apiKey: defaultModel.apiKey,
        apiUrl: defaultModel.apiUrl,
        modelName: defaultModel.modelName,
        timeout: 30000,
      };
    }

    // No model configured - throw error with helpful message
    const errorMessage = 'No LLM model configured. Please configure a model in Settings.';
    logger.error(errorMessage, {
      source: 'User Settings',
      suggestion: 'Open Settings dialog and add a model configuration',
    }, 'ModelConfigServer');
    
    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message.includes('No LLM model configured')) {
      // Re-throw configuration errors as-is
      throw error;
    }
    
    logger.error('Error loading user model configuration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigServer');
    
    throw new Error('Failed to load LLM configuration. Please check your model settings.');
  }
};

