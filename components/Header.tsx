/**
 * Header Component
 * Top navigation bar for the application
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';
import { Download, Settings } from 'lucide-react';
import SettingsDialog from './SettingsDialog';

interface HeaderProps {
  title: string;
  showExport?: boolean;
  onExport?: () => void;
  exportDisabled?: boolean;
}

/**
 * DocAIMasterIcon Component
 * Square logo icon for DocAIMaster application
 * Represents document validation with AI
 */
const DocAIMasterIcon = () => {
  return (
    <svg 
      width="28" 
      height="28" 
      viewBox="0 0 28 28" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
      aria-label="DocAIMaster Logo"
      role="img"
    >
      {/* Document background */}
      <rect 
        x="3" 
        y="2" 
        width="18" 
        height="24" 
        rx="1" 
        fill="currentColor" 
        className="text-primary"
        stroke="currentColor"
        strokeWidth="2"
      />
      
      {/* Document lines */}
      <line 
        x1="7" 
        y1="8" 
        x2="17" 
        y2="8" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      <line 
        x1="7" 
        y1="12" 
        x2="17" 
        y2="12" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      <line 
        x1="7" 
        y1="16" 
        x2="14" 
        y2="16" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        className="text-primary-foreground"
      />
      
      {/* AI Check badge - circle background */}
      <circle 
        cx="20" 
        cy="20" 
        r="6" 
        fill="currentColor" 
        className="text-secondary"
        stroke="currentColor"
        strokeWidth="2"
      />
      
      {/* Checkmark inside badge */}
      <path 
        d="M17.5 20L19 21.5L22.5 18" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="text-secondary-foreground"
      />
    </svg>
  );
};

const Header = ({ title, showExport = false, onExport, exportDisabled = false }: HeaderProps) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    logger.component('Header', 'mounted');
    logger.debug('Header configuration', { 
      title, 
      showExport, 
      exportDisabled 
    }, 'Header');
  }, [title, showExport, exportDisabled]);

  const handleExportClick = () => {
    logger.info('Export button clicked', undefined, 'Header');
    onExport?.();
  };

  const handleSettingsClick = () => {
    logger.info('Settings button clicked', undefined, 'Header');
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    logger.info('Settings dialog closed', undefined, 'Header');
    setIsSettingsOpen(false);
  };

  return (
    <>
      <header className="h-8 bg-background border-b-4 border-border flex items-center px-4 shadow-sm">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 ml-3">
            <DocAIMasterIcon />
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {showExport && (
              <button
                onClick={handleExportClick}
                disabled={exportDisabled}
                className="px-3 py-1 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                aria-label="Export Document"
              >
                <Download className="w-3 h-3" />
                <span className="font-medium">Export</span>
              </button>
            )}
            <button
              onClick={handleSettingsClick}
              className="w-8 h-8 flex items-center justify-center bg-muted border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-foreground" />
            </button>
          </div>
        </div>
      </header>

      <SettingsDialog isOpen={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
};

export default Header;

