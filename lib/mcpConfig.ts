/**
 * MCP Configuration Service
 * Manages MCP (Model Context Protocol) server configurations
 * Supports browser localStorage, Electron file system storage, and Python backend persistence
 */

import { logger } from './logger';
import { buildFlaskApiUrl } from './flaskConfig';

export interface MCPConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>; // Environment variables for the MCP server
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MCPConfigList {
  mcpServers: MCPConfig[];
}

const MCP_CONFIG_KEY = 'docaimaster_mcp_configs';
const MCP_CONFIGS_UPDATED_EVENT = 'mcp-configs-updated';

/**
 * Get the event name for MCP configs updated event
 */
export const getMCPConfigsUpdatedEventName = (): string => {
  return MCP_CONFIGS_UPDATED_EVENT;
};

/**
 * Emit a browser event to notify listeners that MCP configs have changed
 * Safe in Electron and browser environments; no-op on server
 */
const emitMCPConfigsUpdatedEvent = (configs: MCPConfigList): void => {
  if (typeof window === 'undefined') {
    logger.debug('Skipping MCP configs updated event emit on non-browser environment', undefined, 'MCPConfig');
    return;
  }

  try {
    const detail = {
      mcpServersCount: configs.mcpServers.length,
      enabledCount: configs.mcpServers.filter(m => m.isEnabled).length,
    };

    logger.info('Emitting MCP configuration updated event', detail, 'MCPConfig');

    const event = new CustomEvent(MCP_CONFIGS_UPDATED_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (error) {
    logger.error('Failed to emit MCP configuration updated event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'MCPConfig');
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
 * Generate unique ID for MCP server
 */
export const generateMCPId = (): string => {
  return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate MCP configuration
 */
export const validateMCPConfig = (config: Partial<MCPConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating MCP configuration', { configId: config.id }, 'MCPConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('MCP name is required', undefined, 'MCPConfig');
    return { valid: false, error: 'MCP name is required' };
  }

  if (!config.command || config.command.trim().length === 0) {
    logger.warn('MCP command is required', undefined, 'MCPConfig');
    return { valid: false, error: 'MCP command is required' };
  }

  if (!config.args || !Array.isArray(config.args)) {
    logger.warn('MCP args must be an array', undefined, 'MCPConfig');
    return { valid: false, error: 'MCP args must be an array' };
  }

  logger.debug('MCP configuration validated successfully', { configId: config.id }, 'MCPConfig');
  return { valid: true };
};

/**
 * Try to load MCP configurations from Python backend
 */
const tryLoadFromPythonBackend = async (): Promise<MCPConfigList | null> => {
  try {
    logger.debug('Attempting to load MCP configs from Python backend', undefined, 'MCPConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/mcp-configs');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        logger.success('MCP configurations loaded from Python backend', {
          count: result.data.mcpServers?.length || 0,
        }, 'MCPConfig');
        return result.data;
      }
    }
    
    logger.debug('Python backend did not return MCP configs', {
      status: response.status,
    }, 'MCPConfig');
    return null;
  } catch (error) {
    logger.debug('Could not load from Python backend (non-critical)', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'MCPConfig');
    return null;
  }
};

/**
 * Load MCP configurations from storage
 * IMPORTANT: All MCP servers are forced to be disabled on load to ensure default closed state
 */
export const loadMCPConfigs = async (): Promise<MCPConfigList> => {
  logger.info('Loading MCP configurations', undefined, 'MCPConfig');

  try {
    let configList: MCPConfigList;
    
    // Priority: Electron IPC > Python backend > localStorage
    // In Electron environment, prefer Electron IPC to avoid unnecessary API calls
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading MCP configs from Electron file system', undefined, 'MCPConfig');
      const result = await (window as any).electronAPI.loadMCPConfigs();
      
      if (result.success) {
        logger.success('MCP configurations loaded from Electron', {
          count: result.data.mcpServers.length,
        }, 'MCPConfig');
        configList = result.data;
      } else {
        logger.warn('Failed to load MCP configs from Electron, trying Python backend', {
          error: result.error,
        }, 'MCPConfig');
        
        // Fallback to Python backend if Electron IPC fails
        const backendConfigs = await tryLoadFromPythonBackend();
        if (backendConfigs && backendConfigs.mcpServers.length > 0) {
          logger.info('Using MCP configurations from Python backend (fallback)', {
            count: backendConfigs.mcpServers.length,
          }, 'MCPConfig');
          configList = backendConfigs;
        } else {
          logger.info('No configs from backend, using defaults', undefined, 'MCPConfig');
          configList = getDefaultMCPConfigs();
        }
      }
    } else {
      // Browser environment: try Python backend first, then localStorage
      const backendConfigs = await tryLoadFromPythonBackend();
      if (backendConfigs && backendConfigs.mcpServers.length > 0) {
        logger.info('Using MCP configurations from Python backend', {
          count: backendConfigs.mcpServers.length,
        }, 'MCPConfig');
        configList = backendConfigs;
      } else {
        // Use localStorage for browser
        logger.debug('Loading MCP configs from localStorage', undefined, 'MCPConfig');
        const stored = localStorage.getItem(MCP_CONFIG_KEY);
        
        if (stored) {
          const parsed = JSON.parse(stored) as MCPConfigList;
          logger.success('MCP configurations loaded from localStorage', {
            count: parsed.mcpServers.length,
          }, 'MCPConfig');
          configList = parsed;
        } else {
          logger.info('No stored MCP configurations found, using defaults', undefined, 'MCPConfig');
          configList = getDefaultMCPConfigs();
        }
      }
    }

    // CRITICAL: Force all MCP servers to be disabled on load
    // This ensures MCP functionality is always closed by default when entering the software
    const enabledMCPs = configList.mcpServers.filter(mcp => mcp.isEnabled === true);
    
    if (enabledMCPs.length > 0) {
      logger.info('Disabling all enabled MCP servers on load (default closed state)', {
        enabledCount: enabledMCPs.length,
        enabledMCPNames: enabledMCPs.map(m => m.name),
      }, 'MCPConfig');

      // Stop any running MCP servers in Electron environment
      if (isElectron()) {
        for (const mcp of enabledMCPs) {
          try {
            logger.debug('Stopping MCP server process on load', {
              id: mcp.id,
              name: mcp.name,
            }, 'MCPConfig');
            const stopResult = await (window as any).electronAPI.stopMCPServer(mcp.id);
            
            if (stopResult.success) {
              logger.success('MCP server process stopped on load', {
                id: mcp.id,
                name: mcp.name,
              }, 'MCPConfig');
            } else {
              logger.warn('Failed to stop MCP server process on load (may not be running)', {
                id: mcp.id,
                name: mcp.name,
                error: stopResult.error,
              }, 'MCPConfig');
            }
          } catch (error) {
            logger.warn('Exception while stopping MCP server on load', {
              id: mcp.id,
              name: mcp.name,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, 'MCPConfig');
          }
        }
      }

      // Force all MCPs to be disabled
      const currentTime = new Date().toISOString();
      configList.mcpServers = configList.mcpServers.map(mcp => ({
        ...mcp,
        isEnabled: false,
        updatedAt: mcp.isEnabled ? currentTime : mcp.updatedAt, // Only update timestamp if state changed
      }));

      // Save the updated configuration to ensure persistence
      // Use a flag to prevent event emission during load to avoid infinite loops
      logger.debug('Saving MCP configurations with all servers disabled', {
        totalCount: configList.mcpServers.length,
      }, 'MCPConfig');
      
      // Save without emitting event to prevent infinite loops during initialization
      const saveResult = await saveMCPConfigsWithoutEvent(configList);
      
      if (saveResult.success) {
        logger.success('MCP configurations saved with all servers disabled', {
          totalCount: configList.mcpServers.length,
        }, 'MCPConfig');
      } else {
        logger.warn('Failed to save MCP configurations after disabling servers', {
          error: saveResult.error,
        }, 'MCPConfig');
      }
    } else {
      logger.debug('All MCP servers are already disabled, no action needed', {
        totalCount: configList.mcpServers.length,
      }, 'MCPConfig');
    }

    return configList;
  } catch (error) {
    logger.error('Failed to load MCP configurations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'MCPConfig');
    return getDefaultMCPConfigs();
  }
};

/**
 * Get default MCP configurations
 */
export const getDefaultMCPConfigs = (): MCPConfigList => {
  const currentTime = new Date().toISOString();
  
  return {
    mcpServers: [
      {
        id: generateMCPId(),
        name: 'tavily-ai-tavily-mcp',
        command: 'npx',
        args: ['-y', 'tavily-mcp@latest'],
        env: {
          // TAVILY_API_KEY: 'your-api-key-here' // Example: Uncomment and set your API key
        },
        isEnabled: false,
        createdAt: currentTime,
        updatedAt: currentTime,
      },
      {
        id: generateMCPId(),
        name: 'caiyili-baidu-search-mcp',
        command: 'npx',
        args: ['baidu-search-mcp', '--max-result=5', '--fetch-content-count=2', '--max-content-length=2000'],
        env: {},
        isEnabled: false,
        createdAt: currentTime,
        updatedAt: currentTime,
      },
    ],
  };
};

/**
 * Sync MCP configurations to Python backend
 */
const syncToPythonBackend = async (configs: MCPConfigList): Promise<void> => {
  try {
    logger.debug('Syncing MCP configs to Python backend', {
      count: configs.mcpServers.length,
    }, 'MCPConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/mcp-configs');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configs),
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.success('MCP configurations synced to Python backend', {
        count: result.count,
      }, 'MCPConfig');
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      logger.warn('Failed to sync to Python backend, continuing with local storage', {
        status: response.status,
        error: errorData.error,
      }, 'MCPConfig');
    }
  } catch (error) {
    logger.warn('Exception while syncing to Python backend, continuing with local storage', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'MCPConfig');
  }
};

/**
 * Save MCP configurations to storage without emitting event
 * Used internally to prevent infinite loops during initialization
 */
const saveMCPConfigsWithoutEvent = async (configs: MCPConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving MCP configurations (silent mode)', {
    count: configs.mcpServers.length,
  }, 'MCPConfig');

  try {
    let saveResult: { success: boolean; error?: string } = { success: false };
    
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving MCP configs to Electron file system (silent)', undefined, 'MCPConfig');
      const result = await (window as any).electronAPI.saveMCPConfigs(configs);
      
      if (result.success) {
        logger.success('MCP configurations saved to Electron (silent)', {
          count: configs.mcpServers.length,
        }, 'MCPConfig');
      } else {
        logger.error('Failed to save MCP configs to Electron', {
          error: result.error,
        }, 'MCPConfig');
      }
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving MCP configs to localStorage (silent)', undefined, 'MCPConfig');
      localStorage.setItem(MCP_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('MCP configurations saved to localStorage (silent)', {
        count: configs.mcpServers.length,
      }, 'MCPConfig');
      
      saveResult = { success: true };
    }
    
    // Additionally sync to Python backend (but don't emit event)
    syncToPythonBackend(configs).catch(err => {
      logger.debug('Background sync to Python backend failed (non-critical)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'MCPConfig');
    });
    
    // Don't emit event in silent mode
    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save MCP configurations', {
      error: errorMessage,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Save MCP configurations to storage
 */
export const saveMCPConfigs = async (configs: MCPConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving MCP configurations', {
    count: configs.mcpServers.length,
  }, 'MCPConfig');

  try {
    let saveResult: { success: boolean; error?: string } = { success: false };
    
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving MCP configs to Electron file system', undefined, 'MCPConfig');
      const result = await (window as any).electronAPI.saveMCPConfigs(configs);
      
      if (result.success) {
        logger.success('MCP configurations saved to Electron', {
          count: configs.mcpServers.length,
        }, 'MCPConfig');
      } else {
        logger.error('Failed to save MCP configs to Electron', {
          error: result.error,
        }, 'MCPConfig');
      }
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving MCP configs to localStorage', undefined, 'MCPConfig');
      localStorage.setItem(MCP_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('MCP configurations saved to localStorage', {
        count: configs.mcpServers.length,
      }, 'MCPConfig');
      
      saveResult = { success: true };
    }
    
    // Additionally sync to Python backend
    syncToPythonBackend(configs).catch(err => {
      logger.debug('Background sync to Python backend failed (non-critical)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'MCPConfig');
    });
    
    // Emit event to notify listeners
    if (saveResult.success) {
      emitMCPConfigsUpdatedEvent(configs);
    }
    
    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save MCP configurations', {
      error: errorMessage,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Add a new MCP configuration
 */
export const addMCPConfig = async (config: Omit<MCPConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; mcp?: MCPConfig }> => {
  logger.info('Adding new MCP configuration', {
    name: config.name,
  }, 'MCPConfig');

  // Validate configuration
  const validation = validateMCPConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Load existing configs
    const configList = await loadMCPConfigs();

    // Create new MCP with metadata
    const newMCP: MCPConfig = {
      ...config,
      id: generateMCPId(),
      isEnabled: false, // New MCPs are disabled by default
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to list
    configList.mcpServers.push(newMCP);

    // Save to storage
    const saveResult = await saveMCPConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('MCP configuration added successfully', {
      id: newMCP.id,
      name: newMCP.name,
    }, 'MCPConfig');

    return { success: true, mcp: newMCP };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add MCP configuration', {
      error: errorMessage,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Update an existing MCP configuration
 */
export const updateMCPConfig = async (id: string, updates: Partial<Omit<MCPConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  logger.info('Updating MCP configuration', { id }, 'MCPConfig');

  try {
    // Load existing configs
    const configList = await loadMCPConfigs();

    // Find MCP to update
    const mcpIndex = configList.mcpServers.findIndex(m => m.id === id);
    
    if (mcpIndex === -1) {
      logger.warn('MCP configuration not found', { id }, 'MCPConfig');
      return { success: false, error: 'MCP not found' };
    }

    // Update MCP
    const updatedMCP = {
      ...configList.mcpServers[mcpIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = validateMCPConfig(updatedMCP);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    configList.mcpServers[mcpIndex] = updatedMCP;

    // Save to storage
    const saveResult = await saveMCPConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('MCP configuration updated successfully', { id }, 'MCPConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update MCP configuration', {
      error: errorMessage,
      id,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Delete a MCP configuration
 */
export const deleteMCPConfig = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Deleting MCP configuration', { id }, 'MCPConfig');

  try {
    // Load existing configs
    const configList = await loadMCPConfigs();

    // Find MCP to delete
    const mcpIndex = configList.mcpServers.findIndex(m => m.id === id);
    
    if (mcpIndex === -1) {
      logger.warn('MCP configuration not found', { id }, 'MCPConfig');
      return { success: false, error: 'MCP not found' };
    }

    const deletedMCP = configList.mcpServers[mcpIndex];

    // Stop MCP if it's running
    if (deletedMCP.isEnabled && isElectron()) {
      try {
        await (window as any).electronAPI.stopMCPServer(id);
        logger.info('Stopped MCP server before deletion', { id }, 'MCPConfig');
      } catch (error) {
        logger.warn('Failed to stop MCP server before deletion', { id, error }, 'MCPConfig');
      }
    }

    // Remove MCP
    configList.mcpServers.splice(mcpIndex, 1);

    // Save to storage
    const saveResult = await saveMCPConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('MCP configuration deleted successfully', {
      id,
      name: deletedMCP.name,
    }, 'MCPConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete MCP configuration', {
      error: errorMessage,
      id,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Toggle MCP enabled/disabled status
 */
export const toggleMCPEnabled = async (id: string): Promise<{ success: boolean; error?: string; isEnabled?: boolean }> => {
  logger.info('Toggling MCP enabled status', { id }, 'MCPConfig');

  try {
    // Load existing configs
    logger.debug('Loading current MCP configurations', { id }, 'MCPConfig');
    const configList = await loadMCPConfigs();

    // Find MCP
    const mcp = configList.mcpServers.find(m => m.id === id);
    
    if (!mcp) {
      logger.warn('MCP configuration not found', { id }, 'MCPConfig');
      return { success: false, error: 'MCP not found' };
    }

    const previousStatus = mcp.isEnabled;
    logger.debug('Current MCP status', { id, name: mcp.name, isEnabled: previousStatus }, 'MCPConfig');

    // Toggle enabled status
    const newEnabledStatus = !mcp.isEnabled;
    logger.info('Toggling MCP status', { 
      id, 
      name: mcp.name, 
      from: previousStatus, 
      to: newEnabledStatus 
    }, 'MCPConfig');
    
    mcp.isEnabled = newEnabledStatus;
    mcp.updatedAt = new Date().toISOString();

    // Start or stop the MCP server
    if (isElectron()) {
      try {
        if (newEnabledStatus) {
          logger.info('Starting MCP server process', { id, name: mcp.name }, 'MCPConfig');
          const startResult = await (window as any).electronAPI.startMCPServer(id, mcp);
          
          if (startResult.success) {
            logger.success('MCP server process started', { 
              id, 
              name: mcp.name, 
              pid: startResult.pid 
            }, 'MCPConfig');
          } else {
            throw new Error(startResult.error || 'Failed to start MCP server');
          }
        } else {
          logger.info('Stopping MCP server process', { id, name: mcp.name }, 'MCPConfig');
          const stopResult = await (window as any).electronAPI.stopMCPServer(id);
          
          if (stopResult.success) {
            logger.success('MCP server process stopped', { id, name: mcp.name }, 'MCPConfig');
          } else {
            throw new Error(stopResult.error || 'Failed to stop MCP server');
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to start/stop MCP server process', {
          error: errorMessage,
          id,
          name: mcp.name,
          attemptedAction: newEnabledStatus ? 'start' : 'stop',
        }, 'MCPConfig');
        
        // Revert the enabled status
        mcp.isEnabled = !newEnabledStatus;
        logger.warn('Reverted MCP enabled status due to process error', { 
          id, 
          revertedTo: !newEnabledStatus 
        }, 'MCPConfig');
        
        return { 
          success: false, 
          error: `Failed to ${newEnabledStatus ? 'start' : 'stop'} MCP server: ${errorMessage}` 
        };
      }
    } else {
      logger.debug('Not in Electron environment, skipping process start/stop', { id }, 'MCPConfig');
    }

    // Save to storage
    logger.debug('Saving updated MCP configuration to storage', { id, isEnabled: newEnabledStatus }, 'MCPConfig');
    const saveResult = await saveMCPConfigs(configList);
    
    if (!saveResult.success) {
      logger.error('Failed to save MCP configuration', { 
        id, 
        error: saveResult.error 
      }, 'MCPConfig');
      return { success: false, error: saveResult.error };
    }

    logger.success('MCP enabled status toggled and saved successfully', {
      id,
      name: mcp.name,
      isEnabled: newEnabledStatus,
      previousStatus,
    }, 'MCPConfig');

    return { success: true, isEnabled: newEnabledStatus };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to toggle MCP enabled status', {
      error: errorMessage,
      id,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'MCPConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get MCP configuration by ID
 */
export const getMCPById = async (id: string): Promise<MCPConfig | null> => {
  logger.debug('Getting MCP by ID', { id }, 'MCPConfig');

  try {
    const configList = await loadMCPConfigs();
    const mcp = configList.mcpServers.find(m => m.id === id);
    
    if (mcp) {
      logger.debug('MCP found', { id, name: mcp.name }, 'MCPConfig');
    } else {
      logger.debug('MCP not found', { id }, 'MCPConfig');
    }
    
    return mcp || null;
  } catch (error) {
    logger.error('Failed to get MCP by ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id,
    }, 'MCPConfig');
    return null;
  }
};

/**
 * Generate JSON configuration format for MCP server
 * This format can be used in MCP client configuration files
 */
export const generateMCPJsonConfig = (mcp: MCPConfig): string => {
  logger.debug('Generating JSON config for MCP', { id: mcp.id, name: mcp.name }, 'MCPConfig');

  const config: Record<string, any> = {
    mcpServers: {
      [mcp.name]: {
        command: mcp.command,
        args: mcp.args,
      }
    }
  };

  // Add environment variables if present
  if (mcp.env && Object.keys(mcp.env).length > 0) {
    config.mcpServers[mcp.name].env = mcp.env;
  }

  return JSON.stringify(config, null, 2);
};

/**
 * Parse MCP configuration from JSON format
 * Converts JSON structure to MCPConfigList
 */
export const parseMCPConfigFromJson = (json: any): MCPConfigList => {
  logger.info('Parsing MCP configuration from JSON', undefined, 'MCPConfig');

  try {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid JSON structure');
    }

    if (!json.mcpServers || typeof json.mcpServers !== 'object') {
      throw new Error('mcpServers field is required and must be an object');
    }

    const mcpServers: MCPConfig[] = [];
    const currentTime = new Date().toISOString();

    for (const [name, config] of Object.entries(json.mcpServers)) {
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        logger.warn('Skipping invalid MCP server config', { name }, 'MCPConfig');
        continue;
      }

      const mcpConfig = config as any;

      // Validate required fields
      if (!mcpConfig.command || typeof mcpConfig.command !== 'string') {
        logger.warn('Skipping MCP server with invalid command', { name }, 'MCPConfig');
        continue;
      }

      if (!mcpConfig.args || !Array.isArray(mcpConfig.args)) {
        logger.warn('Skipping MCP server with invalid args', { name }, 'MCPConfig');
        continue;
      }

      // Build MCP config
      const mcp: MCPConfig = {
        id: generateMCPId(),
        name: name,
        command: mcpConfig.command,
        args: mcpConfig.args.map((arg: any) => String(arg)),
        env: mcpConfig.env && typeof mcpConfig.env === 'object' && !Array.isArray(mcpConfig.env)
          ? Object.fromEntries(
              Object.entries(mcpConfig.env).map(([key, value]) => [key, String(value)])
            )
          : undefined,
        isEnabled: false, // New configs are disabled by default
        createdAt: currentTime,
        updatedAt: currentTime,
      };

      // Validate the config
      const validation = validateMCPConfig(mcp);
      if (!validation.valid) {
        logger.warn('Skipping invalid MCP config', { name, error: validation.error }, 'MCPConfig');
        continue;
      }

      mcpServers.push(mcp);
      logger.debug('Parsed MCP server config', { name, command: mcp.command }, 'MCPConfig');
    }

    logger.success('MCP configuration parsed successfully', {
      count: mcpServers.length,
    }, 'MCPConfig');

    return {
      mcpServers,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to parse MCP configuration from JSON', {
      error: errorMessage,
    }, 'MCPConfig');
    throw new Error(`Failed to parse MCP configuration: ${errorMessage}`);
  }
};

