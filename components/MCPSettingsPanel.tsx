/**
 * MCP Settings Panel Component
 * Provides UI for configuring MCP servers via JSON and viewing MCP tools
 * Features:
 * - JSON configuration input area
 * - MCP tools list (read-only display)
 * - Auto-enable all MCP servers after configuration save
 * - Real-time updates after configuration save
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Save, Power, AlertCircle, CheckCircle2 } from 'lucide-react';
import { logger } from '@/lib/logger';
import {
  loadMCPConfigs,
  saveMCPConfigs,
  parseMCPConfigFromJson,
  toggleMCPEnabled,
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

      // Automatically enable all MCP servers after saving configuration
      logger.info('Auto-enabling all MCP servers after configuration save', {
        totalCount: configList.mcpServers.length,
      }, 'MCPSettingsPanel');

      const enableResults: Array<{ id: string; name: string; success: boolean; error?: string }> = [];
      
      for (const mcp of configList.mcpServers) {
        // Only enable if not already enabled
        if (mcp.isEnabled) {
          logger.debug('MCP server already enabled, skipping', { id: mcp.id, name: mcp.name }, 'MCPSettingsPanel');
          enableResults.push({ id: mcp.id, name: mcp.name, success: true });
          continue;
        }

        try {
          logger.debug('Enabling MCP server', { id: mcp.id, name: mcp.name }, 'MCPSettingsPanel');
          const toggleResult = await toggleMCPEnabled(mcp.id);
          
          if (toggleResult.success && toggleResult.isEnabled) {
            logger.success('MCP server enabled successfully', {
              id: mcp.id,
              name: mcp.name,
              isEnabled: toggleResult.isEnabled,
            }, 'MCPSettingsPanel');
            enableResults.push({ id: mcp.id, name: mcp.name, success: true });
          } else {
            logger.error('Failed to enable MCP server', {
              id: mcp.id,
              name: mcp.name,
              error: toggleResult.error || 'Toggle returned disabled state',
            }, 'MCPSettingsPanel');
            enableResults.push({ id: mcp.id, name: mcp.name, success: false, error: toggleResult.error || 'Failed to enable' });
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          logger.error('Exception while enabling MCP server', {
            id: mcp.id,
            name: mcp.name,
            error: errorMessage,
          }, 'MCPSettingsPanel');
          enableResults.push({ id: mcp.id, name: mcp.name, success: false, error: errorMessage });
        }
      }

      const successCount = enableResults.filter(r => r.success).length;
      const failCount = enableResults.filter(r => !r.success).length;

      logger.info('MCP servers auto-enable completed', {
        totalCount: configList.mcpServers.length,
        successCount,
        failCount,
        failedServers: enableResults.filter(r => !r.success).map(r => ({ name: r.name, error: r.error })),
      }, 'MCPSettingsPanel');

      if (failCount > 0) {
        const failedNames = enableResults.filter(r => !r.success).map(r => r.name).join(', ');
        setSuccess(`${dict.settings.mcpSaveSuccess}. ${successCount} server(s) enabled. ${failCount} server(s) failed to enable: ${failedNames}`);
      } else {
        setSuccess(`${dict.settings.mcpSaveSuccess}. All ${successCount} server(s) enabled automatically.`);
      }
      
      // Reload configurations to update tool list
      await handleLoadMCPConfigs();
      
      // Clear success message after 5 seconds (longer for more detailed message)
      setTimeout(() => setSuccess(''), 5000);
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


  return (
    <div className={cn('h-full flex flex-col overflow-hidden bg-background', className)}>
      {/* JSON Configuration Area - Top */}
      <div className="flex-shrink-0 border-b border-border bg-card p-4">
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
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive text-destructive-foreground text-sm rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-3 p-3 bg-green-600/10 border border-green-600 text-green-600 text-sm rounded-md flex items-center gap-2">
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
          className="w-full h-48 px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:border-primary rounded-md font-mono text-sm resize-none"
          disabled={isLoading || isSaving}
        />

        <div className="mt-3 flex justify-end">
          <button
            onClick={handleSaveConfig}
            disabled={isLoading || isSaving || !jsonConfig.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground border border-border rounded-md shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
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
            {mcpTools.length} MCP server(s) configured
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
              return (
                <div
                  key={tool.id}
                  className="p-4 bg-card border border-border rounded-md shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Tool Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-md font-bold text-foreground truncate">
                          {tool.name}
                        </h4>
                        {tool.isEnabled && (
                          <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-medium border border-border rounded flex items-center gap-1 flex-shrink-0">
                            <Power className="w-3 h-3" />
                            {dict.settings.mcpToolEnabled}
                          </span>
                        )}
                        {!tool.isEnabled && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium border border-border rounded flex-shrink-0">
                            {dict.settings.mcpToolDisabled}
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

