/**
 * Header Component
 * Top navigation bar with menu dropdowns for the application
 */

'use client';

import { logger } from '@/lib/logger';
import { useEffect, useState, useRef } from 'react';
import { Download, ChevronDown, Settings } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';
import type { Task } from './Taskbar';
import InfoDialog from './InfoDialog';

interface HeaderProps {
  showExport?: boolean;
  onExport?: () => void;
  exportDisabled?: boolean;
  tasks?: Task[];
  onTaskChange?: (taskId: string) => void;
  onSettingsClick?: () => void;
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
  tasks: Task[];
  onTaskChange: (taskId: string) => void;
}

const MenuBar = ({ tasks, onTaskChange }: MenuBarProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
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
    if (menuId === 'info') {
      logger.info('Info menu clicked, opening info dialog', undefined, 'MenuBar');
      setIsInfoDialogOpen(true);
      setOpenMenu(null);
    } else {
      setOpenMenu(openMenu === menuId ? null : menuId);
    }
  };

  const handleTaskMenuItemClick = (taskId: string) => {
    logger.info('Task menu item clicked', { taskId }, 'MenuBar');
    onTaskChange(taskId);
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
          <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[180px]">
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
      </div>

      {/* Info Dialog */}
      <InfoDialog
        isOpen={isInfoDialogOpen}
        onClose={() => {
          logger.debug('Info dialog closed from MenuBar', undefined, 'MenuBar');
          setIsInfoDialogOpen(false);
        }}
      />
    </div>
  );
};

const Header = ({
  showExport = false,
  onExport,
  exportDisabled = false,
  tasks = [],
  onTaskChange,
  onSettingsClick,
}: HeaderProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [hoveredSettings, setHoveredSettings] = useState(false);

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

  const handleTaskChange = (taskId: string) => {
    logger.info('Task changed from menu', { taskId }, 'Header');
    onTaskChange?.(taskId);
  };

  const handleSettingsClick = () => {
    logger.info('Settings button clicked in header', undefined, 'Header');
    onSettingsClick?.();
  };

  const handleSettingsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSettingsClick();
    }
  };

  return (
    <>
      <header className="h-10 bg-card border-b border-border flex items-center px-4 shadow-sm">
        <div className="flex items-center justify-between w-full">
          {/* Left: Menu Bar */}
          <MenuBar
            tasks={tasks}
            onTaskChange={handleTaskChange}
          />

          {/* Right: Language Switcher, Settings Button & Export Button */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />

            {/* Settings Button */}
            <div className="relative group">
              <button
                onClick={handleSettingsClick}
                onKeyDown={handleSettingsKeyDown}
                onMouseEnter={() => setHoveredSettings(true)}
                onMouseLeave={() => setHoveredSettings(false)}
                tabIndex={0}
                aria-label={dict.taskbar.settings}
                className={cn(
                  'px-3 py-1 text-sm font-medium text-foreground',
                  'hover:bg-accent hover:text-accent-foreground transition-colors',
                  'flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                <Settings className="w-4 h-4" />
                <span>{dict.taskbar.settings}</span>
              </button>

              {/* Tooltip */}
              {hoveredSettings && (
                <div className="absolute top-full right-0 mt-1 z-50 pointer-events-none">
                  <div className="bg-popover text-popover-foreground px-2 py-1 border border-border rounded-md shadow-md whitespace-nowrap">
                    <span className="text-xs font-medium">{dict.taskbar.settings}</span>
                  </div>
                </div>
              )}
            </div>

            {showExport && (
              <button
                onClick={handleExportClick}
                disabled={exportDisabled}
                className="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                aria-label="Export Document"
              >
                <Download className="w-3 h-3" />
                <span className="font-medium">{dict.header.export}</span>
              </button>
            )}
          </div>
        </div>
      </header>

    </>
  );
};

export default Header;

