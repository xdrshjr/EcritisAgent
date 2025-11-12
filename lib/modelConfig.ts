/**
 * Model Configuration Service
 * Manages LLM model configurations with support for multiple models
 * Supports both browser localStorage and Electron file system storage
 */

import { logger } from './logger';

export interface ModelConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  isDefault?: boolean;
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelConfigList {
  models: ModelConfig[];
  defaultModelId?: string;
}

const MODEL_CONFIG_KEY = 'docaimaster_model_configs';
const DEFAULT_TIMEOUT = 30000;

/**
 * Check if running in Electron environment
 */
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof (window as any).electronAPI !== 'undefined';
};

/**
 * Generate unique ID for model
 */
export const generateModelId = (): string => {
  return `model_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate model configuration
 */
export const validateModelConfig = (config: Partial<ModelConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating model configuration', { configId: config.id }, 'ModelConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('Model name is required', undefined, 'ModelConfig');
    return { valid: false, error: 'Model name is required' };
  }

  if (!config.apiUrl || config.apiUrl.trim().length === 0) {
    logger.warn('API URL is required', undefined, 'ModelConfig');
    return { valid: false, error: 'API URL is required' };
  }

  // Validate URL format
  try {
    new URL(config.apiUrl);
  } catch {
    logger.warn('Invalid API URL format', { url: config.apiUrl }, 'ModelConfig');
    return { valid: false, error: 'Invalid API URL format' };
  }

  if (!config.apiKey || config.apiKey.trim().length === 0) {
    logger.warn('API key is required', undefined, 'ModelConfig');
    return { valid: false, error: 'API key is required' };
  }

  if (!config.modelName || config.modelName.trim().length === 0) {
    logger.warn('Model name is required', undefined, 'ModelConfig');
    return { valid: false, error: 'Model name is required' };
  }

  logger.debug('Model configuration validated successfully', { configId: config.id }, 'ModelConfig');
  return { valid: true };
};

/**
 * Load model configurations from storage
 */
export const loadModelConfigs = async (): Promise<ModelConfigList> => {
  logger.info('Loading model configurations', undefined, 'ModelConfig');

  try {
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading model configs from Electron file system', undefined, 'ModelConfig');
      const result = await (window as any).electronAPI.loadModelConfigs();
      
      if (result.success) {
        logger.success('Model configurations loaded from Electron', {
          count: result.data.models.length,
        }, 'ModelConfig');
        return result.data;
      } else {
        logger.warn('Failed to load model configs from Electron, using defaults', {
          error: result.error,
        }, 'ModelConfig');
        return { models: [] };
      }
    } else {
      // Use localStorage for browser
      logger.debug('Loading model configs from localStorage', undefined, 'ModelConfig');
      const stored = localStorage.getItem(MODEL_CONFIG_KEY);
      
      if (stored) {
        const parsed = JSON.parse(stored) as ModelConfigList;
        logger.success('Model configurations loaded from localStorage', {
          count: parsed.models.length,
        }, 'ModelConfig');
        return parsed;
      }
      
      logger.info('No stored model configurations found', undefined, 'ModelConfig');
      return { models: [] };
    }
  } catch (error) {
    logger.error('Failed to load model configurations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfig');
    return { models: [] };
  }
};

/**
 * Save model configurations to storage
 */
export const saveModelConfigs = async (configs: ModelConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving model configurations', {
    count: configs.models.length,
  }, 'ModelConfig');

  try {
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving model configs to Electron file system', undefined, 'ModelConfig');
      const result = await (window as any).electronAPI.saveModelConfigs(configs);
      
      if (result.success) {
        logger.success('Model configurations saved to Electron', {
          count: configs.models.length,
        }, 'ModelConfig');
      } else {
        logger.error('Failed to save model configs to Electron', {
          error: result.error,
        }, 'ModelConfig');
      }
      
      return result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving model configs to localStorage', undefined, 'ModelConfig');
      localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('Model configurations saved to localStorage', {
        count: configs.models.length,
      }, 'ModelConfig');
      
      return { success: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save model configurations', {
      error: errorMessage,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Add a new model configuration
 */
export const addModelConfig = async (config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; model?: ModelConfig }> => {
  logger.info('Adding new model configuration', {
    name: config.name,
  }, 'ModelConfig');

  // Validate configuration
  const validation = validateModelConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Create new model with metadata
    const newModel: ModelConfig = {
      ...config,
      id: generateModelId(),
      isEnabled: true, // New models are enabled by default
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If this is the first model, make it default
    if (configList.models.length === 0) {
      newModel.isDefault = true;
      configList.defaultModelId = newModel.id;
      logger.info('Setting first model as default', { modelId: newModel.id }, 'ModelConfig');
    }

    // Add to list
    configList.models.push(newModel);

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Model configuration added successfully', {
      id: newModel.id,
      name: newModel.name,
    }, 'ModelConfig');

    return { success: true, model: newModel };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add model configuration', {
      error: errorMessage,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Update an existing model configuration
 */
export const updateModelConfig = async (id: string, updates: Partial<Omit<ModelConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  logger.info('Updating model configuration', { id }, 'ModelConfig');

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Find model to update
    const modelIndex = configList.models.findIndex(m => m.id === id);
    
    if (modelIndex === -1) {
      logger.warn('Model configuration not found', { id }, 'ModelConfig');
      return { success: false, error: 'Model not found' };
    }

    // Update model
    const updatedModel = {
      ...configList.models[modelIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = validateModelConfig(updatedModel);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    configList.models[modelIndex] = updatedModel;

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Model configuration updated successfully', { id }, 'ModelConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update model configuration', {
      error: errorMessage,
      id,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Delete a model configuration
 */
export const deleteModelConfig = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Deleting model configuration', { id }, 'ModelConfig');

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Find model to delete
    const modelIndex = configList.models.findIndex(m => m.id === id);
    
    if (modelIndex === -1) {
      logger.warn('Model configuration not found', { id }, 'ModelConfig');
      return { success: false, error: 'Model not found' };
    }

    const deletedModel = configList.models[modelIndex];

    // Remove model
    configList.models.splice(modelIndex, 1);

    // If deleted model was default, set new default
    if (deletedModel.isDefault && configList.models.length > 0) {
      configList.models[0].isDefault = true;
      configList.defaultModelId = configList.models[0].id;
      logger.info('Setting new default model after deletion', {
        newDefaultId: configList.models[0].id,
      }, 'ModelConfig');
    } else if (configList.models.length === 0) {
      configList.defaultModelId = undefined;
    }

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Model configuration deleted successfully', {
      id,
      name: deletedModel.name,
    }, 'ModelConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete model configuration', {
      error: errorMessage,
      id,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Set default model
 */
export const setDefaultModel = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Setting default model', { id }, 'ModelConfig');

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Find model
    const model = configList.models.find(m => m.id === id);
    
    if (!model) {
      logger.warn('Model configuration not found', { id }, 'ModelConfig');
      return { success: false, error: 'Model not found' };
    }

    // Update default flags
    configList.models.forEach(m => {
      m.isDefault = m.id === id;
    });
    configList.defaultModelId = id;

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Default model set successfully', {
      id,
      name: model.name,
    }, 'ModelConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to set default model', {
      error: errorMessage,
      id,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get default model configuration
 * Only returns enabled models
 */
export const getDefaultModel = async (): Promise<ModelConfig | null> => {
  logger.debug('Getting default model', undefined, 'ModelConfig');

  try {
    const configList = await loadModelConfigs();

    if (configList.models.length === 0) {
      logger.info('No models configured', undefined, 'ModelConfig');
      return null;
    }

    // Filter enabled models
    const enabledModels = configList.models.filter(m => m.isEnabled !== false);
    
    if (enabledModels.length === 0) {
      logger.warn('No enabled models available', undefined, 'ModelConfig');
      return null;
    }

    // Find default model among enabled models
    const defaultModel = enabledModels.find(m => m.isDefault);
    
    if (defaultModel) {
      logger.info('Default model found and enabled', {
        id: defaultModel.id,
        name: defaultModel.name,
        modelName: defaultModel.modelName,
      }, 'ModelConfig');
      return defaultModel;
    }

    // If no default set among enabled models, return first enabled model
    logger.info('No default model set, using first enabled model', {
      id: enabledModels[0].id,
      name: enabledModels[0].name,
      modelName: enabledModels[0].modelName,
    }, 'ModelConfig');
    
    return enabledModels[0];
  } catch (error) {
    logger.error('Failed to get default model', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfig');
    return null;
  }
};

/**
 * Toggle model enabled/disabled status
 */
export const toggleModelEnabled = async (id: string): Promise<{ success: boolean; error?: string; isEnabled?: boolean }> => {
  logger.info('Toggling model enabled status', { id }, 'ModelConfig');

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Find model
    const model = configList.models.find(m => m.id === id);
    
    if (!model) {
      logger.warn('Model configuration not found', { id }, 'ModelConfig');
      return { success: false, error: 'Model not found' };
    }

    // Toggle enabled status
    const newEnabledStatus = !model.isEnabled;
    model.isEnabled = newEnabledStatus;
    model.updatedAt = new Date().toISOString();

    // If disabling the default model, set another enabled model as default
    if (!newEnabledStatus && model.isDefault) {
      model.isDefault = false;
      
      // Find first enabled model to set as new default
      const firstEnabledModel = configList.models.find(m => m.id !== id && m.isEnabled !== false);
      
      if (firstEnabledModel) {
        firstEnabledModel.isDefault = true;
        configList.defaultModelId = firstEnabledModel.id;
        logger.info('Disabled default model, setting new default', {
          oldDefaultId: id,
          newDefaultId: firstEnabledModel.id,
          newDefaultName: firstEnabledModel.name,
        }, 'ModelConfig');
      } else {
        configList.defaultModelId = undefined;
        logger.warn('No other enabled models available to set as default', undefined, 'ModelConfig');
      }
    }

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Model enabled status toggled', {
      id,
      name: model.name,
      isEnabled: newEnabledStatus,
    }, 'ModelConfig');

    return { success: true, isEnabled: newEnabledStatus };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to toggle model enabled status', {
      error: errorMessage,
      id,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get model configuration by ID
 */
export const getModelById = async (id: string): Promise<ModelConfig | null> => {
  logger.debug('Getting model by ID', { id }, 'ModelConfig');

  try {
    const configList = await loadModelConfigs();
    const model = configList.models.find(m => m.id === id);
    
    if (model) {
      logger.debug('Model found', { id, name: model.name }, 'ModelConfig');
    } else {
      logger.debug('Model not found', { id }, 'ModelConfig');
    }
    
    return model || null;
  } catch (error) {
    logger.error('Failed to get model by ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id,
    }, 'ModelConfig');
    return null;
  }
};

/**
 * Get LLM configuration from model config (for compatibility with chatClient)
 */
export const getLLMConfigFromModel = (model: ModelConfig) => {
  return {
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    modelName: model.modelName,
    timeout: DEFAULT_TIMEOUT,
  };
};

