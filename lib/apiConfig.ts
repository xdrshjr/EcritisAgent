/**
 * API Configuration Utility
 * 
 * This module provides the appropriate API base URL based on the environment:
 * - In browser mode: Uses relative paths (/api/...)
 * - In Electron packaged mode: Uses localhost API server (http://localhost:PORT/api/...)
 * - In Electron dev mode: Uses Next.js dev server (http://localhost:3000/api/...)
 */

import { logger } from './logger';

/**
 * Get API base URL based on environment
 */
export const getApiBaseUrl = async (): Promise<string> => {
  logger.debug('getApiBaseUrl called', undefined, 'APIConfig');

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron();
  logger.debug('Environment check', { 
    isElectron, 
    hasElectronAPI: typeof window !== 'undefined' && !!window.electronAPI,
  }, 'APIConfig');

  if (!isElectron || !window.electronAPI) {
    // Browser mode - use relative paths
    logger.info('Running in browser mode, using relative API paths', undefined, 'APIConfig');
    return '';
  }

  // Electron mode - check if packaged or dev
  try {
    logger.debug('Requesting API server port from Electron', undefined, 'APIConfig');
    const apiServerPort = await window.electronAPI.getApiServerPort();
    logger.debug('Received API server port from Electron', { 
      port: apiServerPort,
      hasPort: !!apiServerPort,
    }, 'APIConfig');

    if (apiServerPort) {
      // Packaged mode with API server
      const baseUrl = `http://localhost:${apiServerPort}`;
      logger.info('Running in Electron packaged mode, using API server', {
        baseUrl,
        port: apiServerPort,
      }, 'APIConfig');
      return baseUrl;
    } else {
      // Dev mode - use Next.js dev server
      const baseUrl = 'http://localhost:3000';
      logger.info('Running in Electron dev mode, using Next.js dev server', {
        baseUrl,
      }, 'APIConfig');
      return baseUrl;
    }
  } catch (error) {
    logger.error('Error getting API server port, using relative paths', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    }, 'APIConfig');
    return '';
  }
};

/**
 * Build full API URL for a given endpoint
 * In packaged mode (Electron), do NOT add trailing slash as the API server normalizes paths
 * In dev mode (Next.js), add trailing slash to match Next.js trailingSlash config
 */
export const buildApiUrl = async (endpoint: string): Promise<string> => {
  logger.debug('buildApiUrl called', { endpoint }, 'APIConfig');
  
  const baseUrl = await getApiBaseUrl();
  logger.debug('Got base URL', { baseUrl }, 'APIConfig');
  
  const isElectronPackaged = baseUrl.includes('localhost:') && baseUrl !== 'http://localhost:3000';
  
  // In packaged Electron mode, do NOT add trailing slash
  // The Electron API server normalizes paths by removing trailing slashes
  // In Next.js dev mode, add trailing slash to match trailingSlash: true config
  const normalizedEndpoint = isElectronPackaged 
    ? endpoint  // Keep as-is for Electron API server
    : (endpoint.endsWith('/') ? endpoint : `${endpoint}/`); // Add slash for Next.js
  
  const url = `${baseUrl}${normalizedEndpoint}`;
  
  logger.info('Built API URL', {
    endpoint,
    normalizedEndpoint,
    baseUrl,
    fullUrl: url,
    isElectronPackaged,
  }, 'APIConfig');
  
  return url;
};

/**
 * Check if API server is available (for packaged mode)
 */
export const checkApiServerAvailability = async (): Promise<boolean> => {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron();

  if (!isElectron || !window.electronAPI) {
    // In browser mode, API routes are always available
    return true;
  }

  try {
    const apiServerPort = await window.electronAPI.getApiServerPort();
    
    if (apiServerPort) {
      // Try to reach the health check endpoint
      try {
        const response = await fetch(`http://localhost:${apiServerPort}/api/chat/`, {
          method: 'GET',
        });
        
        const isAvailable = response.ok;
        
        logger.info('API server availability check', {
          port: apiServerPort,
          available: isAvailable,
          status: response.status,
        }, 'APIConfig');
        
        return isAvailable;
      } catch (error) {
        logger.error('API server not reachable', {
          port: apiServerPort,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'APIConfig');
        return false;
      }
    } else {
      // Dev mode - assume Next.js dev server is running
      logger.debug('Running in dev mode, assuming API server is available', undefined, 'APIConfig');
      return true;
    }
  } catch (error) {
    logger.error('Error checking API server availability', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'APIConfig');
    return false;
  }
};

