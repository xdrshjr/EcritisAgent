/**
 * Language Switcher Component
 * Elegant language toggle button for switching between English and Chinese
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Locale, localeNames } from '@/lib/i18n/config';
import { logger } from '@/lib/logger';

const LanguageSwitcher = () => {
  const { locale, setLocale } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.component('LanguageSwitcher', 'mounted');
    logger.debug('Current language', { locale }, 'LanguageSwitcher');
  }, [locale]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        logger.debug('Closing language menu due to outside click', undefined, 'LanguageSwitcher');
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleToggleMenu = () => {
    logger.debug('Language menu toggle clicked', { wasOpen: isOpen }, 'LanguageSwitcher');
    setIsOpen(!isOpen);
  };

  const handleLanguageSelect = (newLocale: Locale) => {
    logger.info('Language selected from menu', { 
      from: locale, 
      to: newLocale 
    }, 'LanguageSwitcher');
    
    setLocale(newLocale);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleMenu();
    } else if (e.key === 'Escape' && isOpen) {
      logger.debug('Closing language menu with Escape key', undefined, 'LanguageSwitcher');
      setIsOpen(false);
    }
  };

  // Display current language in compact format
  const displayText = locale === 'zh' ? '中/En' : '中/En';

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={handleToggleMenu}
        onKeyDown={handleKeyDown}
        className="px-3 py-1 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Switch Language"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Languages className="w-4 h-4" />
        <span className="font-mono">{displayText}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 min-w-[140px]">
          <button
            onClick={() => handleLanguageSelect('en')}
            className={`w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
              locale === 'en' ? 'bg-accent/50 font-medium' : ''
            }`}
            aria-label="Select English"
          >
            <span>{localeNames.en}</span>
            {locale === 'en' && (
              <span className="text-primary text-xs">●</span>
            )}
          </button>
          <button
            onClick={() => handleLanguageSelect('zh')}
            className={`w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between ${
              locale === 'zh' ? 'bg-accent/50 font-medium' : ''
            }`}
            aria-label="Select Chinese"
          >
            <span>{localeNames.zh}</span>
            {locale === 'zh' && (
              <span className="text-primary text-xs">●</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher;









