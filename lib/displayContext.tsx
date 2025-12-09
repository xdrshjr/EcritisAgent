/**
 * Display Context
 * Provides global display settings (font size) to the application
 */

'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { logger } from './logger';
import {
  loadDisplayConfig,
  getDisplayConfigUpdatedEventName,
  type DisplayConfig,
  type FontSizeLevel,
} from './displayConfig';

interface DisplayContextType {
  config: DisplayConfig | null;
  fontSizeLevel: FontSizeLevel;
  fontSizeScale: number;
  isLoading: boolean;
}

const DisplayContext = createContext<DisplayContextType | undefined>(undefined);

interface DisplayProviderProps {
  children: ReactNode;
}

export const DisplayProvider = ({ children }: DisplayProviderProps) => {
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    logger.component('DisplayProvider', 'mounted');

    const loadConfig = async () => {
      try {
        logger.info('Loading display configuration in provider', undefined, 'DisplayProvider');
        const loadedConfig = await loadDisplayConfig();
        setConfig(loadedConfig);
        logger.success('Display configuration loaded in provider', {
          fontSizeLevel: loadedConfig.fontSize.level,
          fontSizeScale: loadedConfig.fontSize.scale,
        }, 'DisplayProvider');
      } catch (error) {
        logger.error('Failed to load display configuration in provider', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'DisplayProvider');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();

    // Listen for display config updates
    const eventName = getDisplayConfigUpdatedEventName();
    const handleConfigUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<DisplayConfig>;
      if (customEvent.detail) {
        logger.info('Display configuration updated in provider', {
          fontSizeLevel: customEvent.detail.fontSize.level,
          fontSizeScale: customEvent.detail.fontSize.scale,
        }, 'DisplayProvider');
        setConfig(customEvent.detail);
      }
    };

    window.addEventListener(eventName, handleConfigUpdate);

    return () => {
      window.removeEventListener(eventName, handleConfigUpdate);
      logger.component('DisplayProvider', 'unmounted');
    };
  }, []);

  // Apply font size to document root
  useEffect(() => {
    if (!config) {
      return;
    }

    const root = document.documentElement;
    const fontSizeScale = config.fontSize.scale;
    
    logger.debug('Applying font size scale to document', {
      scale: fontSizeScale,
      level: config.fontSize.level,
    }, 'DisplayProvider');

    // Set CSS variable for font size scale
    root.style.setProperty('--font-size-scale', fontSizeScale.toString());
    
    // Apply base font size scaling
    const baseFontSize = 16; // Default browser base font size
    const scaledFontSize = baseFontSize * fontSizeScale;
    root.style.fontSize = `${scaledFontSize}px`;

    return () => {
      // Cleanup on unmount
      root.style.removeProperty('--font-size-scale');
      root.style.fontSize = '';
    };
  }, [config]);

  const value: DisplayContextType = {
    config,
    fontSizeLevel: config?.fontSize.level || 'medium',
    fontSizeScale: config?.fontSize.scale || 1.0,
    isLoading,
  };

  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
};

export const useDisplay = (): DisplayContextType => {
  const context = useContext(DisplayContext);
  if (context === undefined) {
    throw new Error('useDisplay must be used within a DisplayProvider');
  }
  return context;
};

