/**
 * NetworkSearchToggle Component
 * Provides UI for enabling/disabling network search in chat
 * Features:
 * - Toggle switch with globe icon
 * - When enabled, AI will perform network search before answering
 */

'use client';

import { useState, useCallback } from 'react';
import { Globe } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface NetworkSearchToggleProps {
  disabled?: boolean;
  defaultEnabled?: boolean; // Default value for uncontrolled mode
  enabled?: boolean; // Controlled mode value
  onNetworkSearchStateChange?: (enabled: boolean) => void;
}

const NetworkSearchToggle = ({ 
  disabled = false, 
  defaultEnabled = false, // Default to disabled
  enabled: controlledEnabled,
  onNetworkSearchStateChange 
}: NetworkSearchToggleProps) => {
  const [internalEnabled, setInternalEnabled] = useState(defaultEnabled);
  
  // Use controlled value if provided, otherwise use internal state
  const networkSearchEnabled = controlledEnabled !== undefined ? controlledEnabled : internalEnabled;

  const handleToggle = useCallback(() => {
    const newState = !networkSearchEnabled;
    
    // Update internal state only if not controlled
    if (controlledEnabled === undefined) {
      setInternalEnabled(newState);
    }
    
    logger.info('Network search toggle changed', {
      enabled: newState,
      isControlled: controlledEnabled !== undefined,
    }, 'NetworkSearchToggle');
    
    if (onNetworkSearchStateChange) {
      onNetworkSearchStateChange(newState);
    } else {
      logger.warn('onNetworkSearchStateChange callback not provided', undefined, 'NetworkSearchToggle');
    }
  }, [networkSearchEnabled, controlledEnabled, onNetworkSearchStateChange]);

  return (
    <div className="flex items-center gap-2">
      {/* Network Search Toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-input rounded-md hover:bg-muted/50 transition-colors">
        <Globe className="w-4 h-4 text-muted-foreground" aria-label="Network Search" />
        
        <label className="text-sm text-muted-foreground font-medium whitespace-nowrap cursor-pointer select-none">
          网络
        </label>
        
        <button
          onClick={handleToggle}
          disabled={disabled}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            networkSearchEnabled ? 'bg-primary' : 'bg-input'
          }`}
          aria-label="Toggle network search"
          aria-pressed={networkSearchEnabled}
          tabIndex={0}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              networkSearchEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

export default NetworkSearchToggle;


