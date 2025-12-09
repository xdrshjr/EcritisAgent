/**
 * Display Configuration Service
 * Manages display settings like font size with persistence support
 * Supports browser localStorage and Electron file system storage
 */

import { logger } from './logger';

export type FontSizeLevel = 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

export interface FontSizeConfig {
  level: FontSizeLevel;
  scale: number; // CSS scale factor (e.g., 0.875 for small, 1.0 for medium, 1.25 for large)
}

export interface DisplayConfig {
  fontSize: FontSizeConfig;
}

const DISPLAY_CONFIG_KEY = 'docaimaster_display_config';
const DISPLAY_CONFIG_UPDATED_EVENT = 'docaimaster_display_config_updated';

/**
 * Font size presets with scale factors
 */
export const FONT_SIZE_PRESETS: Record<FontSizeLevel, FontSizeConfig> = {
  small: { level: 'small', scale: 0.875 },      // 87.5% of base size
  medium: { level: 'medium', scale: 1.0 },      // 100% of base size (default)
  large: { level: 'large', scale: 1.25 },      // 125% of base size
  xlarge: { level: 'xlarge', scale: 1.5 },      // 150% of base size
  xxlarge: { level: 'xxlarge', scale: 1.75 },  // 175% of base size
};

/**
 * Default display configuration
 */
const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  fontSize: FONT_SIZE_PRESETS.medium,
};

/**
 * Get the browser event name used when display configuration changes
 */
export const getDisplayConfigUpdatedEventName = (): string => {
  return DISPLAY_CONFIG_UPDATED_EVENT;
};

/**
 * Emit a browser event to notify listeners that display config has changed
 */
const emitDisplayConfigUpdatedEvent = (config: DisplayConfig): void => {
  if (typeof window === 'undefined') {
    logger.debug('Skipping display config updated event emit on non-browser environment', undefined, 'DisplayConfig');
    return;
  }

  try {
    logger.info('Emitting display configuration updated event', {
      fontSizeLevel: config.fontSize.level,
      fontSizeScale: config.fontSize.scale,
    }, 'DisplayConfig');

    const event = new CustomEvent(DISPLAY_CONFIG_UPDATED_EVENT, { detail: config });
    window.dispatchEvent(event);
  } catch (error) {
    logger.error('Failed to emit display configuration updated event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'DisplayConfig');
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
 * Load display configuration from storage
 */
export const loadDisplayConfig = async (): Promise<DisplayConfig> => {
  logger.info('Loading display configuration', undefined, 'DisplayConfig');

  try {
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading display config from Electron file system', undefined, 'DisplayConfig');
      
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && typeof electronAPI.loadDisplayConfig === 'function') {
        const result = await electronAPI.loadDisplayConfig();
        
        if (result && result.success && result.data) {
          const config = result.data as DisplayConfig;
          
          // Validate and normalize config
          const normalizedConfig = normalizeDisplayConfig(config);
          
          logger.success('Display configuration loaded from Electron', {
            fontSizeLevel: normalizedConfig.fontSize.level,
            fontSizeScale: normalizedConfig.fontSize.scale,
          }, 'DisplayConfig');
          
          return normalizedConfig;
        }
      }
      
      logger.debug('No display config found in Electron storage, using default', undefined, 'DisplayConfig');
      return { ...DEFAULT_DISPLAY_CONFIG };
    }

    // Use localStorage for browser
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      logger.debug('Not in browser environment, using default display config', undefined, 'DisplayConfig');
      return { ...DEFAULT_DISPLAY_CONFIG };
    }

    logger.debug('Loading display config from localStorage', { key: DISPLAY_CONFIG_KEY }, 'DisplayConfig');

    const raw = localStorage.getItem(DISPLAY_CONFIG_KEY);
    if (!raw) {
      logger.debug('No display config in localStorage, using default', undefined, 'DisplayConfig');
      return { ...DEFAULT_DISPLAY_CONFIG };
    }

    const parsed = JSON.parse(raw) as DisplayConfig;
    const normalizedConfig = normalizeDisplayConfig(parsed);

    logger.success('Display configuration loaded from localStorage', {
      fontSizeLevel: normalizedConfig.fontSize.level,
      fontSizeScale: normalizedConfig.fontSize.scale,
    }, 'DisplayConfig');

    return normalizedConfig;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to load display configuration', { error: errorMessage }, 'DisplayConfig');
    return { ...DEFAULT_DISPLAY_CONFIG };
  }
};

/**
 * Save display configuration to storage
 */
export const saveDisplayConfig = async (config: DisplayConfig): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving display configuration', {
    fontSizeLevel: config.fontSize.level,
    fontSizeScale: config.fontSize.scale,
  }, 'DisplayConfig');

  try {
    // Validate and normalize config
    const normalizedConfig = normalizeDisplayConfig(config);

    let saveResult: { success: boolean; error?: string } = { success: false };

    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving display config to Electron file system', undefined, 'DisplayConfig');
      
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && typeof electronAPI.saveDisplayConfig === 'function') {
        const result = await electronAPI.saveDisplayConfig(normalizedConfig);
        
        if (result && result.success) {
          logger.success('Display configuration saved to Electron', {
            fontSizeLevel: normalizedConfig.fontSize.level,
            fontSizeScale: normalizedConfig.fontSize.scale,
          }, 'DisplayConfig');
          saveResult = { success: true };
        } else {
          logger.error('Failed to save display config to Electron', {
            error: result?.error,
          }, 'DisplayConfig');
          saveResult = { success: false, error: result?.error || 'Unknown error' };
        }
      } else {
        logger.warn('Electron API saveDisplayConfig not available, falling back to localStorage', undefined, 'DisplayConfig');
        // Fallback to localStorage
        localStorage.setItem(DISPLAY_CONFIG_KEY, JSON.stringify(normalizedConfig));
        saveResult = { success: true };
      }
    } else {
      // Use localStorage for browser
      logger.debug('Saving display config to localStorage', undefined, 'DisplayConfig');
      localStorage.setItem(DISPLAY_CONFIG_KEY, JSON.stringify(normalizedConfig));
      
      logger.success('Display configuration saved to localStorage', {
        fontSizeLevel: normalizedConfig.fontSize.level,
        fontSizeScale: normalizedConfig.fontSize.scale,
      }, 'DisplayConfig');
      
      saveResult = { success: true };
    }

    // Emit event to notify listeners
    if (saveResult.success) {
      emitDisplayConfigUpdatedEvent(normalizedConfig);
    }

    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save display configuration', {
      error: errorMessage,
    }, 'DisplayConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Normalize display configuration to ensure valid values
 */
const normalizeDisplayConfig = (config: Partial<DisplayConfig>): DisplayConfig => {
  const normalized: DisplayConfig = {
    fontSize: { ...DEFAULT_DISPLAY_CONFIG.fontSize },
  };

  // Normalize font size
  if (config.fontSize) {
    const level = config.fontSize.level;
    if (level && level in FONT_SIZE_PRESETS) {
      normalized.fontSize = { ...FONT_SIZE_PRESETS[level] };
    } else if (config.fontSize.scale && config.fontSize.scale > 0) {
      // If scale is provided but level is invalid, find closest preset
      const closestPreset = Object.values(FONT_SIZE_PRESETS).reduce((prev, curr) => {
        return Math.abs(curr.scale - config.fontSize.scale) < Math.abs(prev.scale - config.fontSize.scale)
          ? curr
          : prev;
      });
      normalized.fontSize = { ...closestPreset };
    }
  }

  return normalized;
};

/**
 * Get font size scale for a given level
 */
export const getFontSizeScale = (level: FontSizeLevel): number => {
  return FONT_SIZE_PRESETS[level]?.scale || FONT_SIZE_PRESETS.medium.scale;
};

/**
 * Get font size label for display
 */
export const getFontSizeLabel = (level: FontSizeLevel): string => {
  const labels: Record<FontSizeLevel, string> = {
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    xlarge: 'Extra Large',
    xxlarge: 'Extra Extra Large',
  };
  return labels[level] || 'Medium';
};

