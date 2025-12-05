/**
 * InfoDialog Component
 * Displays product information about EcritisAgent
 */

'use client';

import { X, Info } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useEffect } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

interface InfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const InfoDialog = ({ isOpen, onClose }: InfoDialogProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  useEffect(() => {
    if (isOpen) {
      logger.info('Info dialog opened', { locale }, 'InfoDialog');
    }
  }, [isOpen, locale]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      logger.debug('Info dialog closed by backdrop click', undefined, 'InfoDialog');
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      logger.debug('Info dialog closed by Escape key', undefined, 'InfoDialog');
      onClose();
    }
  };

  const handleCloseClick = () => {
    logger.debug('Info dialog closed by close button', undefined, 'InfoDialog');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-label={dict.header.info.title}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-background border-4 border-border rounded-lg shadow-xl w-[600px] max-w-[90%] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-border bg-muted/60 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{dict.header.info.title}</h2>
          </div>
          <button
            onClick={handleCloseClick}
            className="w-8 h-8 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
            aria-label={dict.header.info.close}
            tabIndex={0}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Product Name */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.productName}</h3>
            <p className="text-sm text-muted-foreground">{dict.header.info.productNameValue}</p>
          </div>

          {/* Short Form */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.shortForm}</h3>
            <p className="text-sm text-muted-foreground">{dict.header.info.shortFormValue}</p>
          </div>

          {/* Pronunciation */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.pronunciation}</h3>
            <p className="text-sm text-muted-foreground">{dict.header.info.pronunciationValue}</p>
          </div>

          {/* Name Origin & Meaning */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.nameOrigin}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{dict.header.info.nameOriginValue}</p>
          </div>

          {/* Translation Essence */}
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.translationEssence}</h3>
            <p className="text-sm text-muted-foreground italic">{dict.header.info.translationEssenceValue}</p>
          </div>

          {/* Primary Slogan */}
          <div className="space-y-1 pt-2 border-t border-border">
            <h3 className="text-sm font-semibold text-foreground">{dict.header.info.primarySlogan}</h3>
            <p className="text-base text-primary font-medium">{dict.header.info.primarySloganValue}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t-4 border-border bg-muted/40 flex items-center justify-end">
          <button
            onClick={handleCloseClick}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
            aria-label={dict.header.info.close}
            tabIndex={0}
          >
            {dict.header.info.close}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfoDialog;

