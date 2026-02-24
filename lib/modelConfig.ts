/**
 * Model Configuration Service
 * Manages LLM model configurations with support for multiple models
 * Supports browser localStorage, Electron file system storage, and Python backend persistence
 */

import { logger } from './logger';
import { buildFlaskApiUrl } from './flaskConfig';

// ── Model Type System ──────────────────────────────────────────────────────────

/** Model type discriminator */
export type ModelType = 'standard' | 'codingPlan' | 'custom';

/** Fields shared by all model types */
export interface BaseModelConfig {
  id: string;
  type: ModelType;
  name: string;
  isDefault?: boolean;
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Standard API provider model (OpenAI, Anthropic, Gemini, DeepSeek) */
export interface StandardModelConfig extends BaseModelConfig {
  type: 'standard';
  providerId: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  maxToken?: number;
}

/** Coding Plan service model (e.g. Kimi K2.5) */
export interface CodingPlanModelConfig extends BaseModelConfig {
  type: 'codingPlan';
  serviceId: string;
  apiKey: string;
}

/** Fully custom / self-hosted model */
export interface CustomModelConfig extends BaseModelConfig {
  type: 'custom';
  apiUrl: string;
  apiKey: string;
  modelName: string;
  maxToken?: number;
}

/** Discriminated union of all model config types */
export type ModelConfig = StandardModelConfig | CodingPlanModelConfig | CustomModelConfig;

export interface ModelConfigList {
  models: ModelConfig[];
  defaultModelId?: string;
}

// ── Provider / Service Templates (read-only, from providers.json) ────────────

export interface StandardProvider {
  id: string;
  name: string;
  apiUrl: string;
  models: string[];
  protocol: 'openai' | 'anthropic';
}

export interface CodingPlanService {
  id: string;
  name: string;
  apiUrl: string;
  model: string;
  protocol: 'openai' | 'anthropic';
  extraHeaders: Record<string, string>;
  defaultParams: Record<string, number>;
}

export interface ProvidersConfig {
  standard: StandardProvider[];
  codingPlan: CodingPlanService[];
}

// ── Distributive helper ──────────────────────────────────────────────────────

/** Distributive Omit that preserves discriminated union branches */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/** Distributive Partial that preserves discriminated union branches */
type DistributivePartial<T> = T extends any ? Partial<T> : never;

// ── Type Guards ──────────────────────────────────────────────────────────────

export const isStandardModel = (m: ModelConfig): m is StandardModelConfig => m.type === 'standard';
export const isCodingPlanModel = (m: ModelConfig): m is CodingPlanModelConfig => m.type === 'codingPlan';
export const isCustomModel = (m: ModelConfig): m is CustomModelConfig => m.type === 'custom';

/** Helper: get apiUrl from any model config (CodingPlan resolves via provider template) */
export const getModelApiUrl = (m: ModelConfig): string | undefined => {
  if (m.type === 'codingPlan') return undefined; // resolved from providers.json at call time
  return m.apiUrl;
};

/** Helper: get modelName from any model config (CodingPlan resolves via provider template) */
export const getModelName = (m: ModelConfig): string | undefined => {
  if (m.type === 'codingPlan') return undefined; // resolved from providers.json at call time
  return m.modelName;
};

const MODEL_CONFIG_KEY = 'docaimaster_model_configs';
const MODEL_CONFIGS_UPDATED_EVENT = 'docaimaster_model_configs_updated';
const DEFAULT_TIMEOUT = 60000; // Increased to 60 seconds for more reliable streaming

/**
 * Get the browser event name used when model configurations change
 * Allows UI components (e.g. ChatPanel) to subscribe and refresh their state
 */
export const getModelConfigsUpdatedEventName = (): string => {
  return MODEL_CONFIGS_UPDATED_EVENT;
};

/**
 * Emit a browser event to notify listeners that model configs have changed
 * Safe in Electron and browser environments; no-op on server
 */
const emitModelConfigsUpdatedEvent = (configs: ModelConfigList): void => {
  if (typeof window === 'undefined') {
    logger.debug('Skipping model configs updated event emit on non-browser environment', undefined, 'ModelConfig');
    return;
  }

  try {
    const detail = {
      modelsCount: configs.models.length,
      defaultModelId: configs.defaultModelId,
    };

    logger.info('Emitting model configuration updated event', detail, 'ModelConfig');

    const event = new CustomEvent(MODEL_CONFIGS_UPDATED_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (error) {
    logger.error('Failed to emit model configuration updated event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfig');
  }
};

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
 * Validate model configuration (type-aware)
 */
export const validateModelConfig = (config: Partial<ModelConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating model configuration', { configId: config.id, type: config.type }, 'ModelConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('Model name is required', undefined, 'ModelConfig');
    return { valid: false, error: 'Model name is required' };
  }

  if (!config.apiKey || (config.apiKey as string).trim().length === 0) {
    logger.warn('API key is required', undefined, 'ModelConfig');
    return { valid: false, error: 'API key is required' };
  }

  const type = config.type || 'custom';

  if (type === 'standard') {
    const sc = config as Partial<StandardModelConfig>;
    if (!sc.providerId || sc.providerId.trim().length === 0) {
      return { valid: false, error: 'Provider is required for standard model' };
    }
    if (!sc.apiUrl || sc.apiUrl.trim().length === 0) {
      return { valid: false, error: 'API URL is required' };
    }
    try { new URL(sc.apiUrl!); } catch {
      return { valid: false, error: 'Invalid API URL format' };
    }
    if (!sc.modelName || sc.modelName.trim().length === 0) {
      return { valid: false, error: 'Model name is required' };
    }
  } else if (type === 'codingPlan') {
    const cp = config as Partial<CodingPlanModelConfig>;
    if (!cp.serviceId || cp.serviceId.trim().length === 0) {
      return { valid: false, error: 'Service ID is required for coding plan model' };
    }
    // apiUrl and modelName are resolved from providers.json — not required here
  } else {
    // custom
    const cc = config as Partial<CustomModelConfig>;
    if (!cc.apiUrl || cc.apiUrl.trim().length === 0) {
      return { valid: false, error: 'API URL is required' };
    }
    try { new URL(cc.apiUrl!); } catch {
      return { valid: false, error: 'Invalid API URL format' };
    }
    if (!cc.modelName || cc.modelName.trim().length === 0) {
      return { valid: false, error: 'Model name is required' };
    }
  }

  logger.debug('Model configuration validated successfully', { configId: config.id }, 'ModelConfig');
  return { valid: true };
};

/**
 * Try to load model configurations from Python backend
 */
const tryLoadFromPythonBackend = async (): Promise<ModelConfigList | null> => {
  try {
    logger.debug('Attempting to load model configs from Python backend', undefined, 'ModelConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/model-configs');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        logger.success('Model configurations loaded from Python backend', {
          count: result.data.models?.length || 0,
        }, 'ModelConfig');
        return result.data;
      }
    }
    
    logger.debug('Python backend did not return model configs', {
      status: response.status,
    }, 'ModelConfig');
    return null;
  } catch (error) {
    logger.debug('Could not load from Python backend (non-critical)', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfig');
    return null;
  }
};

/**
 * Load model configurations from storage
 */
export const loadModelConfigs = async (): Promise<ModelConfigList> => {
  logger.info('Loading model configurations', undefined, 'ModelConfig');

  try {
    // First, try to load from Python backend (this ensures we get the default config on first run)
    const backendConfigs = await tryLoadFromPythonBackend();
    if (backendConfigs && backendConfigs.models.length > 0) {
      logger.info('Using model configurations from Python backend', {
        count: backendConfigs.models.length,
      }, 'ModelConfig');
      return backendConfigs;
    }
    
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
 * Sync model configurations to Python backend for persistent storage
 */
const syncToPythonBackend = async (configs: ModelConfigList): Promise<void> => {
  try {
    logger.debug('Syncing model configs to Python backend', {
      count: configs.models.length,
    }, 'ModelConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/model-configs');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configs),
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.success('Model configurations synced to Python backend', {
        count: result.count,
      }, 'ModelConfig');
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      logger.warn('Failed to sync to Python backend, continuing with local storage', {
        status: response.status,
        error: errorData.error,
      }, 'ModelConfig');
    }
  } catch (error) {
    logger.warn('Exception while syncing to Python backend, continuing with local storage', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfig');
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
    let saveResult: { success: boolean; error?: string } = { success: false };
    
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
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving model configs to localStorage', undefined, 'ModelConfig');
      localStorage.setItem(MODEL_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('Model configurations saved to localStorage', {
        count: configs.models.length,
      }, 'ModelConfig');
      
      saveResult = { success: true };
    }
    
    // Additionally sync to Python backend for unified persistence
    // This runs in the background and doesn't affect the main save result
    syncToPythonBackend(configs).catch(err => {
      logger.debug('Background sync to Python backend failed (non-critical)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'ModelConfig');
    });

    // Notify all browser-side listeners (e.g. ChatPanel) that model configs changed
    if (saveResult.success) {
      emitModelConfigsUpdatedEvent(configs);
    } else {
      logger.warn('Skipping model configuration updated event emit due to save failure', {
        error: saveResult.error,
      }, 'ModelConfig');
    }
    
    return saveResult;
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
export const addModelConfig = async (config: DistributiveOmit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; model?: ModelConfig }> => {
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
    const newModel = {
      ...config,
      id: generateModelId(),
      isEnabled: true, // New models are enabled by default
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as ModelConfig;

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
export const updateModelConfig = async (id: string, updates: DistributivePartial<DistributiveOmit<ModelConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
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
    } as ModelConfig;

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
    // Call the dedicated backend endpoint for cross-file default setting
    const apiUrl = buildFlaskApiUrl('/api/model-configs/default');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: id }),
    });

    if (response.ok) {
      // Emit update event so UI refreshes
      const refreshed = await loadModelConfigs();
      emitModelConfigsUpdatedEvent(refreshed);
      logger.success('Default model set successfully', { id }, 'ModelConfig');
      return { success: true };
    }

    const err = await response.json().catch(() => ({ error: 'Unknown' }));
    return { success: false, error: err.error };
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
        type: defaultModel.type,
      }, 'ModelConfig');
      return defaultModel;
    }

    // If no default set among enabled models, return first enabled model
    logger.info('No default model set, using first enabled model', {
      id: enabledModels[0].id,
      name: enabledModels[0].name,
      type: enabledModels[0].type,
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
 * Reorder model configurations
 * The first model in the array becomes the default model
 */
export const reorderModelConfigs = async (orderedIds: string[]): Promise<{ success: boolean; error?: string }> => {
  logger.info('Reordering model configurations', {
    count: orderedIds.length,
  }, 'ModelConfig');

  try {
    // Load existing configs
    const configList = await loadModelConfigs();

    // Create a map for quick lookup
    const modelMap = new Map(configList.models.map(m => [m.id, m]));

    // Reorder models based on the provided IDs
    const reorderedModels: ModelConfig[] = [];
    
    for (const id of orderedIds) {
      const model = modelMap.get(id);
      if (model) {
        reorderedModels.push(model);
        modelMap.delete(id);
      } else {
        logger.warn('Model ID not found during reorder', { id }, 'ModelConfig');
      }
    }

    // Add any remaining models that weren't in the ordered list (shouldn't happen normally)
    modelMap.forEach(model => {
      logger.warn('Model not in ordered list, appending to end', {
        id: model.id,
        name: model.name,
      }, 'ModelConfig');
      reorderedModels.push(model);
    });

    if (reorderedModels.length === 0) {
      logger.warn('No models to reorder', undefined, 'ModelConfig');
      return { success: false, error: 'No models to reorder' };
    }

    // Set first model as default
    reorderedModels.forEach((model, index) => {
      model.isDefault = index === 0;
      model.updatedAt = new Date().toISOString();
    });

    configList.models = reorderedModels;
    configList.defaultModelId = reorderedModels[0].id;

    // Save to storage
    const saveResult = await saveModelConfigs(configList);
    
    if (!saveResult.success) {
      logger.error('Failed to save reordered models', {
        error: saveResult.error,
      }, 'ModelConfig');
      return { success: false, error: saveResult.error };
    }

    logger.success('Model configurations reordered successfully', {
      count: reorderedModels.length,
      newDefaultId: reorderedModels[0].id,
      newDefaultName: reorderedModels[0].name,
    }, 'ModelConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to reorder model configurations', {
      error: errorMessage,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Clear all model configurations
 */
export const clearAllModels = async (): Promise<{ success: boolean; error?: string }> => {
  logger.info('Clearing all model configurations', undefined, 'ModelConfig');

  try {
    const emptyConfigList: ModelConfigList = {
      models: [],
      defaultModelId: undefined,
    };

    // Save empty configuration
    const saveResult = await saveModelConfigs(emptyConfigList);
    
    if (!saveResult.success) {
      logger.error('Failed to clear all models', {
        error: saveResult.error,
      }, 'ModelConfig');
      return { success: false, error: saveResult.error };
    }

    logger.success('All model configurations cleared successfully', undefined, 'ModelConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to clear all models', {
      error: errorMessage,
    }, 'ModelConfig');
    return { success: false, error: errorMessage };
  }
};

// ── Per-type loading / saving ────────────────────────────────────────────────

/**
 * Load model configurations for a specific type from the Python backend.
 */
export const loadModelConfigsByType = async (type: ModelType): Promise<ModelConfigList> => {
  try {
    const apiUrl = buildFlaskApiUrl(`/api/model-configs/${type}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        return result.data;
      }
    }
    return { models: [] };
  } catch {
    logger.debug(`Failed to load ${type} models from backend`, undefined, 'ModelConfig');
    return { models: [] };
  }
};

/**
 * Save model configurations for a specific type to the Python backend.
 */
export const saveModelConfigsByType = async (
  type: ModelType,
  data: ModelConfigList,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const apiUrl = buildFlaskApiUrl(`/api/model-configs/${type}`);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      emitModelConfigsUpdatedEvent(await loadModelConfigs());
      return { success: true };
    }
    const err = await response.json().catch(() => ({ error: 'Unknown' }));
    return { success: false, error: err.error };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

/**
 * Alias for loadModelConfigs (clearer name for new code).
 */
export const loadAllModelConfigs = loadModelConfigs;

/**
 * Load provider/service templates from backend (read-only).
 */
export const loadProviders = async (): Promise<ProvidersConfig> => {
  try {
    const apiUrl = buildFlaskApiUrl('/api/providers');
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        return result.data;
      }
    }
    return { standard: [], codingPlan: [] };
  } catch {
    logger.debug('Failed to load providers from backend', undefined, 'ModelConfig');
    return { standard: [], codingPlan: [] };
  }
};

/**
 * Get LLM configuration from model config (for compatibility with chatClient)
 * For CodingPlan models, apiUrl and modelName must be resolved from providers.json
 * before calling this function (or pass resolved values).
 */
export const getLLMConfigFromModel = (model: ModelConfig, resolvedApiUrl?: string, resolvedModelName?: string) => {
  if (model.type === 'codingPlan') {
    return {
      apiKey: model.apiKey,
      apiUrl: resolvedApiUrl || '',
      modelName: resolvedModelName || '',
      timeout: DEFAULT_TIMEOUT,
    };
  }
  return {
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    modelName: model.modelName,
    timeout: DEFAULT_TIMEOUT,
  };
};

