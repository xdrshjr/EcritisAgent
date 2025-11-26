/**
 * Header Component
 * Top navigation bar with menu dropdowns for the application
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState, useRef } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import SettingsDialog from './SettingsDialog';
import LanguageSwitcher from './LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Task } from './Taskbar';

interface HeaderProps {
  showExport?: boolean;
  onExport?: () => void;
  exportDisabled?: boolean;
  tasks?: Task[];
  onTaskChange?: (taskId: string) => void;
}

/**
 * MenuBar Component
 * Dropdown menu bar with Task, Config, and Info menus
 */
interface MenuItem {
  id: string;
  label: string;
  onClick: () => void;
}

interface MenuBarProps {
  onOpenSettings: () => void;
  tasks: Task[];
  onTaskChange: (taskId: string) => void;
}

const MenuBar = ({ onOpenSettings, tasks, onTaskChange }: MenuBarProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    logger.debug('MenuBar initialized', { tasksCount: tasks.length, locale }, 'MenuBar');
  }, [tasks.length, locale]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenu && menuRefs.current[openMenu]) {
        const menuElement = menuRefs.current[openMenu];
        if (menuElement && !menuElement.contains(event.target as Node)) {
          logger.debug('Closing menu due to outside click', { menu: openMenu }, 'MenuBar');
          setOpenMenu(null);
        }
      }
    };

    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenu]);

  const handleMenuClick = (menuId: string) => {
    logger.info('Menu clicked', { menuId, wasOpen: openMenu === menuId }, 'MenuBar');
    setOpenMenu(openMenu === menuId ? null : menuId);
  };

  const handleTaskMenuItemClick = (taskId: string) => {
    logger.info('Task menu item clicked', { taskId }, 'MenuBar');
    onTaskChange(taskId);
    setOpenMenu(null);
  };

  const handleConfigMenuItemClick = () => {
    logger.info('Config menu item clicked: Basic Config', undefined, 'MenuBar');
    onOpenSettings();
    setOpenMenu(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, menuId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleMenuClick(menuId);
    } else if (e.key === 'Escape' && openMenu) {
      logger.debug('Closing menu with Escape key', { menu: openMenu }, 'MenuBar');
      setOpenMenu(null);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Task Menu */}
      <div
        ref={(el) => {
          menuRefs.current['task'] = el;
        }}
        className="relative"
      >
        <button
          onClick={() => handleMenuClick('task')}
          onKeyDown={(e) => handleKeyDown(e, 'task')}
          className="px-3 py-1 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Task Menu"
          aria-expanded={openMenu === 'task'}
          aria-haspopup="true"
        >
          {dict.header.menu.task}
          <ChevronDown className="w-3 h-3" />
        </button>
        {openMenu === 'task' && (
          <div className="absolute top-full left-0 mt-1 bg-background border-2 border-border shadow-lg z-50 min-w-[180px]">
            {tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => handleTaskMenuItemClick(task.id)}
                className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
                aria-label={task.title}
              >
                <span className="flex-shrink-0">{task.icon}</span>
                <span>{task.title}</span>
                {task.isActive && (
                  <span className="ml-auto text-xs text-primary">●</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Config Menu */}
      <div
        ref={(el) => {
          menuRefs.current['config'] = el;
        }}
        className="relative"
      >
        <button
          onClick={() => handleMenuClick('config')}
          onKeyDown={(e) => handleKeyDown(e, 'config')}
          className="px-3 py-1 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Config Menu"
          aria-expanded={openMenu === 'config'}
          aria-haspopup="true"
        >
          {dict.header.menu.config}
          <ChevronDown className="w-3 h-3" />
        </button>
        {openMenu === 'config' && (
          <div className="absolute top-full left-0 mt-1 bg-background border-2 border-border shadow-lg z-50 min-w-[180px]">
            <button
              onClick={handleConfigMenuItemClick}
              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Basic Config"
            >
              {dict.header.menu.modelConfig}
            </button>
          </div>
        )}
      </div>

      {/* Info Menu */}
      <div
        ref={(el) => {
          menuRefs.current['info'] = el;
        }}
        className="relative"
      >
        <button
          onClick={() => handleMenuClick('info')}
          onKeyDown={(e) => handleKeyDown(e, 'info')}
          className="px-3 py-1 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Info Menu"
          aria-expanded={openMenu === 'info'}
          aria-haspopup="true"
        >
          {dict.header.menu.info}
          <ChevronDown className="w-3 h-3" />
        </button>
        {openMenu === 'info' && (
          <div className="absolute top-full left-0 mt-1 bg-background border-2 border-border shadow-lg z-50 min-w-[180px]">
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {dict.header.menu.comingSoon}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Header = ({
  showExport = false,
  onExport,
  exportDisabled = false,
  tasks = [],
  onTaskChange,
}: HeaderProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    logger.component('Header', 'mounted');
    logger.debug('Header configuration', {
      showExport,
      exportDisabled,
      tasksCount: tasks.length,
      locale,
    }, 'Header');
  }, [showExport, exportDisabled, tasks.length, locale]);

  const handleExportClick = () => {
    logger.info('Export button clicked', undefined, 'Header');
    onExport?.();
  };

  const handleOpenSettings = () => {
    logger.info('Opening settings dialog from menu', undefined, 'Header');
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    logger.info('Settings dialog closed', undefined, 'Header');
    setIsSettingsOpen(false);
  };

  const handleTaskChange = (taskId: string) => {
    logger.info('Task changed from menu', { taskId }, 'Header');
    onTaskChange?.(taskId);
  };

  return (
    <>
      <header className="h-8 bg-background border-b-4 border-border flex items-center px-4 shadow-sm">
        <div className="flex items-center justify-between w-full">
          {/* Left: Menu Bar */}
          <MenuBar
            onOpenSettings={handleOpenSettings}
            tasks={tasks}
            onTaskChange={handleTaskChange}
          />

          {/* Right: Language Switcher & Export Button */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {showExport && (
              <button
                onClick={handleExportClick}
                disabled={exportDisabled}
                className="px-3 py-1 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                aria-label="Export Document"
              >
                <Download className="w-3 h-3" />
                <span className="font-medium">{dict.header.export}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <SettingsDialog isOpen={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
};

export default Header;

