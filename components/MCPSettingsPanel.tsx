/**
 * MCP Settings Panel Component
 * Provides UI for configuring MCP servers via JSON and managing MCP tools
 * Features:
 * - JSON configuration input area
 * - MCP tools list with individual toggles
 * - Real-time updates after configuration save
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Power, PowerOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadMCPConfigs,
  saveMCPConfigs,
  toggleMCPEnabled,
  parseMCPConfigFromJson,
  type MCPConfig,
  type MCPConfigList,
} from '@/lib/mcpConfig';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';

interface MCPSettingsPanelProps {
  className?: string;
}

const MCPSettingsPanel = ({ className }: MCPSettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  
  const [jsonConfig, setJsonConfig] = useState<string>('');
  const [mcpTools, setMcpTools] = useState<MCPConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Load MCP configurations on mount
  useEffect(() => {
    logger.component('MCPSettingsPanel', 'mounted');
    handleLoadMCPConfigs();
  }, []);

  // Load MCP configurations and update JSON preview
  const handleLoadMCPConfigs = useCallback(async () => {
    logger.info('Loading MCP configurations', undefined, 'MCPSettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const configList = await loadMCPConfigs();
      setMcpTools(configList.mcpServers || []);
      
      // Generate JSON preview from current configs
      const jsonPreview = generateJsonFromConfigs(configList);
      setJsonConfig(jsonPreview);
      
      logger.success('MCP configurations loaded', {
        count: configList.mcpServers.length,
      }, 'MCPSettingsPanel');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load MCP configurations';
      logger.error('Failed to load MCP configurations', {
        error: errorMessage,
      }, 'MCPSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Generate JSON string from MCPConfigList
  const generateJsonFromConfigs = (configList: MCPConfigList): string => {
    try {
      const jsonObj: Record<string, any> = {
        mcpServers: {},
      };

      configList.mcpServers.forEach((mcp) => {
        jsonObj.mcpServers[mcp.name] = {
          command: mcp.command,
          args: mcp.args,
        };

        if (mcp.env && Object.keys(mcp.env).length > 0) {
          jsonObj.mcpServers[mcp.name].env = mcp.env;
        }
      });

      return JSON.stringify(jsonObj, null, 2);
    } catch (err) {
      logger.error('Failed to generate JSON from configs', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'MCPSettingsPanel');
      return '{}';
    }
  };

  // Handle JSON configuration save
  const handleSaveConfig = async () => {
    logger.info('Saving MCP configuration from JSON', undefined, 'MCPSettingsPanel');
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      // Validate JSON
      if (!jsonConfig.trim()) {
        throw new Error(dict.settings.mcpConfigRequired);
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(jsonConfig);
      } catch (parseError) {
        throw new Error(dict.settings.mcpJsonParseError);
      }

      // Parse JSON to MCPConfigList
      const configList = parseMCPConfigFromJson(parsedJson);
      
      if (!configList || !configList.mcpServers || configList.mcpServers.length === 0) {
        throw new Error('No valid MCP servers found in configuration');
      }

      // Save configurations
      const saveResult = await saveMCPConfigs(configList);
      
      if (!saveResult.success) {
        throw new Error(saveResult.error || dict.settings.mcpSaveError);
      }

      logger.success('MCP configuration saved successfully', {
        count: configList.mcpServers.length,
      }, 'MCPSettingsPanel');

      setSuccess(dict.settings.mcpSaveSuccess);
      
      // Reload configurations to update tool list
      await handleLoadMCPConfigs();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : dict.settings.mcpSaveError;
      logger.error('Failed to save MCP configuration', {
        error: errorMessage,
      }, 'MCPSettingsPanel');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle toggle MCP tool enabled/disabled
  const handleToggleTool = async (toolId: string) => {
    logger.info('Toggling MCP tool', { toolId }, 'MCPSettingsPanel');
    
    setTogglingIds(prev => new Set(prev).add(toolId));
    setError('');
    setSuccess('');

    try {
      const result = await toggleMCPEnabled(toolId);
      
      if (result.success) {
        logger.success('MCP tool toggled successfully', {
          toolId,
          isEnabled: result.isEnabled,
        }, 'MCPSettingsPanel');
        
        // Update local state
        setMcpTools(prevTools =>
          prevTools.map(tool =>
            tool.id === toolId
              ? { ...tool, isEnabled: result.isEnabled }
              : tool
          )
        );
      } else {
        throw new Error(result.error || 'Failed to toggle MCP tool');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to toggle MCP tool';
      logger.error('Failed to toggle MCP tool', {
        error: errorMessage,
        toolId,
      }, 'MCPSettingsPanel');
      setError(errorMessage);
      
      // Reload to sync state
      await handleLoadMCPConfigs();
    } finally {
      setTogglingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(toolId);
        return newSet;
      });
    }
  };

  return (
    <div className={cn('h-full flex flex-col overflow-hidden bg-background', className)}>
      {/* JSON Configuration Area - Top */}
      <div className="flex-shrink-0 border-b-2 border-border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-lg font-bold text-foreground mb-1">
            {dict.settings.mcpJsonConfig}
          </h3>
          <p className="text-sm text-muted-foreground">
            {dict.settings.mcpJsonConfigHint}
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-3 p-3 bg-destructive/10 border-2 border-destructive text-destructive-foreground text-sm rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-3 p-3 bg-green-600/10 border-2 border-green-600 text-green-600 text-sm rounded-md flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <textarea
          value={jsonConfig}
          onChange={(e) => {
            setJsonConfig(e.target.value);
            setError('');
            setSuccess('');
          }}
          placeholder={dict.settings.mcpJsonConfigPlaceholder}
          className="w-full h-48 px-3 py-2 bg-background border-2 border-border text-foreground focus:outline-none focus:border-primary rounded-md font-mono text-sm resize-none"
          disabled={isLoading || isSaving}
        />

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSaveConfig}
            disabled={isLoading || isSaving || !jsonConfig.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            aria-label={dict.settings.mcpConfirm}
          >
            <Save className="w-4 h-4" />
            <span>{dict.settings.mcpConfirm}</span>
          </button>
        </div>
      </div>

      {/* MCP Tools List - Bottom */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-foreground mb-1">
            {dict.settings.mcpToolList}
          </h3>
          <p className="text-sm text-muted-foreground">
            {mcpTools.filter(t => t.isEnabled).length} of {mcpTools.length} tools enabled
          </p>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            {dict.settings.mcpLoading}
          </div>
        ) : mcpTools.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium mb-1">{dict.settings.mcpNoTools}</p>
            <p className="text-xs">{dict.settings.mcpNoToolsHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mcpTools.map((tool) => {
              const isToggling = togglingIds.has(tool.id);
              return (
                <div
                  key={tool.id}
                  className={cn(
                    'p-4 bg-card border-2 border-border rounded-md shadow-sm hover:shadow-md transition-all',
                    !tool.isEnabled && 'opacity-70'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Tool Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-md font-bold text-foreground truncate">
                          {tool.name}
                        </h4>
                        {tool.isEnabled && !isToggling && (
                          <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-medium border border-border rounded flex items-center gap-1 flex-shrink-0">
                            <Power className="w-3 h-3" />
                            {dict.settings.mcpToolEnabled}
                          </span>
                        )}
                        {!tool.isEnabled && !isToggling && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.mcpToolDisabled}
                          </span>
                        )}
                        {isToggling && (
                          <span className="px-2 py-0.5 bg-yellow-600 text-white text-xs font-medium border border-border rounded flex items-center gap-1 flex-shrink-0">
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {tool.isEnabled ? 'Disabling...' : 'Enabling...'}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>
                          <span className="font-medium">{dict.settings.mcpToolCommand}:</span>{' '}
                          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{tool.command}</code>
                        </div>
                        <div>
                          <span className="font-medium">{dict.settings.mcpToolArgs}:</span>{' '}
                          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">
                            {tool.args.join(' ')}
                          </code>
                        </div>
                        {tool.env && Object.keys(tool.env).length > 0 && (
                          <div>
                            <span className="font-medium">{dict.settings.mcpToolEnv}:</span>{' '}
                            <span className="text-xs">
                              {Object.keys(tool.env).length} variable(s) configured
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className="flex-shrink-0">
                      <button
                        onClick={() => handleToggleTool(tool.id)}
                        disabled={isToggling || isSaving}
                        className={cn(
                          'relative inline-flex h-8 w-14 items-center rounded-full border-2 border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                          tool.isEnabled ? 'bg-green-600' : 'bg-muted'
                        )}
                        aria-label={tool.isEnabled ? 'Disable MCP tool' : 'Enable MCP tool'}
                        title={tool.isEnabled ? 'Disable' : 'Enable'}
                      >
                        <span
                          className={cn(
                            'inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform',
                            tool.isEnabled ? 'translate-x-7' : 'translate-x-1'
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPSettingsPanel;

