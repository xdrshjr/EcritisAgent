/**
 * MCPToolSelector Component
 * Provides UI for enabling/disabling MCP tools in chat
 * Features:
 * - Master toggle switch with hammer icon
 * - Dropdown menu showing all available MCP tools (read-only list when enabled)
 * - When master toggle is enabled, all MCP tools are available for LLM to use
 * - LLM will decide which tools to call based on user query
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Hammer, ChevronDown, ChevronUp } from 'lucide-react';
import { logger } from '@/lib/logger';
import { loadMCPConfigs, getMCPConfigsUpdatedEventName, type MCPConfig } from '@/lib/mcpConfig';

export interface MCPToolSelectorProps {
  disabled?: boolean;
  onMCPStateChange?: (enabled: boolean, enabledTools: MCPConfig[]) => void;
}

const MCPToolSelector = ({ disabled = false, onMCPStateChange }: MCPToolSelectorProps) => {
  const [mcpMasterEnabled, setMcpMasterEnabled] = useState(false);
  const [mcpTools, setMcpTools] = useState<MCPConfig[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load MCP configurations
  const loadTools = useCallback(async () => {
    setIsLoading(true);
    logger.info('Loading MCP tools for selector', undefined, 'MCPToolSelector');
    
    try {
      const configList = await loadMCPConfigs();
      const tools = configList.mcpServers || [];
      
      logger.info('MCP tools loaded', {
        totalTools: tools.length,
        enabledTools: tools.filter(t => t.isEnabled).length,
      }, 'MCPToolSelector');
      
      setMcpTools(tools);
      
      // Set master toggle based on whether any tools are enabled
      // Note: When master is enabled, all tools are available (not just enabled ones)
      const hasEnabledTools = tools.some(t => t.isEnabled);
      
      logger.info('MCP state determined', {
        totalTools: tools.length,
        hasEnabledTools,
        toolNames: tools.map(t => t.name),
      }, 'MCPToolSelector');
      
      setMcpMasterEnabled(hasEnabledTools);
      
      // Notify parent of state
      // When master is enabled, pass all tools (LLM will decide which to use)
      if (onMCPStateChange) {
        const toolsToPass = hasEnabledTools ? tools : [];
        logger.info('Notifying parent of MCP state', {
          masterEnabled: hasEnabledTools,
          totalToolsCount: tools.length,
          toolsToPassCount: toolsToPass.length,
          toolNames: toolsToPass.map(t => t.name),
        }, 'MCPToolSelector');
        onMCPStateChange(hasEnabledTools, toolsToPass);
      } else {
        logger.warn('onMCPStateChange callback not provided', undefined, 'MCPToolSelector');
      }
    } catch (error) {
      logger.error('Failed to load MCP tools', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'MCPToolSelector');
    } finally {
      setIsLoading(false);
    }
  }, [onMCPStateChange]);

  // Load MCP configurations on mount
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  // Listen for MCP configuration updates
  useEffect(() => {
    const eventName = getMCPConfigsUpdatedEventName();
    logger.debug('Setting up MCP configs updated event listener', { eventName }, 'MCPToolSelector');
    
    const handleConfigUpdate = () => {
      logger.info('MCP configuration updated event received, reloading tools', undefined, 'MCPToolSelector');
      loadTools();
    };
    
    window.addEventListener(eventName, handleConfigUpdate);
    
    return () => {
      logger.debug('Removing MCP configs updated event listener', { eventName }, 'MCPToolSelector');
      window.removeEventListener(eventName, handleConfigUpdate);
    };
  }, [loadTools]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  // Handle master toggle
  const handleMasterToggle = () => {
    const newState = !mcpMasterEnabled;
    setMcpMasterEnabled(newState);
    
    logger.info('MCP master toggle changed', {
      enabled: newState,
      totalTools: mcpTools.length,
    }, 'MCPToolSelector');
    
    // When master is disabled, close dropdown
    if (!newState) {
      setIsDropdownOpen(false);
    }
    
    // Notify parent
    // When master is enabled, pass all tools (LLM will decide which to use)
    if (onMCPStateChange) {
      const toolsToPass = newState ? mcpTools : [];
      logger.info('Notifying parent of MCP state change (master toggle)', {
        masterEnabled: newState,
        totalToolsCount: mcpTools.length,
        toolsToPassCount: toolsToPass.length,
        toolNames: toolsToPass.map(t => t.name),
      }, 'MCPToolSelector');
      onMCPStateChange(newState, toolsToPass);
    } else {
      logger.warn('onMCPStateChange callback not provided', undefined, 'MCPToolSelector');
    }
  };

  // Handle dropdown toggle
  const handleDropdownToggle = () => {
    if (!mcpMasterEnabled) {
      return;
    }
    
    setIsDropdownOpen(prev => !prev);
    logger.debug('MCP dropdown toggled', {
      isOpen: !isDropdownOpen,
    }, 'MCPToolSelector');
  };

  return (
    <div className="flex items-center gap-2 relative" ref={dropdownRef}>
      {/* Master MCP Toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-input rounded-md hover:bg-muted/50 transition-colors">
        <Hammer className="w-4 h-4 text-muted-foreground" aria-label="MCP Tools" />
        
        <label className="text-sm text-muted-foreground font-medium whitespace-nowrap cursor-pointer select-none">
          MCP
        </label>
        
        <button
          onClick={handleMasterToggle}
          disabled={disabled || isLoading}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            mcpMasterEnabled ? 'bg-primary' : 'bg-input'
          }`}
          aria-label="Toggle MCP tools"
          aria-pressed={mcpMasterEnabled}
          tabIndex={0}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              mcpMasterEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Dropdown Toggle Button */}
      {mcpMasterEnabled && (
        <button
          onClick={handleDropdownToggle}
          disabled={disabled || isLoading}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-background border border-input hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="MCP tools menu"
          aria-expanded={isDropdownOpen}
          tabIndex={0}
        >
          {isDropdownOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      )}

      {/* Dropdown Menu - Opens upward */}
      {mcpMasterEnabled && isDropdownOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-background border border-border rounded-lg shadow-lg z-50 py-2 animate-fadeIn">
          <div className="px-3 py-2 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">MCP Tools</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              All tools are available. AI will decide which to use.
            </p>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {mcpTools.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">No MCP tools configured</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Configure tools in Settings
                </p>
              </div>
            ) : (
              <div className="py-1">
                {mcpTools.map((tool) => (
                  <div
                    key={tool.id}
                    className="flex items-center px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {tool.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {tool.command} {tool.args.join(' ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="px-3 py-2 border-t border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">
              {mcpTools.length} tool{mcpTools.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCPToolSelector;

