/**
 * Model Configuration Sync Utility
 * Synchronizes model configurations between client localStorage and server cookies
 * Ensures API routes have access to user's model configurations
 */

import { logger } from './logger';
import { loadModelConfigs } from './modelConfig';

const COOKIE_NAME = 'docaimaster_model_configs';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Sync model configurations from localStorage to cookies
 * Should be called before making API requests that need model config
 */
export const syncModelConfigsToCookies = async (): Promise<void> => {
  try {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    logger.debug('Syncing model configs to cookies', undefined, 'ModelConfigSync');

    // Load current configs from localStorage
    const configs = await loadModelConfigs();
    
    // Serialize to JSON
    const configsJson = JSON.stringify(configs);
    
    // Set as cookie
    const cookieValue = encodeURIComponent(configsJson);
    document.cookie = `${COOKIE_NAME}=${cookieValue}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    
    logger.success('Model configs synced to cookies', {
      count: configs.models.length,
    }, 'ModelConfigSync');
  } catch (error) {
    logger.error('Failed to sync model configs to cookies', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigSync');
  }
};

/**
 * Clear model configuration cookies
 */
export const clearModelConfigCookies = (): void => {
  try {
    if (typeof window === 'undefined') {
      return;
    }

    logger.debug('Clearing model config cookies', undefined, 'ModelConfigSync');
    
    // Set cookie with max-age=0 to delete it
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
    
    logger.success('Model config cookies cleared', undefined, 'ModelConfigSync');
  } catch (error) {
    logger.error('Failed to clear model config cookies', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ModelConfigSync');
  }
};

