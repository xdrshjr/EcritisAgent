/**
 * Server-Side Model Configuration Service
 * Handles model configuration loading in Next.js API routes (Node.js runtime)
 * Supports both Electron file system and browser cookie-based storage
 *
 * Reads from the three-file model type system:
 *   standard-models.json, coding-plan-models.json, custom-models.json
 */

import { logger } from './logger';
import { ModelConfig, ModelConfigList, isCodingPlanModel } from './modelConfig';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

/** File names matching backend ConfigLoader.TYPE_FILES */
const TYPE_FILES = [
  'standard-models.json',
  'coding-plan-models.json',
  'custom-models.json',
] as const;

/**
 * Check if running in Electron environment (server-side check)
 */
const isElectronEnvironment = (): boolean => {
  return process.env.ELECTRON_RUN_AS_NODE !== undefined ||
         process.env.ELECTRON_APP === 'true';
};

/**
 * Get user-data directory path for Electron
 */
const getElectronUserDataDir = (): string => {
  return process.env.ELECTRON_USER_DATA ||
         path.join(os.homedir(), '.docaimaster');
};

/**
 * Load and merge model configurations from all three type files (Electron mode)
 */
const loadModelConfigsFromFile = async (): Promise<ModelConfigList> => {
  const userDataDir = getElectronUserDataDir();
  const allModels: ModelConfig[] = [];
  let defaultModelId: string | undefined;

  for (const filename of TYPE_FILES) {
    const filePath = path.join(userDataDir, filename);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as ModelConfigList;
      allModels.push(...(data.models || []));
      if (data.defaultModelId && !defaultModelId) {
        defaultModelId = data.defaultModelId;
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to load ${filename}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'ModelConfigServer');
      }
      // ENOENT is expected for files that don't exist yet — skip silently
    }
  }

  if (allModels.length > 0) {
    logger.success('Model configurations loaded from files', {
      count: allModels.length,
      dir: userDataDir,
    }, 'ModelConfigServer');
  } else {
    logger.info('No model config files found', undefined, 'ModelConfigServer');
  }

  return { models: allModels, defaultModelId };
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

    if (isElectronEnvironment()) {
      logger.debug('Using Electron file system mode', undefined, 'ModelConfigServer');
      configList = await loadModelConfigsFromFile();
    } else if (request) {
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

    const enabledModels = configList.models.filter(m => m.isEnabled !== false);

    if (enabledModels.length === 0) {
      logger.warn('No enabled models available', undefined, 'ModelConfigServer');
      return null;
    }

    const defaultModel = enabledModels.find(m => m.isDefault);

    if (defaultModel) {
      logger.info('Default model found and enabled', {
        id: defaultModel.id,
        name: defaultModel.name,
        type: defaultModel.type,
      }, 'ModelConfigServer');
      return defaultModel;
    }

    logger.info('No default model set, using first enabled model', {
      id: enabledModels[0].id,
      name: enabledModels[0].name,
      type: enabledModels[0].type,
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
 */
export const getLLMConfigServer = async (request?: Request): Promise<{
  apiKey: string;
  apiUrl: string;
  modelName: string;
  timeout: number;
}> => {
  logger.info('Fetching LLM configuration (server-side)', undefined, 'ModelConfigServer');

  try {
    const defaultModel = await getDefaultModelServer(request);

    if (defaultModel) {
      // CodingPlan models have apiUrl/modelName resolved by the backend at call time;
      // server-side we pass empty strings as placeholders.
      let apiUrl = '';
      let modelName = '';

      if (!isCodingPlanModel(defaultModel)) {
        apiUrl = defaultModel.apiUrl;
        modelName = defaultModel.modelName;
      }

      logger.success('Using user-configured default model', {
        source: 'User Settings',
        modelId: defaultModel.id,
        displayName: defaultModel.name,
        type: defaultModel.type,
        apiUrl,
        isEnabled: defaultModel.isEnabled !== false,
      }, 'ModelConfigServer');

      return {
        apiKey: defaultModel.apiKey,
        apiUrl,
        modelName,
        timeout: 30000,
      };
    }

    const errorMessage = 'No LLM model configured. Please configure a model in Settings.';
    logger.error(errorMessage, {
      source: 'User Settings',
      suggestion: 'Open Settings dialog and add a model configuration',
    }, 'ModelConfigServer');

    throw new Error(errorMessage);
  } catch (error) {
    if (error instanceof Error && error.message.includes('No LLM model configured')) {
      throw error;
    }

    logger.error('Error loading user model configuration', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigServer');

    throw new Error('Failed to load LLM configuration. Please check your model settings.');
  }
};
