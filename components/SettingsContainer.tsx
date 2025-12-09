/**
 * Settings Container Component
 * Main settings interface with left sidebar and right content area
 */

'use client';

import { useState, useEffect } from 'react';
import { Bot, Settings as SettingsIcon, Image as ImageIcon, Cpu, Search as SearchIcon, Monitor } from 'lucide-react';
import { logger } from '@/lib/logger';
import ChatBotManager from './ChatBotManager';
import MCPSettingsPanel from './MCPSettingsPanel';
import ImageServiceSettingsPanel from './ImageServiceSettingsPanel';
import SearchServiceSettingsPanel from './SearchServiceSettingsPanel';
import ModelSettingsPanel from './ModelSettingsPanel';
import DisplaySettingsPanel from './DisplaySettingsPanel';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface SettingsContainerProps {
  className?: string;
}

type SettingsSection = 'model-settings' | 'chat-bots' | 'mcp' | 'image-services' | 'search-services' | 'display';

interface SettingsMenuItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const SettingsContainer = ({ className }: SettingsContainerProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [activeSection, setActiveSection] = useState<SettingsSection>('model-settings');

  useEffect(() => {
    logger.component('SettingsContainer', 'mounted', { activeSection });
  }, [activeSection]);

  const menuItems: SettingsMenuItem[] = [
    {
      id: 'model-settings',
      label: dict.settings.modelSettings,
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: 'chat-bots',
      label: dict.settings.chatBots,
      icon: <Bot className="w-4 h-4" />,
    },
    {
      id: 'mcp',
      label: dict.settings.mcp,
      icon: <SettingsIcon className="w-4 h-4" />,
    },
    {
      id: 'image-services',
      label: dict.settings.imageServices || 'Image Services',
      icon: <ImageIcon className="w-4 h-4" />,
    },
    {
      id: 'search-services',
      label: dict.settings.searchServices || 'Search Services',
      icon: <SearchIcon className="w-4 h-4" />,
    },
    {
      id: 'display',
      label: dict.settings.display || 'Display',
      icon: <Monitor className="w-4 h-4" />,
    },
  ];

  const handleSectionChange = (sectionId: SettingsSection) => {
    logger.info('Settings section changed', { from: activeSection, to: sectionId }, 'SettingsContainer');
    setActiveSection(sectionId);
  };

  return (
    <div className={cn('h-full flex overflow-hidden bg-background', className)}>
      {/* Left Sidebar - 15% */}
      <aside className="w-[15%] h-full border-r-2 border-border bg-sidebar overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4">{dict.settings.title}</h2>
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSectionChange(item.id);
                    }
                  }}
                  tabIndex={0}
                  aria-label={item.label}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded transition-colors',
                    'border-2 border-transparent',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card text-foreground'
                  )}
                >
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Right Content Area - 75% */}
      <main className="flex-1 h-full overflow-hidden">
        {activeSection === 'model-settings' && <ModelSettingsPanel className="h-full" />}
        {activeSection === 'chat-bots' && <ChatBotManager className="h-full" />}
        {activeSection === 'mcp' && <MCPSettingsPanel className="h-full" />}
        {activeSection === 'image-services' && <ImageServiceSettingsPanel className="h-full" />}
        {activeSection === 'search-services' && <SearchServiceSettingsPanel className="h-full" />}
        {activeSection === 'display' && <DisplaySettingsPanel className="h-full" />}
      </main>
    </div>
  );
};

export default SettingsContainer;

