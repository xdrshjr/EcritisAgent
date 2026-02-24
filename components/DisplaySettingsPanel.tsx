/**
 * Display Settings Panel Component
 * Manages display settings like font size
 */

'use client';

import { useState, useEffect } from 'react';
import { Monitor, Type, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { logger } from '@/lib/logger';
import {
  loadDisplayConfig,
  saveDisplayConfig,
  type DisplayConfig,
  type FontSizeLevel,
  FONT_SIZE_PRESETS,
  getFontSizeLabel,
} from '@/lib/displayConfig';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface DisplaySettingsPanelProps {
  className?: string;
}

const DisplaySettingsPanel = ({ className }: DisplaySettingsPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    logger.component('DisplaySettingsPanel', 'mounted');
    handleLoadConfig();
  }, []);

  const handleLoadConfig = async () => {
    logger.info('Loading display configuration', undefined, 'DisplaySettingsPanel');
    setIsLoading(true);
    setError('');

    try {
      const loadedConfig = await loadDisplayConfig();
      setConfig(loadedConfig);
      
      logger.success('Display configuration loaded', {
        fontSizeLevel: loadedConfig.fontSize.level,
        fontSizeScale: loadedConfig.fontSize.scale,
      }, 'DisplaySettingsPanel');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load display config';
      logger.error('Failed to load display configuration', { error: errorMessage }, 'DisplaySettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFontSizeChange = async (level: FontSizeLevel) => {
    if (!config) {
      logger.warn('Config not loaded, cannot change font size', undefined, 'DisplaySettingsPanel');
      return;
    }

    logger.info('Changing font size', { from: config.fontSize.level, to: level }, 'DisplaySettingsPanel');
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const newConfig: DisplayConfig = {
        ...config,
        fontSize: FONT_SIZE_PRESETS[level],
      };

      const result = await saveDisplayConfig(newConfig);

      if (result.success) {
        setConfig(newConfig);
        logger.success('Font size changed successfully', {
          level,
          scale: FONT_SIZE_PRESETS[level].scale,
        }, 'DisplaySettingsPanel');
        setSuccess(dict.settings.displaySettings.fontSizeSaved || 'Font size saved successfully!');
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(result.error || 'Failed to save font size');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change font size';
      logger.error('Failed to change font size', { error: errorMessage, level }, 'DisplaySettingsPanel');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fontSizeLevels: FontSizeLevel[] = ['small', 'medium', 'large', 'xlarge', 'xxlarge'];

  if (isLoading && !config) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-muted-foreground">{dict.settings.displaySettings.loading || 'Loading...'}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-destructive">{error || 'Failed to load display settings'}</div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col overflow-hidden p-4', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Monitor className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-bold text-foreground">
          {dict.settings.displaySettings.title || 'Display Settings'}
        </h3>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-3 bg-destructive border border-border text-destructive-foreground text-sm rounded">
          {error}
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-secondary border border-border text-secondary-foreground text-sm rounded">
          {success}
        </div>
      )}

      {/* Settings */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6">
          {/* Theme Section */}
          <div className="bg-card border border-border shadow-sm p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="w-5 h-5 text-primary" />
              <h4 className="text-md font-bold text-foreground">
                {locale === 'zh' ? '主题' : 'Theme'}
              </h4>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {locale === 'zh' ? '选择界面主题外观。' : 'Choose the appearance of the interface.'}
            </p>

            {mounted && (
              <div className="flex gap-3">
                {([
                  { value: 'light', label: locale === 'zh' ? '浅色' : 'Light', icon: Sun },
                  { value: 'dark', label: locale === 'zh' ? '深色' : 'Dark', icon: Moon },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      logger.info('Theme changed from settings', { from: theme, to: value }, 'DisplaySettingsPanel');
                      setTheme(value);
                    }}
                    className={cn(
                      'flex-1 flex items-center gap-3 p-4 rounded-md border transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      theme === value
                        ? 'bg-primary/10 text-primary border-primary'
                        : 'bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size Section */}
          <div className="bg-card border border-border shadow-sm p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Type className="w-5 h-5 text-primary" />
              <h4 className="text-md font-bold text-foreground">
                {dict.settings.displaySettings.fontSize || 'Font Size'}
              </h4>
            </div>
            
            <p className="text-sm text-muted-foreground mb-6">
              {dict.settings.displaySettings.fontSizeDescription || 
               'Adjust the font size to make text more comfortable to read. Changes apply immediately.'}
            </p>

            {/* Font Size Options */}
            <div className="space-y-3">
              {fontSizeLevels.map((level) => {
                const isSelected = config.fontSize.level === level;
                const scale = FONT_SIZE_PRESETS[level].scale;
                const label = getFontSizeLabel(level);
                const percentage = Math.round(scale * 100);

                return (
                  <button
                    key={level}
                    onClick={() => handleFontSizeChange(level)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleFontSizeChange(level);
                      }
                    }}
                    disabled={isLoading}
                    tabIndex={0}
                    aria-label={`${label} (${percentage}%)`}
                    aria-pressed={isSelected}
                    className={cn(
                      'w-full flex items-center justify-between p-4 rounded-md border transition-all',
                      '',
                      'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'w-5 h-5 rounded-full border flex items-center justify-center transition-all',
                        isSelected
                          ? 'border-primary-foreground bg-primary-foreground'
                          : 'border-border'
                      )}>
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{label}</div>
                        <div className={cn(
                          'text-xs',
                          isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                        )}>
                          {percentage}% of base size
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      'text-sm font-medium px-3 py-1 rounded border',
                      isSelected
                        ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30'
                        : 'bg-muted text-muted-foreground border-border'
                    )}>
                      {scale.toFixed(2)}x
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Preview Section */}
            <div className="mt-6 pt-6 border-t border-border">
              <h5 className="text-sm font-semibold text-foreground mb-3">
                {dict.settings.displaySettings.preview || 'Preview'}
              </h5>
              <div 
                className="p-4 bg-muted rounded border border-border"
                style={{ fontSize: `${config.fontSize.scale}rem` }}
              >
                <p className="text-foreground">
                  {dict.settings.displaySettings.previewText || 
                   'This is how your text will appear with the selected font size. The preview updates in real-time as you change the setting.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisplaySettingsPanel;

